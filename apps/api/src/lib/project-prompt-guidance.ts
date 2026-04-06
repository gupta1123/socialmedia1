import type { ProjectProfile } from "@image-lab/contracts";

export type ProjectPromptGuidance = {
  seedClauses: string[];
  finalClauses: string[];
  manifest: {
    tagline: string;
    possessionStatus: string;
    reraNumber: string;
    positioning: string;
    audienceSegments: string[];
    lifestyleAngle: string;
    configurations: string[];
    sizeRanges: string[];
    heroAmenities: string[];
    locationAdvantages: string[];
    nearbyLandmarks: string[];
    travelTimes: string[];
    constructionStatus: string;
    latestUpdate: string;
    completionWindow: string;
    approvedClaims: string[];
    bannedClaims: string[];
    legalNotes: string[];
    approvalsSummary: string;
    credibilityFacts: string[];
    investorAngle: string;
    endUserAngle: string;
    keyObjections: string[];
    actualProjectImageCount: number;
    sampleFlatImageCount: number;
  };
};

export function buildProjectPromptGuidance(projectProfile: ProjectProfile | null | undefined): ProjectPromptGuidance {
  if (!projectProfile) {
    return {
      seedClauses: [],
      finalClauses: [],
      manifest: emptyManifest()
    };
  }

  const configurations = dedupeStrings(projectProfile.configurations);
  const sizeRanges = dedupeStrings(projectProfile.sizeRanges);
  const heroAmenities = dedupeStrings(projectProfile.heroAmenities.length > 0 ? projectProfile.heroAmenities : projectProfile.amenities);
  const locationAdvantages = dedupeStrings(projectProfile.locationAdvantages);
  const nearbyLandmarks = dedupeStrings(projectProfile.nearbyLandmarks);
  const travelTimes = dedupeStrings(projectProfile.travelTimes);
  const approvedClaims = dedupeStrings(projectProfile.approvedClaims);
  const bannedClaims = dedupeStrings(projectProfile.bannedClaims);
  const legalNotes = dedupeStrings(projectProfile.legalNotes);
  const credibilityFacts = dedupeStrings(projectProfile.credibilityFacts);
  const audienceSegments = dedupeStrings(projectProfile.audienceSegments);
  const keyObjections = dedupeStrings(projectProfile.keyObjections);

  return {
    seedClauses: compactStrings([
      projectProfile.tagline ? `Project tagline: ${projectProfile.tagline}.` : null,
      projectProfile.positioning ? `Project positioning: ${projectProfile.positioning}.` : null,
      audienceSegments.length > 0 ? `Project audience segments: ${audienceSegments.join(", ")}.` : null,
      projectProfile.lifestyleAngle ? `Lifestyle angle: ${projectProfile.lifestyleAngle}.` : null,
      configurations.length > 0 ? `Configuration mix: ${configurations.join("; ")}.` : null,
      sizeRanges.length > 0 ? `Size range guidance: ${sizeRanges.join("; ")}.` : null,
      heroAmenities.length > 0 ? `Hero amenities to keep visually legible: ${heroAmenities.join(", ")}.` : null,
      locationAdvantages.length > 0 ? `Location advantages: ${locationAdvantages.join("; ")}.` : null,
      nearbyLandmarks.length > 0 ? `Nearby landmarks: ${nearbyLandmarks.join("; ")}.` : null,
      travelTimes.length > 0 ? `Travel time anchors: ${travelTimes.join("; ")}.` : null,
      projectProfile.constructionStatus ? `Construction status: ${projectProfile.constructionStatus}.` : null,
      projectProfile.latestUpdate ? `Latest project update: ${projectProfile.latestUpdate}.` : null,
      projectProfile.completionWindow ? `Completion window: ${projectProfile.completionWindow}.` : null,
      projectProfile.approvalsSummary ? `Approvals summary: ${projectProfile.approvalsSummary}.` : null,
      credibilityFacts.length > 0 ? `Credibility facts: ${credibilityFacts.join("; ")}.` : null,
      approvedClaims.length > 0 ? `Approved claims: ${approvedClaims.join("; ")}.` : null,
      bannedClaims.length > 0 ? `Never imply: ${bannedClaims.join("; ")}.` : null,
      projectProfile.actualProjectImageIds.length > 0
        ? `Project images are available. Prefer them for truthful architecture, façade, and site context.`
        : null,
      projectProfile.sampleFlatImageIds.length > 0
        ? `Sample-flat images are available. Use them only when interior context is needed.`
        : null
    ]),
    finalClauses: compactStrings([
      projectProfile.tagline ? `Honor this project tagline when relevant: ${projectProfile.tagline}.` : null,
      projectProfile.positioning ? `Ground the creative in this project positioning: ${projectProfile.positioning}.` : null,
      audienceSegments.length > 0 ? `Speak to these project audiences: ${audienceSegments.join(", ")}.` : null,
      projectProfile.lifestyleAngle ? `Carry this lifestyle angle: ${projectProfile.lifestyleAngle}.` : null,
      configurations.length > 0 ? `Project configurations: ${configurations.join("; ")}.` : null,
      sizeRanges.length > 0 ? `Size facts: ${sizeRanges.join("; ")}.` : null,
      projectProfile.startingPrice ? `Starting price fact: ${projectProfile.startingPrice}.` : null,
      projectProfile.priceRangeByConfig.length > 0
        ? `Price-by-configuration facts: ${projectProfile.priceRangeByConfig.join("; ")}.`
        : null,
      heroAmenities.length > 0 ? `Feature these hero amenities when relevant: ${heroAmenities.join(", ")}.` : null,
      locationAdvantages.length > 0 ? `Location advantages to preserve: ${locationAdvantages.join("; ")}.` : null,
      nearbyLandmarks.length > 0 ? `Nearby landmark facts: ${nearbyLandmarks.join("; ")}.` : null,
      travelTimes.length > 0 ? `Travel-time facts: ${travelTimes.join("; ")}.` : null,
      projectProfile.constructionStatus ? `Current construction status: ${projectProfile.constructionStatus}.` : null,
      projectProfile.latestUpdate ? `Latest project update: ${projectProfile.latestUpdate}.` : null,
      projectProfile.completionWindow ? `Completion / possession window: ${projectProfile.completionWindow}.` : null,
      projectProfile.reraNumber ? `RERA reference: ${projectProfile.reraNumber}.` : null,
      projectProfile.approvalsSummary ? `Approvals summary: ${projectProfile.approvalsSummary}.` : null,
      approvedClaims.length > 0 ? `Only use these approved claims: ${approvedClaims.join("; ")}.` : null,
      bannedClaims.length > 0 ? `Never use these claims: ${bannedClaims.join("; ")}.` : null,
      legalNotes.length > 0 ? `Legal notes: ${legalNotes.join("; ")}.` : null,
      credibilityFacts.length > 0 ? `Trust / credibility facts: ${credibilityFacts.join("; ")}.` : null,
      projectProfile.investorAngle ? `Investor framing: ${projectProfile.investorAngle}.` : null,
      projectProfile.endUserAngle ? `End-user framing: ${projectProfile.endUserAngle}.` : null,
      keyObjections.length > 0 ? `Do not ignore these buyer objections: ${keyObjections.join("; ")}.` : null,
      projectProfile.actualProjectImageIds.length > 0
        ? `If project imagery is supplied, prioritize it over generic architecture.`
        : null,
      projectProfile.sampleFlatImageIds.length > 0
        ? `Use sample-flat imagery only when the brief genuinely needs interior storytelling.`
        : null
    ]),
    manifest: {
      tagline: projectProfile.tagline,
      possessionStatus: projectProfile.possessionStatus,
      reraNumber: projectProfile.reraNumber,
      positioning: projectProfile.positioning,
      audienceSegments,
      lifestyleAngle: projectProfile.lifestyleAngle,
      configurations,
      sizeRanges,
      heroAmenities,
      locationAdvantages,
      nearbyLandmarks,
      travelTimes,
      constructionStatus: projectProfile.constructionStatus,
      latestUpdate: projectProfile.latestUpdate,
      completionWindow: projectProfile.completionWindow,
      approvedClaims,
      bannedClaims,
      legalNotes,
      approvalsSummary: projectProfile.approvalsSummary,
      credibilityFacts,
      investorAngle: projectProfile.investorAngle,
      endUserAngle: projectProfile.endUserAngle,
      keyObjections,
      actualProjectImageCount: projectProfile.actualProjectImageIds.length,
      sampleFlatImageCount: projectProfile.sampleFlatImageIds.length
    }
  };
}

function emptyManifest(): ProjectPromptGuidance["manifest"] {
  return {
    tagline: "",
    possessionStatus: "",
    reraNumber: "",
    positioning: "",
    audienceSegments: [],
    lifestyleAngle: "",
    configurations: [],
    sizeRanges: [],
    heroAmenities: [],
    locationAdvantages: [],
    nearbyLandmarks: [],
    travelTimes: [],
    constructionStatus: "",
    latestUpdate: "",
    completionWindow: "",
    approvedClaims: [],
    bannedClaims: [],
    legalNotes: [],
    approvalsSummary: "",
    credibilityFacts: [],
    investorAngle: "",
    endUserAngle: "",
    keyObjections: [],
    actualProjectImageCount: 0,
    sampleFlatImageCount: 0
  };
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function compactStrings(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}
