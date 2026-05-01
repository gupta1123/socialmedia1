import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "apps/api/.env") });

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`Missing required env: ${key}`);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "creative-assets";
const uploadRoot = path.resolve(process.cwd(), "Prescon/db-prepared");

const adminEmail = "admin@prescon.com";
const adminPassword = "Pres@2312";
const displayName = "Prescon Admin";
const workspaceName = "Prescon";
const brandName = "Prescon";
const projectName = "Prescon Midtown Bay";
const reraNumber = "P51900030390";
const dataOnly = process.argv.includes("--data-only");

const brandDraft = {
  brandSlug: "prescon",
  description:
    "Design-led real estate developer creating people-centric urban communities across Mumbai, Thane and Goa.",
  profile: {
    identity: {
      positioning:
        "Design-led real estate developer creating people-centric urban communities across Mumbai, Thane and Goa.",
      promise:
        "Life-enriching, design-focused spaces built around community, innovation and customer-first thinking.",
      audienceSummary:
        "Urban homebuyers seeking premium, thoughtfully designed homes with trust, quality and community value."
    },
    voice: {
      summary: "Premium, thoughtful, design-led, trustworthy, community-oriented.",
      adjectives: ["premium", "design-led", "trustworthy", "people-centric", "innovative"],
      approvedVocabulary: [
        "design-led homes",
        "people-centric spaces",
        "premium urban living",
        "community living",
        "life-enriching spaces"
      ],
      bannedPhrases: ["cheap offer", "lowest price", "guaranteed returns", "hurry hurry", "unverified sea view"]
    },
    palette: {
      primary: "#16254A",
      secondary: "#D5B16A",
      accent: "#F4F0E7",
      neutrals: ["#FFFFFF", "#F6F6F3", "#1F2937"]
    },
    styleDescriptors: ["premium", "design-led", "calm", "architectural", "community-oriented"],
    visualSystem: {
      typographyMood: "Elegant premium editorial",
      typographyNotes: ["Use refined hierarchy and avoid loud offer-led flyer styling."],
      compositionPrinciples: [
        "Clear architectural or lifestyle hero",
        "Disciplined editorial copy blocks",
        "Premium whitespace",
        "Use gold/navy accents with restraint"
      ],
      imageTreatment: ["architectural fidelity", "premium daylight or dusk mood", "truthful render/photo handling"],
      realismLevel: "elevated_real",
      textDensity: "balanced"
    },
    brandPillars: ["Design centricity", "Innovation", "Customer first mindset"],
    credibilityFacts: [
      "40 years of trust gained",
      "42,29,000 sq ft delivered",
      "2,500+ happy families",
      "4 city presence",
      "10,000 lives touched"
    ],
    doRules: [
      "Emphasize design, quality, community and innovation.",
      "Keep tone premium but grounded.",
      "Preserve exact logo fidelity.",
      "Distinguish CGI renders from real photographs when relevant."
    ],
    dontRules: [
      "Do not use cheap offer-led language.",
      "Do not invent possession, pricing or legal claims.",
      "Do not overstate sea views for every unit unless specifically provided.",
      "Do not redraw or stylize the Prescon logo."
    ],
    compliance: {
      bannedClaims: ["guaranteed returns", "assured appreciation", "ready to move unless verified"],
      reviewChecks: ["logo fidelity", "project truth", "RERA number accuracy", "no unsupported pricing or possession claims"]
    },
    bannedPatterns: ["crowded discount flyer", "generic luxury cliches", "fake urgency badges", "unverified skyline swaps"],
    referenceCanon: {
      usageNotes: ["Use official project renders, actual lobby photographs, and exact logos as truth anchors."],
      antiReferenceNotes: ["Do not replace Midtown Bay identity with generic Mumbai towers."]
    }
  }
};

