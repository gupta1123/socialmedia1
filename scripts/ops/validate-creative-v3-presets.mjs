import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(rootDir, "apps/api/.env");
const allowedContactItems = new Set(["phone", "email", "website", "whatsapp"]);
const allowedPositions = new Set([
  "top_left",
  "top_right",
  "top_center",
  "top_left_near_primary",
  "bottom_left",
  "bottom_right",
  "bottom_center",
  "bottom_footer",
  "center",
  "left",
  "right"
]);

loadEnv(envPath);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Expected them in apps/api/.env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const { data: presets, error } = await supabase
  .from("creative_v3_brand_presets")
  .select("id, brand_id, project_id, preset_key, name, description, preset_json, active, updated_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error(`Failed to load creative v3 presets: ${error.message}`);
  process.exit(1);
}

const brandIds = [...new Set((presets ?? []).map((preset) => preset.brand_id).filter(Boolean))];
const projectIds = [...new Set((presets ?? []).map((preset) => preset.project_id).filter(Boolean))];
const brandMap = await loadLookup("brands", brandIds);
const projectMap = await loadLookup("projects", projectIds);

const findings = [];

for (const preset of presets ?? []) {
  const json = isObject(preset.preset_json) ? preset.preset_json : {};
  const context = {
    label: `${brandMap.get(preset.brand_id)?.slug ?? preset.brand_id}/${preset.preset_key}`,
    text: [
      preset.preset_key,
      preset.name,
      preset.description,
      ...(Array.isArray(json.client_rules) ? json.client_rules : [])
    ].join("\n").toLowerCase()
  };
  validatePresetShape(preset, json, context, findings);
  validateTextAgainstJson(json, context, findings);
}

const errors = findings.filter((finding) => finding.level === "error");
const warnings = findings.filter((finding) => finding.level === "warning");

console.log(JSON.stringify({
  checked: presets?.length ?? 0,
  errors: errors.length,
  warnings: warnings.length,
  presets: (presets ?? []).map((preset) => ({
    brand: brandMap.get(preset.brand_id)?.slug ?? preset.brand_id,
    project: preset.project_id ? projectMap.get(preset.project_id)?.slug ?? preset.project_id : null,
    preset_key: preset.preset_key,
    active: preset.active,
    updated_at: preset.updated_at
  })),
  findings
}, null, 2));

if (errors.length > 0) {
  process.exit(1);
}

function validatePresetShape(preset, json, context, out) {
  const logo = objectAt(json, "logo") ?? objectAt(json, "logo_layer");
  const secondaryLogo = objectAt(json, "secondary_logo") ?? objectAt(json, "secondary_logo_layer");
  const additionalLogos = additionalLogoRules(json);
  const contact = objectAt(json, "contact") ?? objectAt(json, "contact_layer");
  const location = objectAt(json, "location") ?? objectAt(json, "location_layer");

  if (logo?.required && !logo.position) {
    add(out, "error", context.label, "Required primary logo is missing a position.");
  }
  validatePosition(out, context.label, "logo.position", logo?.position);

  if (secondaryLogo?.required) {
    if (!secondaryLogo.position) add(out, "error", context.label, "Required secondary logo is missing a position.");
    if (!secondaryLogo.brand_mark) add(out, "warning", context.label, "Required secondary logo has no brand_mark; asset matching may be ambiguous.");
  }
  validatePosition(out, context.label, "secondary_logo.position", secondaryLogo?.position);

  additionalLogos.forEach((additionalLogo, index) => {
    if (additionalLogo.required) {
      if (!additionalLogo.position) add(out, "error", context.label, `Required additional logo ${index + 1} is missing a position.`);
      if (!additionalLogo.brand_mark && !additionalLogo.brandMark && !additionalLogo.asset_id) {
        add(out, "warning", context.label, `Required additional logo ${index + 1} has no brand_mark or asset_id; asset matching may be ambiguous.`);
      }
    }
    validatePosition(out, context.label, `additional_logos[${index}].position`, additionalLogo.position);
  });

  if (location?.required && !location.position) {
    add(out, "error", context.label, "Required location layer is missing a position.");
  }
  validatePosition(out, context.label, "location.position", location?.position);
  validatePosition(out, context.label, "location.fallback_position_without_contact", location?.fallback_position_without_contact);

  if (contact) {
    validatePosition(out, context.label, "contact.position", contact.position);
    if (Array.isArray(contact.items)) {
      for (const item of contact.items) {
        if (!allowedContactItems.has(String(item))) {
          add(out, "error", context.label, `Unsupported contact item "${item}".`);
        }
      }
    } else if (contact.required || contact.include_if_grounded) {
      add(out, "warning", context.label, "Contact layer is enabled but contact.items is not an array.");
    }
  }

  if (logo?.position && secondaryLogo?.position && logo.position === secondaryLogo.position) {
    add(out, "warning", context.label, `Primary and secondary logos share the same exact position "${logo.position}".`);
  }
  additionalLogos.forEach((additionalLogo, index) => {
    if (logo?.position && additionalLogo.position && logo.position === additionalLogo.position) {
      add(out, "warning", context.label, `Primary logo and additional logo ${index + 1} share the same exact position "${logo.position}".`);
    }
  });
}

