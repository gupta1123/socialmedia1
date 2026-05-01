import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
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

// Source notes for this backfill:
// - Krisala official pages and project microsites
// - Pride Miami public campaign page plus Housing.com summary
// - Sankla East World microsite, Housing.com summary, and local brochure page 11
//
// This script only fills empty fields. Existing non-empty data is left untouched.
const PROJECT_PATCHES = {
  "41 Zillenia": {
    sizeRanges: ["724 - 923 sq ft carpet"],
    startingPrice: "₹76 lakh onwards",
    travelTimes: [
      "Hinjawadi IT Park - approx. 15 to 20 min (7 km)",
      "Mumbai-Pune Expressway - approx. 10 to 15 min (5 km)"
    ]
  },
  "41 Cosmo NXT": {
    sizeRanges: ["732 - 930 sq ft carpet"],
    startingPrice: "₹73.75 lakh onwards",
    priceRangeByConfig: [
      "2 BHK: ₹73.75 lakh onwards (732 - 774 sq ft carpet)",
      "2.25/2.75 BHK flexible layouts: ₹92.16 lakh onwards (up to 930 sq ft carpet)"
    ],
    paymentPlanSummary: "CLP-style slab plan publicized: 10% on booking, 10% on agreement, then construction-linked slabs till handover.",
    nearbyLandmarks: [
      "Tathawade Chowk",
      "D-Mart",
      "Indira College",
      "JSPM",
      "Pimpri Chinchwad College of Engineering",
      "Aditya Birla Hospital"
    ],
    travelTimes: [
      "Tathawade Chowk - 700 m",
      "Mumbai-Pune Highway - 1 km",
      "D-Mart - 3.4 km",
      "Aditya Birla Hospital - 5.7 km"
    ]
  },
  "41 Luxovert": {
    sizeRanges: ["817 - 1326 sq ft carpet"],
    startingPrice: "₹81 lakh onwards",
    priceRangeByConfig: [
      "2 BHK: ₹81 lakh onwards",
      "3 BHK: ₹1.08 crore onwards",
      "4 BHK: ₹1.39 crore onwards"
    ]
  },
  "Aventis": {
    priceRangeByConfig: [
      "2.25 BHK: ₹89 lakh onwards (approx. 839 sq ft carpet)",
      "3.25 BHK: ₹1.29 crore onwards (approx. 1116 sq ft carpet)"
    ]
  },
  "Miami": {
    pricingBand: "premium",
    startingPrice: "₹87 lakh onwards",
    priceRangeByConfig: [
      "2 BHK: ₹87 - 89 lakh onwards (785 - 795 sq ft carpet)",
      "3 BHK: ₹1.15 - 1.93 crore onwards (1059 - 1488 sq ft carpet)",
      "4.5 BHK: ₹2.65 - 2.95 crore onwards (2260 sq ft carpet)"
    ],
    currentOffers: [
      "Token amount ₹1,00,000",
      "Pay 30% now and 7% on OC",
      "Instant benefits on spot booking"
    ],
    paymentPlanSummary: "Public campaign plan shows ₹1,00,000 token booking, 30% payable now, and 7% on OC.",
    nearbyLandmarks: [
      "Pune International Airport",
      "Pune Railway Station",
      "Phoenix Marketcity",
      "Dmart",
      "Lexicon International School",
      "Pragatti International School",
      "Dighi Multispeciality Hospital",
      "Orchid Speciality Hospital",
      "Diamond Water Park"
    ],
    travelTimes: [
      "Pune International Airport - approx. 10.5 km",
      "Pune Railway Station - approx. 14.5 km",
      "Phoenix Marketcity - approx. 10.2 km"
    ]
  },
  "East World": {
    pricingBand: "premium",
    startingPrice: "₹72 lakh onwards",
    priceRangeByConfig: [
      "2 BHK: ₹72 lakh onwards (700 - 761 sq ft carpet)",
      "3 BHK: ₹96 lakh onwards (988 sq ft carpet)"
    ],
    nearbyLandmarks: [
      "Sri Sai Academy",
      "The Lexicon School",
      "The Kalyani School",
      "Pawar Public School",
      "VIBGYOR High School",
      "The Orbis School",
      "Delhi Public School",
      "Yog Multispeciality Hospital",
      "Shyadri Super Speciality Hospital",
      "Nobel Hospital",
      "Manipal Hospital",
      "Amanora Mall",
      "Seasons Mall",
      "93 Avenue Mall",
      "Magarpatta City IT Park",
      "World Trade Center",
      "EON IT Park",
      "Cerebrum IT Park",
      "Global Business Hub",
      "Pune Railway Station",
      "Kharadi",
      "Kalyani Nagar",
      "Koregaon Park",
      "Viman Nagar",
      "Yerawada"
    ],
    travelTimes: [
      "Sri Sai Academy - 3.5 km",
      "The Lexicon School - 3.5 km",
      "The Kalyani School - 3.8 km",
      "Pawar Public School - 5.2 km",
      "VIBGYOR High School - 7 km",
      "The Orbis School - 6.8 km",
      "Delhi Public School - 9.8 km",
      "Yog Multispeciality Hospital - 300 m",
      "Shyadri Super Speciality Hospital - 4.5 km",
      "Nobel Hospital - 6 km",
      "Manipal Hospital - 10 km",
      "Amanora Mall - 6.5 km",
      "Seasons Mall - 6.5 km",
      "93 Avenue Mall - 6.8 km",
      "Magarpatta City IT Park - 5.5 km",
      "World Trade Center - 12 km",
      "EON IT Park - 12 km",
      "Cerebrum IT Park - 11 km",
      "Global Business Hub - 12 km",
      "Pune Railway Station - 12 km",
      "Fursungi - 4.5 km",
      "MG Road - 10 km",
      "Kharadi - 11 km",
      "Kalyani Nagar - 11 km",
      "Koregaon Park - 11 km",
      "Viman Nagar - 14 km",
      "Yerawada - 14 km"
    ],
    constructionStatus: "Under-development residential project; public listings indicate possession starting December 2028.",
    latestUpdate: "Current public materials position East World as a privacy-led 2 and 3 BHK project at Hadapsar Annexe / Shewalewadi with possession starting December 2028."
  }
};

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function mergeEmptyFields(current, patch) {
  const next = { ...current };
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!hasValue(next[key]) && hasValue(value)) {
      next[key] = value;
      changes[key] = value;
    }
  }
  return { next, changes };
}