const projectDraft = {
  projectSlug: "prescon-midtown-bay",
  city: "Mumbai",
  microLocation: "Mahim West",
  projectType: "Residential apartments",
  stage: "under_construction",
  description: "Premium 2.5 & 3 BHK deck apartments in Mahim West, Mumbai.",
  siteAddress: "Off Sitladevi Temple Road, Mahim West, Mahim, Mumbai, Maharashtra 400016",
  profile: {
    tagline: "2.5 & 3 BHK Premium Deck Apartments",
    positioning:
      "Premium sea-view residences in Mahim with bay, skyline and Bandra-Worli Sea Link context.",
    lifestyleAngle:
      "Elevated urban living with sea-link views, deck apartments, rooftop lifestyle amenities and strong South/Central Mumbai connectivity.",
    configurations: ["2.5 BHK", "3 BHK"],
    secondaryConfigurationsToVerify: ["1 BHK", "2 BHK", "4 BHK", "Jodi flats"],
    sizeRanges: ["Approx. 560 - 1180 sq ft carpet", "Some public sources mention 365 - 1180 sq ft; verify before using."],
    pricingBand: "premium",
    startingPrice: "₹2.85 Cr all inclusive",
    priceRangeByConfig: [
      "2 BHK: 560/580 sq ft carpet - ₹2.85 Cr all inclusive (verify before ad use)",
      "2.5 BHK: 820 sq ft carpet - ₹4.75 Cr all inclusive (verify before ad use)",
      "3 BHK: 1180 sq ft carpet - ₹6.25 Cr all inclusive (verify before ad use)"
    ],
    currentOffers: [],
    paymentPlanSummary: "5:95 pay plan from Bajaj Finance (verify before use)",
    commercialDataConfidence: "medium; pricing/payment data should be verified before performance ads",
    commercialClaimsToVerify: [
      "Starting price",
      "Price by configuration",
      "5:95 payment plan",
      "Spot booking offers",
      "Early buy discount"
    ],
    reraNumber,
    landParcel: "Approx. 0.75 acres",
    towersCount: "1",
    floorsCount: "2B + G + 10P + 35 storeys / 45-storey tower",
    parkingFacts:
      "2 basements and 10 podium parking; drive-in ramp to each level; independent surface car parking; electric car charging station.",
    amenities: [
      "Swimming Pool",
      "Games Room",
      "Banquet Hall",
      "Outdoor Cinema",
      "Gym",
      "Yoga Deck",
      "Roof Terrace Lounge",
      "Podium Deck",
      "Sea-facing Gym",
      "Bar and Lounge",
      "Barbeque",
      "Zen Garden",
      "Kids Play Area",
      "Business Centre",
      "Grand Entrance Lobby",
      "Outdoor Multipurpose Court",
      "Landscaped Gardens",
      "Creche",
      "Sky Jogging Track"
    ],
    heroAmenities: [
      "Swimming Pool",
      "Sea-facing Gym",
      "Roof Terrace Lounge",
      "Outdoor Cinema",
      "Banquet Hall",
      "Games Room"
    ],
    amenityAliases: {
      "Sea-link pool": "Swimming Pool",
      "Infinity pool": "Swimming Pool",
      "Yoga and activity deck": "Yoga Deck",
      "Rooftop jogging park": "Sky Jogging Track",
      "The café": "Bar and Lounge"
    },
    locationAdvantages: [
      "Mahim West",
      "Mahim Bay",
      "Bandra-Worli Sea Link context",
      "Central access to BKC, Lower Parel, Dadar and Bandra"
    ],
    nearbyLandmarks: [
      "Sitladevi Metro Station",
      "Mahim Railway Station",
      "Dadar Railway Station",
      "Bandra Railway Station",
      "Western Express Highway",
      "Bandra-Worli Sea Link",
      "Chhatrapati Shivaji Maharaj International Airport",
      "Hinduja Hospital",
      "S L Raheja Hospital",
      "Lilavati Hospital",
      "Tata Memorial Hospital",
      "KEM Hospital",
      "BKC",
      "Lower Parel",
      "Mahim Beach",
      "Shivaji Park",
      "Dadar Chowpatty",
      "Mahim Nature Park",
      "Palladium Mall",
      "Bombay Scottish School",
      "Canossa High School",
      "Victoria High School"
    ],
    travelTimes: [
      "Sitladevi Metro Station - 650m / 3mins",
      "Mahim Railway Station - 1.4km / 5mins",
      "Dadar Railway Station - 2.8km / 9mins",
      "Bandra Railway Station - 2.8km / 12mins",
      "Western Express Highway - 1.8km / 8mins",
      "Bandra-Worli Sea Link - 4.3km / 16mins",
      "Airport - 12.3km / 22mins",
      "Hinduja Hospital - 700m / 4mins",
      "BKC - 4.2km / 11mins",
      "Lower Parel - 5.4km / 16mins",
      "Mahim Beach - 700m / 4mins",
      "Shivaji Park - 1km / 4mins",
      "Bombay Scottish School - 700m / 4mins"
    ],
    approvedClaims: [
      "MahaRERA registration number P51900030390",
      "Located at Mahim, Mumbai",
      "2.5 & 3 BHK premium deck apartments",
      "Sea-view / sea-link context",
      "45-storey tower",
      "Amenities across terrace, e-deck and ground levels"
    ],
    legalNotes: [
      "Use MahaRERA number only as verified.",
      "Do not use pricing, payment plan, offers or possession claims in ads unless client confirms.",
      "Do not imply every unit has sea view unless specifically provided.",
      "Possession and completion dates conflict across public sources; keep as needs verification."
    ],
    bannedClaims: [
      "guaranteed returns",
      "ready to move",
      "all units sea-facing",
      "fixed appreciation",
      "exact possession date unless verified"
    ],
    keyObjections: [
      "Need exact possession date confirmation",
      "Need verified price sheet before ad claims",
      "Need exact availability/inventory before scarcity claims"
    ],
    constructionStatus: "Under-construction residential project; possession/completion timing needs client confirmation.",
    possessionStatus: "needs_verification",
    credibilityFacts: [
      "MahaRERA registration P51900030390",
      "Located in Mahim West, Mumbai",
      "Project associated with Prescon brand",
      "Public material positions the project as premium deck apartments with sea-link and skyline context"
    ],
    audienceSegments: ["homebuyers", "upgraders", "premium urban buyers", "investors"],
    endUserAngle: "Premium Mahim lifestyle with deck residences, rooftop amenities and central Mumbai connectivity.",
    investorAngle: "Mahim location with strong access to BKC, Dadar, Bandra and Lower Parel.",
    faqs: [],
    milestoneHistory: [],
    sampleFlatImageIds: [],
    actualProjectImageIds: []
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const manifestRows = parseCsv(await fs.readFile(path.join(uploadRoot, "asset_manifest.csv"), "utf8"));
  const user = await ensureAdminUser();
  const workspace = await ensureWorkspace(user.id);
  const brand = await ensureBrand({ workspaceId: workspace.id, userId: user.id });
  const project = await ensureProject({ workspaceId: workspace.id, brandId: brand.id, userId: user.id });
  const assets = dataOnly
    ? { rows: [], byUploadFilename: new Map(), byRelativePath: new Map() }
    : await syncAssets({ workspaceId: workspace.id, brandId: brand.id, projectId: project.id, userId: user.id, manifestRows });

  await syncBrandProfile({ brand, workspaceId: workspace.id, userId: user.id, assets });
  await syncProjectProfile({ project, workspaceId: workspace.id, userId: user.id, assets });
  await syncReraRegistration({
    workspaceId: workspace.id,
    brandId: brand.id,
    projectId: project.id,
    userId: user.id,
    qrAssetId: assets.byUploadFilename.get("prescon-midtown-bay-rera-qr.png")?.id ?? null
  });

  console.log(JSON.stringify({ ok: true, mode: dataOnly ? "data-only" : "full", workspaceId: workspace.id, brandId: brand.id, projectId: project.id, adminEmail, assetCount: assets.rows.length, reraNumber }, null, 2));
}

async function ensureAdminUser() {
  const existing = await findUserByEmail(adminEmail);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: adminPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });
    if (error) throw error;
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", existing.id);
    return { id: existing.id, email: adminEmail };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("Auth user creation returned no user id");
  await supabase.from("profiles").update({ display_name: displayName }).eq("id", data.user.id);
  return { id: data.user.id, email: adminEmail };
}

