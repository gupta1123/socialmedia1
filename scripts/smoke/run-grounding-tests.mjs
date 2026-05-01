import fs from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";

const localWebEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env.local"));
const localApiEnv = await loadEnvFile(path.resolve(process.cwd(), "apps/api/.env"));

const config = {
  apiBase: process.env.API_BASE ?? "http://127.0.0.1:4000",
  supabaseUrl:
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_URL ??
    localApiEnv.SUPABASE_URL ??
    "",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localWebEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    localApiEnv.SUPABASE_ANON_KEY ??
    "",
  email: process.env.TEST_EMAIL ?? "demo@imagelab.local",
  password: process.env.TEST_PASSWORD ?? "DemoPass1234",
  jwtSecret: process.env.JWT_SECRET ?? localApiEnv.SUPABASE_JWT_SECRET ?? ""
};

const IDS = {
  brands: {
    krisala: "e9afb6df-b957-4d94-b48f-447cb67140b0",
    pride: "869c1fab-f71c-44f3-b36b-9a87f853f127",
    sankla: "71eaacfe-583c-4235-bfe8-48b027563ca6"
  },
  workspaceUsers: {
    krisala: "35e5197a-8536-4d46-89ae-dc04647da7ee",
    pride: "3a2976b7-2c2f-4365-8b50-297c5c067e3c",
    sankla: "916f4959-82d6-4827-821b-91f225fe93a8"
  },
  projects: {
    zoy: "faf46010-d038-4a2d-bd6d-3e944e7eab0f",
    miami: "289b2551-75ef-4d63-b9fe-b0e476c0e63b",
    eastWorld: "c2ba3fe7-9f18-47aa-ab6c-2e6b2292c6df"
  },
  postTypes: {
    ad: "3eab73a3-d989-4646-a277-4fdb98ac2bad",
    amenitySpotlight: "3e53af1b-8795-49b9-8f69-e4597dda87bb",
    constructionUpdate: "dd845fb4-e31c-4acb-8fc4-e36097ff4897",
    locationAdvantage: "9bbf1923-2796-49ae-8971-03bbe7df3f45",
    projectLaunch: "4a4c0806-7f31-45fa-b582-34ccf37999fd",
    siteVisitInvite: "831ce65a-13f3-4062-adc1-d2380390120b"
  }
};