function validateTextAgainstJson(json, context, out) {
  const logo = objectAt(json, "logo") ?? objectAt(json, "logo_layer");
  const secondaryLogo = objectAt(json, "secondary_logo") ?? objectAt(json, "secondary_logo_layer");
  const contact = objectAt(json, "contact") ?? objectAt(json, "contact_layer");
  const location = objectAt(json, "location") ?? objectAt(json, "location_layer");

  expectPositionFromText(out, context, logo, "logo", "top-right", "top_right");
  expectPositionFromText(out, context, logo, "logo", "top-left", "top_left");
  expectPositionFromText(out, context, secondaryLogo, "secondary logo", "top-left", "top_left");
  expectPositionFromText(out, context, location, "location", "bottom-left", "bottom_left");
  expectPositionFromText(out, context, location, "location", "bottom-center", "bottom_center");
  expectPositionFromText(out, context, contact, "contact", "bottom-right", "bottom_right");
  expectPositionFromText(out, context, contact, "contact number", "bottom-right", "bottom_right");
}

function expectPositionFromText(out, context, rules, subject, phrase, expected) {
  if (!rules || !textSaysSubjectPosition(context.text, subject, phrase)) return;
  if (rules.position && !positionMatches(rules.position, expected)) {
    add(out, "error", context.label, `Text says ${subject} should be ${phrase}, but JSON has position "${rules.position}".`);
  }
}

function textSaysSubjectPosition(text, subject, phrase) {
  const escapedSubject = escapeRegExp(subject).replaceAll("\\ ", "\\s+");
  const escapedPhrase = escapeRegExp(phrase).replaceAll("\\-", "[-\\s]");
  return new RegExp(`${escapedSubject}[^.\\n]{0,90}${escapedPhrase}`, "i").test(text);
}

function positionMatches(actual, expected) {
  const value = String(actual);
  if (value === expected) return true;
  return expected === "top_left" && value.startsWith("top_left");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePosition(out, label, field, value) {
  if (!value) return;
  if (!allowedPositions.has(String(value))) {
    add(out, "warning", label, `${field} uses non-standard position "${value}".`);
  }
}

function add(out, level, preset, message) {
  out.push({ level, preset, message });
}

function objectAt(source, key) {
  const value = source?.[key];
  return isObject(value) ? value : null;
}

function additionalLogoRules(source) {
  return ["additional_logos", "additional_logo_layers", "logo_layers"].flatMap((key) => {
    const value = source?.[key];
    if (!Array.isArray(value)) return [];
    return value.filter((item) => {
      if (!isObject(item)) return false;
      const role = String(item.role ?? item.slot ?? item.kind ?? "").trim().toLowerCase();
      return !["primary", "primary_logo", "main_logo", "logo"].includes(role) && item.primary !== true;
    });
  });
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadLookup(table, ids) {
  if (ids.length === 0) return new Map();
  const { data, error: lookupError } = await supabase
    .from(table)
    .select("id, name, slug")
    .in("id", ids);
  if (lookupError) throw lookupError;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
