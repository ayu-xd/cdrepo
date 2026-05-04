import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, Zap, Monitor, Hash } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SCRAPE_TYPES = [
  { value: "scrape_followers", label: "Followers", desc: "Who follows the account", icon: Users },
  { value: "scrape_following", label: "Following", desc: "Who the account follows", icon: UserCheck },
];

const Scraper = ({ userId }: { userId: string }) => {
  const [target, setTarget] = useState("");
  const [limit, setLimit] = useState(100);
  const [type, setType] = useState("scrape_followers");
  const [loading, setLoading] = useState(false);
  const [browsers, setBrowsers] = useState<{ id: string; label: string }[]>([]);
  const [selectedBrowser, setSelectedBrowser] = useState<string>("");

  useEffect(() => {
    supabase
      .from("browser_instances")
      .select("id, label")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) {
          setBrowsers(data);
          if (data.length > 0) setSelectedBrowser(data[0].id);
        }
      });
  }, [userId]);

  const handleScrape = async () => {
    if (!target) return toast.error("Enter a username");
    if (!selectedBrowser) return toast.error("Select a browser");
    setLoading(true);
    const { error } = await supabase.from("dm_tasks").insert({
      user_id: userId,
      task_type: type as any,
      message_text: JSON.stringify({ target, limit: Number(limit) }),
      status: "pending",
      browser_instance_id: selectedBrowser,
      variant_number: 0,
      scheduled_date: new Date().toISOString().slice(0, 10),
    });
    if (error) toast.error(error.message);
    else { toast.success("Scrape task queued!"); setTarget(""); }
    setLoading(false);
  };

  const inputCls = "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <div className="max-w-xl pb-16 space-y-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-semibold">Find Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scrape followers or following from any public account.
        </p>
      </div>

      {/* ── Type selector ── */}
      <div style={{ display: "flex", flexDirection: "column", paddingBottom: "1.5rem" }}>
        <label className="text-sm font-semibold text-foreground" style={{ display: "block", marginBottom: "1rem" }}>What to scrape</label>
        <div className="grid grid-cols-2 gap-3">
          {SCRAPE_TYPES.map(({ value, label, desc, icon: Icon }) => {
            const active = type === value;
            return (
              <button
                key={value}
                onClick={() => setType(value)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/30"
                )}
              >
                <div className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  active ? "bg-background/20" : "bg-muted"
                )}>
                  <Icon className={cn("h-4 w-4", active ? "text-background" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className={cn("text-sm font-semibold", active ? "text-background" : "text-foreground")}>{label}</p>
                  <p className={cn("text-xs mt-0.5 leading-snug", active ? "text-background/70" : "text-muted-foreground")}>{desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Instagram username ── */}
      <div style={{ display: "flex", flexDirection: "column", paddingBottom: "1.5rem" }}>
        <label className="text-sm font-semibold text-foreground" style={{ display: "block", marginBottom: "1rem" }}>Instagram username</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">@</span>
          <input
            value={target}
            onChange={e => setTarget(e.target.value.trim().replace(/^@/, ""))}
            onKeyDown={e => e.key === "Enter" && !loading && target && handleScrape()}
            placeholder="alexhormozi"
            className={cn(inputCls, "pl-8")}
          />
        </div>
        <p className="text-xs text-muted-foreground">Profile must be public</p>
      </div>

      {/* ── Max leads ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          Max leads
        </label>
        <input
          type="number"
          value={limit}
          onChange={e => setLimit(Math.max(1, Math.min(5000, Number(e.target.value))))}
          min={1}
          max={5000}
          className={inputCls}
        />
        <p className="text-xs text-muted-foreground">Between 1 – 5,000</p>
      </div>

      {/* ── Worker browser ── */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          Worker browser
        </label>
        {browsers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
            No browsers paired yet — go to Browsers to add one
          </div>
        ) : (
          <select
            value={selectedBrowser}
            onChange={e => setSelectedBrowser(e.target.value)}
            className={cn(inputCls, "appearance-none cursor-pointer")}
          >
            {browsers.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        )}
      </div>

      {/* ── CTA ── */}
      <button
        onClick={handleScrape}
        disabled={loading || !target || !selectedBrowser}
        className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
      >
        <Zap className={cn("h-4 w-4", loading && "animate-pulse")} />
        {loading ? "Queuing…" : "Start Scraping"}
      </button>

      {/* ── Footer note ── */}
      <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-4 py-3.5 leading-relaxed">
        The Chrome extension must be running to execute the scrape. Results are saved to your contacts automatically.
      </p>
    </div>
  );
};

export default Scraper;
