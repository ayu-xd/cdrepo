import { useCallback, useState, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const contactSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200),
  username: z.string().trim().max(100),
  profile_link: z.string().trim().url().max(500),
  followers: z.number().int().min(0).max(1_000_000_000),
  biography: z.string().trim().max(2000),
  category: z.string().trim().max(100),
});

type ParsedContact = z.infer<typeof contactSchema>;

interface CsvUploadProps {
  userId: string;
  onComplete: () => void;
}

const CsvUpload = ({ userId, onComplete }: CsvUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildListName = (fileName: string) => {
    const baseName = fileName.replace(/\.[^.]+$/, "").trim();
    if (baseName) return baseName;
    return `Imported ${new Date().toISOString().slice(0, 10)}`;
  };

  const processFile = useCallback(
    async (file: File) => {
      setUploading(true);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const rows = results.data as Record<string, string>[];

            let skippedInvalid = 0;
            const parsedContacts = rows
              .map((row) => {
                const raw = {
                  user_id: userId,
                  full_name: row["Full name"] || row["full_name"] || row["Full Name"] || "",
                  username: row["Username"] || row["username"] || "",
                  profile_link: row["Profile link"] || row["profile_link"] || row["Profile Link"] || "",
                  followers: parseInt(row["Followers count"] || row["followers"] || row["Followers"] || "0") || 0,
                  biography: row["Biography"] || row["biography"] || "",
                  category: row["Category"] || row["category"] || "",
                };
                const result = contactSchema.safeParse(raw);
                if (!result.success) {
                  skippedInvalid++;
                  return null;
                }
                return result.data;
              })
              .filter((c): c is ParsedContact => c !== null && !!c.profile_link);

            if (!parsedContacts.length) {
              toast.error("No valid contacts found in CSV");
              return;
            }

            const uniqueContactsByLink = new Map<string, ParsedContact>();
            parsedContacts.forEach((contact) => {
              const key = contact.profile_link.trim();
              if (!uniqueContactsByLink.has(key)) uniqueContactsByLink.set(key, contact);
            });

            const uniqueContacts = Array.from(uniqueContactsByLink.values());
            const listName = buildListName(file.name);
            const profileLinks = uniqueContacts.map((contact) => contact.profile_link.trim());

            const existingContacts: { id: string; profile_link: string }[] = [];
            const chunkSize = 200;
            for (let i = 0; i < profileLinks.length; i += chunkSize) {
              const chunk = profileLinks.slice(i, i + chunkSize);
              const { data, error } = await supabase
                .from("contacts")
                .select("id, profile_link")
                .eq("user_id", userId)
                .in("profile_link", chunk);
              if (error) throw error;
              if (data) existingContacts.push(...data);
            }

            const existingByLink = new Map(existingContacts.map((c) => [c.profile_link, c.id]));
            const newContacts = uniqueContacts
              .filter((contact) => !existingByLink.has(contact.profile_link))
              .map((contact) => ({
                id: crypto.randomUUID(),
                ...contact,
              }));

            const { data: list, error: listError } = await supabase
              .from("lead_lists")
              .insert({
                user_id: userId,
                name: listName,
                type: "csv",
                count: uniqueContacts.length,
                source_info: { filename: file.name },
              })
              .select("id")
              .single();

            if (listError || !list) throw listError ?? new Error("Failed to create lead list");

            if (newContacts.length > 0) {
              for (let i = 0; i < newContacts.length; i += 50) {
                const batch = newContacts.slice(i, i + 50) as any[];
                const { error } = await supabase.from("contacts").insert(batch);
                if (error) throw error;
              }
            }

            const newByLink = new Map(newContacts.map((contact) => [contact.profile_link, contact.id]));
            const listItems = uniqueContacts.map((contact) => ({
              lead_list_id: list.id,
              contact_id: existingByLink.get(contact.profile_link) ?? newByLink.get(contact.profile_link)!,
            }));

            for (let i = 0; i < listItems.length; i += 500) {
              const batch = listItems.slice(i, i + 500) as any[];
              const { error } = await supabase.from("lead_list_items").insert(batch);
              if (error) throw error;
            }

            const duplicatesInCsv = parsedContacts.length - uniqueContacts.length;
            const existingCount = existingByLink.size;
            const newCount = newContacts.length;

            toast.success(
              `Created list "${listName}" with ${listItems.length} contacts (${newCount} new` +
                `${existingCount ? `, ${existingCount} existing` : ""}` +
                `${duplicatesInCsv ? `, ${duplicatesInCsv} duplicates skipped` : ""}` +
                `${skippedInvalid ? `, ${skippedInvalid} invalid skipped` : ""})`
            );
            onComplete();
          } catch (err: any) {
            toast.error(err.message || "Upload failed");
          } finally {
            setUploading(false);
          }
        },
        error: () => {
          toast.error("Failed to parse CSV");
          setUploading(false);
        },
      });
    },
    [userId, onComplete]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so same file can be re-selected
      if (e.target) e.target.value = "";
    },
    [processFile]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileInput}
        disabled={uploading}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="h-8 gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        {uploading ? "Importing..." : "Import CSV"}
      </Button>
    </>
  );
};

export default CsvUpload;
