import { useEffect, useState, useCallback } from "react";
import { SkeletonRows } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { generateDailyTasks } from "@/lib/scheduler";
import { toast } from "sonner";
import { RefreshCw, Check, ExternalLink, AlertCircle, ChevronDown, ChevronUp, Zap, MessageCircle, UserPlus, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

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

// Inject CSS animations once
function injectStyles() {
  if (typeof document === "undefined" || document.getElementById("actions-kf")) return;
  const s = document.createElement("style");
  s.id = "actions-kf";
  s.textContent = `
    @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.7)} }
    @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes slide-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fade-in { from{opacity:0} to{opacity:1} }
    @keyframes pop { 0%{transform:scale(1)} 50%{transform:scale(1.18)} 100%{transform:scale(1)} }
    .action-row:hover { background: var(--accent) !important; }
    .follow-row:hover { background: var(--accent) !important; }
    .follow-row:hover .follow-check { border-color: var(--foreground) !important; }
  `;
  document.head.appendChild(s);
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string; bg: string }> = {
  completed: { color: "#10b981", icon: null, label: "Sent", bg: "#10b98114" },
  pending:   { color: "#94a3b8", icon: null, label: "Pending", bg: "transparent" },
  claimed:   { color: "#3b82f6", icon: null, label: "Active", bg: "#3b82f614" },
  processing:{ color: "#3b82f6", icon: null, label: "Active", bg: "#3b82f614" },
  failed:    { color: "#ef4444", icon: null, label: "Failed", bg: "#ef444414" },
  skipped:   { color: "#6b7280", icon: null, label: "Skipped", bg: "transparent" },
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  first_dm:            { label: "New DM", color: "#6366f1" },
  followup_1a:         { label: "Follow-up", color: "#a855f7" },
  scrape_followers:    { label: "Scrape", color: "#f59e0b" },
  scrape_following:    { label: "Scrape", color: "#f59e0b" },
};

const Actions = ({ userId }: { userId: string }) => {
  injectStyles();
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
  const [justFollowed, setJustFollowed] = useState<Set<string>>(new Set());

  const [followCandidates, setFollowCandidates] = useState<ContactInfo[]>([]);
  const [followLoading, setFollowLoading] = useState(true);
  const [followedToday, setFollowedToday] = useState(0);
  const [followBrowserList, setFollowBrowserList] = useState<BrowserInfo[]>([]);
  const [selectedFollowBrowserId, setSelectedFollowBrowserId] = useState<string>("");

  const today = new Date().toISOString().slice(0, 10);

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

    if (!contactIds.length) { setFollowCandidates([]); setFollowLoading(false); return; }

    const batches: string[][] = [];
    for (let i = 0; i < contactIds.length; i += 500) batches.push(contactIds.slice(i, i + 500));
    let allContacts: ContactInfo[] = [];
    for (const batch of batches) {
      const { data } = await supabase.from("contacts")
        .select("id, username, full_name, status").in("id", batch).eq("status", "not_started");
      allContacts = allContacts.concat((data ?? []) as ContactInfo[]);
    }

    const todayStart = new Date(today).toISOString();
    const { count } = await supabase.from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "followed").gte("followed_at", todayStart);

    setFollowedToday(count ?? 0);
    setFollowCandidates(allContacts.slice(0, settings.follow_limit));
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
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const channel = supabase.channel("dm-tasks-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_tasks" },
        (payload) => setTasks(prev =>
          prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as DmTask : t)
        ))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const markFollowed = async (contactId: string) => {
    if (!selectedFollowBrowserId) {
      toast.error("Select an account first");
      return;
    }
    setJustFollowed(prev => new Set([...prev, contactId]));
    setTimeout(() => {
      setFollowCandidates(prev => prev.filter(c => c.id !== contactId));
      setFollowedToday(prev => prev + 1);
      setJustFollowed(prev => { const s = new Set(prev); s.delete(contactId); return s; });
    }, 350);
    const { error } = await supabase.from("contacts").update({
      status: "followed",
      followed_at: new Date().toISOString(),
      assigned_browser_id: selectedFollowBrowserId,
    }).eq("id", contactId);
    if (error) { toast.error(error.message); return; }
  };

  const refresh = () => { setLoading(true); setFollowLoading(true); fetchTasks(); fetchFollowQueue(); };

  const completed  = tasks.filter(t => t.status === "completed").length;
  const pending    = tasks.filter(t => t.status === "pending").length;
  const failed     = tasks.filter(t => t.status === "failed").length;
  const inProgress = tasks.filter(t => ["claimed", "processing"].includes(t.status)).length;

  const followPct = settings.follow_limit > 0
    ? Math.min(100, (followedToday / settings.follow_limit) * 100) : 0;
  const dmPct = tasks.length > 0
    ? Math.min(100, ((completed + failed) / tasks.length) * 100) : 0;
  const allDone = followedToday >= settings.follow_limit;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem",
            border: "1px solid var(--border)", background: "transparent", cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
          onClick={refresh}
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>

        {/* Pill tab switcher */}
        <div style={{
          display: "inline-flex", alignItems: "center",
          border: "1px solid var(--border)", borderRadius: "999px", padding: "2px",
        }}>
          {settings.follow_before_dm && (
            <button
              style={{
                display: "flex", alignItems: "center", gap: "0.3rem",
                padding: "0.2rem 0.75rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 500,
                cursor: "pointer", border: "none", transition: "all 0.15s",
                background: activeTab === "follow" ? "var(--foreground)" : "transparent",
                color: activeTab === "follow" ? "var(--background)" : "var(--muted-foreground)",
                whiteSpace: "nowrap" as const,
              }}
              onClick={() => setActiveTab("follow")}
            >
              Follow ({followedToday}/{settings.follow_limit})
            </button>
          )}
          <button
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.2rem 0.75rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 500,
              cursor: "pointer", border: "none", transition: "all 0.15s",
              background: activeTab === "dm" ? "var(--foreground)" : "transparent",
              color: activeTab === "dm" ? "var(--background)" : "var(--muted-foreground)",
              whiteSpace: "nowrap" as const,
            }}
            onClick={() => setActiveTab("dm")}
          >
            DMs ({completed}/{tasks.length})
          </button>
        </div>
      </div>

      {/* ══════════════ FOLLOW TAB ══════════════ */}
      {activeTab === "follow" && settings.follow_before_dm && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", animation: "slide-in 0.2s ease" }}>

          {/* Account selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" as const }}>
            {followBrowserList.length === 0 ? (
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>No active accounts</span>
            ) : (
              followBrowserList.map(b => (
                <button
                  key={b.id}
                  style={{
                    padding: "0.15rem 0.55rem", borderRadius: "999px", fontSize: "0.68rem", fontWeight: 500,
                    border: `1px solid ${selectedFollowBrowserId === b.id ? "var(--foreground)" : "var(--border)"}`,
                    background: selectedFollowBrowserId === b.id ? "var(--foreground)" : "transparent",
                    color: selectedFollowBrowserId === b.id ? "var(--background)" : "var(--muted-foreground)",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                  onClick={() => setSelectedFollowBrowserId(b.id)}
                >
                  {b.ig_username ? `@${b.ig_username}` : b.label}
                </button>
              ))
            )}
          </div>

          {/* Progress bar */}
          {settings.follow_limit > 0 && (
            <div style={{ height: "1px", background: "var(--border)", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                background: allDone ? "#10b981" : "var(--foreground)",
                width: `${followPct}%`,
                transition: "width 0.5s ease, background 0.3s",
              }} />
            </div>
          )}

          {/* List */}
          {followLoading ? (
            <SkeletonRows rows={6} />
          ) : allDone ? (
            /* Completion state */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
              padding: "2.5rem 1rem", animation: "fade-in 0.4s ease",
            }}>
              <div style={{
                width: "2.5rem", height: "2.5rem", borderRadius: "50%",
                background: "#10b98120", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckCircle2 size={20} color="#10b981" />
              </div>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--foreground)" }}>
                All {settings.follow_limit} follows done!
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                DMs will auto-generate tomorrow morning.
              </span>
            </div>
          ) : followCandidates.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
              padding: "2.5rem 1rem",
            }}>
              <UserPlus size={24} color="var(--muted-foreground)" style={{ opacity: 0.4 }} />
              <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--foreground)" }}>
                No contacts to follow
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", textAlign: "center" }}>
                Add contacts to your target list or start a campaign
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {followCandidates.map((contact, i) => {
                const isJustFollowed = justFollowed.has(contact.id);
                return (
                  <div
                    key={contact.id}
                    className="follow-row"
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.5rem 0.6rem", borderRadius: "0.5rem",
                      background: "var(--card)", cursor: "default",
                      transition: "all 0.2s",
                      opacity: isJustFollowed ? 0 : 1,
                      transform: isJustFollowed ? "translateX(8px)" : "none",
                      animationDelay: `${i * 0.03}s`,
                      animation: "slide-in 0.2s ease both",
                    }}
                  >
                    {/* Avatar placeholder */}
                    <div style={{
                      width: "1.75rem", height: "1.75rem", borderRadius: "50%", flexShrink: 0,
                      background: `hsl(${(contact.full_name.charCodeAt(0) * 37) % 360}, 55%, 60%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.65rem", fontWeight: 700, color: "#fff",
                    }}>
                      {contact.full_name.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {contact.full_name}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>
                        @{contact.username}
                      </div>
                    </div>

                    <a
                      href={`https://instagram.com/${contact.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "1.5rem", height: "1.5rem", borderRadius: "0.375rem",
                        color: "var(--muted-foreground)", textDecoration: "none", flexShrink: 0,
                        border: "1px solid var(--border)", background: "transparent",
                      }}
                      title="Open Instagram"
                    >
                      <ExternalLink size={10} />
                    </a>

                    <button
                      className="follow-check"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "1.5rem", height: "1.5rem", borderRadius: "0.375rem", flexShrink: 0,
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--muted-foreground)", cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onClick={() => markFollowed(contact.id)}
                      disabled={followedToday >= settings.follow_limit}
                      title="Mark as followed"
                    >
                      <Check size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ DM TAB ══════════════ */}
      {activeTab === "dm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", animation: "slide-in 0.2s ease" }}>

          {/* Stats chips */}
          {!loading && tasks.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" as const }}>
              {completed > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem", fontWeight: 500, color: "#10b981", background: "#10b98114", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                  <CheckCircle2 size={11} /> {completed} sent
                </span>
              )}
              {inProgress > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem", fontWeight: 500, color: "#3b82f6", background: "#3b82f614", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                  <Loader2 size={11} style={{ animation: "spin-slow 1s linear infinite" }} /> {inProgress} active
                </span>
              )}
              {pending > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem", fontWeight: 500, color: "var(--muted-foreground)", background: "var(--muted)", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                  <Clock size={11} /> {pending} pending
                </span>
              )}
              {failed > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem", fontWeight: 500, color: "#ef4444", background: "#ef444414", padding: "0.15rem 0.5rem", borderRadius: "999px" }}>
                  <XCircle size={11} /> {failed} failed
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {tasks.length > 0 && (
            <div style={{ height: "1px", background: "var(--border)", borderRadius: "999px", overflow: "hidden" }}>
              <div style={{
                height: "100%", background: completed === tasks.length ? "#10b981" : "var(--foreground)",
                width: `${dmPct}%`, transition: "width 0.5s ease, background 0.3s",
              }} />
            </div>
          )}

          {/* List */}
          {loading ? (
            <SkeletonRows rows={6} />
          ) : tasks.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem",
              padding: "3rem 1rem", animation: "fade-in 0.4s ease",
            }}>
              <div style={{
                width: "2.75rem", height: "2.75rem", borderRadius: "50%",
                background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <MessageCircle size={20} color="var(--muted-foreground)" style={{ opacity: 0.5 }} />
              </div>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>No tasks for today</span>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", textAlign: "center" as const, maxWidth: "18rem" }}>
                Tasks generate automatically each morning. Make sure your campaign is active and contacts are loaded.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {tasks.map((task, i) => {
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
                  <div key={task.id} style={{ animation: `slide-in 0.2s ease ${i * 0.02}s both` }}>
                    <button
                      className="action-row"
                      style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        padding: "0.5rem 0.6rem", borderRadius: "0.5rem",
                        background: "var(--card)", width: "100%", textAlign: "left", cursor: "pointer",
                        border: "none", transition: "background 0.15s",
                        opacity: isDone ? 0.55 : 1,
                      }}
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      {/* Status dot */}
                      <div style={{
                        width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                        background: cfg.color,
                        animation: isActive ? "pulse-dot 1.4s ease-in-out infinite" : "none",
                        boxShadow: isActive ? `0 0 6px ${cfg.color}80` : "none",
                      }} />

                      {/* Name + handle */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: "0.75rem", fontWeight: 500,
                          whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
                          display: "block",
                          textDecoration: isDone ? "line-through" : "none",
                          color: isDone ? "var(--muted-foreground)" : "var(--foreground)",
                        }}>
                          {name}
                          {handle && (
                            <span style={{ fontWeight: 400, color: "var(--muted-foreground)", marginLeft: "0.25rem" }}>
                              @{handle}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Type pill */}
                      <span style={{
                        fontSize: "0.6rem", fontWeight: 600, padding: "0.1rem 0.4rem",
                        borderRadius: "999px", flexShrink: 0, letterSpacing: "0.02em",
                        background: `${typeCfg.color}18`, color: typeCfg.color,
                      }}>
                        {typeCfg.label}
                      </span>

                      {/* Browser */}
                      {browser && (
                        <span style={{
                          fontSize: "0.6rem", color: "var(--muted-foreground)", flexShrink: 0,
                          maxWidth: "72px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                        }}>
                          {browser.ig_username ?? browser.label}
                        </span>
                      )}

                      {/* Expand chevron */}
                      <span style={{ color: "var(--muted-foreground)", flexShrink: 0, display: "flex" }}>
                        {isExpanded
                          ? <ChevronUp size={12} />
                          : <ChevronDown size={12} />
                        }
                      </span>
                    </button>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div style={{
                        margin: "2px 0 4px",
                        padding: "0.5rem 0.7rem",
                        borderRadius: "0.5rem",
                        background: task.error_reason ? "#ef444410" : "var(--muted)",
                        fontSize: "0.68rem",
                        color: task.error_reason ? "#ef4444" : "var(--muted-foreground)",
                        animation: "slide-in 0.15s ease",
                        lineHeight: 1.5,
                        display: "flex", flexDirection: "column", gap: "0.25rem",
                      }}>
                        {task.error_reason ? (
                          <>
                            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontWeight: 600 }}>
                              <AlertCircle size={11} /> Error
                            </span>
                            <span>{task.error_reason}</span>
                            {task.unreachable_type && (
                              <span style={{ opacity: 0.7 }}>Type: {task.unreachable_type}</span>
                            )}
                          </>
                        ) : (
                          <>
                            <div style={{ display: "flex", gap: "1rem" }}>
                              <span><strong>Status:</strong> {cfg.label}</span>
                              <span><strong>Type:</strong> {typeCfg.label}</span>
                              {task.variant_number > 0 && <span><strong>Variant:</strong> {task.variant_number}</span>}
                            </div>
                            {campaigns.get(task.campaign_id) && (
                              <span><strong>Campaign:</strong> {campaigns.get(task.campaign_id)!.name}</span>
                            )}
                            {task.message_text && !isScrape && (
                              <div style={{
                                marginTop: "0.25rem", padding: "0.4rem 0.5rem",
                                background: "var(--card)", borderRadius: "0.375rem",
                                color: "var(--foreground)", fontStyle: "italic",
                                overflow: "hidden", maxHeight: "5rem",
                              }}>
                                "{task.message_text.slice(0, 200)}{task.message_text.length > 200 ? "…" : ""}"
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
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              padding: "0.75rem", borderRadius: "0.625rem",
              background: "#10b98112", border: "1px solid #10b98130",
              fontSize: "0.75rem", fontWeight: 600, color: "#10b981",
              animation: "fade-in 0.4s ease",
            }}>
              <Zap size={13} />
              All {tasks.length} DM tasks completed today 🎉
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Actions;
