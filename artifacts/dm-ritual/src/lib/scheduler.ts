/**
 * Smart Scheduler — Generates daily DM tasks for all active campaigns.
 *
 * Algorithm:
 * 1. For each browser instance, find which active campaigns it's assigned to
 * 2. Split DM_LIMIT equally across those campaigns
 * 3. Within each campaign: 33% follow-ups / 67% new DMs (if follow-up enabled)
 * 4. Cross-campaign dedup: skip contacts already targeted by another campaign
 * 5. Pick random variants and resolve {{variables}}
 */

import { supabase } from "@/integrations/supabase/client";

// ── Variable replacement ──────────────────────────────────────────

const normalizeFullName = (n: string | null) => (n || "").split("|")[0].trim();
const getFirstName = (fullName: string | null, username: string | null) => {
  const clean = normalizeFullName(fullName);
  if (clean) return clean.split(/\s+/)[0];
  return (username || "").replace(/^@/, "").trim();
};

export function applyVariables(
  template: string,
  contact: { full_name: string; username: string }
): string {
  const fullName = normalizeFullName(contact.full_name);
  const firstName = getFirstName(contact.full_name, contact.username);
  const username = (contact.username || "").replace(/^@/, "").trim();
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, fullName)
    .replace(/\{\{\s*username\s*\}\}/gi, username);
}

// ── Types ──────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  followup_enabled: boolean;
  followup_delay_days: number;
};

type Variant = {
  id: string;
  sequence_id: string;
  variant_number: number;
  message_text: string;
};

type SequenceWithVariants = {
  id: string;
  campaign_id: string;
  step_type: string;
  variants: Variant[];
};

type Contact = {
  id: string;
  username: string;
  full_name: string;
  status: string;
  dmed_at: string | null;
  followed_at: string | null;
  followup_1a_sent: boolean;
  assigned_browser_id: string | null;
};

// ── Main scheduler ────────────────────────────────────────────────

