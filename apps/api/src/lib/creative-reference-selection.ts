import type { BrandAssetRecord } from "@image-lab/contracts";

const AMENITY_MATCHES = [
  "sky lounge",
  "yoga deck",
  "juice bar",
  "lap pool",
  "kids play area",
  "entrance plaza",
  "fitness studio",
  "open air amphitheater",
  "amphitheater",
  "clubhouse",
  "jacuzzi",
  "terrace",
  "lounge",
  "garden",
  "theatre",
  "pool",
  "gym",
  "cafe",
  "deck",
  "kids",
  "play",
  "plaza",
  "cricket",
];

type InferredReferenceSelectionInput = {
  postTypeCode?: string | null;
  isFestiveGreeting?: boolean;
  explicitReferenceAssetIds?: string[] | null;
  projectImageAssetIds?: string[] | null;
  sampleFlatImageIds?: string[] | null;
  brandReferenceAssetIds?: string[] | null;
  allAssets?: BrandAssetRecord[] | null;
  projectId?: string | null;
  focusAmenity?: string | null;
};

type AmenityFocusInput = {
  briefText?: string | null;
  projectAmenityNames?: string[] | null;
  allAssets?: BrandAssetRecord[] | null;
  projectId?: string | null;
  seed?: string | null;
};

export type AmenityCatalogOption = {
  name: string;
  assetIds: string[];
  hasAssets: boolean;
  sources: Array<"project_profile" | "asset_metadata">;
};

export type AmenityFocusSelection = {
  focusAmenity: string | null;
  source: "explicit" | "inferred" | "none";
  amenityAssetIds: string[];
};

export function isAmenityFocusedPostType(postTypeCode: string | null | undefined) {
  return postTypeCode === "amenity-spotlight";
}

export function inferAmenityNameFromAssetParts(
  label: string,
  metadataJson: Record<string, unknown> | null | undefined
) {
  const metadata = asRecord(metadataJson);
  if (typeof metadata.amenityName === "string" && metadata.amenityName.trim()) {
    return metadata.amenityName.trim();
  }

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const haystack = `${label} ${tags.join(" ")}`.toLowerCase();

  return AMENITY_MATCHES.find((item) => haystack.includes(item)) ?? undefined;
}

export function isAmenityReferenceAsset(asset: BrandAssetRecord) {
  if (asset.kind !== "reference") {
    return false;
  }

  const metadata = asRecord(asset.metadataJson);
  const subjectType = typeof metadata.subjectType === "string" ? metadata.subjectType.toLowerCase() : "";
  if (subjectType === "amenity") {
    return true;
  }

  return Boolean(inferAmenityNameFromAssetParts(asset.label, metadata));
}

