import { useEffect, useState, useCallback, useMemo } from "react";
import { SkeletonRows } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, ExternalLink, Search, Users } from "lucide-react";
import { toast } from "sonner";

type Contact = {
  id: string;
  full_name: string;
  username: string | null;
  profile_link: string;
  followers: number | null;
  biography: string | null;
  status: string;
  category: string | null;
};

const STATUS_DOT: Record<string, string> = {
  not_started:  "#94a3b8",
  followed:     "#3b82f6",
  dmed:         "#6366f1",
  initiated:    "#a855f7",
  engaged:      "#f97316",
  calendly_sent:"#f59e0b",
  booked:       "#10b981",
  flywheel:     "#ef4444",
};

const STATUS_LABEL: Record<string, string> = {
  not_started:   "New",
  followed:      "Followed",
  dmed:          "DM'd",
  initiated:     "Initiated",
  engaged:       "Engaged",
  calendly_sent: "Calendly",
  booked:        "Booked",
  flywheel:      "Flywheel",
};

const Contacts = ({ userId }: { userId: string }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, username, profile_link, followers, biography, status, category")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10000);
    setContacts(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const deleteContact = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" permanently?`)) return;
    setContacts(prev => prev.filter(c => c.id !== id));
    await supabase.from("target_list_items").delete().eq("contact_id", id);
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      fetchContacts();
      return;
    }
    toast.success("Contact deleted");
  };

  const filtered = useMemo(() =>
    contacts.filter(c =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.username || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.category || "").toLowerCase().includes(search.toLowerCase())
    ), [contacts, search]);

  return (
    <div className="flex flex-col gap-3 pb-6" style={{ minHeight: 0 }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Contacts</h1>
          <span style={{
            fontSize: "0.68rem", fontWeight: 600,
            background: "var(--muted)", color: "var(--muted-foreground)",
            padding: "0.1rem 0.45rem", borderRadius: "999px",
          }}>
            {filtered.length}{contacts.length !== filtered.length ? `/${contacts.length}` : ""}
          </span>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search style={{
          position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)",
          width: "14px", height: "14px", color: "var(--muted-foreground)",
        }} />
        <input
          placeholder="Search by name, username, category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", paddingLeft: "2.25rem", paddingRight: "0.75rem",
            paddingTop: "0.5rem", paddingBottom: "0.5rem",
            borderRadius: "0.625rem", border: "1px solid var(--border)",
            background: "var(--background)", fontSize: "0.8rem",
            outline: "none",
          }}
        />
      </div>

      {/* List */}
      {loading ? (
        <SkeletonRows rows={8} height="2.75rem" />
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 1rem", gap: "0.5rem" }}>
          <Users style={{ width: "1.75rem", height: "1.75rem", color: "var(--muted-foreground)", opacity: 0.4 }} />
          <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>
            {contacts.length === 0 ? "No contacts yet" : "No contacts match your search"}
          </p>
          {contacts.length === 0 && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", textAlign: "center" }}>
              Import contacts via Targets → New List
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {filtered.map(c => {
            const dotColor = STATUS_DOT[c.status] ?? "#94a3b8";
            const label = STATUS_LABEL[c.status] ?? c.status;
            return (
              <div
                key={c.id}
                style={{
                  display: "flex", alignItems: "center", gap: "0.625rem",
                  padding: "0.625rem 0.75rem", borderRadius: "0.625rem",
                  background: "var(--card)", border: "1px solid var(--border)",
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: dotColor, flexShrink: 0,
                }} />

                {/* Name + username */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: "flex", alignItems: "baseline", gap: "0.375rem",
                    flexWrap: "wrap" as const,
                  }}>
                    <span style={{
                      fontSize: "0.8rem", fontWeight: 600,
                      whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}>
                      {c.full_name}
                    </span>
                    {c.username && (
                      <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" as const }}>
                        @{c.username}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.1rem", flexWrap: "wrap" as const }}>
                    <span style={{
                      fontSize: "0.6rem", fontWeight: 600,
                      color: dotColor, letterSpacing: "0.03em",
                    }}>
                      {label}
                    </span>
                    {c.category && (
                      <>
                        <span style={{ color: "var(--border)", fontSize: "0.6rem" }}>·</span>
                        <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)" }}>{c.category}</span>
                      </>
                    )}
                    {c.followers != null && c.followers > 0 && (
                      <>
                        <span style={{ color: "var(--border)", fontSize: "0.6rem" }}>·</span>
                        <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)" }}>
                          {c.followers >= 1000 ? `${(c.followers / 1000).toFixed(1)}k` : c.followers} followers
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                  {c.profile_link && (
                    <a
                      href={c.profile_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem",
                        color: "var(--muted-foreground)", border: "none", background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <ExternalLink style={{ width: "13px", height: "13px" }} />
                    </a>
                  )}
                  <button
                    onClick={() => deleteContact(c.id, c.full_name)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem",
                      color: "var(--muted-foreground)", border: "none", background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 style={{ width: "13px", height: "13px" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Contacts;
