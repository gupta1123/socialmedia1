import type { BrandProfile } from "@image-lab/contracts";

type Input = {
  brandProfile: BrandProfile;
};

export type BrandPromptGuidance = {
  styleDescriptors: string[];
  approvedVocabulary: string[];
  bannedTerms: string[];
  seedClauses: string[];
  finalClauses: string[];
  manifest: {
    identity: BrandProfile["identity"];
    voiceSummary: string;
    palette: BrandProfile["palette"];
    styleDescriptors: string[];
    approvedVocabulary: string[];
    bannedTerms: string[];
    usageNotes: string[];
    antiReferenceNotes: string[];
    reviewChecks: string[];
  };
};

export function buildBrandPromptGuidance(input: Input): BrandPromptGuidance {
  const approvedVocabulary = dedupeStrings(input.brandProfile.voice.approvedVocabulary ?? []);
  const styleDescriptors = dedupeStrings([
    ...input.brandProfile.styleDescriptors,
    ...input.brandProfile.voice.adjectives,
    ...approvedVocabulary
  ]);
  const bannedTerms = dedupeStrings([
    ...input.brandProfile.voice.bannedPhrases,
    ...input.brandProfile.bannedPatterns,
    ...input.brandProfile.dontRules,
    ...(input.brandProfile.compliance?.bannedClaims ?? [])
  ]);
  const usageNotes = dedupeStrings(input.brandProfile.referenceCanon?.usageNotes ?? []);
  const antiReferenceNotes = dedupeStrings(input.brandProfile.referenceCanon?.antiReferenceNotes ?? []);
  const reviewChecks = dedupeStrings(input.brandProfile.compliance?.reviewChecks ?? []);

  return {
    styleDescriptors,
    approvedVocabulary,
    bannedTerms,
    seedClauses: compactStrings([
      input.brandProfile.identity.positioning ? `Brand positioning: ${input.brandProfile.identity.positioning}.` : null,
      input.brandProfile.identity.promise ? `Brand promise: ${input.brandProfile.identity.promise}.` : null,
      input.brandProfile.identity.audienceSummary ? `Audience summary: ${input.brandProfile.identity.audienceSummary}.` : null,
      styleDescriptors.length > 0 ? `Visual direction: ${styleDescriptors.join(", ")}.` : null,
      `Palette anchors: ${input.brandProfile.palette.primary}, ${input.brandProfile.palette.secondary}, ${input.brandProfile.palette.accent}.`,
      input.brandProfile.visualSystem.typographyMood ? `Typography mood: ${input.brandProfile.visualSystem.typographyMood}.` : null,
      input.brandProfile.visualSystem.headlineFontFamily ? `Preferred headline font family: ${input.brandProfile.visualSystem.headlineFontFamily}.` : null,
      input.brandProfile.visualSystem.bodyFontFamily ? `Preferred body/supporting font family: ${input.brandProfile.visualSystem.bodyFontFamily}.` : null,
      input.brandProfile.visualSystem.typographyNotes.length > 0
        ? `Typography rules: ${input.brandProfile.visualSystem.typographyNotes.join("; ")}.`
        : null,
      input.brandProfile.visualSystem.textDensity ? `Text density target: ${input.brandProfile.visualSystem.textDensity}.` : null,
      input.brandProfile.visualSystem.realismLevel ? `Realism level: ${input.brandProfile.visualSystem.realismLevel}.` : null,
      input.brandProfile.visualSystem.compositionPrinciples.length > 0
        ? `Composition principles: ${input.brandProfile.visualSystem.compositionPrinciples.join("; ")}.`
        : null,
      input.brandProfile.visualSystem.imageTreatment.length > 0
        ? `Image treatment: ${input.brandProfile.visualSystem.imageTreatment.join("; ")}.`
        : null,
      approvedVocabulary.length > 0 ? `Prefer vocabulary like: ${approvedVocabulary.join(", ")}.` : null,
      usageNotes.length > 0 ? `Reference canon usage notes: ${usageNotes.join("; ")}.` : null,
      antiReferenceNotes.length > 0 ? `Avoid these anti-reference cues: ${antiReferenceNotes.join("; ")}.` : null,
      bannedTerms.length > 0 ? `Avoid: ${bannedTerms.join(", ")}.` : null
    ]),
    finalClauses: compactStrings([
      `Use a ${input.brandProfile.voice.summary.toLowerCase()} tone translated into visual form.`,
      styleDescriptors.length > 0 ? `Prioritize ${styleDescriptors.join(", ")}.` : null,
      input.brandProfile.identity.positioning ? `Express this market positioning: ${input.brandProfile.identity.positioning}.` : null,
      input.brandProfile.identity.promise ? `Protect this brand promise: ${input.brandProfile.identity.promise}.` : null,
      input.brandProfile.visualSystem.typographyMood ? `Typography should feel like ${input.brandProfile.visualSystem.typographyMood}.` : null,
      input.brandProfile.visualSystem.headlineFontFamily
        ? `When text appears, make headline styling align with ${input.brandProfile.visualSystem.headlineFontFamily}.`
        : null,
      input.brandProfile.visualSystem.bodyFontFamily
        ? `When text appears, make supporting copy styling align with ${input.brandProfile.visualSystem.bodyFontFamily}.`
        : null,
      input.brandProfile.visualSystem.typographyNotes.length > 0
        ? `Typography behavior: ${input.brandProfile.visualSystem.typographyNotes.join("; ")}.`
        : null,
      input.brandProfile.visualSystem.compositionPrinciples.length > 0
        ? `Composition rules: ${input.brandProfile.visualSystem.compositionPrinciples.join("; ")}.`
        : null,
      input.brandProfile.visualSystem.imageTreatment.length > 0
        ? `Image treatment rules: ${input.brandProfile.visualSystem.imageTreatment.join("; ")}.`
        : null,
      `Respect brand dos: ${input.brandProfile.doRules.join("; ") || "clear hierarchy and premium restraint"}.`,
      usageNotes.length > 0 ? `Use references this way: ${usageNotes.join("; ")}.` : null,
      antiReferenceNotes.length > 0 ? `Do not imitate these reference traits: ${antiReferenceNotes.join("; ")}.` : null,
      reviewChecks.length > 0 ? `Review checks to satisfy: ${reviewChecks.join("; ")}.` : null,
      bannedTerms.length > 0 ? `Never include: ${bannedTerms.join(", ")}.` : null
    ]),
    manifest: {
      identity: input.brandProfile.identity,
      voiceSummary: input.brandProfile.voice.summary,
      palette: input.brandProfile.palette,
      styleDescriptors,
      approvedVocabulary,
      bannedTerms,
      usageNotes,
      antiReferenceNotes,
      reviewChecks
    }
  };
}

export function appendMissingPromptClauses(basePrompt: string, clauses: string[]) {
  const existing = normalizePrompt(basePrompt);
  const missing = clauses.filter((clause) => !existing.includes(normalizePrompt(clause)));
  if (missing.length === 0) {
    return basePrompt.trim();
  }

  return `${basePrompt.trim()} ${missing.join(" ")}`.trim();
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const items: string[] = [];

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
    items.push(normalized);
  }

  return items;
}

function compactStrings(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function normalizePrompt(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
