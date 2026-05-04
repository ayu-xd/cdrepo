import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Plus, MessageSquare, Clock, ChevronRight, X } from "lucide-react";

export type SequenceStep = {
  id: string;
  label: string;
  delay_days: number;
  variants: { id: string; variant_number: number; message_text: string }[];
};

type Props = {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
  onSave?: () => void;
  saving?: boolean;
};

const MIN_VARIANTS = 5;

const VARIABLES = [
  { tag: "{{FirstName}}", desc: "First name" },
  { tag: "{{Username}}", desc: "IG username" },
  { tag: "{{Name}}", desc: "Full name" },
];

const SequenceEditor = ({ steps, onChange, onSave, saving }: Props) => {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);

  const activeStep = steps[activeStepIdx];
  const activeVariant = activeStep?.variants[activeVariantIdx];

  const addFollowUp = () => {
    const newStep: SequenceStep = {
      id: crypto.randomUUID(),
      label: `Follow-up ${steps.length}`,
      delay_days: 3,
      variants: Array(MIN_VARIANTS).fill(null).map((_, i) => ({
        id: crypto.randomUUID(),
        variant_number: i + 1,
        message_text: "",
      })),
    };
    const updated = [...steps, newStep];
    onChange(updated);
    setActiveStepIdx(updated.length - 1);
    setActiveVariantIdx(0);
  };

  const removeStep = (idx: number) => {
    if (idx === 0) return;
    const updated = steps.filter((_, i) => i !== idx);
    onChange(updated);
    setActiveStepIdx(Math.min(activeStepIdx, updated.length - 1));
    setActiveVariantIdx(0);
  };

  const addVariant = () => {
    if (!activeStep) return;
    const newVariant = {
      id: crypto.randomUUID(),
      variant_number: activeStep.variants.length + 1,
      message_text: "",
    };
    const updated = [...steps];
    updated[activeStepIdx] = { ...activeStep, variants: [...activeStep.variants, newVariant] };
    onChange(updated);
    setActiveVariantIdx(activeStep.variants.length);
  };

  const removeVariant = (varIdx: number) => {
    if (!activeStep || activeStep.variants.length <= MIN_VARIANTS) return;
    const newVariants = activeStep.variants
      .filter((_, i) => i !== varIdx)
      .map((v, i) => ({ ...v, variant_number: i + 1 }));
    const updated = [...steps];
    updated[activeStepIdx] = { ...activeStep, variants: newVariants };
    onChange(updated);
    setActiveVariantIdx(Math.max(0, varIdx - 1));
  };

  const updateMessageText = (text: string) => {
    if (!activeStep) return;
    const updated = [...steps];
    const newVariants = [...activeStep.variants];
    newVariants[activeVariantIdx] = { ...newVariants[activeVariantIdx], message_text: text };
    updated[activeStepIdx] = { ...activeStep, variants: newVariants };
    onChange(updated);
  };

  const updateDelay = (days: number) => {
    if (!activeStep) return;
    const updated = [...steps];
    updated[activeStepIdx] = { ...activeStep, delay_days: days };
    onChange(updated);
  };

  const insertVariable = (tag: string) => {
    if (!activeVariant) return;
    const el = document.getElementById("seq-textarea") as HTMLTextAreaElement | null;
    if (el) {
      const start = el.selectionStart ?? activeVariant.message_text.length;
      const end = el.selectionEnd ?? activeVariant.message_text.length;
      const newText =
        activeVariant.message_text.substring(0, start) +
        tag +
        activeVariant.message_text.substring(end);
      updateMessageText(newText);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      updateMessageText(activeVariant.message_text + tag);
    }
  };

  const filledCount = activeStep?.variants.filter(v => v.message_text.trim()).length ?? 0;
  const needsMore = filledCount < MIN_VARIANTS;

  return (
    <div className="flex gap-8 min-h-[600px]">

      {/* Left: Sequence flow */}
      <div className="w-64 shrink-0 flex flex-col">
        {steps.map((step, i) => (
          <div key={step.id} className="flex flex-col items-center">
            {i > 0 && (
              <div className="flex flex-col items-center py-1">
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1.5 bg-muted border border-border rounded-full px-3 py-1 text-xs text-muted-foreground font-medium">
                  <Clock className="h-3 w-3" />
                  {step.delay_days}d delay
                </div>
                <div className="w-px h-4 bg-border" />
                <ChevronRight className="h-3.5 w-3.5 text-border rotate-90" />
              </div>
            )}

            <button
              onClick={() => { setActiveStepIdx(i); setActiveVariantIdx(0); }}
              className={cn(
                "w-full text-left rounded-2xl border p-4 transition-all group relative",
                i === activeStepIdx
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/20"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                    i === activeStepIdx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm font-semibold leading-tight",
                      i === activeStepIdx ? "text-foreground" : "text-foreground/80"
                    )}>
                      {step.label}
                    </p>
                    <p className={cn(
                      "text-xs mt-0.5",
                      step.variants.filter(v => v.message_text.trim()).length >= MIN_VARIANTS
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    )}>
                      {step.variants.filter(v => v.message_text.trim()).length}/{step.variants.length} variants
                    </p>
                  </div>
                </div>
                {i > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); removeStep(i); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded-lg"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </button>
          </div>
        ))}

        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-border" />
          <button
            onClick={addFollowUp}
            className="w-full rounded-2xl border border-dashed border-border hover:border-primary/50 hover:bg-muted/30 p-4 transition-all flex items-center gap-3 text-muted-foreground hover:text-foreground group"
          >
            <div className="h-9 w-9 rounded-xl border border-dashed border-border group-hover:border-primary/40 flex items-center justify-center shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Add follow-up</span>
          </button>
        </div>
      </div>

      {/* Right: Variant editor */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">
        {activeStep && (
          <>
            {/* Step header */}
            <div>
              <h3 className="text-base font-semibold text-foreground">{activeStep.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {activeStepIdx === 0
                  ? "The first message sent to each contact"
                  : `Sent ${activeStep.delay_days} day${activeStep.delay_days !== 1 ? "s" : ""} after the previous step if no reply`}
              </p>
            </div>

            {/* Delay editor — follow-ups only */}
            {activeStepIdx > 0 && (
              <div className="rounded-2xl border border-border bg-muted/20 p-4 flex items-center gap-5">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground/80 mb-2">Wait before sending</p>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={activeStep.delay_days}
                    onChange={e => updateDelay(Number(e.target.value))}
                    className="w-full accent-primary h-1.5"
                  />
                </div>
                <div className="text-sm font-semibold text-foreground bg-muted rounded-xl px-3 py-1.5 w-20 text-center shrink-0">
                  {activeStep.delay_days} day{activeStep.delay_days !== 1 ? "s" : ""}
                </div>
              </div>
            )}

            {/* Variant tabs */}
            <div className="flex items-center gap-0.5 border-b border-border">
              {activeStep.variants.map((v, i) => {
                const filled = v.message_text.trim().length > 0;
                return (
                  <div key={v.id} className="relative group/tab">
                    <button
                      onClick={() => setActiveVariantIdx(i)}
                      className={cn(
                        "relative px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                        i === activeVariantIdx
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          filled ? "bg-emerald-500" : "bg-muted-foreground/30"
                        )} />
                        V{i + 1}
                      </span>
                    </button>
                    {activeStep.variants.length > MIN_VARIANTS && (
                      <button
                        onClick={() => removeVariant(i)}
                        className="absolute -top-1 -right-1 opacity-0 group-hover/tab:opacity-100 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={addVariant}
                className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
                title="Add variant"
              >
                <Plus className="h-4 w-4" />
              </button>
              <span className={cn(
                "ml-auto text-xs pb-2 pr-1 font-medium",
                needsMore ? "text-muted-foreground" : "text-emerald-600"
              )}>
                {filledCount}/{MIN_VARIANTS} filled
              </span>
            </div>

            {/* Textarea */}
            {activeVariant && (
              <div className="flex-1 flex flex-col gap-3">
                <Textarea
                  id="seq-textarea"
                  value={activeVariant.message_text}
                  onChange={e => updateMessageText(e.target.value)}
                  placeholder={
                    activeStepIdx === 0
                      ? `Hey {{FirstName}}, I came across your profile and wanted to reach out...`
                      : `Hey {{FirstName}}, just circling back on my previous message...`
                  }
                  rows={10}
                  className="resize-none text-sm font-mono leading-relaxed flex-1"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Insert:</span>
                    {VARIABLES.map(({ tag, desc }) => (
                      <button
                        key={tag}
                        onClick={() => insertVariable(tag)}
                        title={desc}
                        className="text-xs font-mono rounded-lg border border-border bg-muted px-2 py-1 text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <span className={cn(
                    "text-xs font-mono",
                    activeVariant.message_text.length > 800 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {activeVariant.message_text.length} chars
                  </span>
                </div>
              </div>
            )}

            {onSave && (
              <button
                onClick={onSave}
                disabled={saving}
                className="mt-auto self-end rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SequenceEditor;
