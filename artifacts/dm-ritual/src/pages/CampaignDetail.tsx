import { useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, Play, Pause, CheckCircle2, AlertCircle, Clock, Send, Users, Target } from "lucide-react";

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

type TaskStat = {
  status: string;
  task_type: string;
  count: number;
};

type Variant = {
  variant_number: number;
  message_text: string;
  step_type: string;
};

const CampaignDetail = ({ userId }: { userId: string }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStat[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [targetCount, setTargetCount] = useState(0);
  const [accountCount, setAccountCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [campRes, tasksRes, seqRes, targetsRes, accountsRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("dm_tasks").select("status, task_type").eq("campaign_id", id),
        supabase.from("sequences").select("id, step_type").eq("campaign_id", id),
        supabase.from("campaign_targets").select("target_list_id").eq("campaign_id", id),
        supabase.from("campaign_accounts").select("browser_instance_id").eq("campaign_id", id),
      ]);

      setCampaign(campRes.data as Campaign);
      setTargetCount(targetsRes.data?.length ?? 0);
      setAccountCount(accountsRes.data?.length ?? 0);

      // Aggregate task stats
      const tasks = tasksRes.data ?? [];
      const statMap = new Map<string, number>();
      tasks.forEach(t => {
        const key = `${t.status}:${t.task_type}`;
        statMap.set(key, (statMap.get(key) || 0) + 1);
      });
      setTaskStats(
        Array.from(statMap.entries()).map(([key, count]) => {
          const [status, task_type] = key.split(":");
          return { status, task_type, count };
        })
      );

      // Load variants
      const seqIds = (seqRes.data ?? []).map(s => s.id);
      if (seqIds.length) {
        const { data: vars } = await supabase
          .from("sequence_variants")
          .select("variant_number, message_text, sequence_id")
          .in("sequence_id", seqIds)
          .order("variant_number");

        const seqTypeMap = new Map((seqRes.data ?? []).map(s => [s.id, s.step_type]));
        setVariants(
          (vars ?? []).map(v => ({
            variant_number: v.variant_number,
            message_text: v.message_text,
            step_type: seqTypeMap.get(v.sequence_id) || "first_message",
          }))
        );
      }

      setLoading(false);
    };
    load();
  }, [id]);

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

  const totalTasks = taskStats.reduce((acc, s) => acc + s.count, 0);
  const completed = taskStats.filter(s => s.status === "completed").reduce((acc, s) => acc + s.count, 0);
  const failed = taskStats.filter(s => s.status === "failed").reduce((acc, s) => acc + s.count, 0);
  const pending = taskStats.filter(s => s.status === "pending").reduce((acc, s) => acc + s.count, 0);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!campaign) {
    return <div className="text-center py-20 text-muted-foreground">Campaign not found</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
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
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Send className="h-3 w-3" /><span className="text-[10px]">Total Tasks</span>
          </div>
          <p className="text-xl font-bold">{totalTasks}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-emerald-500 mb-1">
            <CheckCircle2 className="h-3 w-3" /><span className="text-[10px]">Completed</span>
          </div>
          <p className="text-xl font-bold text-emerald-500">{completed}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-amber-500 mb-1">
            <Clock className="h-3 w-3" /><span className="text-[10px]">Pending</span>
          </div>
          <p className="text-xl font-bold text-amber-500">{pending}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-destructive mb-1">
            <AlertCircle className="h-3 w-3" /><span className="text-[10px]">Failed</span>
          </div>
          <p className="text-xl font-bold text-destructive">{failed}</p>
        </div>
      </div>

      {/* Config overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">Target Lists</span>
          </div>
          <p className="text-sm font-semibold">{targetCount} list(s)</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium">Accounts</span>
          </div>
          <p className="text-sm font-semibold">{accountCount} browser(s)</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-[10px] text-muted-foreground font-medium">Follow-up -1A</span>
          <p className="text-sm font-semibold">
            {campaign.followup_enabled
              ? `Enabled · ${campaign.followup_delay_days}d delay`
              : "Disabled"}
          </p>
        </div>
      </div>

      {/* Variants */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Message Variants</h2>
        {["first_message", "followup_1a"].map(stepType => {
          const stepVariants = variants.filter(v => v.step_type === stepType);
          if (!stepVariants.length) return null;
          return (
            <div key={stepType} className="space-y-2">
              <p className="text-xs font-medium">
                {stepType === "first_message" ? "First Message" : "Follow-up (-1A)"}
                <span className="text-muted-foreground ml-1">· {stepVariants.length} variants</span>
              </p>
              <div className="space-y-1.5">
                {stepVariants.map(v => (
                  <div key={v.variant_number} className="flex gap-2 rounded-md bg-muted/40 p-2.5">
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 w-4 pt-0.5">
                      {v.variant_number}
                    </span>
                    <p className="text-xs leading-relaxed">{v.message_text}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CampaignDetail;
