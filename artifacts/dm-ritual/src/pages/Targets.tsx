import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { PageSkeleton, SkeletonRows } from "@/components/ui/skeleton-shimmer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Target, Users, Search, X, ChevronRight, FileText, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file";

type TargetList = {
  id: string;
  name: string;
  type: string;
  count: number;
  created_at: string;
};

type Contact = {
  id: string;
  username: string;
  full_name: string;
  profile_link: string;
  status: string;
};

type ParsedContact = {
  username: string;
  full_name: string;
  profile_link: string;
  biography?: string;
  category?: string;
  followers?: number;
};

const STATUS_STYLES: Record<string, string> = {
  dmed:      "bg-indigo-500/10 text-indigo-500",
  followed:  "bg-blue-500/10 text-blue-500",
  initiated: "bg-orange-500/10 text-orange-500",
};

// Maps common column name variations to our canonical field names
function mapRow(row: Record<string, string | number | null>): ParsedContact | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.entries(row).find(([col]) => col.toLowerCase().replace(/[\s_-]/g, "") === k.toLowerCase().replace(/[\s_-]/g, ""));
      if (found && found[1] != null && String(found[1]).trim() !== "") return String(found[1]).trim();
    }
    return "";
  };

  const username = get("username", "handle", "igusername", "instagramusername").replace(/^@/, "");
  if (!username) return null;

  const full_name = get("fullname", "full_name", "name", "displayname") || username;
  const profile_link = get("profilelink", "profile_link", "profileurl", "url", "link") || `https://instagram.com/${username}`;
  const biography = get("biography", "bio", "description") || undefined;
  const category = get("category", "type", "niche", "industry") || undefined;
  const followersRaw = get("followerscount", "followers", "followercount", "followers_count");
  const followers = followersRaw ? Number(followersRaw.replace(/,/g, "")) || undefined : undefined;

  return { username, full_name, profile_link, biography, category, followers };
}