async function fetchProjectRows() {
  const names = Object.keys(PROJECT_PATCHES);
  const { data, error } = await supabase
    .from("projects")
    .select("id, workspace_id, created_by, name, current_profile_version_id")
    .in("name", names);
  if (error) throw error;
  return data ?? [];
}

async function fetchCurrentProjectProfile(projectId, currentProfileVersionId) {
  if (currentProfileVersionId) {
    const { data, error } = await supabase
      .from("project_profile_versions")
      .select("id, version_number, created_by, profile_json")
      .eq("id", currentProfileVersionId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from("project_profile_versions")
    .select("id, version_number, created_by, profile_json")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function writeProjectProfileVersion({ workspaceId, projectId, createdBy, currentVersionNumber, profile }) {
  const profileId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("project_profile_versions").insert({
    id: profileId,
    workspace_id: workspaceId,
    project_id: projectId,
    version_number: currentVersionNumber + 1,
    profile_json: profile,
    created_by: createdBy
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from("projects")
    .update({ current_profile_version_id: profileId })
    .eq("id", projectId);
  if (updateError) throw updateError;

  return profileId;
}

async function main() {
  const projects = await fetchProjectRows();
  const summary = [];

  for (const project of projects) {
    const current = await fetchCurrentProjectProfile(project.id, project.current_profile_version_id);
    if (!current) {
      summary.push({ project: project.name, status: "skipped", reason: "no current profile version" });
      continue;
    }

    const patch = PROJECT_PATCHES[project.name];
    const { next, changes } = mergeEmptyFields(current.profile_json ?? {}, patch);
    if (Object.keys(changes).length === 0) {
      summary.push({ project: project.name, status: "unchanged" });
      continue;
    }

    await writeProjectProfileVersion({
      workspaceId: project.workspace_id,
      projectId: project.id,
      createdBy: current.created_by ?? project.created_by,
      currentVersionNumber: current.version_number ?? 0,
      profile: next
    });

    summary.push({
      project: project.name,
      status: "updated",
      changedFields: Object.keys(changes)
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