export async function generateDailyTasks(userId: string, dmLimit: number, followBeforeDm: boolean = true) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  
  // Load settings to check configured working days
  const { data: settings } = await supabase
    .from("user_settings")
    .select("working_days")
    .eq("user_id", userId)
    .single();

  // "0"=Sun, "1"=Mon, "2"=Tue, "3"=Wed, "4"=Thu, "5"=Fri, "6"=Sat
  const workingDays = settings?.working_days || ["1", "2", "3", "4", "5"];
  const dayOfWeek = now.getDay().toString();

  if (!workingDays.includes(dayOfWeek)) {
    return { generated: 0, message: "Skipping scheduling on non-working days" };
  }

  // 1. Get all active campaigns
  const { data: campaigns, error: campErr } = await supabase
    .from("campaigns")
    .select("id, followup_enabled, followup_delay_days")
    .eq("user_id", userId)
    .eq("status", "active");

  if (campErr) throw campErr;
  if (!campaigns?.length) return { generated: 0, message: "No active campaigns" };

  // 2. Get all browser instances for this user
  const { data: browsers } = await supabase
    .from("browser_instances")
    .select("id")
    .eq("user_id", userId);

  if (!browsers?.length) return { generated: 0, message: "No browser instances" };

  // 3. Get campaign ↔ account assignments
  const campaignIds = campaigns.map(c => c.id);
  const browserIds = browsers.map(b => b.id);

  const { data: assignments } = await supabase
    .from("campaign_accounts")
    .select("campaign_id, browser_instance_id, daily_dm_limit")
    .in("campaign_id", campaignIds)
    .in("browser_instance_id", browserIds);

  if (!assignments?.length) return { generated: 0, message: "No accounts assigned to campaigns" };

  // Build a pacing lookup: "campaignId:browserId" → daily_dm_limit
  const pacingMap = new Map<string, number>();
  assignments.forEach(a => {
    pacingMap.set(`${a.campaign_id}:${a.browser_instance_id}`, a.daily_dm_limit ?? dmLimit);
  });

  // 4. Get existing tasks for today (to avoid duplicates and update pending)
  const { data: existingTasks } = await supabase
    .from("dm_tasks")
    .select("id, contact_id, browser_instance_id, status, task_type, variant_number, message_text, campaign_id")
    .eq("user_id", userId)
    .eq("scheduled_date", today)
    .in("status", ["pending", "claimed", "processing", "completed"]);

  const existingSet = new Set(
    (existingTasks || []).map(t => `${t.contact_id}:${t.browser_instance_id}`)
  );
  const globalContactsToday = new Set(
    (existingTasks || []).map(t => t.contact_id)
  );

  const existingCountByBrowser = new Map<string, number>();
  (existingTasks || []).forEach(t => {
    existingCountByBrowser.set(
      t.browser_instance_id,
      (existingCountByBrowser.get(t.browser_instance_id) || 0) + 1
    );
  });

  // 5. Load sequences + variants for all active campaigns
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, campaign_id, step_type")
    .in("campaign_id", campaignIds);

  const seqIds = (sequences || []).map(s => s.id);
  let allVariants: Variant[] = [];
  if (seqIds.length) {
    const { data } = await supabase
      .from("sequence_variants")
      .select("id, sequence_id, variant_number, message_text")
      .in("sequence_id", seqIds);
    allVariants = (data || []) as Variant[];
  }

  // Build lookup: campaign_id → SequenceWithVariants[]
  const seqMap = new Map<string, SequenceWithVariants[]>();
  (sequences || []).forEach(s => {
    const existing = seqMap.get(s.campaign_id) || [];
    existing.push({
      ...s,
      variants: allVariants.filter(v => v.sequence_id === s.id),
    });
    seqMap.set(s.campaign_id, existing);
  });

  // 6. Load campaign ↔ target list ↔ contacts
  const { data: campaignTargetLinks } = await supabase
    .from("campaign_targets")
    .select("campaign_id, target_list_id")
    .in("campaign_id", campaignIds);

  const targetListIds = [...new Set((campaignTargetLinks || []).map(ct => ct.target_list_id))];

  const campaignContactIds = new Map<string, string[]>();
  let allContactIds: string[] = [];

  if (targetListIds.length) {
    const { data: items } = await supabase
      .from("target_list_items")
      .select("target_list_id, contact_id")
      .in("target_list_id", targetListIds);

    const listToContacts = new Map<string, string[]>();
    (items || []).forEach(item => {
      const existing = listToContacts.get(item.target_list_id) || [];
      existing.push(item.contact_id);
      listToContacts.set(item.target_list_id, existing);
    });

    allContactIds = [...new Set((items || []).map(i => i.contact_id))];

    (campaignTargetLinks || []).forEach(ct => {
      const contacts = listToContacts.get(ct.target_list_id) || [];
      const existing = campaignContactIds.get(ct.campaign_id) || [];
      campaignContactIds.set(ct.campaign_id, [...new Set([...existing, ...contacts])]);
    });
  }

  // Include any contacts that already have tasks today to ensure we can update their pending variants
  const existingTaskContactIds = (existingTasks || []).map(t => t.contact_id);
  allContactIds = [...new Set([...allContactIds, ...existingTaskContactIds])];

  // 7. Load all relevant contacts in bulk
  const contactMap = new Map<string, Contact>();
  if (allContactIds.length) {
    const batches: string[][] = [];
    for (let i = 0; i < allContactIds.length; i += 500) {
      batches.push(allContactIds.slice(i, i + 500));
    }
    for (const batch of batches) {
      const { data } = await supabase
        .from("contacts")
        .select("id, username, full_name, status, dmed_at, followed_at, followup_1a_sent, assigned_browser_id")
        .in("id", batch);
      (data || []).forEach(c => contactMap.set(c.id, c as Contact));
    }
  }

  // 7.5 Synchronize pending tasks with latest message variants
  const pendingTasks = (existingTasks || []).filter(t => t.status === "pending");
  let updatedPendingCount = 0;

  for (const t of pendingTasks) {
    if (!t.campaign_id || !t.task_type || !t.variant_number) continue;
    
    const seqs = seqMap.get(t.campaign_id) || [];
    // task_type in dm_tasks differs from step_type in sequences
    const stepTypeMap: Record<string, string> = { first_dm: "first_message", followup_1a: "followup_1a" };
    const mappedStepType = stepTypeMap[t.task_type] ?? t.task_type;
    const seq = seqs.find(s => s.step_type === mappedStepType);
    if (!seq) continue;
    
    const variant = seq.variants.find(v => v.variant_number === t.variant_number);
    if (!variant) continue;
    
    const contact = contactMap.get(t.contact_id);
    if (!contact) continue;
    
    const resolved = applyVariables(variant.message_text, contact);
    if (resolved !== t.message_text) {
      await supabase.from("dm_tasks").update({ message_text: resolved }).eq("id", t.id);
      updatedPendingCount++;
    }
  }

  // 8. Generate tasks
  const tasksToInsert: any[] = [];
  let totalGenerated = 0;

  for (const browser of browsers) {
    const browserCampaigns = assignments
      .filter(a => a.browser_instance_id === browser.id)
      .map(a => campaigns.find(c => c.id === a.campaign_id)!)
      .filter(Boolean);

    if (!browserCampaigns.length) continue;

    const existingCount = existingCountByBrowser.get(browser.id) || 0;
    const globalRemaining = dmLimit - existingCount;
    if (globalRemaining <= 0) continue;

    for (const campaign of browserCampaigns) {
      const seqs = seqMap.get(campaign.id) || [];
      const firstMsgSeq = seqs.find(s => s.step_type === "first_message");
      const followupSeq = seqs.find(s => s.step_type === "followup_1a");

      if (!firstMsgSeq?.variants.length) continue;

      const contactIds = campaignContactIds.get(campaign.id) || [];

      // Per-campaign pacing: use the MINIMUM of global remaining and campaign-specific limit
      const campaignPacingLimit = pacingMap.get(`${campaign.id}:${browser.id}`) ?? dmLimit;
      const perCampaignQuota = Math.max(1, Math.min(globalRemaining, campaignPacingLimit));

      // Calculate slots
      let followupSlots = 0;
      let newDmSlots = perCampaignQuota;

      if (campaign.followup_enabled && followupSeq?.variants.length) {
        followupSlots = Math.floor(perCampaignQuota * 0.33);
        newDmSlots = perCampaignQuota - followupSlots;
      }

      // === Follow-up -1A candidates ===
      if (followupSlots > 0 && followupSeq) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - campaign.followup_delay_days);
        const cutoff = cutoffDate.toISOString();

        let followupCount = 0;
        for (const cId of contactIds) {
          if (followupCount >= followupSlots) break;
          const contact = contactMap.get(cId);
          if (!contact) continue;
          if (contact.status !== "dmed") continue;
          if (contact.followup_1a_sent) continue;
          if (!contact.dmed_at || contact.dmed_at > cutoff) continue;
          if (globalContactsToday.has(cId)) continue;

          const key = `${cId}:${browser.id}`;
          if (existingSet.has(key)) continue;

          const variant = followupSeq.variants[
            Math.floor(Math.random() * followupSeq.variants.length)
          ];
          const resolved = applyVariables(variant.message_text, contact);

          tasksToInsert.push({
            user_id: userId,
            campaign_id: campaign.id,
            contact_id: cId,
            browser_instance_id: browser.id,
            task_type: "followup_1a",
            message_text: resolved,
            variant_number: variant.variant_number,
            status: "pending",
            scheduled_date: today,
          });

          globalContactsToday.add(cId);
          existingSet.add(key);
          followupCount++;
          totalGenerated++;
        }
      }

      // Set up a round-robin queue for variants to ensure perfectly even distribution
      let variantQueue: typeof firstMsgSeq.variants = [];
      const getNextVariant = () => {
        if (variantQueue.length === 0) {
          // Refill and shuffle the queue
          variantQueue = [...firstMsgSeq.variants].sort(() => Math.random() - 0.5);
        }
        return variantQueue.pop()!;
      };

      // === New DM candidates ===
      let newCount = 0;
      for (const cId of contactIds) {
        if (newCount >= newDmSlots) break;
        const contact = contactMap.get(cId);
        if (!contact) continue;
        if (contact.dmed_at !== null) continue;
        
        // When follow_before_dm is ON, only DM people who've been followed already
        const eligibleStatuses = followBeforeDm ? ["followed"] : ["not_started", "followed"];
        if (!eligibleStatuses.includes(contact.status)) continue;
        
        // Enforce the 1-Day Delay rule! (Cannot Follow and DM on the same day)
        if (followBeforeDm && contact.status === "followed") {
          // If followed_at is today, they must wait until tomorrow to receive a DM task
          if (contact.followed_at && contact.followed_at.startsWith(today)) {
            continue;
          }
        }

        if (globalContactsToday.has(cId)) continue;
        // If a specific browser was recorded at follow-time, only assign to that browser
        if (contact.assigned_browser_id && contact.assigned_browser_id !== browser.id) continue;

        const key = `${cId}:${browser.id}`;
        if (existingSet.has(key)) continue;

        const variant = getNextVariant();
        const resolved = applyVariables(variant.message_text, contact);

        tasksToInsert.push({
          user_id: userId,
          campaign_id: campaign.id,
          contact_id: cId,
          browser_instance_id: browser.id,
          task_type: "first_dm",
          message_text: resolved,
          variant_number: variant.variant_number,
          status: "pending",
          scheduled_date: today,
        });

        globalContactsToday.add(cId);
        existingSet.add(key);
        newCount++;
        totalGenerated++;
      }
    }
  }

  // 9. Bulk insert tasks
  if (tasksToInsert.length) {
    // Shuffle the entire task list so that variants and campaigns are completely interleaved.
    // This breaks repeating patterns and makes the DM flow look highly organic to Instagram.
    for (let i = tasksToInsert.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tasksToInsert[i], tasksToInsert[j]] = [tasksToInsert[j], tasksToInsert[i]];
    }

    const { error: insertErr } = await supabase
      .from("dm_tasks")
      .insert(tasksToInsert);
    if (insertErr) throw insertErr;
  }

  return {
    generated: totalGenerated,
    message: `Generated ${totalGenerated} tasks for today${updatedPendingCount > 0 ? ` (Updated ${updatedPendingCount} pending tasks)` : ''}`,
  };
}

/**
 * Get today's task stats for the dashboard
 */
export async function getTodayStats(userId: string, campaignId?: string) {
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("dm_tasks")
    .select("status, task_type, campaign_id, browser_instance_id")
    .eq("user_id", userId)
    .eq("scheduled_date", today);

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data: tasks } = await query;
  const all = tasks || [];
  return {
    total: all.length,
    pending: all.filter(t => t.status === "pending").length,
    completed: all.filter(t => t.status === "completed").length,
    failed: all.filter(t => t.status === "failed").length,
    processing: all.filter(t => ["claimed", "processing"].includes(t.status)).length,
    followups: all.filter(t => t.task_type === "followup_1a").length,
    newDms: all.filter(t => t.task_type === "first_dm").length,
  };
}
