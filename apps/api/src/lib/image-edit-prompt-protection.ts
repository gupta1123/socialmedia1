type ProtectedImageEditPermissions = {
  buildingTruth: boolean;
  brandMarks: boolean;
  textAndCompliance: boolean;
};

const CHANGE_ACTION_PATTERN =
  /\b(?:add|alter|change|color|colour|complete|delete|edit|enlarge|erase|finish|hide|make|modernize|modify|move|redesign|rebrand|recolor|remove|replace|resize|rework|shrink|swap|update)\b/i;
const PROTECTIVE_NEGATION_PATTERN =
  /\b(?:avoid|do not|don't|dont|keep|leave|must not|never|no|preserve|same|should not|unchanged|without)\b/i;
const BUILDING_TRUTH_TARGET_PATTERN =
  /\b(?:architecture|balcon(?:y|ies)|beam|building|column|concrete|construction|crane|elevation|exterior|facade|floor|floors|glass|material|paint|podium|scaffold(?:ing)?|site|skyline|slab|stories|storey|structure|terrace|tower|window|windows)\b/i;
const BRAND_MARK_TARGET_PATTERN =
  /\b(?:brand|brandmark|emblem|logo|mark|monogram|watermark|wordmark)\b/i;
const TEXT_AND_COMPLIANCE_TARGET_PATTERN =
  /\b(?:address|caption|compliance|contact|copy|cta|disclaimer|email|headline|phone|qr|rera|registration|tagline|text|url|website)\b/i;
const GLOBAL_LAYOUT_TARGET_PATTERN =
  /\b(?:composition|crop|layout|margin|negative space|position|reframe|resize|room|scale|space|spacing|zoom)\b/i;

export function detectProtectedImageEditPermissions(prompt: string): ProtectedImageEditPermissions {
  return {
    buildingTruth: hasExplicitProtectedChangeIntent(prompt, BUILDING_TRUTH_TARGET_PATTERN),
    brandMarks: hasExplicitProtectedChangeIntent(prompt, BRAND_MARK_TARGET_PATTERN),
    textAndCompliance: hasExplicitProtectedChangeIntent(prompt, TEXT_AND_COMPLIANCE_TARGET_PATTERN)
  };
}

export function buildProtectedImageEditPrompt(prompt: string) {
  const normalizedPrompt = normalizeUserPrompt(prompt);
  const permissions = detectProtectedImageEditPermissions(normalizedPrompt);

  return [
    "User edit request:",
    normalizedPrompt,
    "",
    "Protected edit rules:",
    "Treat the input image as a locked source document, not a loose inspiration reference. Apply only the requested edit as a localized in-place change.",
    "Do not add optional beautification, redesign, cleanup, layout changes, camera changes, perspective changes, crop changes, zoom changes, or extra creative interpretation.",
    "Canvas and composition lock: preserve the exact canvas size, aspect ratio, framing, camera viewpoint, subject scale, object positions, and empty-space distribution unless the user explicitly requests one of those exact layout changes.",
    permissions.buildingTruth
      ? "Building/elevation truth: the user requested a building-related change. Change only the exact building, elevation, facade, construction, or site detail named in the request; preserve all other architecture, floor count, windows, balconies, construction progress, materials, paint color, skyline, and site context."
      : "Building/elevation truth: not requested. Do not change, redraw, replace, upscale, downscale, stretch, compress, straighten, complete, beautify, modernize, re-angle, reframe, or relocate the building. Preserve architecture, elevation, facade, floor count, windows, balconies, construction progress, cranes, scaffolding, materials, paint color, skyline, shadows, and site context exactly.",
    permissions.brandMarks
      ? "Logo/brand marks: the user requested a brand-related change. Change only the exact logo or brand mark detail named in the request; preserve all other logos, wordmarks, watermarks, brand typography, placement, shape, and color."
      : "Logo/brand marks: not requested. Do not remove, replace, redraw, distort, recolor, move, upscale, or simplify any logo, wordmark, watermark, brand mark, or brand typography.",
    permissions.textAndCompliance
      ? "Text/compliance: the user requested a text or compliance change. Change only the exact text, RERA, QR, compliance, contact, CTA, or disclaimer item named in the request; preserve all other readable text exactly."
      : "Text/compliance: not requested. Do not change, remove, redraw, translate, hallucinate, or distort RERA details, QR codes, compliance blocks, disclaimers, phone numbers, emails, websites, CTAs, headlines, captions, or any existing readable text.",
    GLOBAL_LAYOUT_TARGET_PATTERN.test(normalizedPrompt)
      ? "Layout-related request: if the user asked for spacing, size, crop, position, or layout changes, apply that change only to the explicitly named editable non-building element. Do not resize, move, crop, reframe, or distort the building to make room."
      : "Layout-related request: not requested. Do not move, resize, crop, reframe, or rescale any major subject to accommodate the edit.",
    "If the edit cannot be done without changing protected building truth, logos, compliance/text, or global composition, leave those protected areas unchanged and apply only the safe portion of the request.",
    "If the user request is ambiguous, keep protected building truth, logos, and compliance/text unchanged. Never invent a more complete, premium, fantasy, cleaner, taller, shorter, wider, narrower, or different building."
  ].join("\n");
}

function normalizeUserPrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

function hasExplicitProtectedChangeIntent(prompt: string, targetPattern: RegExp) {
  const clauses = normalizeUserPrompt(prompt)
    .toLowerCase()
    .split(/(?:[.;!?\n,]+|\s+\bbut\b\s+|\s+\bthen\b\s+|\s+\band then\b\s+)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);

  return clauses.some(
    (clause) =>
      targetPattern.test(clause) &&
      CHANGE_ACTION_PATTERN.test(clause) &&
      !PROTECTIVE_NEGATION_PATTERN.test(clause)
  );
}
