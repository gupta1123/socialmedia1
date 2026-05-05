import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONTACT_FIELDS = ["phone", "whatsapp", "email", "website"];
const PROFILE_CONTACT_ALIASES = {
  phone: ["phone", "salesPhone", "contactPhone", "mobile", "sales_phone", "contact_number", "alternatePhone", "alternate_phone"],
  whatsapp: ["whatsapp", "whatsappPhone", "whatsapp_number"],
  email: ["email", "salesEmail", "contactEmail"],
  website: ["website", "websiteUrl", "url", "site"]
};
const EMBEDDED_CONTACT_FIELDS = ["approvedClaims", "configurations", "amenities", "travelTimes", "credibilityFacts", "legalNotes"];

loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));

const args = parseArgs(process.argv.slice(2));
const jsonOutput = args.flags.has("json");
const includeValues = !args.flags.has("hide-values");
const workspaceFilter = args.values.workspace ? String(args.values.workspace).toLowerCase() : null;
const brandFilter = args.values.brand ? String(args.values.brand).toLowerCase() : null;

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}. Expected it in apps/api/.env or shell env.`);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const [workspaces, brands, projects] = await Promise.all([
    fetchRows("workspaces", "id, name, slug"),
    fetchRows("brands", "id, workspace_id, name, slug, current_profile_version_id"),
    fetchRows("projects", "id, workspace_id, brand_id, name, slug, status, current_profile_version_id")
  ]);

  const brandProfileIds = unique(brands.map((brand) => brand.current_profile_version_id).filter(Boolean));
  const projectProfileIds = unique(projects.map((project) => project.current_profile_version_id).filter(Boolean));
  const [brandProfiles, projectProfiles] = await Promise.all([
    brandProfileIds.length
      ? fetchRows("brand_profile_versions", "id, brand_id, version_number, profile_json", (query) => query.in("id", brandProfileIds))
      : [],
    projectProfileIds.length
      ? fetchRows("project_profile_versions", "id, project_id, version_number, profile_json", (query) => query.in("id", projectProfileIds))
      : []
  ]);

  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const brandProfileById = new Map(brandProfiles.map((profile) => [profile.id, profile]));
  const projectProfileById = new Map(projectProfiles.map((profile) => [profile.id, profile]));

  const brandCoverage = brands
    .map((brand) => {
      const workspace = workspaceById.get(brand.workspace_id);
      const profile = brand.current_profile_version_id ? brandProfileById.get(brand.current_profile_version_id) : null;
      const coverage = extractProfileContacts(profile?.profile_json ?? null, "brand.profile");
      return {
        workspace: workspace?.name ?? brand.workspace_id,
        workspaceSlug: workspace?.slug ?? null,
        brand: brand.name,
        brandSlug: brand.slug,
        hasActiveProfile: Boolean(profile),
        profileVersion: profile?.version_number ?? null,
        coverage: summarizeCoverage(coverage, includeValues)
      };
    })
    .filter(matchesFilters);

  const projectCoverage = projects
    .map((project) => {
      const workspace = workspaceById.get(project.workspace_id);
      const brand = brandById.get(project.brand_id);
      const brandProfile = brand?.current_profile_version_id ? brandProfileById.get(brand.current_profile_version_id) : null;
      const projectProfile = project.current_profile_version_id ? projectProfileById.get(project.current_profile_version_id) : null;
      const brandContacts = extractProfileContacts(brandProfile?.profile_json ?? null, "brand.profile");
      const projectContacts = extractProfileContacts(projectProfile?.profile_json ?? null, "project.profile");
      const effectiveContacts = mergeEffectiveContacts(projectContacts, brandContacts);
      return {
        workspace: workspace?.name ?? project.workspace_id,
        workspaceSlug: workspace?.slug ?? null,
        brand: brand?.name ?? project.brand_id,
        brandSlug: brand?.slug ?? null,
        project: project.name,
        projectSlug: project.slug,
        status: project.status,
        hasActiveProfile: Boolean(projectProfile),
        profileVersion: projectProfile?.version_number ?? null,
        projectCoverage: summarizeCoverage(projectContacts, includeValues),
        effectiveCompileV3Coverage: summarizeCoverage(effectiveContacts, includeValues)
      };
    })
    .filter(matchesFilters);

  const workspaceSummary = workspaces
    .map((workspace) => {
      const workspaceBrands = brandCoverage.filter((row) => row.workspaceSlug === workspace.slug);
      const workspaceProjects = projectCoverage.filter((row) => row.workspaceSlug === workspace.slug);
      return {
        workspace: workspace.name,
        workspaceSlug: workspace.slug,
        brandCount: workspaceBrands.length,
        projectCount: workspaceProjects.length,
        brandLevelAny: anyCoverage(workspaceBrands.map((row) => row.coverage)),
        projectLevelAny: anyCoverage(workspaceProjects.map((row) => row.projectCoverage)),
        effectiveProjectAny: anyCoverage(workspaceProjects.map((row) => row.effectiveCompileV3Coverage))
      };
    })
    .filter((row) => !workspaceFilter || row.workspace.toLowerCase().includes(workspaceFilter) || row.workspaceSlug.toLowerCase().includes(workspaceFilter));

  const report = { workspaceSummary, brandCoverage, projectCoverage };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

function matchesFilters(row) {
  if (workspaceFilter) {
    const workspace = String(row.workspace ?? "").toLowerCase();
    const workspaceSlug = String(row.workspaceSlug ?? "").toLowerCase();
    if (!workspace.includes(workspaceFilter) && !workspaceSlug.includes(workspaceFilter)) return false;
  }
  if (brandFilter) {
    const brand = String(row.brand ?? "").toLowerCase();
    const brandSlug = String(row.brandSlug ?? "").toLowerCase();
    if (!brand.includes(brandFilter) && !brandSlug.includes(brandFilter)) return false;
  }
  return true;
}

function extractProfileContacts(profile, sourcePrefix) {
  const out = emptyContacts();
  if (!profile || typeof profile !== "object") return out;

  for (const field of CONTACT_FIELDS) {
    for (const key of PROFILE_CONTACT_ALIASES[field]) {
      for (const value of flatten(profile[key])) {
        addContact(out, field, value, `${sourcePrefix}.${key}`);
      }
    }
  }

  const contact = profile.contact && typeof profile.contact === "object" && !Array.isArray(profile.contact)
    ? profile.contact
    : null;
  if (contact) {
    for (const field of CONTACT_FIELDS) {
      for (const key of PROFILE_CONTACT_ALIASES[field]) {
        for (const value of flatten(contact[key])) {
          addContact(out, field, value, `${sourcePrefix}.contact.${key}`);
        }
      }
    }
  }

  for (const key of EMBEDDED_CONTACT_FIELDS) {
    for (const value of flatten(profile[key])) {
      extractEmbeddedContact(out, value, `${sourcePrefix}.${key}`);
    }
  }

  return out;
}

function mergeEffectiveContacts(projectContacts, brandContacts) {
  const out = emptyContacts();
  for (const field of CONTACT_FIELDS) {
    for (const item of [...projectContacts[field], ...brandContacts[field]]) {
      addContact(out, field, item.value, item.source);
    }
  }
  return out;
}

function summarizeCoverage(contacts, includeContactValues) {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [
      field,
      {
        present: contacts[field].length > 0,
        ...(includeContactValues ? { values: contacts[field] } : {})
      }
    ])
  );
}

function anyCoverage(rows) {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, rows.some((row) => row?.[field]?.present)]));
}

function emptyContacts() {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, []]));
}

function addContact(out, field, rawValue, source) {
  const value = String(rawValue ?? "").trim();
  if (!value) return;
  const key = value.toLowerCase();
  if (out[field].some((item) => item.value.toLowerCase() === key)) return;
  out[field].push({ value, source });
}

function extractEmbeddedContact(out, rawText, source) {
  const text = String(rawText ?? "");
  for (const match of text.matchAll(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g)) {
    addContact(out, "phone", match[0], source);
  }
  for (const match of text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) {
    addContact(out, "email", match[0], source);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s]+|www\.[^\s]+/g)) {
    addContact(out, "website", match[0].replace(/[.,)]$/, ""), source);
  }
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

async function fetchRows(table, select, customize = null) {
  let query = supabase.from(table).select(select);
  if (customize) query = customize(query);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(rawValue) {
  let value = String(rawValue ?? "").trim();
  const hashIndex = value.search(/\s#/);
  if (hashIndex >= 0) value = value.slice(0, hashIndex).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values[rawKey] = next;
      index += 1;
    } else {
      flags.add(rawKey);
    }
  }
  return { flags, values };
}

function printHumanReport(report) {
  console.log("\nCompile V3 Contact Coverage");
  console.log("Sources checked: active brand_profile_versions.profile_json and active project_profile_versions.profile_json");
  console.log("Effective project coverage means project profile values first, then brand profile fallback.\n");

  console.log("Workspace Summary");
  for (const row of report.workspaceSummary) {
    console.log(`- ${row.workspace}: brands=${row.brandCount}, projects=${row.projectCount}, brandAny=${coverageFlags(row.brandLevelAny)}, projectAny=${coverageFlags(row.projectLevelAny)}, effectiveAny=${coverageFlags(row.effectiveProjectAny)}`);
  }

  console.log("\nBrand / Org Profile Coverage");
  for (const row of report.brandCoverage) {
    console.log(`- ${row.workspace} / ${row.brand}: activeProfile=${row.hasActiveProfile}, ${coverageFlags(row.coverage)}`);
    printValues(row.coverage, "  ");
  }

  console.log("\nProject Profile Coverage");
  for (const row of report.projectCoverage) {
    console.log(`- ${row.workspace} / ${row.brand} / ${row.project}: activeProfile=${row.hasActiveProfile}, project=${coverageFlags(row.projectCoverage)}, effective=${coverageFlags(row.effectiveCompileV3Coverage)}`);
    printValues(row.effectiveCompileV3Coverage, "  effective ");
  }
}

function coverageFlags(coverage) {
  return CONTACT_FIELDS.map((field) => `${field}:${coverage?.[field]?.present ? "yes" : "no"}`).join(", ");
}

function printValues(coverage, prefix) {
  for (const field of CONTACT_FIELDS) {
    const values = coverage?.[field]?.values ?? [];
    if (!values.length) continue;
    console.log(`${prefix}${field}: ${values.map((item) => `${item.value} [${item.source}]`).join("; ")}`);
  }
}

function unique(values) {
  return [...new Set(values)];
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|getaddrinfo|ENOTFOUND|ECONNREFUSED|network/i.test(message)) {
    console.error("Could not reach Supabase from this shell. Run this script from a normal terminal with network access.");
  }
  console.error(message);
  process.exit(1);
});
