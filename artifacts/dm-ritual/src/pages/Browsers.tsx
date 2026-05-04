import { useEffect, useState, useCallback } from "react";
import { PageSkeleton } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Monitor, Plus, Copy, Trash2 } from "lucide-react";

type Browser = {
  id: string;
  instance_key: string;
  label: string;
  ig_username: string | null;
  ig_user_id: string | null;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
};

const generateKey = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) key += "-";
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
};

const Browsers = ({ userId }: { userId: string }) => {
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("browser_instances")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setBrowsers((data ?? []) as Browser[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const channel = supabase
      .channel("browser-heartbeats")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "browser_instances",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setBrowsers(prev =>
          prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } as Browser : b)
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const addBrowser = async () => {
    if (!newLabel.trim()) { toast.error("Enter a label"); return; }
    setAdding(true);
    const key = generateKey();
    const { error } = await supabase.from("browser_instances").insert({
      user_id: userId,
      instance_key: key,
      label: newLabel.trim(),
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Browser added");
      setNewLabel("");
      fetch();
    }
    setAdding(false);
  };

  const deleteBrowser = async (id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"? This will also remove it from all campaigns.`)) return;
    const { error } = await supabase.from("browser_instances").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetch(); }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Pairing key copied!");
  };

  const getStatus = (b: Browser) => {
    if (b.status !== "active") return { label: "Inactive", color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "" };
    if (!b.last_heartbeat_at) return { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "" };
    const diff = Date.now() - new Date(b.last_heartbeat_at).getTime();
    if (diff < 90_000) return { label: "Online", color: "text-emerald-500", dot: "bg-emerald-500", bg: "border-emerald-500/20 bg-emerald-500/5" };
    if (diff < 300_000) return { label: "Idle", color: "text-amber-500", dot: "bg-amber-500", bg: "border-amber-500/20 bg-amber-500/5" };
    return { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground", bg: "" };
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="max-w-2xl space-y-5 pb-16">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Browsers</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pair Chrome extension instances. Each browser = one Instagram account.
        </p>
      </div>

      {/* Add new browser — stacked on mobile */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder='e.g. "Account 1" or "Coaches Account"'
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
          onKeyDown={e => e.key === "Enter" && addBrowser()}
        />
        <button
          onClick={addBrowser}
          disabled={adding}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Browser
        </button>
      </div>

      {/* Browser list */}
      {browsers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Monitor className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No browsers paired yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {browsers.map(b => {
            const s = getStatus(b);
            return (
              <div key={b.id} className={`rounded-xl border bg-card p-4 transition-colors ${s.bg || "border-border"}`}>

                {/* Top row: status dot + label + delete */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className="text-sm font-semibold truncate">{b.label}</span>
                    <span className={`text-xs font-medium shrink-0 ${s.color}`}>{s.label}</span>
                  </div>
                  <button
                    onClick={() => deleteBrowser(b.id, b.label)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* IG username */}
                {b.ig_username && (
                  <p className="text-xs text-muted-foreground mt-1 pl-[18px]">@{b.ig_username}</p>
                )}

                {/* Pairing key — full width, scrollable */}
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2.5">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">Key</span>
                  <code className="text-xs font-mono font-bold tracking-widest flex-1 min-w-0 overflow-x-auto">
                    {b.instance_key}
                  </code>
                  <button
                    onClick={() => copyKey(b.instance_key)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Copy pairing key"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Heartbeat */}
                {b.last_heartbeat_at && (
                  <p className="text-[10px] text-muted-foreground mt-2 pl-[18px]">
                    Last heartbeat: {new Date(b.last_heartbeat_at).toLocaleTimeString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How to pair */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
        <p className="text-sm font-semibold">How to pair</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
          <li>Install the DM Ritual extension in your Chrome browser profile</li>
          <li>Click the extension icon → enter your email + password</li>
          <li>Paste the pairing key shown above</li>
          <li>Status will change to <span className="text-emerald-500 font-medium">Online</span> once connected</li>
        </ol>
      </div>
    </div>
  );
};

export default Browsers;
