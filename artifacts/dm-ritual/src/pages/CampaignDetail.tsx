import { useEffect, useState, useCallback } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronLeft, Play, Pause, CheckCircle2, AlertCircle, Clock, Send,
  Users, Target, Plus, X, Save, Monitor, MessageSquare, RefreshCw,
  ChevronDown, ChevronUp, Pencil, Trash2, Settings
} from "lucide-react";
import VariantsEditor from "@/components/VariantsEditor";

// ── Types ──────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  description: string;
  status: string;
  followup_enabled: boolean;
  followup_delay_days: number;
  messages_sent: number;
  replies_count: number;
  created_at: string;
};

type SequenceRow = { id: string; step_type: string; step_order: number; delay_days: number };
type VariantRow = { id: string; sequence_id: string; variant_number: number; message_text: string };

type TargetListInfo = { id: string; name: string; count: number };
type BrowserInfo = { id: string; label: string; ig_username: string | null; status: string };

type CampaignAccount = {
  id?: string;
  campaign_id: string;
  browser_instance_id: string;
  daily_dm_limit: number;
};

// ── Component ──────────────────────────────────────────────────────

const CampaignDetail = ({ userId }: { userId: string }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Task stats
  const [totalTasks, setTotalTasks] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);

  // Sequences & variants
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantEdits, setVariantEdits] = useState<Map<string, string>>(new Map());
  const [variantsDirty, setVariantsDirty] = useState(false);

  // Target lists
  const [linkedTargets, setLinkedTargets] = useState<string[]>([]);
  const [allTargetLists, setAllTargetLists] = useState<TargetListInfo[]>([]);

  // Browser accounts + pacing
  const [campaignAccounts, setCampaignAccounts] = useState<CampaignAccount[]>([]);
  const [allBrowsers, setAllBrowsers] = useState<BrowserInfo[]>([]);

  // Tabs
  const [activeTab, setActiveTab] = useState<"settings" | "targets" | "sequences" | "accounts" | "replies">("sequences");

  // ── Load data ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!id) return;

    const [campRes, tasksRes, seqRes, targetsRes, accountsRes, allTargetsRes, allBrowsersRes] =
      await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("dm_tasks").select("status, task_type").eq("campaign_id", id),
        supabase.from("sequences").select("id, step_type, step_order, delay_days").eq("campaign_id", id).order("step_order"),
        supabase.from("campaign_targets").select("target_list_id").eq("campaign_id", id),
        supabase.from("campaign_accounts").select("*").eq("campaign_id", id),
        supabase.from("target_lists").select("id, name, count").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("browser_instances").select("id, label, ig_username, status").eq("user_id", userId),
      ]);

    setCampaign(campRes.data as Campaign);

    const tasks = tasksRes.data ?? [];
    setTotalTasks(tasks.length);
    setCompleted(tasks.filter(t => t.status === "completed").length);
    setPending(tasks.filter(t => t.status === "pending").length);
    setFailed(tasks.filter(t => t.status === "failed").length);

    const seqs = (seqRes.data ?? []) as SequenceRow[];
    setSequences(seqs);

    const seqIds = seqs.map(s => s.id);
    if (seqIds.length) {
      const { data: vars } = await supabase
        .from("sequence_variants")
        .select("id, sequence_id, variant_number, message_text")
        .in("sequence_id", seqIds)
        .order("variant_number");
      setVariants((vars ?? []) as VariantRow[]);
    }

    setLinkedTargets((targetsRes.data ?? []).map(t => t.target_list_id));
    setCampaignAccounts((accountsRes.data ?? []) as CampaignAccount[]);
    setAllTargetLists((allTargetsRes.data ?? []) as TargetListInfo[]);
    setAllBrowsers((allBrowsersRes.data ?? []) as BrowserInfo[]);

    setVariantEdits(new Map());
    setVariantsDirty(false);
    setLoading(false);
  }, [id, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Campaign actions ──────────────────────────────────────────

  const toggleStatus = async () => {
    if (!campaign) return;
    const newStatus = campaign.status === "active" ? "paused" : "active";
    const { error } = await supabase
      .from("campaigns")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Campaign ${newStatus}`);
      setCampaign({ ...campaign, status: newStatus });
    }
  };

  const toggleFollowup = async () => {
    if (!campaign) return;
    const newVal = !campaign.followup_enabled;
    const { error } = await supabase
      .from("campaigns")
      .update({ followup_enabled: newVal, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    if (error) toast.error(error.message);
    else {
      toast.success(newVal ? "Follow-up enabled" : "Follow-up disabled");
      setCampaign({ ...campaign, followup_enabled: newVal });
    }
  };

  const updateDelay = async (days: number) => {
    if (!campaign) return;
    await supabase.from("campaigns")
      .update({ followup_delay_days: days, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    setCampaign({ ...campaign, followup_delay_days: days });
  };

  // ── Variant actions ───────────────────────────────────────────

  const editVariant = (variantId: string, text: string) => {
    setVariantEdits(prev => new Map(prev).set(variantId, text));
    setVariantsDirty(true);
  };

  const getVariantText = (v: VariantRow) => {
    return variantEdits.has(v.id) ? variantEdits.get(v.id)! : v.message_text;
  };

  const saveVariants = async () => {
    setSaving(true);
    for (const [varId, text] of variantEdits.entries()) {
      await supabase.from("sequence_variants").update({ message_text: text }).eq("id", varId);
    }
    toast.success("Variants saved");
    setVariantsDirty(false);
    setVariantEdits(new Map());
    await loadData();
    setSaving(false);
  };

  const addVariant = async (sequenceId: string) => {
    const seqVariants = variants.filter(v => v.sequence_id === sequenceId);
    const nextNum = seqVariants.length + 1;
    const { error } = await supabase.from("sequence_variants").insert({
      sequence_id: sequenceId,
      variant_number: nextNum,
      message_text: "",
    });
    if (error) toast.error(error.message);
    else { toast.success("Variant added"); loadData(); }
  };

  const deleteVariant = async (variantId: string, sequenceId: string) => {
    const seqVariants = variants.filter(v => v.sequence_id === sequenceId);
    if (seqVariants.length <= 1) { toast.error("Need at least 1 variant"); return; }
    if (!window.confirm("Delete this variant?")) return;
    await supabase.from("sequence_variants").delete().eq("id", variantId);
    toast.success("Variant deleted");
    loadData();
  };

  // ── Target list actions ───────────────────────────────────────

  const addTargetList = async (listId: string) => {
    if (!id) return;
    const { error } = await supabase.from("campaign_targets").insert({
      campaign_id: id,
      target_list_id: listId,
    });
    if (error) toast.error(error.message);
    else { toast.success("Target list added"); loadData(); }
  };

  const removeTargetList = async (listId: string) => {
    if (!id) return;
    if (!window.confirm("Remove this target list from the campaign?")) return;
    await supabase.from("campaign_targets").delete()
      .eq("campaign_id", id).eq("target_list_id", listId);
    toast.success("Target list removed");
    loadData();
  };

  // ── Account actions ───────────────────────────────────────────

  const addAccount = async (browserId: string) => {
    if (!id) return;
    const { error } = await supabase.from("campaign_accounts").insert({
      campaign_id: id,
      browser_instance_id: browserId,
      daily_dm_limit: 5,
    });
    if (error) toast.error(error.message);
    else { toast.success("Account added (5 DMs/day default)"); loadData(); }
  };

  const removeAccount = async (browserId: string) => {
    if (!id) return;
    if (!window.confirm("Remove this account from the campaign?")) return;
    await supabase.from("campaign_accounts").delete()
      .eq("campaign_id", id).eq("browser_instance_id", browserId);
    toast.success("Account removed");
    loadData();
  };

  const updatePacing = async (browserId: string, limit: number) => {
    if (!id) return;
    setCampaignAccounts(prev =>
      prev.map(a => a.browser_instance_id === browserId ? { ...a, daily_dm_limit: limit } : a)
    );
    await supabase.from("campaign_accounts").update({ daily_dm_limit: limit })
      .eq("campaign_id", id).eq("browser_instance_id", browserId);
  };

  // ── Render ────────────────────────────────────────────────────

  if (loading) return <PageSkeleton />;
  if (!campaign) return <div className="text-center py-20 text-muted-foreground">Campaign not found</div>;

  const linkedBrowserIds = new Set(campaignAccounts.map(a => a.browser_instance_id));
  const availableBrowsers = allBrowsers.filter(b => !linkedBrowserIds.has(b.id));
  const availableTargets = allTargetLists.filter(tl => !linkedTargets.includes(tl.id));

  return (
    <div className="max-w-3xl space-y-5 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/campaigns")} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">{campaign.name}</h1>
            {campaign.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{campaign.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] rounded-full px-2.5 py-1 font-medium ${
            campaign.status === "active" ? "bg-emerald-500/10 text-emerald-500"
            : campaign.status === "paused" ? "bg-amber-500/10 text-amber-500"
            : "bg-muted text-muted-foreground"
          }`}>
            {campaign.status}
          </span>
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              campaign.status === "active"
                ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
            }`}
          >
            {campaign.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {campaign.status === "active" ? "Pause" : "Activate"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Tasks", value: totalTasks, icon: Send, color: "text-muted-foreground" },
          { label: "Completed", value: completed, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Pending", value: pending, icon: Clock, color: "text-amber-500" },
          { label: "Failed", value: failed, icon: AlertCircle, color: "text-destructive" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-3">
            <div className={`flex items-center gap-1.5 ${s.color} mb-1`}>
              <s.icon className="h-3 w-3" /><span className="text-[10px]">{s.label}</span>
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-border bg-card overflow-x-auto scrollbar-hide px-2 pt-2">
        {[
          { id: "settings", label: "SETTINGS", icon: Settings },
          { id: "targets", label: "TARGETS", icon: Users },
          { id: "sequences", label: "SEQUENCES", icon: MessageSquare },
          { id: "accounts", label: "ACCOUNTS", icon: Monitor },
          { id: "replies", label: "REPLIES", icon: Send },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center gap-1.5 px-6 py-3 min-w-[100px] border-b-2 transition-colors ${
                isActive
                  ? "border-foreground text-foreground font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground font-medium"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] tracking-widest">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ═══════ SETTINGS TAB ═══════ */}
      {activeTab === "settings" && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Campaign Settings</h2>
            
            <div className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Follow-up (-1A)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.followup_enabled
                      ? `Enabled · ${campaign.followup_delay_days} day delay after first DM`
                      : "Disabled — only first DMs will be sent"}
                  </p>
                </div>
                <button
                  onClick={toggleFollowup}
                  style={{
                    position: "relative", width: "44px", height: "24px",
                    borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0,
                    background: campaign.followup_enabled ? "var(--foreground)" : "var(--muted)",
                    transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: "2px",
                    left: campaign.followup_enabled ? "22px" : "2px",
                    width: "20px", height: "20px",
                    borderRadius: "50%", background: "var(--background)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                    transition: "left 0.2s",
                  }} />
                </button>
              </div>
              {campaign.followup_enabled && (
                <div className="mt-4 flex items-center gap-4">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Delay:</span>
                  <input
                    type="range" min={1} max={14}
                    value={campaign.followup_delay_days}
                    onChange={e => updateDelay(Number(e.target.value))}
                    className="flex-1 accent-foreground"
                  />
                  <span className="text-sm font-bold w-12 text-center text-foreground">{campaign.followup_delay_days}d</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SEQUENCES TAB ═══════ */}
      {activeTab === "sequences" && (
        <VariantsEditor
          sequences={sequences}
          variants={variants}
          variantEdits={variantEdits}
          variantsDirty={variantsDirty}
          saving={saving}
          open={true}
          onToggle={() => {}}
          onEdit={editVariant}
          onSave={saveVariants}
          onAdd={addVariant}
          onDelete={deleteVariant}
          getVariantText={getVariantText}
        />
      )}

      {/* ═══════ TARGETS TAB ═══════ */}
      {activeTab === "targets" && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lists</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Lists of target users that messages will be sent to.</p>
          </div>
          <div className="space-y-2">
            {linkedTargets.map(tlId => {
              const info = allTargetLists.find(t => t.id === tlId);
              return (
                <div key={tlId} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold">{info?.name ?? "Unknown list"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{info?.count?.toLocaleString() ?? "?"} contacts</p>
                  </div>
                  <button
                    onClick={() => removeTargetList(tlId)}
                    className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            
            {availableTargets.length > 0 && (
              <div className="pt-2">
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { addTargetList(e.target.value); e.target.value = ""; } }}
                  className="w-full rounded-md border-2 border-dashed border-border bg-transparent px-4 py-3 text-sm text-muted-foreground font-medium hover:border-foreground/30 transition-colors focus:outline-none"
                >
                  <option value="">+ Add target list...</option>
                  {availableTargets.map(tl => (
                    <option key={tl.id} value={tl.id}>{tl.name} ({tl.count} contacts)</option>
                  ))}
                </select>
              </div>
            )}
            
            {linkedTargets.length === 0 && availableTargets.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No target lists available. Create one first.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ ACCOUNTS TAB ═══════ */}
      {activeTab === "accounts" && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
           <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Accounts & Pacing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Set a daily DM limit per account. Start low (5) for new accounts.</p>
          </div>
          <div className="space-y-3">
            {campaignAccounts.map(acc => {
              const browser = allBrowsers.find(b => b.id === acc.browser_instance_id);
              return (
                <div key={acc.browser_instance_id} className="rounded-md border border-border bg-background px-4 py-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {browser?.ig_username ? `@${browser.ig_username}` : browser?.label ?? "Unknown"}
                      </p>
                      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full mt-1 inline-block">{browser?.status ?? "?"}</span>
                    </div>
                    <button
                      onClick={() => removeAccount(acc.browser_instance_id)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 bg-muted/20 p-3 rounded-md">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">DMs/day:</span>
                    <input
                      type="range" min={1} max={50}
                      value={acc.daily_dm_limit}
                      onChange={e => updatePacing(acc.browser_instance_id, Number(e.target.value))}
                      className="flex-1 accent-foreground"
                    />
                    <input
                      type="number" min={1} max={50}
                      value={acc.daily_dm_limit}
                      onChange={e => updatePacing(acc.browser_instance_id, Math.max(1, Math.min(50, Number(e.target.value))))}
                      className="w-14 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-center font-bold"
                    />
                  </div>
                </div>
              );
            })}
            
            {availableBrowsers.length > 0 && (
              <div className="pt-2">
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { addAccount(e.target.value); e.target.value = ""; } }}
                  className="w-full rounded-md border-2 border-dashed border-border bg-transparent px-4 py-3 text-sm text-muted-foreground font-medium hover:border-foreground/30 transition-colors focus:outline-none"
                >
                  <option value="">+ Add account...</option>
                  {availableBrowsers.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.ig_username ? `@${b.ig_username}` : b.label} ({b.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {campaignAccounts.length === 0 && availableBrowsers.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground">
                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No browser accounts available. Pair one first.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ REPLIES TAB ═══════ */}
      {activeTab === "replies" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center space-y-3">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <div>
            <h2 className="text-base font-semibold">Replies Inbox</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              This section is under construction. Soon you will be able to see and respond to campaign replies directly from here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignDetail;
