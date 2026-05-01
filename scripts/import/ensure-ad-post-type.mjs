import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const POST_TYPE_CODE = "ad";
const payload = {
  workspace_id: null,
  code: POST_TYPE_CODE,
  name: "Ad",
  description: "Drive enquiries with one clear premium commercial hook and readable action hierarchy.",
  config_json: {
    defaultChannels: ["instagram-feed", "instagram-story", "ad-creative"],
    allowedFormats: ["square", "portrait", "story", "landscape"],
    recommendedTemplateTypes: ["offer", "announcement", "hero"],
    requiredBriefFields: ["goal", "prompt"],
    safeZoneGuidance: [
      "Keep one dominant hook readable at feed size and keep compliance subordinate"
    ],
    ctaStyle: "lead-gen",
    copyDensity: "balanced"
  },
  is_system: true,
  active: true
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const { data: existing, error: fetchError } = await supabase
    .from("post_types")
    .select("id")
    .is("workspace_id", null)
    .eq("code", POST_TYPE_CODE)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("post_types")
      .update(payload)
      .eq("id", existing.id);

    if (updateError) throw updateError;
    console.log(JSON.stringify({ ok: true, action: "updated", id: existing.id, code: POST_TYPE_CODE }, null, 2));
    return;
  }

  const { data, error: insertError } = await supabase
    .from("post_types")
    .insert(payload)
    .select("id")
    .single();

  if (insertError) throw insertError;
  console.log(JSON.stringify({ ok: true, action: "inserted", id: data.id, code: POST_TYPE_CODE }, null, 2));
}
