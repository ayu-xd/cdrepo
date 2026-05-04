import { useEffect, useState, useCallback } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { ExternalLink, ChevronRight, RotateCcw, ThumbsDown, Eye, Search, Copy, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";

type PipelineContact = {
  id: string;
  full_name: string;
  username: string | null;
  profile_link: string;
  status: string;
  media_seen: boolean;
  current_follow_up: string | null;
  last_follow_up_at: string | null;
  a2_notes: string;
  b_notes: string;
  dmed_at: string | null;
  initiated_at: string | null;
  engaged_at: string | null;
  calendly_sent_at: string | null;
  booked_at: string | null;
};

type DmTaskInfo = {
  message_text: string;
  variant_number: number;
  task_type: string;
  campaign_name: string | null;
  completed_at: string | null;
};

const STAGES = [
  { key: "dmed", label: "DM'd", color: "text-primary", dotColor: "bg-primary", tsField: "dmed_at" },
  { key: "initiated", label: "Initiated", color: "text-orange-400", dotColor: "bg-orange-400", tsField: "initiated_at" },
  { key: "engaged", label: "Engaged", color: "text-yellow-400", dotColor: "bg-yellow-400", tsField: "engaged_at" },
  { key: "calendly_sent", label: "Calendly", color: "text-blue-400", dotColor: "bg-blue-400", tsField: "calendly_sent_at" },
  { key: "booked", label: "Booked", color: "text-emerald-400", dotColor: "bg-emerald-400", tsField: "booked_at" },
];

const Pipeline = ({ userId }: { userId: string }) => {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<PipelineContact | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dmTaskInfo, setDmTaskInfo] = useState<DmTaskInfo | null>(null);
  const [a2Notes, setA2Notes] = useState("");
  const [b_notes, setBNotes] = useState("");
  const [stageSearch, setStageSearch] = useState<Record<string, string>>({});

  // Campaign filter
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [campaignNames, setCampaignNames] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").eq("user_id", userId)
      .then(({ data }) => setCampaignNames(data ?? []));
  }, [userId]);

  const fetchContacts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    let contactIds: string[] | null = null;
    if (campaignFilter !== "all") {
      // Get contacts in this campaign's target lists
      const { data: targets } = await supabase
        .from("campaign_targets").select("target_list_id").eq("campaign_id", campaignFilter);
      const listIds = (targets ?? []).map(t => t.target_list_id);
      if (listIds.length) {
        const { data: items } = await supabase
          .from("target_list_items").select("contact_id").in("target_list_id", listIds);
        contactIds = [...new Set((items ?? []).map(i => i.contact_id))];
      } else {
        contactIds = [];
      }
    }

    let query = supabase
      .from("contacts")
      .select("id, full_name, username, profile_link, status, media_seen, current_follow_up, last_follow_up_at, a2_notes, b_notes, dmed_at, initiated_at, engaged_at, calendly_sent_at, booked_at")
      .eq("user_id", userId)
      .in("status", ["dmed", "initiated", "engaged", "calendly_sent", "booked"])
      .order("dmed_at", { ascending: true });

    if (contactIds !== null && contactIds.length <= 1000) {
      if (!contactIds.length) { setContacts([]); if (!silent) setLoading(false); return; }
      query = query.in("id", contactIds);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);

    let results = (data as PipelineContact[]) || [];
    if (contactIds !== null && contactIds.length > 1000) {
      const idSet = new Set(contactIds);
      results = results.filter(c => idSet.has(c.id));
    }

    setContacts(results);
    if (!silent) setLoading(false);
  }, [userId, campaignFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const contactsByStage = (stage: string) => {
    const q = (stageSearch[stage] || "").toLowerCase().trim();
    return contacts
      .filter(c => c.status === stage && (!q || c.full_name.toLowerCase().includes(q) || (c.username || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        const tsField = STAGES.find(s => s.key === stage)?.tsField as keyof PipelineContact;
        const aTs = tsField ? (a[tsField] as string | null) : null;
        const bTs = tsField ? (b[tsField] as string | null) : null;
        if (!aTs && !bTs) return 0;
        if (!aTs) return 1;
        if (!bTs) return -1;
        return bTs.localeCompare(aTs);
      });
  };

  const cumulativeCount = (stageKey: string) => {
    const ts = STAGES.find(s => s.key === stageKey)?.tsField as keyof PipelineContact;
    return ts ? contacts.filter(c => c[ts] != null).length : 0;
  };

  const advanceStage = async (contactId: string, newStatus: string) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, status: newStatus } : c));
    if (selectedContact?.id === contactId) { setDrawerOpen(false); setSelectedContact(null); }

    const nowIso = new Date().toISOString();
    const updates: Record<string, any> = { status: newStatus };
    if (newStatus === "initiated") {
      updates.initiated_at = nowIso;
      updates.current_follow_up = "1A";
      updates.last_follow_up_at = nowIso;
    } else if (newStatus === "engaged") {
      updates.engaged_at = nowIso;
      updates.current_follow_up = "1B";
      updates.last_follow_up_at = nowIso;
    } else if (newStatus === "calendly_sent") {
      updates.calendly_sent_at = nowIso;
      updates.current_follow_up = "1C";
      updates.last_follow_up_at = nowIso;
    } else if (newStatus === "booked") {
      updates.booked_at = nowIso;
      updates.current_follow_up = null;
      updates.last_follow_up_at = null;
    }

    await supabase.from("contacts").update(updates).eq("id", contactId);
    toast.success(`Moved to ${newStatus.replace("_", " ")}`);
    fetchContacts(true);
  };

  const { settings } = useSettings();

  const sendToFlywheel = async (contactId: string, reason: string) => {
    setContacts(prev => prev.filter(c => c.id !== contactId));
    if (selectedContact?.id === contactId) { setDrawerOpen(false); setSelectedContact(null); }

    // Calculate requeue_after date based on flywheel_days setting
    const requeueDate = new Date();
    requeueDate.setDate(requeueDate.getDate() + settings.flywheel_days);
    const requeueAfter = requeueDate.toISOString().slice(0, 10);

    await supabase.from("contacts").update({
      status: "flywheel", flywheel_reason: reason, negative_reply: reason === "negative",
      current_follow_up: null, last_follow_up_at: null,
      requeue_after: requeueAfter,
    }).eq("id", contactId);
    toast.success(`Sent to flywheel (re-enters in ${settings.flywheel_days} days)`);
    fetchContacts(true);
  };

  const openDrawer = async (contact: PipelineContact) => {
    setSelectedContact(contact);
    setA2Notes(contact.a2_notes || "");
    setBNotes(contact.b_notes || "");
    setDmTaskInfo(null);

    // Load the message that was sent to this contact
    const { data: tasks } = await supabase
      .from("dm_tasks")
      .select("message_text, variant_number, task_type, campaign_id, completed_at")
      .eq("contact_id", contact.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1);

    if (tasks?.length) {
      const task = tasks[0];
      let campaignName: string | null = null;
      if (task.campaign_id) {
        const { data: camp } = await supabase
          .from("campaigns").select("name").eq("id", task.campaign_id).single();
        campaignName = camp?.name || null;
      }
      setDmTaskInfo({
        message_text: task.message_text,
        variant_number: task.variant_number,
        task_type: task.task_type,
        campaign_name: campaignName,
        completed_at: task.completed_at,
      });
    }

    setDrawerOpen(true);
  };

  const saveNotes = async (field: "a2_notes" | "b_notes", value: string) => {
    if (!selectedContact) return;
    await supabase.from("contacts").update({ [field]: value }).eq("id", selectedContact.id);
  };

  const getNextStage = (contact: PipelineContact) => {
    if (contact.status === "dmed") return { label: "Initiated", status: "initiated" };
    if (contact.status === "initiated") return { label: "Engaged", status: "engaged" };
    if (contact.status === "engaged") return { label: "Calendly", status: "calendly_sent" };
    if (contact.status === "calendly_sent") return { label: "Booked", status: "booked" };
    return null;
  };

  const getDaysSince = (contact: PipelineContact) => {
    const dateStr = contact.last_follow_up_at || contact.initiated_at || contact.dmed_at;
    if (!dateStr) return null;
    return differenceInDays(new Date(), new Date(dateStr));
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="h-[calc(100vh-5rem)] md:h-[calc(100vh-2rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-border gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <h1 className="text-lg font-semibold">Pipeline</h1>
          <span className="text-xs text-muted-foreground">{contacts.length}</span>
          {campaignNames.length > 0 && (
            <select
              value={campaignFilter}
              onChange={e => setCampaignFilter(e.target.value)}
              className="h-7 text-xs rounded border border-border bg-background px-2 text-muted-foreground"
            >
              <option value="all">All campaigns</option>
              {campaignNames.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {STAGES.map(({ key, label, dotColor }) => (
            <div key={key} className="flex items-center gap-1 shrink-0">
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              <span className="text-[11px] text-muted-foreground hidden sm:inline">{label}</span>
              <span className="text-xs font-semibold text-foreground">{cumulativeCount(key)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div className="flex gap-3 min-w-[900px] md:min-w-0 md:grid md:grid-cols-5 h-full">
          {STAGES.map(({ key, label, color, dotColor }) => {
            const stageContacts = contactsByStage(key);
            return (
              <div key={key} className="flex flex-col min-h-0 w-[200px] md:w-auto shrink-0 md:shrink">
                <div className="flex items-center gap-2 pb-2">
                  <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>{label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{stageContacts.length}</span>
                </div>
                {stageContacts.length > 3 && (
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={stageSearch[key] || ""}
                      onChange={e => setStageSearch(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full rounded-md border border-border bg-secondary/50 pl-7 pr-2 py-1.5 text-[11px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-1.5" style={{ scrollbarWidth: "thin" }}>
                  {stageContacts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-[11px] text-muted-foreground/50">Empty</div>
                  ) : (
                    stageContacts.map(contact => {
                      const days = getDaysSince(contact);
                      const next = getNextStage(contact);
                      return (
                        <div
                          key={contact.id}
                          className="rounded-lg bg-card border border-border/40 p-3 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all group"
                          onClick={() => openDrawer(contact)}
                        >
                          <p className="text-[13px] font-medium truncate leading-tight">{contact.full_name}</p>
                          {contact.username && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">@{contact.username}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {contact.current_follow_up && (
                              <span className="text-[10px] rounded-md bg-primary/10 text-primary px-1.5 py-0.5 font-medium">{contact.current_follow_up}</span>
                            )}
                            {days !== null && days > 0 && (
                              <span className={`text-[10px] ${days >= 3 ? "text-destructive" : "text-muted-foreground"}`}>{days}d ago</span>
                            )}
                          </div>
                          {key !== "booked" && (
                            <div className="flex items-center gap-1 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              {next && (
                                <button
                                  className="inline-flex items-center gap-0.5 text-[10px] rounded-md bg-primary/10 text-primary px-2 py-1 hover:bg-primary/20 font-medium"
                                  onClick={e => { e.stopPropagation(); advanceStage(contact.id, next.status); }}
                                >
                                  <ChevronRight className="h-3 w-3" /> {next.label}
                                </button>
                              )}
                              <button
                                className="inline-flex items-center text-[10px] rounded-md bg-destructive/10 text-destructive px-1.5 py-1 hover:bg-destructive/20 ml-auto"
                                onClick={e => { e.stopPropagation(); sendToFlywheel(contact.id, "no_reply"); }}
                                title="Flywheel"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedContact && (
            <>
              <SheetHeader className="pb-4 border-b border-border">
                <SheetTitle className="text-left text-base">
                  <button
                    onClick={() => { navigator.clipboard.writeText(selectedContact.full_name); toast.success("Name copied"); }}
                    className="hover:text-primary transition-colors text-left"
                  >
                    {selectedContact.full_name}
                  </button>
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  {selectedContact.username && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(selectedContact.username!); toast.success("Copied"); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      @{selectedContact.username}
                    </button>
                  )}
                  <a href={selectedContact.profile_link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> Profile
                  </a>
                </div>
                {selectedContact.status !== "booked" && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(() => {
                      const next = getNextStage(selectedContact);
                      return next ? (
                        <button onClick={() => advanceStage(selectedContact.id, next.status)}
                          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                          <ChevronRight className="h-3.5 w-3.5" /> {next.label}
                        </button>
                      ) : null;
                    })()}
                    <button onClick={() => sendToFlywheel(selectedContact.id, "no_reply")}
                      className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
                      <RotateCcw className="h-3.5 w-3.5" /> No Reply
                    </button>
                    <button onClick={() => sendToFlywheel(selectedContact.id, "negative")}
                      className="flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/20">
                      <ThumbsDown className="h-3.5 w-3.5" /> -ve Reply
                    </button>
                  </div>
                )}
              </SheetHeader>

              <div className="mt-5 space-y-5">
                {/* Message Sent — from dm_tasks */}
                {dmTaskInfo && (
                  <div className="space-y-1.5">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Message Sent
                      <span className="ml-1.5 text-[9px] font-normal normal-case rounded bg-muted px-1.5 py-0.5">
                        Variant {dmTaskInfo.variant_number}
                      </span>
                      {dmTaskInfo.campaign_name && (
                        <span className="ml-1 text-[9px] font-normal normal-case rounded bg-primary/10 text-primary px-1.5 py-0.5">
                          {dmTaskInfo.campaign_name}
                        </span>
                      )}
                    </h3>
                    <div className="rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-secondary-foreground leading-relaxed">
                      {dmTaskInfo.message_text}
                    </div>
                    {dmTaskInfo.task_type === "followup_1a" && (
                      <p className="text-[10px] text-muted-foreground">This was a follow-up (-1A) message</p>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
                  <Textarea value={a2Notes} onChange={e => setA2Notes(e.target.value)}
                    onBlur={() => saveNotes("a2_notes", a2Notes)}
                    placeholder="Add notes..." className="min-h-[60px] text-sm resize-none" />
                </div>

                {(selectedContact.status === "engaged" || selectedContact.status === "calendly_sent" || selectedContact.status === "booked") && (
                  <div className="space-y-1.5">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">B Notes</h3>
                    <Textarea value={b_notes} onChange={e => setBNotes(e.target.value)}
                      onBlur={() => saveNotes("b_notes", b_notes)}
                      placeholder="VSL follow-up notes..." className="min-h-[60px] text-sm resize-none" />
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Pipeline;
