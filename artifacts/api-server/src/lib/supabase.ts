import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — scheduler will not run");
}

export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl ?? "",
  supabaseServiceKey ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);