async function ensureWorkspace(userId) {
  const workspace = await waitForWorkspace(userId);
  const desiredSlug = await ensureUniqueWorkspaceSlug(slugify(workspaceName), workspace.id);
  const { error } = await supabase.from("workspaces").update({ name: workspaceName, slug: desiredSlug }).eq("id", workspace.id);
  if (error) throw error;
  const { data, error: refetchError } = await supabase.from("workspaces").select("id, name, slug, created_by").eq("id", workspace.id).maybeSingle();
  if (refetchError) throw refetchError;
  if (!data) throw new Error("Workspace disappeared after update");
  return data;
}

async function waitForWorkspace(userId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.from("workspaces").select("id, name, slug, created_by").eq("created_by", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data;
    await sleep(500);
  }
  throw new Error(`No workspace found for user ${userId}`);
}

async function ensureUniqueWorkspaceSlug(baseSlug, workspaceId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data, error } = await supabase.from("workspaces").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data || data.id === workspaceId) return candidate;
  }
  return `${baseSlug}-${Date.now().toString().slice(-6)}`;
}

async function ensureBrand({ workspaceId, userId }) {
  const { data: existing, error: fetchError } = await supabase.from("brands").select("id, current_profile_version_id").eq("workspace_id", workspaceId).eq("name", brandName).maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) {
    const { error } = await supabase.from("brands").update({ slug: slugify(brandDraft.brandSlug), description: brandDraft.description }).eq("id", existing.id);
    if (error) throw error;
    return existing;
  }
  const brandId = crypto.randomUUID();
  const { error } = await supabase.from("brands").insert({ id: brandId, workspace_id: workspaceId, name: brandName, slug: slugify(brandDraft.brandSlug), description: brandDraft.description, created_by: userId });
  if (error) throw error;
  return { id: brandId, current_profile_version_id: null };
}

