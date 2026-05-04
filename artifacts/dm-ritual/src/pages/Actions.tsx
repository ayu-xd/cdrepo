import { useEffect, useState, useCallback } from "react";
import { SkeletonRows } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { generateDailyTasks } from "@/lib/scheduler";
import { toast } from "sonner";
import { 
  RefreshCw, Check, ExternalLink, AlertCircle, 
  ChevronDown, ChevronUp, Zap, MessageCircle, 
  UserPlus, CheckCircle2, Clock, Loader2, XCircle, X
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

type DmTask = {
  id: string;
  campaign_id: string;
  contact_id: string;
  browser_instance_id: string;
  task_type: string;
  message_text: string;
  variant_number: number;
  status: string;
  error_reason: string | null;
  unreachable_type: string | null;
  created_at: string;
};

type ContactInfo = { id: string; username: string; full_name: string; status: string };
type CampaignInfo = { id: string; name: string };
type BrowserInfo = { id: string; label: string; ig_username: string | null };

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string; bg: string }> = {
  completed: { color: "#10b981", icon: null, label: "Sent", bg: "#10b98114" },
  pending: { color: "#94a3b8", icon: null, label: "Pending", bg: "transparent" },
  claimed: { color: "#3b82f6", icon: null, label: "Active", bg: "#3b82f614" },
  processing: { color: "#3b82f6", icon: null, label: "Active", bg: "#3b82f614" },
  failed: { color: "#ef4444", icon: null, label: "Failed", bg: "#ef444414" },
  skipped: { color: "#6b7280", icon: null, label: "Skipped", bg: "transparent" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  first_dm: { label: "New DM", color: "#6366f1" },
  followup_1a: { label: "Follow-up", color: "#a855f7" },
  scrape_followers: { label: "Scrape", color: "#f59e0b" },
  scrape_following: { label: "Scrape", color: "#f59e0b" },
};

const Actions = ({ userId }: { userId: string }) => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<"follow" | "dm">(
    settings.follow_before_dm ? "follow" : "dm"
  );
  const [tasks, setTasks] = useState<DmTask[]>([]);
  const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
  const [campaigns, setCampaigns] = useState<Map<string, CampaignInfo>>(new Map());
  const [browsers, setBrowsers] = useState<Map<string, BrowserInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const [followCandidates, setFollowCandidates] = useState<ContactInfo[]>([]);
  const [followLoading, setFollowLoading] = useState(true);
  const [followedToday, setFollowedToday] = useState(0);
  const [followBrowserList, setFollowBrowserList] = useState<BrowserInfo[]>([]);
  const [selectedFollowBrowserId, setSelectedFollowBrowserId] = useState<string>("");

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dateFormatted = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(now);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("dm_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("scheduled_date", today)
      .neq("task_type", "follow")
      .order("created_at", { ascending: true });

    const taskList = (data ?? []) as DmTask[];
    setTasks(taskList);

    const contactIds = [...new Set(taskList.map(t => t.contact_id))];
    const campaignIds = [...new Set(taskList.map(t => t.campaign_id))];
    const browserIds = [...new Set(taskList.map(t => t.browser_instance_id))];

    if (contactIds.length) {
      const { data: c } = await supabase.from("contacts")
        .select("id, username, full_name, status").in("id", contactIds);
      setContacts(new Map((c ?? []).map(x => [x.id, x as ContactInfo])));
    }
    if (campaignIds.length) {
      const { data: c } = await supabase.from("campaigns")
        .select("id, name").in("id", campaignIds);
      setCampaigns(new Map((c ?? []).map(x => [x.id, x as CampaignInfo])));
    }
    if (browserIds.length) {
      const { data: b } = await supabase.from("browser_instances")
        .select("id, label, ig_username").in("id", browserIds);
      setBrowsers(new Map((b ?? []).map(x => [x.id, x as BrowserInfo])));
    }

    setLoading(false);
  }, [userId, today]);

  const fetchFollowQueue = useCallback(async () => {
    setFollowLoading(true);

    const { data: activeCampaigns } = await supabase
      .from("campaigns").select("id").eq("user_id", userId).eq("status", "active");
    const campaignIds = (activeCampaigns ?? []).map(c => c.id);

    if (!campaignIds.length) { setFollowCandidates([]); setFollowLoading(false); return; }

    const { data: targets } = await supabase
      .from("campaign_targets").select("target_list_id").in("campaign_id", campaignIds);
    const listIds = [...new Set((targets ?? []).map(t => t.target_list_id))];

    if (!listIds.length) { setFollowCandidates([]); setFollowLoading(false); return; }

    const { data: items } = await supabase
      .from("target_list_items").select("contact_id").in("target_list_id", listIds);
    const contactIds = [...new Set((items ?? []).map(i => i.contact_id))];

    const todayStart = new Date(today).toISOString();
    
    // Fetch contacts followed today
    const { data: followedData } = await supabase.from("contacts")
      .select("id, username, full_name, status")
      .eq("user_id", userId).eq("status", "followed").gte("followed_at", todayStart);
    
    const followedList = (followedData ?? []) as ContactInfo[];
    setFollowedToday(followedList.length);

    // Fetch `not_started` contacts to fill the remaining slots
    const remainingSlots = Math.max(0, settings.follow_limit - followedList.length);
    let notStartedList: ContactInfo[] = [];

    if (remainingSlots > 0 && contactIds.length > 0) {
       const batches: string[][] = [];
       for (let i = 0; i < contactIds.length; i += 500) batches.push(contactIds.slice(i, i + 500));
       for (const batch of batches) {
         if (notStartedList.length >= remainingSlots) break;
         const { data } = await supabase.from("contacts")
           .select("id, username, full_name, status")
           .in("id", batch).eq("status", "not_started")
           .limit(remainingSlots - notStartedList.length);
         notStartedList = notStartedList.concat((data ?? []) as ContactInfo[]);
       }
    }

    setFollowCandidates([...notStartedList, ...followedList]);
    setFollowLoading(false);
  }, [userId, today, settings.follow_limit]);

  useEffect(() => {
    supabase.from("browser_instances")
      .select("id, label, ig_username")
      .eq("user_id", userId).eq("status", "active")
      .then(({ data }) => {
        const list = (data ?? []) as BrowserInfo[];
        setFollowBrowserList(list);
        if (list.length === 1) setSelectedFollowBrowserId(list[0].id);
      });
  }, [userId]);

  useEffect(() => {
    const autoGenerate = async () => {
      await fetchTasks();
      await fetchFollowQueue();
    };
    autoGenerate();
  }, [fetchTasks, fetchFollowQueue]);

  useEffect(() => {
    if (!loading && tasks.length === 0) {
      generateDailyTasks(userId, settings.dm_limit, settings.follow_before_dm)
        .then(() => fetchTasks())
        .catch(() => { });
    }
  }, [loading, tasks.length, userId, settings.dm_limit, settings.follow_before_dm, fetchTasks]);

  useEffect(() => {
    const channel = supabase.channel("dm-tasks-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_tasks" },
        (payload) => setTasks(prev =>
          prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as DmTask : t)
        ))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const refresh = () => { setLoading(true); setFollowLoading(true); fetchTasks(); fetchFollowQueue(); };

  // --- ACTIONS FOR REMOVAL / SKIPPING / TOGGLING ---
  const toggleFollow = async (contactId: string, currentStatus: string) => {
    if (!selectedFollowBrowserId && currentStatus === "not_started") {
      toast.error("Select an account first");
      return;
    }
    
    // Optimistic Update
    setFollowCandidates(prev => 
      prev.map(c => c.id === contactId ? { ...c, status: currentStatus === "not_started" ? "followed" : "not_started" } : c)
    );
    setFollowedToday(prev => currentStatus === "not_started" ? prev + 1 : Math.max(0, prev - 1));

    const newStatus = currentStatus === "not_started" ? "followed" : "not_started";
    const { error } = await supabase.from("contacts").update({
      status: newStatus,
      followed_at: newStatus === "followed" ? new Date().toISOString() : null,
      assigned_browser_id: newStatus === "followed" ? selectedFollowBrowserId : null,
    }).eq("id", contactId);

    if (error) { 
      toast.error(error.message); 
      // Revert optimistic update
      setFollowCandidates(prev => 
        prev.map(c => c.id === contactId ? { ...c, status: currentStatus } : c)
      );
      setFollowedToday(prev => newStatus === "followed" ? Math.max(0, prev - 1) : prev + 1);
      return; 
    }

    // NEW: If unchecking (reverting to not_started), ensure any pending DM tasks are deleted
    if (newStatus === "not_started") {
      await supabase.from("dm_tasks").delete().eq("contact_id", contactId).eq("status", "pending");
      fetchTasks(); // Refresh DM list to show the removal
    }
  };

  const removeFollowCandidate = async (contactId: string) => {
    const confirmed = window.confirm("Remove this contact from the queue and delete them permanently?");
    if (!confirmed) return;
    
    // Check if they were already followed to decrement count correctly
    const contact = followCandidates.find(c => c.id === contactId);
    if (contact?.status === "followed") {
      setFollowedToday(prev => Math.max(0, prev - 1));
    }

    setFollowCandidates(prev => prev.filter(c => c.id !== contactId));
    // Remove from target list and delete contact to naturally backfill
    await supabase.from("target_list_items").delete().eq("contact_id", contactId);
    await supabase.from("contacts").delete().eq("id", contactId);
    toast.success("Removed & replaced");
    fetchFollowQueue();
  };

  const skipDmTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await supabase.from("dm_tasks").update({ 
      scheduled_date: tomorrow.toISOString().slice(0, 10), 
      status: "pending" 
    }).eq("id", taskId);
    toast.success("Skipped to tomorrow");
  };

  const removeDmTask = async (taskId: string, contactId: string, contactName: string) => {
    if (!window.confirm(`Revert "${contactName}" back to the Follow list?`)) return;
    
    setTasks(prev => prev.filter(t => t.id !== taskId));
    // Delete the task so it doesn't get processed
    await supabase.from("dm_tasks").delete().eq("id", taskId);
    
    // Revert the contact back to not_started instead of permanently deleting them
    await supabase.from("contacts").update({
      status: "not_started",
      followed_at: null,
      assigned_browser_id: null
    }).eq("id", contactId);

    toast.success("Reverted to Follow list");
    fetchFollowQueue(); // Refresh Follow list
  };

  const completed = tasks.filter(t => t.status === "completed").length;
  const pending = tasks.filter(t => t.status === "pending").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const inProgress = tasks.filter(t => ["claimed", "processing"].includes(t.status)).length;

  const followPct = settings.follow_limit > 0
    ? Math.min(100, (followedToday / settings.follow_limit) * 100) : 0;
  const dmPct = tasks.length > 0
    ? Math.min(100, ((completed + failed) / tasks.length) * 100) : 0;
  
  const sortedFollowCandidates = [...followCandidates].sort((a, b) => {
    if (a.status === "followed" && b.status !== "followed") return 1;
    if (a.status !== "followed" && b.status === "followed") return -1;
    return 0;
  });

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-24 md:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Daily Actions</h1>
          <p className="text-sm text-muted-foreground">{dateFormatted}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading || followLoading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading || followLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Load Queue</span>
          </Button>
        </div>
      </div>

      {/* Section header with toggle */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {activeTab === "follow"
            ? `Follow (${followedToday}/${settings.follow_limit})`
            : `DM (${completed}/${tasks.length})${failed > 0 ? ` · Failed ${failed}` : ""}`}
        </h2>
        <div className="inline-flex items-center rounded-full border border-border p-0.5">
          {settings.follow_before_dm && (
            <button
              onClick={() => setActiveTab("follow")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                activeTab === "follow"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground"
              }`}
            >
              Follow
            </button>
          )}
          <button
            onClick={() => setActiveTab("dm")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "dm"
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            }`}
          >
            DM
          </button>
        </div>
      </div>

      <Progress
        value={activeTab === "follow" ? followPct : dmPct}
        className="h-2 mb-3"
      />

      {/* ══════════════ FOLLOW TAB ══════════════ */}
      {activeTab === "follow" && settings.follow_before_dm && (
        <div className="space-y-2">
          {/* Account selector */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {followBrowserList.length === 0 ? (
              <span className="text-xs text-muted-foreground">No active accounts</span>
            ) : (
              followBrowserList.map(b => (
                <button
                  key={b.id}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all border ${
                    selectedFollowBrowserId === b.id 
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:bg-secondary"
                  }`}
                  onClick={() => setSelectedFollowBrowserId(b.id)}
                >
                  {b.ig_username ? `@${b.ig_username}` : b.label}
                </button>
              ))
            )}
          </div>

          {/* List */}
          {followLoading ? (
            <SkeletonRows rows={6} />
          ) : followCandidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <UserPlus className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-medium">No contacts to follow</span>
              <span className="text-xs text-muted-foreground text-center">Add contacts to your target list or start a campaign</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sortedFollowCandidates.map((contact, i) => {
                const isCompleted = contact.status === "followed";
                return (
                  <div
                    key={contact.id}
                    className={`flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-all ${
                      isCompleted ? "opacity-50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={() => toggleFollow(contact.id, contact.status)}
                      className="h-4 w-4 shrink-0"
                      disabled={!isCompleted && followedToday >= settings.follow_limit}
                    />
                    
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium leading-tight truncate ${isCompleted ? "line-through" : ""}`}>
                        {contact.full_name}
                      </p>
                      {contact.username && (
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">@{contact.username}</p>
                      )}
                    </div>

                    {!isCompleted && (
                      <button
                        onClick={() => removeFollowCandidate(contact.id)}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                        title="Remove & replace"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a
                      href={`https://instagram.com/${contact.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ DM TAB ══════════════ */}
      {activeTab === "dm" && (
        <div className="space-y-2">
          {/* Stats chips */}
          {!loading && tasks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {completed > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> {completed} sent
                </span>
              )}
              {inProgress > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                  <Loader2 className="h-3 w-3 animate-spin" /> {inProgress} active
                </span>
              )}
              {pending > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Clock className="h-3 w-3" /> {pending} pending
                </span>
              )}
              {failed > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                  <XCircle className="h-3 w-3" /> {failed} failed
                </span>
              )}
            </div>
          )}

          {/* List */}
          {loading ? (
            <SkeletonRows rows={6} />
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 fade-in">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <span className="text-sm font-semibold">No tasks for today</span>
              <span className="text-xs text-muted-foreground text-center max-w-[18rem]">
                Tasks generate automatically each morning. Make sure your campaign is active and contacts are loaded.
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((task) => {
                const contact = contacts.get(task.contact_id);
                const browser = browsers.get(task.browser_instance_id);
                const isExpanded = expandedTask === task.id;
                const isScrape = task.task_type.startsWith("scrape_");
                const cfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
                const typeCfg = TYPE_CONFIG[task.task_type] ?? { label: "Task", color: "#6366f1" };

                const name = isScrape
                  ? `Scrape ${task.task_type === "scrape_followers" ? "followers" : "following"}`
                  : contact?.full_name ?? "Unknown";
                const handle = isScrape
                  ? (() => { try { return JSON.parse(task.message_text)?.target; } catch { return null; } })()
                  : contact?.username;

                const isActive = ["claimed", "processing"].includes(task.status);
                const isDone = task.status === "completed";

                return (
                  <div key={task.id}>
                    <div
                      className={`flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-all ${
                        isDone ? "opacity-50" : ""
                      }`}
                    >
                      {/* Status Checkbox/Indicator */}
                      <div className="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                        {isDone ? (
                           <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : isActive ? (
                           <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                        ) : task.status === 'failed' ? (
                           <XCircle className="h-4 w-4 text-destructive" />
                        ) : (
                           <div className="h-4 w-4 rounded-full border border-muted-foreground/40" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                        <p className={`text-sm font-medium leading-tight truncate ${isDone ? "line-through" : ""}`}>
                          {name}
                        </p>
                        {handle && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-muted-foreground leading-tight">@{handle}</span>
                            <span 
                              className="text-[9px] rounded px-1.5 py-[1px] font-medium"
                              style={{ backgroundColor: `${typeCfg.color}18`, color: typeCfg.color }}
                            >
                              {typeCfg.label}
                            </span>
                          </div>
                        )}
                      </div>

                      {!isDone && (
                        <>
                          <button
                            onClick={() => skipDmTask(task.id)}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-orange-500/15 hover:text-orange-500 transition-colors"
                            title="Skip → +1 day"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeDmTask(task.id, task.contact_id, name)}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                            title="Remove task"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}

                      <a
                        href={`https://instagram.com/${handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className={`mt-1 mb-2 ml-9 p-2 rounded-md text-xs ${task.error_reason ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {task.error_reason ? (
                          <>
                            <span className="flex items-center gap-1 font-semibold mb-1">
                              <AlertCircle className="h-3 w-3" /> Error
                            </span>
                            <span className="block mb-1">{task.error_reason}</span>
                            {task.unreachable_type && (
                              <span className="opacity-70 text-[10px]">Type: {task.unreachable_type}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex gap-4 mb-1">
                              <span><strong>Status:</strong> {cfg.label}</span>
                              {task.variant_number > 0 && <span><strong>Variant:</strong> {task.variant_number}</span>}
                            </div>
                            {campaigns.get(task.campaign_id) && (
                              <span className="block mb-1"><strong>Campaign:</strong> {campaigns.get(task.campaign_id)!.name}</span>
                            )}
                            {task.message_text && !isScrape && (
                              <div className="mt-1.5 p-1.5 bg-background/50 rounded text-[11px] font-mono whitespace-pre-wrap">
                                {task.message_text}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Completion banner */}
          {!loading && tasks.length > 0 && completed === tasks.length && (
            <div className="flex items-center justify-center gap-2 p-3 mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-500 fade-in">
              <Zap className="h-4 w-4" />
              All {tasks.length} DM tasks completed today 🎉
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Actions;
