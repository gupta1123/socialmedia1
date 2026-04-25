export type RoleAwareReferencePlan = {
  primaryAnchor: { role: "template" | "source_post"; label: string; storagePath: string } | null;
  sourcePost: { role: "source_post"; label: string; storagePath: string } | null;
  amenityAnchor: { role: "amenity_image"; label: string; storagePath: string; amenityName: string | null } | null;
  projectAnchor: { role: "project_image"; label: string; storagePath: string } | null;
  brandLogo: { role: "brand_logo"; label: string; storagePath: string } | null;
  complianceQr: { role: "rera_qr"; label: string; storagePath: string } | null;
  references: Array<{ role: "reference"; label: string; storagePath: string }>;
};

export function collectReferenceStoragePaths(plan: RoleAwareReferencePlan) {
  return [
    plan.primaryAnchor?.storagePath,
    plan.sourcePost?.storagePath,
    plan.amenityAnchor?.storagePath,
    plan.projectAnchor?.storagePath,
    plan.brandLogo?.storagePath,
    plan.complianceQr?.storagePath,
    ...plan.references.map((reference) => reference.storagePath)
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function filterReferenceStoragePathsForPrompt(
  plan: RoleAwareReferencePlan,
  _prompt: string,
  postTypeCode: string
): string[] {
  const alwaysInclude = [
    plan.brandLogo?.storagePath,
    plan.complianceQr?.storagePath
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const heroReference: string[] = [];
  const secondaryReference: string[] = [];
  const pushHero = (value: string | null | undefined) => {
    if (!value || heroReference.includes(value)) {
      return;
    }

    heroReference.push(value);
  };

  const pushSecondary = (value: string | null | undefined) => {
    if (!value || heroReference.includes(value) || secondaryReference.includes(value)) {
      return;
    }

    secondaryReference.push(value);
  };
  const pushProjectTruthFallback = () => {
    pushHero(getProjectTruthFallbackReference(plan));
  };

  if (postTypeCode === "amenity-spotlight") {
    if (plan.amenityAnchor?.storagePath) {
      pushHero(plan.amenityAnchor.storagePath);
    }
  } else if (
    postTypeCode === "construction-update" ||
    postTypeCode === "ad" ||
    postTypeCode === "project-launch" ||
    postTypeCode === "site-visit-invite" ||
    postTypeCode === "location-advantage"
  ) {
    pushProjectTruthFallback();
  } else if (postTypeCode === "sample-flat-showcase") {
    pushProjectTruthFallback();
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "testimonial") {
    if (plan.primaryAnchor?.storagePath) {
      pushHero(plan.primaryAnchor.storagePath);
    } else if (plan.projectAnchor?.storagePath) {
      pushHero(plan.projectAnchor.storagePath);
    }
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else if (postTypeCode === "festive-greeting") {
    pushSecondary(plan.primaryAnchor?.storagePath);
    if (secondaryReference.length === 0) {
      pushSecondary(plan.references[0]?.storagePath);
    }
  } else {
    if (plan.amenityAnchor?.storagePath) {
      pushHero(plan.amenityAnchor.storagePath);
    } else if (plan.projectAnchor?.storagePath) {
      pushHero(plan.projectAnchor.storagePath);
    } else {
      pushHero(plan.references[0]?.storagePath);
    }
  }

  return [...heroReference, ...secondaryReference.slice(0, 1), ...alwaysInclude];
}

export function buildV2RoleAwarePrompt(
  basePrompt: string,
  plan: RoleAwareReferencePlan,
  mode: "seed" | "final",
  postTypeCode?: string
) {
  const roleLines: string[] = [];
  const resolvedPostTypeCode = postTypeCode ?? "default";
  const attachedReferencePaths = filterReferenceStoragePathsForPrompt(plan, basePrompt, resolvedPostTypeCode);
  const heroReferencePaths = getHeroReferenceForPostType(plan, resolvedPostTypeCode);
  const primaryReferencePath = heroReferencePaths[0];
  const heroAsset = primaryReferencePath ? getAssetForPath(plan, primaryReferencePath) : null;
  const attachedReferenceCount = attachedReferencePaths.length;
  const projectReferenceAttached = Boolean(
    plan.projectAnchor?.storagePath && attachedReferencePaths.includes(plan.projectAnchor.storagePath)
  );

  if (heroAsset?.role === "amenity_image") {
    roleLines.push(
      "Use the amenity as the hero subject. Preserve its function, spatial cues, materiality, and lifestyle context. Do not switch to a different facility or amenity type."
    );
  } else if (heroAsset?.role === "project_image") {
    roleLines.push(
      "Use the project building as the primary reference. Preserve its tower identity, facade rhythm, massing, proportions, and overall silhouette."
    );
  } else if (heroAsset?.role === "reference") {
    roleLines.push(
      "Use the supplied reference image as the primary truth anchor. Preserve the visible architecture, scene identity, and real project cues."
    );
  }

  if (attachedReferenceCount > 1 && primaryReferencePath) {
    roleLines.push(
      "Treat the first attached image as the primary truth anchor. Use any additional attached assets only as supporting context or exact brand/compliance elements, never as the replacement hero subject."
    );
  }

  if (postTypeCode === "amenity-spotlight" && !plan.amenityAnchor && plan.projectAnchor) {
    roleLines.push(
      "No exact amenity reference image was supplied for the requested facility. Use the project reference only for project identity and brand-truth context."
    );
    roleLines.push(
      "Do not substitute a different amenity, facility, park, lawn, pool, or plaza from any reference image."
    );
  } else if (plan.projectAnchor && plan.amenityAnchor && projectReferenceAttached) {
    roleLines.push(
      "Use the amenity reference for the hero subject and use the project reference only for project identity context."
    );
  } else if (plan.projectAnchor && plan.amenityAnchor) {
    roleLines.push(
      "Preserve the supplied project identity and do not switch to a different development while building the amenity-led composition."
    );
  } else if (plan.projectAnchor && !heroAsset) {
    roleLines.push(
      `Use the project building reference (${plan.projectAnchor.label}) for project identity and architectural context.`
    );
  }

  if (plan.brandLogo) {
    roleLines.push(
      `Use the brand logo (${plan.brandLogo.label}) as a small footer signature element. Match the exact lockup, shape, colors, and spacing.`
    );
  }

  if (plan.complianceQr) {
    roleLines.push(
      `Use the supplied compliance QR (${plan.complianceQr.label}) exactly as provided. Keep it legible and subordinate.`
    );
  }

  roleLines.push(
    mode === "seed"
      ? "One complete style direction only; no grid, collage, contact sheet, or multiple poster options."
      : "One finished design only; keep text minimal, clean, and legible."
  );

  if (plan.projectAnchor) {
    roleLines.push("Do not replace the supplied project with a different generic building.");
  }

  return `${basePrompt} ${roleLines.join(" ")}`.trim();
}

function getHeroReferenceForPostType(plan: RoleAwareReferencePlan, postTypeCode: string): string[] {
  if (postTypeCode === "amenity-spotlight") {
    return plan.amenityAnchor?.storagePath ? [plan.amenityAnchor.storagePath] : [];
  }

  const fallbackProjectTruth = getProjectTruthFallbackReference(plan);

  return [
    plan.projectAnchor?.storagePath,
    plan.amenityAnchor?.storagePath,
    fallbackProjectTruth,
    plan.primaryAnchor?.storagePath
  ].filter((value, index, values): value is string => typeof value === "string" && value.length > 0 && values.indexOf(value) === index);
}

function getAssetForPath(plan: RoleAwareReferencePlan, storagePath: string): { role: string; label: string } | null {
  if (plan.primaryAnchor?.storagePath === storagePath) {
    return { role: plan.primaryAnchor.role, label: plan.primaryAnchor.label };
  }
  if (plan.sourcePost?.storagePath === storagePath) {
    return { role: plan.sourcePost.role, label: plan.sourcePost.label };
  }
  if (plan.amenityAnchor?.storagePath === storagePath) {
    return { role: "amenity_image", label: plan.amenityAnchor.label };
  }
  if (plan.projectAnchor?.storagePath === storagePath) {
    return { role: "project_image", label: plan.projectAnchor.label };
  }
  if (plan.brandLogo?.storagePath === storagePath) {
    return { role: "brand_logo", label: plan.brandLogo.label };
  }
  if (plan.complianceQr?.storagePath === storagePath) {
    return { role: "rera_qr", label: plan.complianceQr.label };
  }

  const reference = plan.references.find((entry) => entry.storagePath === storagePath);
  return reference ? { role: reference.role, label: reference.label } : null;
}

function getProjectTruthFallbackReference(plan: RoleAwareReferencePlan) {
  if (plan.projectAnchor?.storagePath) {
    return plan.projectAnchor.storagePath;
  }

  if (plan.sourcePost?.storagePath) {
    return plan.sourcePost.storagePath;
  }

  if (plan.primaryAnchor?.role === "source_post") {
    return plan.primaryAnchor.storagePath;
  }

  return plan.references[0]?.storagePath ?? null;
}
