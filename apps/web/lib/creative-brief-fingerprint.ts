import type { CreativeBrief, PromptPackage } from "@image-lab/contracts";
import type { CreativeFlowVersion } from "./api";

type FingerprintBriefInput = {
  [K in keyof CreativeBrief]?: CreativeBrief[K] | undefined;
} & {
  selectedReferenceAssetIds?: string[] | undefined;
};

type BriefFingerprintInput = {
  activeBrandId: string | null | undefined;
  creativeFlowVersion: CreativeFlowVersion;
  styleVariationCount: number;
  brief: FingerprintBriefInput;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeCopyFields(brief: FingerprintBriefInput) {
  const copyMode = brief.copyMode === "auto" ? "auto" : "manual";
  return {
    copyMode,
    offer: copyMode === "auto" ? "" : brief.offer ?? "",
    exactText: copyMode === "auto" ? "" : brief.exactText ?? "",
  };
}

export function buildCreativeBriefFingerprint(input: BriefFingerprintInput) {
  const { brief } = input;
  const normalizedCopy = normalizeCopyFields(brief);

  return JSON.stringify({
    activeBrandId: input.activeBrandId ?? null,
    createMode: brief.createMode ?? null,
    deliverableId: brief.deliverableId ?? null,
    campaignId: brief.campaignId ?? null,
    campaignPlanId: brief.campaignPlanId ?? null,
    seriesId: brief.seriesId ?? null,
    festivalId: brief.festivalId ?? null,
    sourceOutputId: brief.sourceOutputId ?? null,
    projectId: brief.projectId ?? null,
    postTypeId: brief.postTypeId ?? null,
    creativeTemplateId: brief.creativeTemplateId ?? null,
    channel: brief.channel,
    format: brief.format,
    seriesOutputKind: brief.seriesOutputKind ?? null,
    slideCount: brief.slideCount ?? null,
    templateType: brief.templateType ?? null,
    goal: brief.goal,
    prompt: brief.prompt,
    audience: brief.audience ?? "",
    copyMode: normalizedCopy.copyMode,
    offer: normalizedCopy.offer,
    exactText: normalizedCopy.exactText,
    includeBrandLogo: brief.includeBrandLogo ?? false,
    includeReraQr: brief.includeReraQr ?? false,
    logoAssetId: brief.logoAssetId ?? null,
    referenceAssetIds: brief.selectedReferenceAssetIds ?? [],
    creativeFlowVersion: input.creativeFlowVersion,
    styleVariationCount: input.styleVariationCount,
  });
}

export function getPromptPackageBriefFingerprint(
  promptPackage: PromptPackage | null | undefined,
  creativeFlowVersion: CreativeFlowVersion
) {
  if (!promptPackage) {
    return null;
  }

  const sourceBrief = asRecord(promptPackage.compilerTrace?.sourceBrief);
  if (Object.keys(sourceBrief).length === 0) {
    return null;
  }

  const resolvedConstraints = asRecord(promptPackage.resolvedConstraints);
  const sourceVariationCount =
    typeof sourceBrief.variationCount === "number" && Number.isFinite(sourceBrief.variationCount)
      ? Math.trunc(sourceBrief.variationCount)
      : typeof resolvedConstraints.variationCount === "number" && Number.isFinite(resolvedConstraints.variationCount)
        ? Math.trunc(resolvedConstraints.variationCount)
        : promptPackage.variations.length > 0
          ? promptPackage.variations.length
          : 1;

  return buildCreativeBriefFingerprint({
    activeBrandId: promptPackage.brandId,
    creativeFlowVersion,
    styleVariationCount: sourceVariationCount,
    brief: {
      createMode: asOptionalString(sourceBrief.createMode) as CreativeBrief["createMode"] | undefined,
      deliverableId: asOptionalString(sourceBrief.deliverableId) ?? promptPackage.deliverableId ?? undefined,
      campaignId: asOptionalString(sourceBrief.campaignId),
      campaignPlanId: asOptionalString(sourceBrief.campaignPlanId),
      seriesId: asOptionalString(sourceBrief.seriesId),
      festivalId: asOptionalString(sourceBrief.festivalId),
      sourceOutputId: asOptionalString(sourceBrief.sourceOutputId),
      projectId: asOptionalString(sourceBrief.projectId) ?? promptPackage.projectId ?? undefined,
      postTypeId: asOptionalString(sourceBrief.postTypeId) ?? promptPackage.postTypeId ?? undefined,
      creativeTemplateId:
        asOptionalString(sourceBrief.creativeTemplateId) ?? promptPackage.creativeTemplateId ?? undefined,
      channel: sourceBrief.channel as CreativeBrief["channel"],
      format: sourceBrief.format as CreativeBrief["format"],
      seriesOutputKind: sourceBrief.seriesOutputKind as CreativeBrief["seriesOutputKind"],
      slideCount: typeof sourceBrief.slideCount === "number" ? sourceBrief.slideCount : undefined,
      templateType:
        (asOptionalString(sourceBrief.templateType) ??
          (promptPackage.templateType ?? undefined)) as CreativeBrief["templateType"],
      goal: asOptionalString(sourceBrief.goal) ?? "",
      prompt: asOptionalString(sourceBrief.prompt) ?? "",
      audience: asOptionalString(sourceBrief.audience),
      copyMode: sourceBrief.copyMode as CreativeBrief["copyMode"],
      offer: asOptionalString(sourceBrief.offer),
      exactText: asOptionalString(sourceBrief.exactText),
      includeBrandLogo: Boolean(sourceBrief.includeBrandLogo ?? resolvedConstraints.includeBrandLogo),
      includeReraQr: Boolean(sourceBrief.includeReraQr ?? resolvedConstraints.includeReraQr),
      logoAssetId:
        asOptionalString(sourceBrief.logoAssetId) ??
        asOptionalString(resolvedConstraints.brandLogoAssetId),
      selectedReferenceAssetIds:
        asStringArray(sourceBrief.referenceAssetIds).length > 0
          ? asStringArray(sourceBrief.referenceAssetIds)
          : promptPackage.referenceAssetIds,
    },
  });
}