async function ensureProject({ workspaceId, brandId, userId }) {
  const { data: existing, error: fetchError } = await supabase.from("projects").select("id, current_profile_version_id").eq("workspace_id", workspaceId).eq("brand_id", brandId).eq("name", projectName).maybeSingle();
  if (fetchError) throw fetchError;
  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    name: projectName,
    slug: slugify(projectDraft.projectSlug),
    city: projectDraft.city,
    micro_location: projectDraft.microLocation,
    project_type: projectDraft.projectType,
    stage: projectDraft.stage,
    status: "active",
    description: projectDraft.description,
    created_by: userId
  };
  if (existing) {
    const { error } = await supabase.from("projects").update(payload).eq("id", existing.id);
    if (error) throw error;
    return existing;
  }
  const projectId = crypto.randomUUID();
  const { error } = await supabase.from("projects").insert({ id: projectId, ...payload });
  if (error) throw error;
  return { id: projectId, current_profile_version_id: null };
}

async function syncAssets({ workspaceId, brandId, projectId, userId, manifestRows }) {
  const { data: existingRows, error: fetchError } = await supabase.from("brand_assets").select("id, file_name, storage_path").eq("brand_id", brandId);
  if (fetchError) throw fetchError;
  const existingByFileName = new Map((existingRows ?? []).map((row) => [row.file_name, row]));
  const results = [];

  for (const row of manifestRows) {
    const relativePath = row.local_path;
    const absolutePath = path.join(uploadRoot, relativePath);
    const fileBuffer = await fs.readFile(absolutePath);
    const mimeType = getMimeType(row.upload_filename);
    const existing = existingByFileName.get(row.upload_filename);
    const assetId = existing?.id ?? crypto.randomUUID();
    const storagePath = existing?.storage_path ?? buildStoragePath({ workspaceId, brandId, projectId: row.project_name ? projectId : null, section: getStorageSection(relativePath, row.asset_kind), id: assetId, fileName: row.upload_filename });

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;

    const payload = {
      workspace_id: workspaceId,
      brand_id: brandId,
      project_id: row.project_name ? projectId : null,
      kind: row.asset_kind,
      label: buildAssetLabel(row),
      file_name: row.upload_filename,
      mime_type: mimeType,
      storage_path: storagePath,
      metadata_json: buildAssetMetadata(row),
      asset_description: row.asset_description || null,
      truth_status: row.truth_status || null,
      scene_type: row.scene_type || null,
      visual_use: row.visual_use || null,
      safe_claims: splitPipes(row.safe_claims),
      do_not_claim: splitPipes(row.do_not_claim),
      created_by: userId
    };

    if (existing) {
      const { error } = await supabase.from("brand_assets").update(payload).eq("id", existing.id);
      if (error) throw error;
      results.push({ ...payload, id: existing.id, relativePath });
      continue;
    }

    const { error } = await supabase.from("brand_assets").insert({ id: assetId, ...payload });
    if (error) throw error;
    results.push({ ...payload, id: assetId, relativePath });
  }

  return {
    rows: results,
    byUploadFilename: new Map(results.map((row) => [row.file_name, row])),
    byRelativePath: new Map(results.map((row) => [row.relativePath, row]))
  };
}