export function resolveAmenityFocus(input: AmenityFocusInput): AmenityFocusSelection {
  const briefText = normalizeText(input.briefText ?? "");
  const amenityCatalog = buildProjectAmenityCatalog({
    projectAmenityNames: input.projectAmenityNames ?? [],
    allAssets: input.allAssets ?? [],
    projectId: input.projectId ?? null,
  });
  const namedAmenityOptions = amenityCatalog.map((option) => option.name);
  const namedAmenityGroups = new Map(amenityCatalog.map((option) => [option.name, option.assetIds]));
  const unnamedAmenityAssetIds = dedupeStrings(
    (input.allAssets ?? [])
      .filter((asset) => asset.projectId === input.projectId && isAmenityReferenceAsset(asset))
      .filter((asset) => !inferAmenityNameFromAssetParts(asset.label, asset.metadataJson ?? {}))
      .map((asset) => asset.id)
  );
  const projectAmenityOptions = dedupeStrings(input.projectAmenityNames ?? []);
  const seed = `${input.seed ?? ""}|${briefText}|${projectAmenityOptions.join("|")}|${namedAmenityOptions.join("|")}`;

  const explicitAssetAmenity = findBestAmenityMatch(briefText, namedAmenityOptions);
  if (explicitAssetAmenity) {
    return {
      focusAmenity: explicitAssetAmenity,
      source: "explicit",
      amenityAssetIds: namedAmenityGroups.get(explicitAssetAmenity) ?? [],
    };
  }

  const explicitProjectAmenity = findBestAmenityMatch(briefText, projectAmenityOptions);
  if (explicitProjectAmenity) {
    const matchedAssetAmenity = findBestAmenityMatch(explicitProjectAmenity, namedAmenityOptions);
    return {
      focusAmenity: explicitProjectAmenity,
      source: "explicit",
      amenityAssetIds: matchedAssetAmenity ? namedAmenityGroups.get(matchedAssetAmenity) ?? [] : [],
    };
  }

  if (namedAmenityOptions.length > 0) {
    const focusAmenity = chooseRandom(namedAmenityOptions, seed);
    return {
      focusAmenity,
      source: "inferred",
      amenityAssetIds: namedAmenityGroups.get(focusAmenity) ?? [],
    };
  }

  if (projectAmenityOptions.length > 0) {
    return {
      focusAmenity: chooseRandom(projectAmenityOptions, seed),
      source: "inferred",
      amenityAssetIds: [],
    };
  }

  if (unnamedAmenityAssetIds.length > 0) {
    return {
      focusAmenity: null,
      source: "none",
      amenityAssetIds: [unnamedAmenityAssetIds[0]!],
    };
  }

  return {
    focusAmenity: null,
    source: "none",
    amenityAssetIds: [],
  };
}

