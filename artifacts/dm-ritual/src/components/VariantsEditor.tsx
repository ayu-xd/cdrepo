import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Plus, Trash2, Edit2, Save, X, CheckCircle2 } from "lucide-react";

type SequenceRow = { id: string; step_type: string; step_order: number; delay_days: number };
type VariantRow = { id: string; sequence_id: string; variant_number: number; message_text: string };

interface VariantsEditorProps {
  sequences: SequenceRow[];
  variants: VariantRow[];
  variantEdits: Map<string, string>;
  variantsDirty: boolean;
  saving: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: (variantId: string, text: string) => void;
  onSave: () => void;
  onAdd: (sequenceId: string) => void;
  onDelete: (variantId: string, sequenceId: string) => void;
  getVariantText: (v: VariantRow) => string;
}

export default function VariantsEditor({
  sequences,
  variants,
  variantEdits,
  variantsDirty,
  saving,
  open,
  onToggle,
  onEdit,
  onSave,
  onAdd,
  onDelete,
  getVariantText,
}: VariantsEditorProps) {
  const [activeSeqId, setActiveSeqId] = useState<string | null>(sequences.length > 0 ? sequences[0].id : null);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // When sequences change, ensure activeSeqId is valid
  useEffect(() => {
    if (sequences.length > 0 && (!activeSeqId || !sequences.find((s) => s.id === activeSeqId))) {
      setActiveSeqId(sequences[0].id);
    }
  }, [sequences, activeSeqId]);

  // When active sequence changes, set active variant to the first one
  useEffect(() => {
    if (activeSeqId) {
      const seqVariants = variants.filter((v) => v.sequence_id === activeSeqId).sort((a, b) => a.variant_number - b.variant_number);
      if (seqVariants.length > 0 && (!activeVariantId || !seqVariants.find((v) => v.id === activeVariantId))) {
        setActiveVariantId(seqVariants[0].id);
        setIsEditing(false); // Reset edit state when switching tabs
      }
    }
  }, [activeSeqId, variants, activeVariantId]);

  const activeSequence = sequences.find((s) => s.id === activeSeqId);
  const seqVariants = activeSequence ? variants.filter((v) => v.sequence_id === activeSequence.id).sort((a, b) => a.variant_number - b.variant_number) : [];
  const activeVariant = seqVariants.find((v) => v.id === activeVariantId);

  return (
    <div className="w-full h-full bg-card">
      {open && sequences.length > 0 && (
        <div className="flex flex-col md:flex-row h-[500px] border border-border rounded-lg overflow-hidden">
          {/* Left Sidebar: Sequences */}
          <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-border bg-muted/10 flex flex-col shrink-0">
            {sequences.map((seq) => {
              const isActive = activeSeqId === seq.id;
              return (
                <button
                  key={seq.id}
                  onClick={() => { setActiveSeqId(seq.id); setIsEditing(false); }}
                  className={`flex items-center gap-2 px-4 py-5 text-left transition-colors border-l-[3px] ${
                    isActive
                      ? "border-primary bg-background font-semibold"
                      : "border-transparent text-muted-foreground hover:bg-muted/30 font-medium"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="text-xs uppercase tracking-wider">
                    {seq.step_type === "first_message" ? "First Message" : "First Follow-Up"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Main Area: Variants Tabs & Editor */}
          <div className="flex-1 flex flex-col bg-background min-w-0">
            {/* Tabs */}
            <div className="flex items-center overflow-x-auto border-b border-border scrollbar-hide px-2 pt-1 shrink-0">
              {seqVariants.map((v, i) => {
                const isActive = activeVariantId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => { setActiveVariantId(v.id); setIsEditing(false); }}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
                      isActive
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Variant {i + 1}
                  </button>
                );
              })}
              <button
                onClick={() => activeSequence && onAdd(activeSequence.id)}
                className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                Add
              </button>
            </div>

            {/* Editor Area */}
            {activeVariant ? (
              <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    {activeSequence?.step_type === "first_message" ? "First message" : "Follow-up message"}
                  </h3>
                  <div className="flex items-center gap-2">
                    {variantsDirty && (
                      <button
                        onClick={onSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 animate-in fade-in"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    )}

                    {isEditing ? (
                      <button
                        onClick={() => setIsEditing(false)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Done Editing
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" /> Edit Text
                        </button>
                        <button
                          onClick={() => {
                            if (activeSequence) onDelete(activeVariant.id, activeSequence.id);
                          }}
                          className="flex items-center gap-1.5 rounded-md text-destructive bg-destructive/10 px-3 py-1.5 text-xs font-medium hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-[150px] relative mb-4">
                  {isEditing ? (
                    <textarea
                      value={getVariantText(activeVariant)}
                      onChange={(e) => onEdit(activeVariant.id, e.target.value)}
                      className="w-full h-full rounded-md border border-foreground bg-background px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-4 focus:ring-foreground/10 resize-none transition-all shadow-sm"
                      placeholder="Type your message here..."
                      autoFocus
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-md border border-border bg-background px-4 py-3 text-sm leading-relaxed overflow-y-auto cursor-pointer hover:border-foreground/30 transition-colors"
                      onDoubleClick={() => setIsEditing(true)}
                      title="Double-click to edit"
                    >
                      {getVariantText(activeVariant) ? (
                        <span className="whitespace-pre-wrap">{getVariantText(activeVariant)}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Empty variant. Click Edit to add text.</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-md bg-muted/40 p-4 border border-border mt-auto shrink-0">
                  <p className="text-xs font-bold mb-2">Available variables:</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5">
                    <li><strong className="text-foreground">{`{{firstName}}`}</strong> - User's first name, parsed from full name (if no name, replaced with username)</li>
                    <li><strong className="text-foreground">{`{{username}}`}</strong> - Instagram username</li>
                    <li><strong className="text-foreground">{`{{name}}`}</strong> - User's full name (if no name, replaced with username)</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm">
                <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                No variants found. Add one to start.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