const tests = [
  {
    key: "launch_tagline_location",
    label: "Project launch uses project identity and location",
    payload: {
      brandId: IDS.brands.krisala,
      createMode: "post",
      projectId: IDS.projects.zoy,
      postTypeId: IDS.postTypes.projectLaunch,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a premium launch poster. Use the project tagline and mention Hinjawadi Phase 1. Keep it aspirational and design-led.",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    mustContain: ["Hinjawadi Phase 1"],
    shouldContainAny: [["Zoy+", "Experience a Plus Side Of Life"]],
    mustNotContain: ["Miami, Florida", "phone number", "website"]
  },
  {
    key: "amenity_exact_pool",
    label: "Amenity spotlight stays on requested amenity",
    payload: {
      brandId: IDS.brands.sankla,
      createMode: "post",
      projectId: IDS.projects.eastWorld,
      postTypeId: IDS.postTypes.amenitySpotlight,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Spotlight the swimming pool only. Build an aspirational amenity-led poster and do not shift the focus to the building.",
      audience: "Homebuyers",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    mustContain: ["swimming pool"],
    mustNotContain: ["kids play area", "basketball court only", "building hero"]
  },
  {
    key: "construction_truthful_update",
    label: "Construction update uses latest update without fake completion",
    payload: {
      brandId: IDS.brands.sankla,
      createMode: "post",
      projectId: IDS.projects.eastWorld,
      postTypeId: IDS.postTypes.constructionUpdate,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a construction update. Use the latest project state and keep it truthful. Do not imply completed handover or ready possession.",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    shouldContainAny: [["under-development", "December 2028", "current public materials"]],
    mustNotContain: ["ready possession", "completed project", "handover now"]
  },
  {
    key: "site_visit_no_contact_invention",
    label: "Site visit invite does not invent phone or website",
    payload: {
      brandId: IDS.brands.pride,
      createMode: "post",
      projectId: IDS.projects.miami,
      postTypeId: IDS.postTypes.siteVisitInvite,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Invite people for a site visit. Do not add any phone number, website, or email unless explicitly provided.",
      audience: "Homebuyers",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    mustNotContain: ["www.", ".com", "+91", "call now", "@", "phone number"]
  },
  {
    key: "ad_show_starting_price",
    label: "Ad can use DB-backed starting price",
    payload: {
      brandId: IDS.brands.pride,
      createMode: "post",
      projectId: IDS.projects.miami,
      postTypeId: IDS.postTypes.ad,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a premium ad and show the starting price prominently. Keep it sharp and scroll-stopping.",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    shouldContainAny: [["₹87 lakh onwards", "87 lakh onwards", "₹87"]],
    notes: "This checks whether price can surface even though current notebook projectTruth does not include commercial fields."
  },
  {
    key: "ad_no_contact_invention",
    label: "Ad still does not invent contact fields",
    payload: {
      brandId: IDS.brands.pride,
      createMode: "post",
      projectId: IDS.projects.miami,
      postTypeId: IDS.postTypes.ad,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a premium ad. Show price and project details, and add phone number and website if available.",
      audience: "Homebuyers",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    mustNotContain: ["www.", ".com", "+91", "@", "phone number"]
  },
  {
    key: "location_advantage_landmarks",
    label: "Location advantage can ground nearby landmarks",
    payload: {
      brandId: IDS.brands.sankla,
      createMode: "post",
      projectId: IDS.projects.eastWorld,
      postTypeId: IDS.postTypes.locationAdvantage,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a location advantage poster and mention nearby schools, hospitals, and malls. Keep it factual.",
      audience: "Homebuyers and investors",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    shouldContainAny: [
      ["Sri Sai Academy", "Lexicon", "Kalyani School"],
      ["Yog Multispeciality Hospital", "Nobel Hospital", "Manipal Hospital"],
      ["Amanora Mall", "Seasons Mall", "93 Avenue Mall"]
    ]
  },
  {
    key: "project_name_not_city",
    label: "Project name Miami is not treated as Miami city",
    payload: {
      brandId: IDS.brands.pride,
      createMode: "post",
      projectId: IDS.projects.miami,
      postTypeId: IDS.postTypes.projectLaunch,
      channel: "instagram-feed",
      format: "portrait",
      goal: "Grounding test",
      prompt:
        "Create a premium launch poster for the Miami project. Use the project name correctly and keep the location grounded in Charholi, Pune.",
      audience: "Homebuyers",
      offer: "",
      exactText: "",
      referenceAssetIds: [],
      variationCount: 1
    },
    mustContain: ["Charholi"],
    mustNotContain: ["Miami Beach", "Florida", "USA", "oceanfront", "South Beach"]
  }
];

async function main() {
  const results = [];

  for (const test of tests) {
    const token = await createLocalToken(config, {
      subject: subjectForBrand(test.payload.brandId),
      email: emailForBrand(test.payload.brandId)
    });
    const compiled = await request("/api/creative/compile-v2", token, test.payload, config.apiBase);
    const finalPrompt = String(compiled.finalPrompt ?? "");
    const lowered = finalPrompt.toLowerCase();

    const missing = (test.mustContain ?? []).filter((needle) => !lowered.includes(needle.toLowerCase()));
    const forbidden = (test.mustNotContain ?? []).filter((needle) => lowered.includes(needle.toLowerCase()));
    const anyFailures = (test.shouldContainAny ?? []).filter(
      (group) => !group.some((needle) => lowered.includes(needle.toLowerCase()))
    );

    results.push({
      key: test.key,
      label: test.label,
      pass: missing.length === 0 && forbidden.length === 0 && anyFailures.length === 0,
      missing,
      forbidden,
      unmetAnyGroups: anyFailures,
      finalPrompt,
      promptSummary: compiled.promptSummary ?? null,
      variationTitle: Array.isArray(compiled.variations) && compiled.variations[0] ? compiled.variations[0].title : null,
      notes: test.notes ?? null
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

async function signIn(options) {
  const authUrl = `${options.supabaseUrl}/auth/v1/token?grant_type=password`;
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      apikey: options.supabaseAnonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase sign-in failed (${response.status}): ${text}`);
  const json = JSON.parse(text);
  return json.access_token;
}

async function createLocalToken(options, { subject, email }) {
  const secret = new TextEncoder().encode(options.jwtSecret);
  return new SignJWT({ email, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

function subjectForBrand(brandId) {
  if (brandId === IDS.brands.krisala) return IDS.workspaceUsers.krisala;
  if (brandId === IDS.brands.pride) return IDS.workspaceUsers.pride;
  if (brandId === IDS.brands.sankla) return IDS.workspaceUsers.sankla;
  throw new Error(`No workspace user mapped for brand ${brandId}`);
}

function emailForBrand(brandId) {
  if (brandId === IDS.brands.krisala) return "demo@imagelab.local";
  if (brandId === IDS.brands.pride) return "admin@pridegroup.com";
  if (brandId === IDS.brands.sankla) return "admin@sanklabuildcoon.com";
  return "owner@imagelab.local";
}

async function request(route, token, body, apiBase) {
  const response = await fetch(`${apiBase}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