const Targets = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<TargetList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<TargetList | null>(null);
  const [listContacts, setListContacts] = useState<Contact[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [createMode, setCreateMode] = useState<"raw" | "file">("raw");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState("");
  const [creating, setCreating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchLists = useCallback(async () => {
    const { data } = await supabase
      .from("target_lists")
      .select("id, name, type, count, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setLists(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const loadListContacts = async (list: TargetList) => {
    setSelectedList(list);
    setListLoading(true);
    setSearch("");
    const { data: items } = await supabase
      .from("target_list_items")
      .select("contact_id")
      .eq("target_list_id", list.id);

    if (items?.length) {
      const contactIds = items.map(i => i.contact_id);
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, username, full_name, profile_link, status")
        .in("id", contactIds);
      setListContacts(contacts ?? []);
    } else {
      setListContacts([]);
    }
    setListLoading(false);
  };

  const parseRaw = (input: string): ParsedContact[] =>
    input
      .split("\n")
      .map(line => line.trim().replace(/^@/, ""))
      .filter(Boolean)
      .map(username => ({
        username,
        full_name: username,
        profile_link: `https://instagram.com/${username}`,
      }));

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    setFileName(file.name);

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const rows = result.data as Record<string, string>[];
          const contacts = rows.map(mapRow).filter((c): c is ParsedContact => c !== null);
          setParsedContacts(contacts);
          toast.success(`Parsed ${contacts.length} contacts from CSV`);
        },
        error: (err) => toast.error(`CSV error: ${err.message}`),
      });
    } else if (ext === "xlsx") {
      readXlsxFile(file).then((rows) => {
        if (rows.length < 2) {
          toast.error("File appears to be empty or has no data rows");
          return;
        }
        const headers = rows[0].map((h) => String(h ?? "").trim());
        const dataRows = rows.slice(1).map((row) => {
          const obj: Record<string, string | number | null> = {};
          headers.forEach((h, i) => {
            const val = row[i];
            obj[h] = val === undefined ? null : (val as string | number | null);
          });
          return obj;
        });
        const contacts = dataRows.map(mapRow).filter((c): c is ParsedContact => c !== null);
        setParsedContacts(contacts);
        toast.success(`Parsed ${contacts.length} contacts from ${ext.toUpperCase()}`);
      }).catch((err: any) => {
        toast.error(`XLSX error: ${err.message}`);
      });
    } else {
      toast.error("Unsupported file type. Use .csv or .xlsx");
    }
  };

  const clearFile = () => {
    setParsedContacts([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const createList = async () => {
    if (!newName.trim()) { toast.error("Enter a list name"); return; }

    const contacts = createMode === "file" ? parsedContacts : parseRaw(rawInput);
    if (!contacts.length) { toast.error("Add at least one contact"); return; }

    setCreating(true);
    try {
      const usernames = contacts.map(c => c.username);
      const { data: existing } = await supabase
        .from("contacts").select("id, username")
        .eq("user_id", userId).in("username", usernames);

      const existingMap = new Map((existing ?? []).map(c => [c.username, c.id]));
      const newContacts = contacts.filter(c => !existingMap.has(c.username));

      if (newContacts.length) {
        const { data: inserted, error } = await supabase
          .from("contacts")
          .insert(newContacts.map(c => ({
            user_id: userId,
            username: c.username,
            full_name: c.full_name,
            profile_link: c.profile_link,
            ...(c.biography ? { biography: c.biography } : {}),
            ...(c.category  ? { category: c.category }   : {}),
            ...(c.followers != null ? { followers: c.followers } : {}),
          })))
          .select("id, username");
        if (error) throw error;
        (inserted ?? []).forEach(c => existingMap.set(c.username, c.id));
      }

      // Update existing contacts with richer data if available
      const toUpdate = contacts.filter(c => existingMap.has(c.username) && (c.biography || c.category || c.followers));
      for (const c of toUpdate) {
        await supabase.from("contacts").update({
          full_name: c.full_name,
          profile_link: c.profile_link,
          ...(c.biography ? { biography: c.biography } : {}),
          ...(c.category  ? { category: c.category }   : {}),
          ...(c.followers != null ? { followers: c.followers } : {}),
        }).eq("user_id", userId).eq("username", c.username);
      }

      const allContactIds = contacts.map(c => existingMap.get(c.username)!).filter(Boolean);
      const { data: list, error: listErr } = await supabase
        .from("target_lists")
        .insert({ user_id: userId, name: newName.trim(), type: createMode === "file" ? "csv" : "raw", count: allContactIds.length })
        .select("id").single();
      if (listErr) throw listErr;

      if (allContactIds.length) {
        const { error: itemErr } = await supabase.from("target_list_items")
          .insert(allContactIds.map(contactId => ({ target_list_id: list.id, contact_id: contactId })));
        if (itemErr) throw itemErr;
      }

      toast.success(`Created "${newName.trim()}" with ${allContactIds.length} contacts`);
      setShowCreate(false);
      setNewName("");
      setRawInput("");
      setParsedContacts([]);
      setFileName("");
      fetchLists();
    } catch (err: any) {
      toast.error(err.message || "Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  const deleteList = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? Contacts will remain in the system.`)) return;
    await supabase.from("target_list_items").delete().eq("target_list_id", id);
    const { error } = await supabase.from("target_lists").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("List deleted");
      if (selectedList?.id === id) { setSelectedList(null); setListContacts([]); }
      fetchLists();
    }
  };

  const filteredContacts = useMemo(() =>
    listContacts.filter(c =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.username.toLowerCase().includes(search.toLowerCase())
    ), [listContacts, search]);

  const parsedCount = createMode === "file" ? parsedContacts.length : parseRaw(rawInput).length;

  // Count how many parsed contacts have enriched fields
  const enrichedCount = parsedContacts.filter(c => c.biography || c.category || c.followers).length;

  if (loading) return <PageSkeleton rows={8} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} className="pb-16">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 className="text-2xl font-semibold">Targets</h1>
          <p className="text-sm text-muted-foreground" style={{ marginTop: "0.2rem" }}>
            Manage your lead lists, contacts and scraping.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); if (showCreate) { clearFile(); setRawInput(""); setNewName(""); } }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all shrink-0 ${
            showCreate
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          }`}
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? "Cancel" : "New List"}
        </button>
      </div>

      {/* ── Lead hub — quick nav to Find Leads + Contacts ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <button
          onClick={() => navigate("/scraper")}
          style={{
            display: "flex", alignItems: "center", gap: "0.75rem",
            padding: "0.875rem 1rem", borderRadius: "0.875rem",
            border: "1px solid var(--border)", background: "var(--card)",
            cursor: "pointer", textAlign: "left", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--card)")}
        >
          <div style={{
            width: "36px", height: "36px", borderRadius: "0.625rem", flexShrink: 0,
            background: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Zap style={{ width: "16px", height: "16px", color: "var(--background)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>Find Leads</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>Scrape from Instagram</div>
          </div>
        </button>

        <button
          onClick={() => navigate("/contacts")}
          style={{
            display: "flex", alignItems: "center", gap: "0.75rem",
            padding: "0.875rem 1rem", borderRadius: "0.875rem",
            border: "1px solid var(--border)", background: "var(--card)",
            cursor: "pointer", textAlign: "left", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--card)")}
        >
          <div style={{
            width: "36px", height: "36px", borderRadius: "0.625rem", flexShrink: 0,
            background: "var(--foreground)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Users style={{ width: "16px", height: "16px", color: "var(--background)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)" }}>All Contacts</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>Browse &amp; manage contacts</div>
          </div>
        </button>
      </div>

      {/* ── Create form ── */}
      {showCreate && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.75rem" }}>

            {/* Name */}
            <div>
              <label className="text-sm font-semibold text-foreground" style={{ display: "block", marginBottom: "0.75rem" }}>
                List name
              </label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder='e.g. "Agency Owners" or "Med Spa Leads"'
                className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              />
            </div>

            {/* Mode tabs */}
            <div>
              <label className="text-sm font-semibold text-foreground" style={{ display: "block", marginBottom: "0.75rem" }}>
                How to add contacts
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "raw",  label: "Paste usernames",  icon: FileText, desc: "One username per line" },
                  { value: "file", label: "Upload file",      icon: Upload,   desc: "CSV, XLSX or XLS" },
                ].map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    onClick={() => { setCreateMode(value as "raw" | "file"); clearFile(); }}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                      createMode === value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      createMode === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground" style={{ marginTop: "0.125rem" }}>{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── File upload mode ── */}
            {createMode === "file" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />

                {parsedContacts.length === 0 ? (
                  /* Drop zone with real drag-and-drop */
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFile(file);
                    }}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: "0.75rem", borderRadius: "0.875rem", padding: "2.5rem 1.5rem",
                      border: `2px dashed ${isDragging ? "var(--primary)" : "var(--border)"}`,
                      background: isDragging ? "var(--primary)08" : "var(--muted)/30",
                      cursor: "pointer", transition: "all 0.15s", userSelect: "none",
                      transform: isDragging ? "scale(1.01)" : "scale(1)",
                    }}
                  >
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "0.875rem",
                      background: isDragging ? "var(--primary)15" : "var(--muted)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      <Upload style={{ width: "20px", height: "20px", color: isDragging ? "var(--primary)" : "var(--muted-foreground)", opacity: isDragging ? 1 : 0.6 }} />
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: isDragging ? "var(--primary)" : "var(--foreground)" }}>
                        {isDragging ? "Drop it!" : "Drag & drop your file here"}
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                        or <span style={{ color: "var(--primary)", fontWeight: 600 }}>click to browse</span> · CSV or XLSX
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Airtable-style preview */
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

                    {/* Header bar */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0.625rem 0.875rem", borderRadius: "0.75rem",
                      background: "linear-gradient(135deg, #10b98112, #059669 08)",
                      border: "1px solid #10b98130",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#10b981" }}>{fileName}</p>
                          <p style={{ fontSize: "0.67rem", color: "#10b981", opacity: 0.8 }}>
                            {parsedContacts.length.toLocaleString()} contacts · {enrichedCount > 0 ? `${enrichedCount} enriched` : "username only"}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <button
                          onClick={() => fileRef.current?.click()}
                          style={{ fontSize: "0.68rem", fontWeight: 600, color: "#10b981", opacity: 0.75, background: "transparent", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem" }}
                        >
                          Replace
                        </button>
                        <button
                          onClick={clearFile}
                          style={{ padding: "0.25rem", borderRadius: "0.375rem", border: "none", background: "transparent", cursor: "pointer", color: "#10b981", flexShrink: 0 }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Field pills */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", alignItems: "center" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--muted-foreground)", marginRight: "0.125rem" }}>Detected:</span>
                      {[
                        { label: "username", always: true },
                        { label: "full_name", always: true },
                        { label: "profile_link", always: true },
                        { label: "biography", check: parsedContacts.some(c => c.biography) },
                        { label: "category", check: parsedContacts.some(c => c.category) },
                        { label: "followers", check: parsedContacts.some(c => c.followers != null) },
                      ].filter(f => f.always || f.check).map(f => (
                        <span key={f.label} style={{
                          padding: "0.15rem 0.5rem", borderRadius: "999px", fontSize: "0.67rem", fontWeight: 600,
                          background: f.always ? "#10b98118" : "#6366f118",
                          color: f.always ? "#10b981" : "#818cf8",
                          border: `1px solid ${f.always ? "#10b98130" : "#6366f130"}`,
                        }}>{f.label}</span>
                      ))}
                    </div>

                    {/* Airtable-style table */}
                    <div style={{ borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
                      {/* Column headers */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr 1fr 110px 90px",
                        background: "var(--muted)",
                        borderBottom: "2px solid var(--border)",
                      }}>
                        <div style={{ padding: "0.5rem 0", textAlign: "center", borderRight: "1px solid var(--border)", fontSize: "0.65rem", color: "var(--muted-foreground)" }}>#</div>
                        {[
                          { label: "Username", color: "#6366f1" },
                          { label: "Full Name", color: "#0ea5e9" },
                          { label: "Category", color: "#f59e0b" },
                          { label: "Followers", color: "#10b981" },
                        ].map((col, i) => (
                          <div key={col.label} style={{
                            padding: "0.45rem 0.75rem", fontSize: "0.68rem", fontWeight: 700,
                            color: col.color, borderRight: i < 3 ? "1px solid var(--border)" : "none",
                            display: "flex", alignItems: "center", gap: "0.3rem",
                          }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: col.color, flexShrink: 0, display: "inline-block" }} />
                            {col.label}
                          </div>
                        ))}
                      </div>

                      {/* Data rows */}
                      {parsedContacts.slice(0, 7).map((c, i) => (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "32px 1fr 1fr 110px 90px",
                          borderBottom: i < Math.min(parsedContacts.length, 7) - 1 ? "1px solid var(--border)" : "none",
                          transition: "background 0.1s",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)/50")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{
                            padding: "0.5rem 0", textAlign: "center", borderRight: "1px solid var(--border)",
                            fontSize: "0.63rem", color: "var(--muted-foreground)", fontWeight: 500,
                          }}>{i + 1}</div>
                          <div style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
                            <span style={{
                              fontSize: "0.72rem", fontWeight: 600, color: "#6366f1",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block",
                            }}>@{c.username}</span>
                          </div>
                          <div style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
                            <span style={{
                              fontSize: "0.72rem", color: "var(--foreground)",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block",
                            }}>{c.full_name}</span>
                          </div>
                          <div style={{ padding: "0.5rem 0.75rem", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
                            {c.category ? (
                              <span style={{
                                fontSize: "0.65rem", fontWeight: 600, padding: "0.15rem 0.5rem",
                                borderRadius: "999px", background: "#f59e0b18", color: "#f59e0b",
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "100%",
                              }}>{c.category}</span>
                            ) : (
                              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.4 }}>—</span>
                            )}
                          </div>
                          <div style={{ padding: "0.5rem 0.75rem", overflow: "hidden" }}>
                            {c.followers != null ? (
                              <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#10b981" }}>
                                {c.followers >= 1000 ? `${(c.followers / 1000).toFixed(1)}K` : c.followers.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.4 }}>—</span>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Footer */}
                      {parsedContacts.length > 7 && (
                        <div style={{
                          padding: "0.4rem 0.75rem",
                          background: "var(--muted)",
                          borderTop: "1px solid var(--border)",
                          fontSize: "0.68rem", color: "var(--muted-foreground)", fontWeight: 500,
                        }}>
                          + {(parsedContacts.length - 7).toLocaleString()} more rows not shown
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Field mapping note */}
                {parsedContacts.length === 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
                    <AlertCircle size={12} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                    <span>
                      Columns automatically mapped: <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Username</code>, <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Full name</code>, <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Profile link</code>, <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Followers count</code>, <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Biography</code>, <code style={{ background: "var(--muted)", padding: "0 3px", borderRadius: "3px" }}>Category</code>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Raw paste mode ── */}
            {createMode === "raw" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <label className="text-sm font-semibold text-foreground">Usernames</label>
                  {parsedCount > 0 && (
                    <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-2.5 py-0.5">
                      {parsedCount} detected
                    </span>
                  )}
                </div>
                <textarea
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder={"username1\nusername2\nusername3"}
                  rows={8}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all resize-none"
                />
              </div>
            )}

            <button
              onClick={createList}
              disabled={creating || !newName.trim() || parsedCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Users className="h-4 w-4" />
              {creating ? "Creating list…" : `Create list${parsedCount > 0 ? ` · ${parsedCount} contacts` : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {lists.length === 0 && !showCreate && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto" style={{ marginBottom: "1.25rem" }}>
            <Target className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <p className="text-base font-semibold text-foreground">No target lists yet</p>
          <p className="text-sm text-muted-foreground" style={{ marginTop: "0.375rem" }}>
            Create a list to start using contacts in campaigns.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
            style={{ marginTop: "1.5rem" }}
          >
            <Plus className="h-4 w-4" />
            Create your first list
          </button>
        </div>
      )}

      {/* Lists grid */}
      {lists.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: "1rem" }}>
          {lists.map(list => (
            <div
              key={list.id}
              onClick={() => loadListContacts(list)}
              className={`group relative rounded-2xl border cursor-pointer transition-all ${
                selectedList?.id === list.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
              }`}
              style={{ padding: "1.25rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
                  selectedList?.id === list.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  <Target className="h-5 w-5" />
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteList(list.id, list.name); }}
                  className="opacity-0 group-hover:opacity-100 transition-all rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div style={{ marginTop: "0.875rem" }}>
                <p className="text-sm font-semibold text-foreground truncate">{list.name}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.375rem" }}>
                  <span className="text-xs text-muted-foreground">{list.count.toLocaleString()} contacts</span>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="text-xs text-muted-foreground capitalize">{list.type}</span>
                </div>
              </div>
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="text-xs text-muted-foreground/60">
                  {new Date(list.created_at).toLocaleDateString()}
                </span>
                <ChevronRight className={`h-4 w-4 transition-colors ${
                  selectedList?.id === list.id ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                }`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact panel */}
      {selectedList && (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border" style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{selectedList.name}</h3>
              <p className="text-xs text-muted-foreground" style={{ marginTop: "0.125rem" }}>
                {listContacts.length.toLocaleString()} contacts
              </p>
            </div>
            <button
              onClick={() => { setSelectedList(null); setListContacts([]); }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {listContacts.length > 5 && (
            <div style={{ padding: "0.875rem 1.5rem", borderBottom: "1px solid hsl(var(--border))" }}>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                />
              </div>
            </div>
          )}

          {listLoading ? (
            <div style={{ padding: "0.75rem 0" }}><SkeletonRows rows={5} height="1.9rem" /></div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No contacts found.</div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {filteredContacts.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 hover:bg-muted/30 transition-colors"
                  style={{
                    padding: "0.75rem 1.5rem",
                    borderBottom: i < filteredContacts.length - 1 ? "1px solid hsl(var(--border) / 0.5)" : "none",
                  }}
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      {(c.full_name?.[0] || c.username?.[0] || "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">@{c.username}</p>
                  </div>
                  {c.status && (
                    <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold shrink-0 ${
                      STATUS_STYLES[c.status] ?? "bg-muted text-muted-foreground"
                    }`}>
                      {c.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Targets;
