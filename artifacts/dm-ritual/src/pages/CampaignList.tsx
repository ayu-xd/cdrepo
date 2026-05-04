import { useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Plus, ArrowRight } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  description: string;
  status: string;
  followup_enabled: boolean;
  messages_sent: number;
  replies_count: number;
  created_at: string;
};

const CampaignList = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("campaigns")
      .select("id, name, description, status, followup_enabled, messages_sent, replies_count, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCampaigns((data ?? []) as Campaign[]);
        setLoading(false);
      });
  }, [userId]);

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Campaigns</h1>
        <button
          onClick={() => navigate("/campaigns/new")}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          <button
            onClick={() => navigate("/campaigns/new")}
            className="mt-2 text-xs text-primary font-medium hover:underline"
          >
            Create your first campaign
          </button>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(c => {
            const rate = c.messages_sent > 0
              ? ((c.replies_count / c.messages_sent) * 100).toFixed(1) + "%"
              : "—";
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/campaigns/${c.id}`)}
                className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium truncate flex-1">{c.name}</span>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                    c.status === "active" ? "bg-emerald-500/10 text-emerald-500"
                    : c.status === "paused" ? "bg-amber-500/10 text-amber-500"
                    : c.status === "draft" ? "bg-muted text-muted-foreground"
                    : "bg-blue-500/10 text-blue-500"
                  }`}>
                    {c.status}
                  </span>
                </div>
                {c.description && (
                  <p className="text-xs text-muted-foreground truncate mb-2">{c.description}</p>
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span><span className="font-semibold text-foreground">{c.messages_sent}</span> sent</span>
                  <span><span className="font-semibold text-foreground">{c.replies_count}</span> replies</span>
                  <span><span className="font-semibold text-foreground">{rate}</span> rate</span>
                </div>
                {c.followup_enabled && (
                  <p className="text-[10px] text-primary mt-2">Follow-up enabled</p>
                )}
                <div className="flex items-center gap-1 mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  View details <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CampaignList;