async function syncBrandProfile({ brand, workspaceId, userId, assets }) {
  const referenceAssetIds = assets.rows
    .filter((asset) => asset.kind === "reference" && asset.metadata_json.subjectType === "project_exterior")
    .filter((asset) => asset.visual_use === "hero_anchor" || asset.visual_use === "truth_anchor")
    .map((asset) => asset.id);
  await upsertBrandProfileVersion({ workspaceId, brandId: brand.id, userId, profile: { ...brandDraft.profile, referenceAssetIds } });
}

async function syncProjectProfile({ project, workspaceId, userId, assets }) {
  const actualProjectImageIds = assets.rows
    .filter((asset) => asset.kind === "reference" && asset.metadata_json.subjectType === "project_exterior")
    .filter((asset) => asset.visual_use === "hero_anchor" || asset.visual_use === "truth_anchor")
    .map((asset) => asset.id);
  const sampleFlatImageIds = assets.rows
    .filter((asset) => asset.mime_type.startsWith("image/"))
    .filter((asset) => asset.metadata_json.subjectType === "interior")
    .map((asset) => asset.id);
  const profile = { ...projectDraft.profile, actualProjectImageIds, sampleFlatImageIds };
  await upsertProjectProfileVersion({ workspaceId, projectId: project.id, userId, profile });
}

async function upsertBrandProfileVersion({ workspaceId, brandId, userId, profile }) {
  const current = await fetchCurrentBrandProfile(brandId);
  if (jsonEquals(current?.profile_json ?? null, profile)) return current?.id ?? null;
  const profileId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("brand_profile_versions").insert({ id: profileId, workspace_id: workspaceId, brand_id: brandId, version_number: (current?.version_number ?? 0) + 1, profile_json: profile, created_by: userId });
  if (insertError) throw insertError;
  const { error: updateError } = await supabase.from("brands").update({ current_profile_version_id: profileId }).eq("id", brandId);
  if (updateError) throw updateError;
  return profileId;
}

async function upsertProjectProfileVersion({ workspaceId, projectId, userId, profile }) {
  const current = await fetchCurrentProjectProfile(projectId);
  if (jsonEquals(current?.profile_json ?? null, profile)) return current?.id ?? null;
  const profileId = crypto.randomUUID();
  const { error: insertError } = await supabase.from("project_profile_versions").insert({ id: profileId, workspace_id: workspaceId, project_id: projectId, version_number: (current?.version_number ?? 0) + 1, profile_json: profile, created_by: userId });
  if (insertError) throw insertError;
  const { error: updateError } = await supabase.from("projects").update({ current_profile_version_id: profileId }).eq("id", projectId);
  if (updateError) throw updateError;
  return profileId;
}

