import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Check, Megaphone,
  Users, MessageSquare, Monitor, Rocket, Lightbulb,
  Sparkles, Bot, Loader2
} from "lucide-react";
import SequenceEditor, { SequenceStep } from "@/components/SequenceEditor";
import { resolveFirstName } from "@/lib/parse-name";

type TargetList = { id: string; name: string; count: number };
type BrowserInstance = { id: string; label: string; ig_username: string | null; status: string };

const MIN_VARIANTS = 5;

const STEPS = [
  { label: "Details",   icon: Megaphone },
  { label: "Audience",  icon: Users },
  { label: "Sequence",  icon: MessageSquare },
  { label: "Accounts",  icon: Monitor },
  { label: "Launch",    icon: Rocket },
];

const makeFirstStep = (): SequenceStep => ({
  id: crypto.randomUUID(),
  label: "First DM",
  delay_days: 0,
  variants: Array(MIN_VARIANTS).fill(null).map((_, i) => ({
    id: crypto.randomUUID(),
    variant_number: i + 1,
    message_text: "",
  })),
});

const CampaignWizard = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [preResolveName, setPreResolveName] = useState(true);

  const [targetLists, setTargetLists] = useState<TargetList[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>([makeFirstStep()]);

  const [browsers, setBrowsers] = useState<BrowserInstance[]>([]);
  const [selectedBrowsers, setSelectedBrowsers] = useState<string[]>([]);
  const [initialPacing, setInitialPacing] = useState(5);

  type PreviewRow = { username: string; full_name: string | null; resolved: string };
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewFetchedFor = useRef<string>("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateResolvedName = (idx: number, val: string) =>
    setPreviewRows(rows => rows.map((r, i) => i === idx ? { ...r, resolved: val.trim() } : r));

  const getNameWarnings = (resolved: string): { label: string; color: string }[] => {
    if (!resolved) return [];
    const w: { label: string; color: string }[] = [];
    if (resolved.length === 1)              w.push({ label: "Short",         color: "#f59e0b" });
    if (/\d/.test(resolved))               w.push({ label: "Has digits",     color: "#f59e0b" });
    if (/[&@#$%|{}<>\\]/.test(resolved))   w.push({ label: "Special chars",  color: "#ef4444" });
    if (resolved.length > 14)              w.push({ label: "Too long",        color: "#f59e0b" });
    return w;
  };

  useEffect(() => {
    if (step !== 5 || !preResolveName || selectedTargets.length === 0) return;
    const key = selectedTargets.slice().sort().join(",");
    if (previewFetchedFor.current === key) return;
    previewFetchedFor.current = key;

    (async () => {
      setPreviewLoading(true);
      try {
        const { data: items } = await supabase
          .from("target_list_items")
          .select("contact_id")
          .in("target_list_id", selectedTargets);

        const ids = [...new Set((items ?? []).map((r: any) => r.contact_id))];
        setPreviewTotal(ids.length);

        const previewIds = ids.slice(0, 150);
        const { data: contacts } = await supabase
          .from("contacts")
          .select("username, full_name")
          .in("id", previewIds);

        setPreviewRows(
          (contacts ?? []).map((c: any) => ({
            username: c.username,
            full_name: c.full_name,
            resolved: resolveFirstName(c.full_name, c.username),
          }))
        );
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, [step, preResolveName, selectedTargets]);

  useEffect(() => {
    supabase
      .from("target_lists")
      .select("id, name, count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTargetLists(data ?? []));

    supabase
      .from("browser_instances")
      .select("id, label, ig_username, status")
      .eq("user_id", userId)
      .then(({ data }) => setBrowsers(data ?? []));
  }, [userId]);

  const stepHint = (): { label: string; filled: number } | null => {
    if (step === 3) {
      for (const s of sequenceSteps) {
        const filled = s.variants.filter(v => v.message_text.trim()).length;
        if (filled < MIN_VARIANTS) return { label: s.label, filled };
      }
    }
    return null;
  };

  const canProceed = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return selectedTargets.length > 0;
    if (step === 3) return stepHint() === null;
    if (step === 4) return selectedBrowsers.length > 0;
    return true;
  };

  const handleCreate = async () => {
    if (!canProceed()) return;
    setSaving(true);
    try {
      const hasFollowUp = sequenceSteps.length > 1;
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          user_id: userId,
          name: name.trim(),
          description: description.trim(),
          followup_enabled: hasFollowUp,
          followup_delay_days: hasFollowUp ? sequenceSteps[1].delay_days : 0,
          status: "active",
          pre_resolve_name: preResolveName,
        })
        .select("id")
        .single();

      if (campErr) throw campErr;
      const campaignId = campaign.id;

      await supabase.from("campaign_targets").insert(
        selectedTargets.map(tlId => ({ campaign_id: campaignId, target_list_id: tlId }))
      );
      await supabase.from("campaign_accounts").insert(
        selectedBrowsers.map(bId => ({ campaign_id: campaignId, browser_instance_id: bId, daily_dm_limit: initialPacing }))
      );

      for (let i = 0; i < sequenceSteps.length; i++) {
        const s = sequenceSteps[i];
        const { data: seq, error: seqErr } = await supabase
          .from("sequences")
          .insert({
            campaign_id: campaignId,
            step_type: i === 0 ? "first_message" : "followup_1a",
            step_order: i + 1,
            delay_days: s.delay_days,
          })
          .select("id")
          .single();
        if (seqErr) throw seqErr;

        const rows = s.variants
          .filter(v => v.message_text.trim())
          .map((v, vi) => ({
            sequence_id: seq.id,
            variant_number: vi + 1,
            message_text: v.message_text.trim(),
          }));
        if (rows.length) await supabase.from("sequence_variants").insert(rows);
      }

      toast.success("Campaign created!");
      navigate(`/campaigns/${campaignId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create campaign");
    }
    setSaving(false);
  };

  const hint = stepHint();

  return (
    <div className="max-w-5xl mx-auto px-4 space-y-8 pb-16">

      {/* Header */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={() => navigate("/campaigns")}
          className="h-9 w-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold leading-tight">New Campaign</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{STEPS[step - 1].label}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const s = i + 1;
          const done = step > s;
          const active = step === s;
          return (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs font-medium ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 mb-5 transition-colors ${
                  step > s ? "bg-primary" : "bg-border"
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">

        {/* Step 1 — Details */}
        {step === 1 && (
          <div className="p-10 space-y-8">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Name your campaign</h2>
              <p className="text-sm text-muted-foreground">Give it a clear name so you can find it later.</p>
            </div>

            <div className="space-y-6 max-w-xl">
              <div className="space-y-2.5">
                <label className="text-sm font-medium text-foreground">
                  Campaign name <span className="text-destructive">*</span>
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && canProceed() && setStep(2)}
                  placeholder="e.g. Agency Owners — May 2025"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-medium text-foreground">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Internal notes about this campaign..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all resize-none"
                />
              </div>

              {/* Name resolution toggle */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <label className="text-sm font-medium text-foreground">Name personalisation</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {[
                    {
                      value: true,
                      icon: Sparkles,
                      title: "Use contacts DB",
                      desc: "First name resolved from your scraped data before sending. Faster, no Instagram API call.",
                      color: "#6366f1",
                      bg: "#6366f1",
                    },
                    {
                      value: false,
                      icon: Bot,
                      title: "Let extension decide",
                      desc: "Extension queries Instagram live at send time. Works even without scraped names.",
                      color: "#f59e0b",
                      bg: "#f59e0b",
                    },
                  ].map(opt => {
                    const active = preResolveName === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setPreResolveName(opt.value)}
                        style={{
                          display: "flex", flexDirection: "column", gap: "0.625rem",
                          padding: "1rem", borderRadius: "0.875rem", textAlign: "left",
                          border: `1.5px solid ${active ? opt.color : "var(--border)"}`,
                          background: active ? `${opt.bg}08` : "var(--background)",
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{
                            width: "32px", height: "32px", borderRadius: "0.5rem",
                            background: active ? `${opt.bg}18` : "var(--muted)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <opt.icon style={{ width: "15px", height: "15px", color: active ? opt.color : "var(--muted-foreground)" }} />
                          </div>
                          <div style={{
                            width: "16px", height: "16px", borderRadius: "50%",
                            border: `2px solid ${active ? opt.color : "var(--border)"}`,
                            background: active ? opt.color : "transparent",
                            transition: "all 0.15s", flexShrink: 0,
                          }} />
                        </div>
                        <div>
                          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: active ? opt.color : "var(--foreground)" }}>{opt.title}</p>
                          <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.25rem", lineHeight: 1.4 }}>{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Step 2 — Audience */}
        {step === 2 && (
          <div className="p-10 space-y-7">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Select your audience</h2>
              <p className="text-sm text-muted-foreground">Choose the target lists this campaign will DM.</p>
            </div>

            {targetLists.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-16 text-center space-y-3">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="text-sm font-medium">No target lists yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a list of contacts to target first.</p>
                </div>
                <button
                  onClick={() => navigate("/targets")}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Go to Targets →
                </button>
              </div>
            ) : (
              <div className="grid gap-3 max-w-2xl">
                {targetLists.map(tl => {
                  const checked = selectedTargets.includes(tl.id);
                  return (
                    <label
                      key={tl.id}
                      className={`flex items-center gap-4 rounded-xl border p-5 cursor-pointer transition-all ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <input type="checkbox" checked={checked} onChange={e => {
                        if (e.target.checked) setSelectedTargets(prev => [...prev, tl.id]);
                        else setSelectedTargets(prev => prev.filter(id => id !== tl.id));
                      }} className="sr-only" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{tl.name}</p>
                        <p className="text-sm text-muted-foreground">{tl.count.toLocaleString()} contacts</p>
                      </div>
                      {checked && (
                        <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-3 py-1 shrink-0">
                          Selected
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {selectedTargets.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedTargets.length} list{selectedTargets.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>
        )}

        {/* Step 3 — Sequence */}
        {step === 3 && (
          <div className="p-10 space-y-7">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Write your message sequence</h2>
              <p className="text-sm text-muted-foreground">
                Each step needs at least {MIN_VARIANTS} variants to keep messages varied and avoid detection.
              </p>
            </div>

            <SequenceEditor steps={sequenceSteps} onChange={setSequenceSteps} />

            {hint && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                Add {MIN_VARIANTS - hint.filled} more variant{MIN_VARIANTS - hint.filled !== 1 ? "s" : ""} to &ldquo;{hint.label}&rdquo; to continue
              </p>
            )}
          </div>
        )}

        {/* Step 4 — Accounts */}
        {step === 4 && (
          <div className="p-10 space-y-7">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Choose sending accounts</h2>
              <p className="text-sm text-muted-foreground">Select which browser-paired Instagram accounts will send DMs.</p>
            </div>

            {browsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-16 text-center space-y-3">
                <Monitor className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="text-sm font-medium">No browser instances paired</p>
                  <p className="text-xs text-muted-foreground mt-1">Pair a Chrome browser first to send DMs.</p>
                </div>
                <button onClick={() => navigate("/browsers")} className="text-sm text-primary font-medium hover:underline">
                  Go to Browsers →
                </button>
              </div>
            ) : (
              <div className="grid gap-3 max-w-2xl">
                {browsers.map(b => {
                  const checked = selectedBrowsers.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex items-center gap-4 rounded-xl border p-5 cursor-pointer transition-all ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        checked ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <input type="checkbox" checked={checked} onChange={e => {
                        if (e.target.checked) setSelectedBrowsers(prev => [...prev, b.id]);
                        else setSelectedBrowsers(prev => prev.filter(id => id !== b.id));
                      }} className="sr-only" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{b.label || "Browser"}</p>
                        {b.ig_username && <p className="text-sm text-muted-foreground">@{b.ig_username}</p>}
                      </div>
                      <span className={`text-xs font-medium rounded-full px-3 py-1 shrink-0 ${
                        b.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                      }`}>
                        {b.status}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedBrowsers.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 p-5 space-y-3 max-w-2xl">
                <div>
                  <p className="text-sm font-semibold">Starting DM limit per account</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    New accounts should start low (5) to avoid flags. You can increase this later inside the campaign.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={50}
                    value={initialPacing}
                    onChange={e => setInitialPacing(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <input
                    type="number" min={1} max={50}
                    value={initialPacing}
                    onChange={e => setInitialPacing(Math.max(1, Math.min(50, Number(e.target.value))))}
                    className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-center font-semibold"
                  />
                  <span className="text-xs text-muted-foreground">DMs/day</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5 — Review */}
        {step === 5 && (
          <div className="p-10 space-y-7">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Ready to launch</h2>
              <p className="text-sm text-muted-foreground">Review your campaign before activating it.</p>
            </div>

            <div className="grid gap-4 max-w-2xl">
              <div className="rounded-xl border border-border bg-muted/20 p-5 flex gap-4 items-start">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Megaphone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Campaign</p>
                  <p className="text-base font-semibold">{name}</p>
                  {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-5 flex gap-4 items-start">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Audience</p>
                  <p className="text-base font-semibold">{selectedTargets.length} target list{selectedTargets.length !== 1 ? "s" : ""}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {targetLists.filter(t => selectedTargets.includes(t.id)).map(t => t.name).join(", ")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-5 flex gap-4 items-start">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-2">Sequence</p>
                  <div className="space-y-1.5">
                    {sequenceSteps.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="text-muted-foreground">{s.variants.filter(v => v.message_text.trim()).length} variants</span>
                        {i > 0 && <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-muted-foreground">{s.delay_days}d delay</span>
                        </>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-5 flex gap-4 items-start">
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Accounts</p>
                  <p className="text-base font-semibold">{selectedBrowsers.length} browser{selectedBrowsers.length !== 1 ? "s" : ""}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {browsers.filter(b => selectedBrowsers.includes(b.id)).map(b => b.ig_username ? `@${b.ig_username}` : b.label).join(", ")}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border p-5 flex gap-4 items-start"
                style={{ borderColor: preResolveName ? "#6366f130" : "#f59e0b30", background: preResolveName ? "#6366f108" : "#f59e0b08" }}>
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: preResolveName ? "#6366f118" : "#f59e0b18" }}>
                  {preResolveName
                    ? <Sparkles className="h-4 w-4" style={{ color: "#6366f1" }} />
                    : <Bot className="h-4 w-4" style={{ color: "#f59e0b" }} />}
                </div>
                <div>
                  <p className="text-xs uppercase font-semibold tracking-wider mb-1" style={{ color: preResolveName ? "#6366f1" : "#f59e0b" }}>Name Personalisation</p>
                  <p className="text-base font-semibold">{preResolveName ? "Use contacts DB" : "Let extension decide"}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {preResolveName
                      ? "{{firstName}} resolved server-side from scraped full_name before the task reaches the extension."
                      : "Extension calls Instagram's contact store live at send time to resolve names."}
                  </p>
                </div>
              </div>
            </div>

            {/* Name resolution preview table */}
            {preResolveName && (
              <div style={{ marginTop: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div>
                    <p className="text-sm font-semibold">Name resolution preview</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {previewLoading
                        ? "Loading contacts…"
                        : previewTotal > 0
                        ? `Showing ${previewRows.length} of ${previewTotal.toLocaleString()} contacts — how {{firstName}} will resolve`
                        : "No contacts found in selected lists"}
                    </p>
                  </div>
                  {previewLoading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
                </div>

                {!previewLoading && previewRows.length > 0 && (
                  <div style={{ borderRadius: "0.875rem", border: "1px solid var(--border)", overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1.6fr 1.1fr",
                      padding: "0.6rem 1rem", background: "var(--muted)",
                      borderBottom: "1px solid var(--border)",
                    }}>
                      {["Username", "Raw full_name", "{{firstName}} → (dbl-click to edit)"].map(h => (
                        <span key={h} style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>{h}</span>
                      ))}
                    </div>

                    {/* Scrollable rows */}
                    <div style={{ maxHeight: "380px", overflowY: "auto" }}>
                      {previewRows.map((row, i) => {
                        const hasName = !!row.full_name?.trim();
                        const rawDisplay = row.full_name?.split("|")[0].trim() || "—";
                        const warnings = getNameWarnings(row.resolved);
                        const isEditing = editingIdx === i;
                        return (
                          <div
                            key={row.username + i}
                            style={{
                              display: "grid", gridTemplateColumns: "1fr 1.6fr 1.1fr",
                              padding: "0.5rem 1rem", alignItems: "center",
                              borderBottom: i < previewRows.length - 1 ? "1px solid var(--border)" : "none",
                              background: warnings.length > 0 ? "rgba(245,158,11,0.04)" : i % 2 === 0 ? "transparent" : "transparent",
                            }}
                          >
                            <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                              @{row.username}
                            </span>
                            <span style={{
                              fontSize: "0.75rem", color: hasName ? "var(--foreground)" : "var(--muted-foreground)",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              paddingRight: "1rem",
                            }} title={rawDisplay}>
                              {rawDisplay}
                            </span>

                            {/* Resolved name — editable on double-click */}
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => { updateResolvedName(i, editValue); setEditingIdx(null); }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") { updateResolvedName(i, editValue); setEditingIdx(null); }
                                    if (e.key === "Escape") setEditingIdx(null);
                                  }}
                                  style={{
                                    fontSize: "0.78rem", fontWeight: 600, color: "#6366f1",
                                    background: "#6366f110", border: "1.5px solid #6366f1",
                                    borderRadius: "0.375rem", padding: "0.1rem 0.4rem",
                                    outline: "none", width: "100%", maxWidth: "110px",
                                  }}
                                />
                              ) : (
                                <span
                                  onDoubleClick={() => { setEditingIdx(i); setEditValue(row.resolved); }}
                                  title="Double-click to edit"
                                  style={{
                                    fontSize: "0.78rem", fontWeight: 600,
                                    color: row.resolved ? "#6366f1" : "var(--muted-foreground)",
                                    cursor: "text",
                                    borderRadius: "0.25rem",
                                    padding: "0.1rem 0.2rem",
                                  }}
                                >
                                  {row.resolved || "—"}
                                </span>
                              )}
                              {!isEditing && warnings.map(w => (
                                <span key={w.label} style={{
                                  fontSize: "0.6rem", fontWeight: 700, padding: "0.1rem 0.35rem",
                                  borderRadius: "999px", background: `${w.color}18`,
                                  color: w.color, border: `1px solid ${w.color}40`,
                                  whiteSpace: "nowrap", letterSpacing: "0.02em",
                                }}>
                                  {w.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step < 5 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Continue
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Rocket className="h-4 w-4" />
            {saving ? "Creating…" : "Launch Campaign"}
          </button>
        )}
      </div>
    </div>
  );
};

export default CampaignWizard;
