import { useEffect, useState, useCallback } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";
import { generateDailyTasks, getTodayStats } from "@/lib/scheduler";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Megaphone, Monitor, Zap, RefreshCw, CheckCircle2,
  AlertCircle, Clock, Send, ArrowRight
} from "lucide-react";

type CampaignSummary = {
  id: string;
  name: string;
  status: string;
  messages_sent: number;
  replies_count: number;
};

type BrowserSummary = {
  id: string;
  label: string;
  ig_username: string | null;
  status: string;
  last_heartbeat_at: string | null;
};

type TodayStats = {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  processing: number;
  followups: number;
  newDms: number;
};

type TaskRow = {
  status: string;
  task_type: string;
  variant_number: number;
  scheduled_date: string;
};

const Dashboard = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const now = new Date();

  const getGreeting = () => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [browsers, setBrowsers] = useState<BrowserSummary[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [campaignNames, setCampaignNames] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("campaigns").select("id, name").eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCampaignNames(data ?? []));
  }, [userId]);

  const fetchData = useCallback(async () => {
    const campId = campaignFilter !== "all" ? campaignFilter : undefined;

    let taskQuery = supabase
      .from("dm_tasks")
      .select("status, task_type, variant_number, scheduled_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (campId) taskQuery = taskQuery.eq("campaign_id", campId);

    const [campRes, browserRes, todayStats, taskRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, status, messages_sent, replies_count")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("browser_instances")
        .select("id, label, ig_username, status, last_heartbeat_at")
        .eq("user_id", userId),
      getTodayStats(userId, campId),
      taskQuery,
    ]);

    setCampaigns((campRes.data ?? []) as CampaignSummary[]);
    setBrowsers((browserRes.data ?? []) as BrowserSummary[]);
    setStats(todayStats);
    setAllTasks((taskRes.data ?? []) as TaskRow[]);
    setLoading(false);
  }, [userId, campaignFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateDailyTasks(userId, settings.dm_limit, settings.follow_before_dm);
      toast.success(result.message);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate tasks");
    }
    setGenerating(false);
  };

  const getBrowserStatus = (b: BrowserSummary) => {
    if (b.status !== "active") return { label: "Inactive", color: "text-muted-foreground", dot: "bg-muted-foreground" };
    if (!b.last_heartbeat_at) return { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground" };
    const diff = Date.now() - new Date(b.last_heartbeat_at).getTime();
    if (diff < 90_000) return { label: "Online", color: "text-emerald-500", dot: "bg-emerald-500" };
    if (diff < 300_000) return { label: "Idle", color: "text-amber-500", dot: "bg-amber-500" };
    return { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground" };
  };

  const activeCampaigns = campaigns.filter(c => c.status === "active");

  const variantStats = new Map<number, { sent: number; failed: number }>();
  allTasks.forEach(t => {
    const existing = variantStats.get(t.variant_number) || { sent: 0, failed: 0 };
    if (t.status === "completed") existing.sent++;
    if (t.status === "failed") existing.failed++;
    variantStats.set(t.variant_number, existing);
  });

  const dailyStats = new Map<string, { completed: number; failed: number; total: number }>();
  allTasks.forEach(t => {
    const date = t.scheduled_date;
    const existing = dailyStats.get(date) || { completed: 0, failed: 0, total: 0 };
    existing.total++;
    if (t.status === "completed") existing.completed++;
    if (t.status === "failed") existing.failed++;
    dailyStats.set(date, existing);
  });
  const sortedDays = Array.from(dailyStats.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 10);

  if (loading) return <PageSkeleton rows={6} />;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{getGreeting()}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{format(now, "EEEE, MMMM d")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {campaignNames.length > 0 && (
            <select
              value={campaignFilter}
              onChange={e => { setCampaignFilter(e.target.value); setLoading(true); }}
              className="h-8 text-xs rounded-lg border border-border bg-background px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="all">All campaigns</option>
              {campaignNames.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {generating
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : <Zap className="h-3.5 w-3.5" />
            }
            <span className="hidden sm:inline">{generating ? "Generating…" : "Generate Tasks"}</span>
            <span className="sm:hidden">{generating ? "…" : "Generate"}</span>
          </button>
        </div>
      </div>

      {/* ── Today's stats ── */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { icon: Send, label: "Total", value: stats.total, sub: `${stats.newDms} new · ${stats.followups} FU`, color: "" },
            { icon: CheckCircle2, label: "Sent", value: stats.completed, sub: `${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% done`, color: "text-emerald-500" },
            { icon: Clock, label: "Pending", value: stats.pending, sub: stats.processing > 0 ? `${stats.processing} active` : "queued", color: "text-amber-500" },
            { icon: AlertCircle, label: "Failed", value: stats.failed, sub: "errors", color: "text-destructive" },
          ].map(({ icon: Icon, label, value, sub, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3.5">
              <div className={`flex items-center gap-1.5 mb-1.5 ${color || "text-muted-foreground"}`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {stats && stats.total === 0 && activeCampaigns.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
          <Zap className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No tasks generated yet for today.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Tap "Generate Tasks" above to fill the queue.</p>
        </div>
      )}

      {/* ── Variant Performance ── */}
      {variantStats.size > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Variant Performance</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {Array.from(variantStats.entries())
              .sort(([a], [b]) => a - b)
              .map(([num, stat]) => (
                <div key={num} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[10px] text-muted-foreground font-medium">V{num}</p>
                  <p className="text-xl font-bold mt-0.5">{stat.sent}</p>
                  {stat.failed > 0 && <p className="text-[10px] text-destructive">{stat.failed} failed</p>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Daily Activity ── */}
      {sortedDays.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent Activity</h2>
          <div className="space-y-1 rounded-xl border border-border bg-card overflow-hidden">
            {sortedDays.map(([date, stat], i) => (
              <div
                key={date}
                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors"
                style={{ borderTop: i > 0 ? "1px solid hsl(var(--border) / 0.4)" : "none" }}
              >
                <span className="text-[11px] text-muted-foreground font-mono w-[88px] shrink-0">{date}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div className="bg-emerald-500 rounded-l-full" style={{ width: `${stat.total > 0 ? (stat.completed / stat.total) * 100 : 0}%` }} />
                    <div className="bg-destructive" style={{ width: `${stat.total > 0 ? (stat.failed / stat.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="flex gap-1.5 text-[11px] shrink-0">
                  <span className="text-emerald-500 font-semibold">{stat.completed}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium">{stat.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Campaigns ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Campaigns ({activeCampaigns.length} active)
          </h2>
          <button onClick={() => navigate("/campaigns/new")} className="text-xs text-primary font-medium hover:underline">
            + New
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Megaphone className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            <button onClick={() => navigate("/campaigns/new")} className="mt-2 text-xs text-primary font-medium hover:underline">
              Create your first campaign
            </button>
          </div>
        ) : (
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map(c => {
              const rate = c.messages_sent > 0
                ? ((c.replies_count / c.messages_sent) * 100).toFixed(1) + "%"
                : "—";
              const isActive = c.status === "active";
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/campaigns/${c.id}`)}
                  className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/40 transition-colors group active:bg-accent/60"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <Megaphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate flex-1">{c.name}</span>
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold shrink-0 ${
                      isActive ? "bg-emerald-500/10 text-emerald-500"
                        : c.status === "paused" ? "bg-amber-500/10 text-amber-500"
                        : c.status === "draft" ? "bg-muted text-muted-foreground"
                        : "bg-blue-500/10 text-blue-500"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-foreground">{c.messages_sent}</span> sent</span>
                    <span><span className="font-semibold text-foreground">{c.replies_count}</span> replies</span>
                    <span><span className="font-semibold text-foreground">{rate}</span></span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    View details <ArrowRight className="h-3 w-3" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Browser Fleet ── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Browsers ({browsers.length})
          </h2>
          <button onClick={() => navigate("/browsers")} className="text-xs text-primary font-medium hover:underline">
            Manage
          </button>
        </div>

        {browsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Monitor className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No browsers paired yet.</p>
            <button onClick={() => navigate("/browsers")} className="mt-2 text-xs text-primary font-medium hover:underline">
              Add a browser
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {browsers.map(b => {
              const s = getBrowserStatus(b);
              return (
                <button
                  key={b.id}
                  onClick={() => navigate("/browsers")}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:bg-accent/40 transition-colors active:bg-accent/60"
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                  <span className="text-xs font-medium">{b.label || b.ig_username || "Browser"}</span>
                  <span className={`text-[10px] ${s.color}`}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