async function fetchCurrentBrandProfile(brandId) {
  const { data: brand, error: brandError } = await supabase.from("brands").select("current_profile_version_id").eq("id", brandId).maybeSingle();
  if (brandError) throw brandError;
  if (brand?.current_profile_version_id) {
    const { data, error } = await supabase.from("brand_profile_versions").select("id, version_number, profile_json").eq("id", brand.current_profile_version_id).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const { data, error } = await supabase.from("brand_profile_versions").select("id, version_number, profile_json").eq("brand_id", brandId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function fetchCurrentProjectProfile(projectId) {
  const { data: project, error: projectError } = await supabase.from("projects").select("current_profile_version_id").eq("id", projectId).maybeSingle();
  if (projectError) throw projectError;
  if (project?.current_profile_version_id) {
    const { data, error } = await supabase.from("project_profile_versions").select("id, version_number, profile_json").eq("id", project.current_profile_version_id).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const { data, error } = await supabase.from("project_profile_versions").select("id, version_number, profile_json").eq("project_id", projectId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function syncReraRegistration({ workspaceId, brandId, projectId, userId, qrAssetId }) {
  const { data: existing, error: fetchError } = await supabase.from("project_rera_registrations").select("id").eq("project_id", projectId).eq("registration_number", reraNumber).maybeSingle();
  if (fetchError) throw fetchError;
  const payload = {
    workspace_id: workspaceId,
    brand_id: brandId,
    project_id: projectId,
    registration_number: reraNumber,
    label: "MahaRERA",
    qr_asset_id: qrAssetId,
    is_default: true,
    metadata_json: {
      source: "Prescon Midtown Bay RERA QR PDF and public project references",
      notes: ["Registration number should be used exactly as P51900030390.", "QR image was converted from the provided source PDF."]
    },
    created_by: userId
  };
  if (existing) {
    const { error } = await supabase.from("project_rera_registrations").update(payload).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from("project_rera_registrations").insert({ id, ...payload });
  if (error) throw error;
  return id;
}

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
  }
}

function buildAssetMetadata(row) {
  return {
    source: "prescon-db-prepared",
    originalRelativePath: row.source_path || row.local_path,
    preparedRelativePath: row.local_path,
    subjectType: row.subject_type || null,
    assetClass: row.subject_type === "interior" ? "sample_flat" : row.subject_type || null,
    viewType: row.view_type || null,
    usageIntent: row.usage_intent || null,
    preserveIdentity: parseBoolean(row.preserve_identity),
    qualityTier: row.quality_tier || null,
    amenityName: row.amenity_name || null,
    tags: splitPipes(row.tags),
    notes: row.notes || null,
    assetDescription: row.asset_description || null,
    truthStatus: row.truth_status || null,
    sceneType: row.scene_type || null,
    visualUse: row.visual_use || null,
    safeClaims: splitPipes(row.safe_claims),
    doNotClaim: splitPipes(row.do_not_claim),
    sha256: row.sha256 || null,
    width: row.width ? Number(row.width) : null,
    height: row.height ? Number(row.height) : null
  };
}

function buildAssetLabel(row) {
  if (row.subject_type === "brand_logo") return "Prescon brand logo";
  if (row.subject_type === "project_logo") return "Prescon Midtown Bay project logo";
  if (row.asset_kind === "rera_qr") return "Prescon Midtown Bay RERA QR";
  return humanizeFileName(row.upload_filename);
}

function buildStoragePath({ workspaceId, brandId, projectId, section, id, fileName }) {
  return `${workspaceId}/${brandId}/${projectId ?? "brand"}/${section}/${id}/${fileName.toLowerCase()}`;
}

function getStorageSection(relativePath, assetKind) {
  const [topLevel] = relativePath.split("/");
  if (assetKind === "logo") return "logos";
  if (assetKind === "rera_qr") return "compliance";
  return topLevel.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unsupported file type: ${fileName}`);
  return mime;
}

function parseCsv(input) {
  const lines = input.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function splitPipes(value) {
  return String(value ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

function humanizeFileName(fileName) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function jsonEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf"
};
