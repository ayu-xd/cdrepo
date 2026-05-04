import { useState, useEffect } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from "@/components/ThemeSwitcher";

const Settings = ({ userId }: { userId: string }) => {
  const { settings, refreshSettings } = useSettings();
  const [dmLimit, setDmLimit] = useState(settings.dm_limit);
  const [followLimit, setFollowLimit] = useState(settings.follow_limit);
  const [followBeforeDm, setFollowBeforeDm] = useState(settings.follow_before_dm);
  const [flywheelDays, setFlywheelDays] = useState(settings.flywheel_days);
  const [saving, setSaving] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(getStoredTheme);

  const selectTheme = (id: ThemeId) => {
    setCurrentTheme(id);
    applyTheme(id);
  };

  // Sync state when settings load
  useEffect(() => {
    setDmLimit(settings.dm_limit);
    setFollowLimit(settings.follow_limit);
    setFollowBeforeDm(settings.follow_before_dm);
    setFlywheelDays(settings.flywheel_days);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: userId,
        dm_limit: dmLimit,
        follow_limit: followLimit,
        follow_before_dm: followBeforeDm,
        flywheel_days: flywheelDays,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      toast.error(`Failed to save: ${error.message}`);
    } else {
      toast.success("Settings saved");
      await refreshSettings();
    }
    setSaving(false);
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Control your daily limits and automation behavior.</p>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Color Theme</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Choose the look and feel of the app.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => selectTheme(theme.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: "0.375rem", padding: "0.5rem 0.25rem", borderRadius: "0.5rem",
                border: currentTheme === theme.id ? "2px solid hsl(var(--foreground))" : "2px solid transparent",
                background: currentTheme === theme.id ? "hsl(var(--accent))" : "transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <span className={`h-5 w-5 rounded-full shrink-0 ${theme.dot}`} style={{ display: "block" }} />
              <span style={{ fontSize: "10px", fontWeight: 500, color: "hsl(var(--foreground))", lineHeight: 1 }}>
                {theme.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Follow Before DM Toggle */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Follow → DM Workflow</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {followBeforeDm
                ? "Day 1: Follow people. Day 2: DM them."
                : "DM people directly without following first."}
            </p>
          </div>
          <button
            onClick={() => setFollowBeforeDm(!followBeforeDm)}
            style={{
              position: "relative", width: "44px", height: "24px",
              borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0,
              background: followBeforeDm ? "var(--primary)" : "var(--muted)",
              transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: "2px",
              left: followBeforeDm ? "22px" : "2px",
              width: "20px", height: "20px",
              borderRadius: "50%", background: "white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              transition: "left 0.2s",
            }} />
          </button>
        </div>
      </div>

      {/* Follow Limit (only visible when follow_before_dm is ON) */}
      {followBeforeDm && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Daily Follow Limit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              How many people to follow per day. They'll be DMed on the next day.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={200}
              value={followLimit}
              onChange={e => setFollowLimit(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <input
              type="number"
              min={1}
              max={200}
              value={followLimit}
              onChange={e => setFollowLimit(Math.max(1, Math.min(200, Number(e.target.value))))}
              className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-center font-semibold"
            />
          </div>
        </div>
      )}

      {/* DM Limit */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Daily DM Limit</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Max DMs per browser account per day. Controls new DMs + follow-ups.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={200}
            value={dmLimit}
            onChange={e => setDmLimit(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <input
            type="number"
            min={1}
            max={200}
            value={dmLimit}
            onChange={e => setDmLimit(Math.max(1, Math.min(200, Number(e.target.value))))}
            className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-center font-semibold"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5 font-medium">
            {Math.floor(dmLimit * 0.67)} new DMs
          </span>
          <span>+</span>
          <span className="rounded bg-muted px-2 py-0.5 font-medium">
            {Math.floor(dmLimit * 0.33)} follow-ups
          </span>
          <span className="ml-1 text-[10px]">(when -1A is enabled)</span>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">How it works</p>
        <ul className="space-y-1.5 list-disc list-inside">
          {followBeforeDm && (
            <>
              <li>Day 1: Extension follows up to <span className="font-medium text-foreground">{followLimit}</span> people from your target lists</li>
              <li>Day 2: Those followed people enter the DM queue automatically</li>
            </>
          )}
          {!followBeforeDm && (
            <li>People are DMed directly without following first</li>
          )}
          <li>Each browser account gets its own <span className="font-medium text-foreground">{dmLimit}</span> daily DM quota</li>
          <li>If an account is in 2 campaigns, the quota is split equally</li>
          <li>When -1A follow-up is ON for a campaign, 33% of its quota goes to follow-ups</li>
          <li>Cross-campaign dedup: a person will never get DMed twice</li>
          <li>Flywheel preserves rejected leads for <span className="font-medium text-foreground">{flywheelDays}</span> days before re-entering the queue</li>
        </ul>
      </div>

      {/* Flywheel Days */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Flywheel Cooldown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            How many days before a rejected prospect re-enters the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={7}
            max={365}
            value={flywheelDays}
            onChange={e => setFlywheelDays(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <input
            type="number"
            min={7}
            max={365}
            value={flywheelDays}
            onChange={e => setFlywheelDays(Math.max(7, Math.min(365, Number(e.target.value))))}
            className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-center font-semibold"
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
};

export default Settings;
