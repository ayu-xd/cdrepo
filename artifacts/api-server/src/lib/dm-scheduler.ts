/**
 * Server-side DM task scheduler.
 * Mirrors the logic in dm-ritual/src/lib/scheduler.ts but runs with
 * the Supabase service-role client so it works for all users at once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { supabaseAdmin } from "./supabase";
import { resolveFirstName } from "./parse-name";

// ── Variable replacement ───────────────────────────────────────────

const normalizeFullName = (n: string | null) => (n || "").split("|")[0].trim();

function applyVariables(
  template: string,
  contact: { full_name: string; username: string },
  preResolveName: boolean
): string {
  const fullName = normalizeFullName(contact.full_name);
  const firstName = preResolveName
    ? resolveFirstName(contact.full_name, contact.username)
    : (fullName ? fullName.split(/\s+/)[0] : (contact.username || "").replace(/^@/, "").trim());
  const username = (contact.username || "").replace(/^@/, "").trim();
  let result = template;
  if (firstName) {
    result = result.replace(/\{\{\s*firstName\s*\}\}/gi, firstName);
  } else {
    // No name available — remove the token and clean up dangling punctuation/spaces
    // e.g. "Hey {{firstName}}, love your work!" → "Hey, love your work!"
    result = result
      .replace(/\{\{\s*firstName\s*\}\}/gi, "")
      .replace(/\s+([,!?.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return result
    .replace(/\{\{\s*name\s*\}\}/gi, fullName)
    .replace(/\{\{\s*username\s*\}\}/gi, username);
}

// ── Types ──────────────────────────────────────────────────────────

type Contact = {
  id: string;
  username: string;
  full_name: string;
  status: string;
  dmed_at: string | null;
  followup_1a_sent: boolean;
  assigned_browser_id: string | null;
};

type Variant = {
  id: string;
  sequence_id: string;
  variant_number: number;
  message_text: string;
};

function createShuffledQueue(variants: Variant[]): () => Variant {
  let queue: Variant[] = [];
  return () => {
    if (queue.length === 0) {
      queue = [...variants];
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    return queue.pop()!;
  };
}

// ── Per-user generator ────────────────────────────────────────────

export async function generateDailyTasksForUser(
  db: SupabaseClient,
  userId: string,
  dmLimit: number,
  followBeforeDm: boolean
): Promise<{ generated: number; message: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: campaigns, error: campErr } = await db
    .from("campaigns")
    .select("id, followup_enabled, followup_delay_days, pre_resolve_name")
    .eq("user_id", userId)
    .eq("status", "active");

  if (campErr) throw campErr;
  if (!campaigns?.length) return { generated: 0, message: "No active campaigns" };

  const { data: browsers } = await db
    .from("browser_instances")
    .select("id")
    .eq("user_id", userId);

  if (!browsers?.length) return { generated: 0, message: "No browser instances" };

  const campaignIds = campaigns.map((c: any) => c.id);
  const browserIds = browsers.map((b: any) => b.id);

  const { data: assignments } = await db
    .from("campaign_accounts")
    .select("campaign_id, browser_instance_id")
    .in("campaign_id", campaignIds)
    .in("browser_instance_id", browserIds);

  if (!assignments?.length) return { generated: 0, message: "No accounts assigned to campaigns" };

  const { data: existingTasks } = await db
    .from("dm_tasks")
    .select("contact_id, browser_instance_id")
    .eq("user_id", userId)
    .eq("scheduled_date", today)
    .in("status", ["pending", "claimed", "processing", "completed"]);

  const existingSet = new Set(
    (existingTasks || []).map((t: any) => `${t.contact_id}:${t.browser_instance_id}`)
  );
  const globalContactsToday = new Set((existingTasks || []).map((t: any) => t.contact_id));
  const existingCountByBrowser = new Map<string, number>();
  (existingTasks || []).forEach((t: any) => {
    existingCountByBrowser.set(t.browser_instance_id, (existingCountByBrowser.get(t.browser_instance_id) || 0) + 1);
  });

  const { data: sequences } = await db
    .from("sequences")
    .select("id, campaign_id, step_type")
    .in("campaign_id", campaignIds);

  const seqIds = (sequences || []).map((s: any) => s.id);
  let allVariants: Variant[] = [];
  if (seqIds.length) {
    const { data } = await db
      .from("sequence_variants")
      .select("id, sequence_id, variant_number, message_text")
      .in("sequence_id", seqIds);
    allVariants = (data || []) as Variant[];
  }

  const seqMap = new Map<string, any[]>();
  (sequences || []).forEach((s: any) => {
    const existing = seqMap.get(s.campaign_id) || [];
    existing.push({ ...s, variants: allVariants.filter(v => v.sequence_id === s.id) });
    seqMap.set(s.campaign_id, existing);
  });

  const { data: campaignTargetLinks } = await db
    .from("campaign_targets")
    .select("campaign_id, target_list_id")
    .in("campaign_id", campaignIds);

  const targetListIds = [...new Set((campaignTargetLinks || []).map((ct: any) => ct.target_list_id))];
  const campaignContactIds = new Map<string, string[]>();
  let allContactIds: string[] = [];

  if (targetListIds.length) {
    const { data: items } = await db
      .from("target_list_items")
      .select("target_list_id, contact_id")
      .in("target_list_id", targetListIds);

    const listToContacts = new Map<string, string[]>();
    (items || []).forEach((item: any) => {
      const existing = listToContacts.get(item.target_list_id) || [];
      existing.push(item.contact_id);
      listToContacts.set(item.target_list_id, existing);
    });
    allContactIds = [...new Set((items || []).map((i: any) => i.contact_id))];
    (campaignTargetLinks || []).forEach((ct: any) => {
      const contacts = listToContacts.get(ct.target_list_id) || [];
      const existing = campaignContactIds.get(ct.campaign_id) || [];
      campaignContactIds.set(ct.campaign_id, [...new Set([...existing, ...contacts])]);
    });
  }

  const contactMap = new Map<string, Contact>();
  if (allContactIds.length) {
    const batches: string[][] = [];
    for (let i = 0; i < allContactIds.length; i += 500) batches.push(allContactIds.slice(i, i + 500));
    for (const batch of batches) {
      const { data } = await db
        .from("contacts")
        .select("id, username, full_name, status, dmed_at, followup_1a_sent, assigned_browser_id")
        .in("id", batch);
      (data || []).forEach((c: any) => contactMap.set(c.id, c as Contact));
    }
  }

  const tasksToInsert: any[] = [];
  let totalGenerated = 0;

  for (const browser of browsers) {
    const browserCampaigns = (assignments as any[])
      .filter(a => a.browser_instance_id === (browser as any).id)
      .map(a => campaigns.find((c: any) => c.id === a.campaign_id))
      .filter(Boolean);

    if (!browserCampaigns.length) continue;

    const existingCount = existingCountByBrowser.get((browser as any).id) || 0;
    const remaining = dmLimit - existingCount;
    if (remaining <= 0) continue;

    const perCampaignQuota = Math.max(1, Math.floor(remaining / browserCampaigns.length));

    for (const campaign of browserCampaigns) {
      const seqs = seqMap.get((campaign as any).id) || [];
      const firstMsgSeq = seqs.find(s => s.step_type === "first_message");
      const followupSeq = seqs.find(s => s.step_type === "followup_1a");

      if (!firstMsgSeq?.variants.length) continue;

      const contactIds = campaignContactIds.get((campaign as any).id) || [];

      const getFollowupVariant = followupSeq?.variants.length 
        ? createShuffledQueue(followupSeq.variants) 
        : null;

      const getFirstMsgVariant = firstMsgSeq?.variants.length 
        ? createShuffledQueue(firstMsgSeq.variants) 
        : null;

      let followupSlots = 0;
      let newDmSlots = perCampaignQuota;
      if ((campaign as any).followup_enabled && followupSeq?.variants.length) {
        followupSlots = Math.floor(perCampaignQuota * 0.33);
        newDmSlots = perCampaignQuota - followupSlots;
      }

      // Follow-up -1A
      if (followupSlots > 0 && followupSeq) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (campaign as any).followup_delay_days);
        const cutoff = cutoffDate.toISOString();
        let followupCount = 0;

        for (const cId of contactIds) {
          if (followupCount >= followupSlots) break;
          const contact = contactMap.get(cId);
          if (!contact || contact.status !== "dmed") continue;
          if (contact.followup_1a_sent) continue;
          if (!contact.dmed_at || contact.dmed_at > cutoff) continue;
          if (globalContactsToday.has(cId)) continue;
          const key = `${cId}:${(browser as any).id}`;
          if (existingSet.has(key)) continue;

          const variant = getFollowupVariant!();
          const preResolveFollowup = (campaign as any).pre_resolve_name !== false;
          tasksToInsert.push({
            user_id: userId,
            campaign_id: (campaign as any).id,
            contact_id: cId,
            browser_instance_id: (browser as any).id,
            task_type: "followup_1a",
            message_text: applyVariables(variant.message_text, contact, preResolveFollowup),
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

      // New DMs
      let newCount = 0;
      for (const cId of contactIds) {
        if (newCount >= newDmSlots) break;
        const contact = contactMap.get(cId);
        if (!contact || contact.dmed_at !== null) continue;
        const eligibleStatuses = followBeforeDm ? ["followed"] : ["not_started", "followed"];
        if (!eligibleStatuses.includes(contact.status)) continue;
        if (globalContactsToday.has(cId)) continue;
        if (contact.assigned_browser_id && contact.assigned_browser_id !== (browser as any).id) continue;
        const key = `${cId}:${(browser as any).id}`;
        if (existingSet.has(key)) continue;

        const variant = getFirstMsgVariant!();
        const preResolveNew = (campaign as any).pre_resolve_name !== false;
        tasksToInsert.push({
          user_id: userId,
          campaign_id: (campaign as any).id,
          contact_id: cId,
          browser_instance_id: (browser as any).id,
          task_type: "first_dm",
          message_text: applyVariables(variant.message_text, contact, preResolveNew),
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

  if (tasksToInsert.length) {
    // Interleave all variants and campaigns for organic, randomized listing
    for (let i = tasksToInsert.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tasksToInsert[i], tasksToInsert[j]] = [tasksToInsert[j], tasksToInsert[i]];
    }

    const { error: insertErr } = await db.from("dm_tasks").insert(tasksToInsert);
    if (insertErr) throw insertErr;
  }

  return { generated: totalGenerated, message: `Generated ${totalGenerated} tasks for today` };
}

// ── Run for ALL users ─────────────────────────────────────────────

export async function runSchedulerForAllUsers(): Promise<void> {
  logger.info("Scheduler: starting daily task generation for all users");

  const { data: allSettings, error } = await supabaseAdmin
    .from("user_settings")
    .select("user_id, dm_limit, follow_before_dm");

  if (error) {
    logger.error({ err: error }, "Scheduler: failed to fetch user settings");
    return;
  }

  if (!allSettings?.length) {
    logger.info("Scheduler: no users found");
    return;
  }

  let totalUsers = 0;
  let totalTasks = 0;

  for (const s of allSettings) {
    try {
      const result = await generateDailyTasksForUser(
        supabaseAdmin,
        s.user_id,
        s.dm_limit ?? 30,
        s.follow_before_dm ?? true
      );
      totalTasks += result.generated;
      totalUsers++;
    } catch (err) {
      logger.error({ err, userId: s.user_id }, "Scheduler: failed for user");
    }
  }

  logger.info({ totalUsers, totalTasks }, "Scheduler: done");
}