export function buildProjectAmenityCatalog(input: {
  projectAmenityNames?: string[] | null;
  allAssets?: BrandAssetRecord[] | null;
  projectId?: string | null;
}) {
  const options = new Map<string, AmenityCatalogOption>();
  const addOrMerge = (
    name: string,
    source: "project_profile" | "asset_metadata",
    assetIds: string[] = []
  ) => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    const existingKey = findBestAmenityMatch(normalizedName, Array.from(options.keys()));
    const targetKey = existingKey ?? normalizedName;
    const current = options.get(targetKey) ?? {
      name: targetKey,
      assetIds: [],
      hasAssets: false,
      sources: [],
    };
    current.assetIds = dedupeStrings([...current.assetIds, ...assetIds]);
    current.hasAssets = current.assetIds.length > 0;
    if (!current.sources.includes(source)) {
      current.sources.push(source);
    }
    options.set(targetKey, current);
  };

  for (const name of dedupeStrings(input.projectAmenityNames ?? [])) {
    addOrMerge(name, "project_profile");
  }

  const assetGroups = groupProjectAmenityAssets(input.allAssets ?? [], input.projectId ?? null);
  for (const [amenityName, assetIds] of assetGroups.entries()) {
    addOrMerge(amenityName, "asset_metadata", assetIds);
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.hasAssets !== right.hasAssets) {
      return left.hasAssets ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export function buildInferredReferenceSelection(input: InferredReferenceSelectionInput) {
  const explicitReferenceAssetIds = dedupeStrings(input.explicitReferenceAssetIds ?? []);
  const amenityFocused = isAmenityFocusedPostType(input.postTypeCode);
  const sampleFlatFocused = isSampleFlatFocusedPostType(input.postTypeCode);
  if (input.isFestiveGreeting) {
    return {
      referenceAssetIds: explicitReferenceAssetIds,
      amenityAssetIds: [] as string[],
    };
  }

  const amenityAssetIds =
    amenityFocused
      ? dedupeStrings(
          (input.allAssets ?? [])
            .filter((asset) => asset.projectId === input.projectId && isAmenityReferenceAsset(asset))
            .filter((asset) => assetMatchesAmenityFocus(asset, input.focusAmenity ?? null))
            .map((asset) => asset.id)
        )
      : [];
  const explicitAmenityAssetIds = dedupeStrings(
    (input.allAssets ?? [])
      .filter((asset) => explicitReferenceAssetIds.includes(asset.id) && isAmenityReferenceAsset(asset))
      .filter((asset) => assetMatchesAmenityFocus(asset, input.focusAmenity ?? null))
      .map((asset) => asset.id)
  );
  const explicitNonAmenityAssetIds = dedupeStrings(
    explicitReferenceAssetIds.filter(
      (assetId) =>
        !(input.allAssets ?? []).some((asset) => asset.id === assetId && isAmenityReferenceAsset(asset))
    )
  );

  const referenceAssetIds = dedupeStrings([
    ...explicitNonAmenityAssetIds,
    ...explicitAmenityAssetIds,
    ...amenityAssetIds,
    ...(amenityFocused ? [] : input.projectImageAssetIds ?? []),
    ...(amenityFocused || !sampleFlatFocused ? [] : input.sampleFlatImageIds ?? []),
    ...(input.brandReferenceAssetIds ?? []),
  ]);

  return { referenceAssetIds, amenityAssetIds };
}

export function isSampleFlatFocusedPostType(postTypeCode: string | null | undefined) {
  return postTypeCode === "sample-flat-showcase";
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function groupProjectAmenityAssets(allAssets: BrandAssetRecord[], projectId: string | null) {
  const groups = new Map<string, string[]>();

  for (const asset of allAssets) {
    if (asset.projectId !== projectId || !isAmenityReferenceAsset(asset)) {
      continue;
    }

    const amenityName = inferAmenityNameFromAssetParts(asset.label, asset.metadataJson ?? {});
    if (!amenityName) {
      continue;
    }

    const current = groups.get(amenityName) ?? [];
    current.push(asset.id);
    groups.set(amenityName, current);
  }

  return groups;
}

function assetMatchesAmenityFocus(asset: BrandAssetRecord, focusAmenity: string | null) {
  if (!focusAmenity) {
    return true;
  }

  const amenityName = inferAmenityNameFromAssetParts(asset.label, asset.metadataJson ?? {});
  if (!amenityName) {
    return false;
  }

  return scoreAmenityTextMatch(focusAmenity, amenityName) > 0 || scoreAmenityTextMatch(amenityName, focusAmenity) > 0;
}

function findBestAmenityMatch(targetText: string, candidates: string[]) {
  let best: { value: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreAmenityTextMatch(targetText, candidate);
    if (score <= 0) {
      continue;
    }

    if (!best || score > best.score) {
      best = { value: candidate, score };
    }
  }

  return best?.value ?? null;
}

function scoreAmenityTextMatch(text: string, candidate: string) {
  const normalizedText = normalizeText(text);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedText || !normalizedCandidate) {
    return 0;
  }

  if (normalizedText.includes(normalizedCandidate)) {
    return 100 + normalizedCandidate.length;
  }

  const textTokens = new Set(tokenize(normalizedText));
  const candidateTokens = tokenize(normalizedCandidate);
  const overlap = candidateTokens.filter((token) => token.length > 2 && !STOPWORDS.has(token) && textTokens.has(token)).length;

  if (overlap === 0) {
    return 0;
  }

  return overlap * 10 + (candidateTokens.length === overlap ? 25 : 0);
}

function chooseRandom(values: string[], _seed: string) {
  if (values.length === 1) {
    return values[0]!;
  }

  const randomIndex = Math.floor(Math.random() * values.length);
  return values[randomIndex]!;
}

function chooseDeterministic(values: string[], seed: string) {
  if (values.length === 1) {
    return values[0]!;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return values[hash % values.length]!;
}

const STOPWORDS = new Set(["a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "must", "shall", "can", "need", "dare", "ought", "used", "it", "its", "this", "that", "these", "those", "i", "you", "he", "she", "we", "they", "what", "which", "who", "whom", "whose", "where", "when", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "as", "if", "then", "else", "up", "down", "out", "off", "over", "under", "again", "further", "once"]);

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenize(value: string) {
  return value.split(/\s+/g).filter(Boolean);
}
