import type { CreativeBrief } from "@image-lab/contracts";
import { env } from "./config.js";

type PromptLocalizationInput = {
  brandName: string;
  projectName?: string | null | undefined;
  brief: CreativeBrief;
};

type PromptLike = {
  promptSummary?: string;
  seedPrompt?: string;
  finalPrompt?: string;
  variations?: Array<{
    id?: string;
    title?: string;
    strategy?: string;
    seedPrompt?: string;
    finalPrompt?: string;
    resolvedConstraints?: Record<string, unknown>;
    compilerTrace?: Record<string, unknown>;
  }>;
  compilerTrace?: Record<string, unknown>;
};

type PromptItem = {
  key: string;
  prompt: string;
};

type CopyFields = {
  headline?: string;
  subheadline?: string;
  cta?: string;
};

type CopyItem = {
  key: string;
  copy: CopyFields;
};

const COPY_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali"
};

type CreativeV3PromptLike = {
  status?: string;
  variants?: Array<Record<string, unknown>>;
  debug?: Record<string, unknown>;
};

export async function localizePromptPackageCopy<T extends PromptLike>(
  compiled: T,
  input: PromptLocalizationInput
): Promise<T> {
  const targetLanguageCode = input.brief.copyLanguage ?? "en";
  if (input.brief.copyMode !== "auto" || targetLanguageCode === "en") {
    return withPromptLocalizationTrace(compiled, {
      applied: false,
      reason: input.brief.copyMode !== "auto" ? "manual-copy" : "english",
      targetLanguage: targetLanguageCode
    });
  }

  if (!env.OPENROUTER_API_KEY) {
    return withPromptLocalizationTrace(compiled, {
      applied: false,
      reason: "missing-openrouter-api-key",
      targetLanguage: targetLanguageCode
    });
  }

  const promptItems = collectPromptItems(compiled);
  if (promptItems.length === 0) {
    return withPromptLocalizationTrace(compiled, {
      applied: false,
      reason: "no-prompts",
      targetLanguage: targetLanguageCode
    });
  }

  const targetLanguage = COPY_LANGUAGE_LABELS[targetLanguageCode] ?? targetLanguageCode;
  const revisedPrompts = await translatePromptBatch({
    targetLanguage,
    promptItems,
    brandName: input.brandName,
    projectName: input.projectName ?? null
  });

  const localized = applyPromptTranslations(compiled, revisedPrompts);
  return withPromptLocalizationTrace(localized, {
    applied: true,
    targetLanguage: targetLanguageCode,
    targetLanguageName: targetLanguage,
    model: env.OPENROUTER_PROMPT_COMPOSER_MODEL,
    promptCount: promptItems.length
  });
}

export async function localizeCreativeV3PromptCopy<T extends CreativeV3PromptLike>(
  compiled: T,
  input: {
    targetLanguageCode?: string | null;
    copyMode?: string | null;
    brandName: string;
    projectName?: string | null;
  }
): Promise<T> {
  const targetLanguageCode = input.targetLanguageCode ?? "en";
  if (input.copyMode !== "auto" || targetLanguageCode === "en") {
    return withCreativeV3PromptLocalizationTrace(compiled, {
      applied: false,
      reason: input.copyMode !== "auto" ? "manual-copy" : "english",
      targetLanguage: targetLanguageCode
    });
  }

  if (!env.OPENROUTER_API_KEY) {
    return withCreativeV3PromptLocalizationTrace(compiled, {
      applied: false,
      reason: "missing-openrouter-api-key",
      targetLanguage: targetLanguageCode
    });
  }

  const copyItems = collectCreativeV3CopyItems(compiled);
  const promptItems = collectCreativeV3PromptItems(compiled);
  if (promptItems.length === 0 && copyItems.length === 0) {
    return withCreativeV3PromptLocalizationTrace(compiled, {
      applied: false,
      reason: "no-prompts-or-copy",
      targetLanguage: targetLanguageCode
    });
  }

  const targetLanguage = COPY_LANGUAGE_LABELS[targetLanguageCode] ?? targetLanguageCode;
  const revisedCopies = copyItems.length > 0
    ? await translateCopyBatch({
        targetLanguage,
        copyItems,
        brandName: input.brandName,
        projectName: input.projectName ?? null
      })
    : new Map<string, CopyFields>();
  let localized = applyCreativeV3CopyTranslations(compiled, revisedCopies);

  // Do not ask the model to rewrite full provider prompts for Creative V3.
  // The canonical copy fields are localized above; final prompts are then rebuilt
  // from those fields. This prevents duplicate English/Hindi text blocks and keeps
  // visual instructions, logo instructions, and grounding in stable English.
  const localizedPromptItems = collectCreativeV3PromptItems(localized);
  localized = injectCreativeV3ExactLocalizedCopy(localized);
  return withCreativeV3PromptLocalizationTrace(localized, {
    applied: true,
    targetLanguage: targetLanguageCode,
    targetLanguageName: targetLanguage,
    model: env.OPENROUTER_PROMPT_COMPOSER_MODEL,
    promptCount: localizedPromptItems.length,
    copyCount: copyItems.length
  });
}

function collectPromptItems(compiled: PromptLike): PromptItem[] {
  const items: PromptItem[] = [];
  addPromptItem(items, "root.seedPrompt", compiled.seedPrompt);
  addPromptItem(items, "root.finalPrompt", compiled.finalPrompt);

  for (const [index, variation] of (compiled.variations ?? []).entries()) {
    addPromptItem(items, `variations.${index}.seedPrompt`, variation.seedPrompt);
    addPromptItem(items, `variations.${index}.finalPrompt`, variation.finalPrompt);
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const identity = `${item.key}\n${item.prompt}`;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function collectCreativeV3CopyItems(compiled: CreativeV3PromptLike): CopyItem[] {
  const items: CopyItem[] = [];
  for (const [index, variant] of (compiled.variants ?? []).entries()) {
    const copy = readCopyFields(variant.copy) ?? readCopyFields(variant.copy_contract);
    if (copy && hasAnyCopy(copy)) {
      items.push({ key: `variants.${index}.copy`, copy });
    }
  }
  return items;
}

function collectCreativeV3PromptItems(compiled: CreativeV3PromptLike): PromptItem[] {
  const items: PromptItem[] = [];
  for (const [index, variant] of (compiled.variants ?? []).entries()) {
    addPromptItem(items, `variants.${index}.prompt`, variant.prompt);
    addPromptItem(items, `variants.${index}.compiled_prompt`, variant.compiled_prompt);
    const renderPackage = isRecord(variant.render_package) ? variant.render_package : null;
    if (renderPackage) {
      addPromptItem(items, `variants.${index}.render_package.prompt`, renderPackage.prompt);
      addPromptItem(items, `variants.${index}.render_package.compiled_prompt`, renderPackage.compiled_prompt);
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const identity = `${item.key}\n${item.prompt}`;
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

function addPromptItem(items: PromptItem[], key: string, value: unknown) {
  if (typeof value !== "string") {
    return;
  }
  const prompt = value.trim();
  if (prompt.length === 0) {
    return;
  }
  items.push({ key, prompt });
}

async function translateCopyBatch(params: {
  targetLanguage: string;
  copyItems: CopyItem[];
  brandName: string;
  projectName?: string | null;
}) {
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model: env.OPENROUTER_PROMPT_COMPOSER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You translate only visible on-poster marketing copy for real-estate social creatives.",
            "Return strict JSON only with shape: {\"copies\":[{\"key\":\"...\",\"copy\":{\"headline\":\"...\",\"subheadline\":\"...\",\"cta\":\"...\"}}]}.",
            "Translate the human marketing copy into the requested language.",
            "Preserve brand names, project names, logo text, legal names, URLs, email addresses, phone numbers, RERA/MahaRERA numbers, QR references, prices, currency symbols, numeric values, and BHK labels exactly.",
            "Do not translate, modify, or invent logo content. Do not add new facts. Do not add new fields.",
            "If a field is empty, keep it empty. If a field is only a protected brand/project name, keep it unchanged.",
            "Use natural, polished advertising language in the target language, not literal awkward translation."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            targetLanguage: params.targetLanguage,
            preserve: {
              brandName: params.brandName,
              projectName: params.projectName,
              protectedTerms: [
                params.brandName,
                params.projectName,
                "RERA",
                "MahaRERA",
                "QR",
                "BHK",
                "WhatsApp",
                "https://",
                "http://"
              ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            },
            copies: params.copyItems
          })
        }
      ]
    })
  });

  const raw = await response.text();
  const parsed = raw.length > 0 ? safeParseJson(raw) : null;
  if (!response.ok) {
    throw new Error(`Copy localization failed (${response.status})`);
  }

  const content = extractOpenRouterTextContent(parsed);
  const json = content ? safeParseJson(content) : null;
  const copies = isRecord(json) && Array.isArray(json.copies) ? json.copies : [];
  const result = new Map<string, CopyFields>();
  for (const item of copies) {
    if (!isRecord(item) || typeof item.key !== "string" || !isRecord(item.copy)) {
      continue;
    }
    const copy = readCopyFields(item.copy);
    if (copy && hasAnyCopy(copy)) {
      result.set(item.key, copy);
    }
  }

  if (params.copyItems.length > 0 && result.size === 0) {
    throw new Error("Copy localization returned no revised copy.");
  }

  return result;
}

async function translatePromptBatch(params: {
  targetLanguage: string;
  promptItems: PromptItem[];
  brandName: string;
  projectName?: string | null;
}) {
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify({
      model: env.OPENROUTER_PROMPT_COMPOSER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You revise image-generation prompts for multilingual real-estate social posters.",
            "Your job is NOT to translate the whole prompt. Your job is to make the intended on-poster copy render in the requested language while preserving the visual prompt.",
            "Visible copy means explicit on-image text, headline, commercial hook, support line, CTA, or quoted poster text. Translate those visible-copy phrases into the requested language.",
            "Non-visible context means project facts, location context, strategy, asset truth, architecture, layout, style, mood, guardrails, negative prompt, and internal instructions. Keep non-visible context in English and never convert it into poster copy.",
            "Do not let context lines such as 'Actual location context', 'Project name', 'micro-market positioning', 'growth corridor', or guardrails become visible text on the poster.",
            "When a price phrase is visible copy, translate human language around the number too. For Hindi, 'Starting price: ₹72 lakh onwards' should become a natural Hindi visible hook such as '₹72 लाख से शुरू'. Do not leave visible English labels like Starting price or onwards.",
            "Preserve project names, brand/developer names, logo text, logo lockups, text already on buildings/signage, numbers, prices, currency symbols, BHK labels, RERA numbers, phone numbers, website URLs, emails, QR references, asset references, architecture, layout, style, archetype, and grounding exactly.",
            "Do not add facts, remove facts, change claims, change project identity, change visual direction, add proof chips, add extra text blocks, or turn location facts into display copy.",
            "If the prompt requires visible copy, remove or rewrite negative-prompt terms that forbid text, words, letters, numbers, typography, or branding. Keep the negative prompt visual-quality focused, such as low quality, clutter, harsh lighting, distorted architecture.",
            "Prefer a final prompt that explicitly says: Visible on-poster copy must be in the requested language; do not render any other text.",
            "Return strict JSON only with shape: {\"prompts\":[{\"key\":\"...\",\"prompt\":\"...\"}]}."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            targetLanguage: params.targetLanguage,
            revisionGoal: [
              "Revise each full prompt in place.",
              "Only intended visible copy should change language.",
              "Keep all non-visible context/instructions in English.",
              "Make the prompt clearly instruct the image model not to render location context, strategy text, guardrails, or negative prompt words as poster text.",
              "Avoid negative-prompt conflicts that ban the required visible copy."
            ],
            preserve: {
              brandName: params.brandName,
              projectName: params.projectName,
              protectedTerms: [
                params.brandName,
                params.projectName,
                "RERA",
                "MahaRERA",
                "QR",
                "BHK",
                "WhatsApp",
                "website",
                "email",
                "phone"
              ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            },
            prompts: params.promptItems
          })
        }
      ]
    })
  });

  const raw = await response.text();
  const parsed = raw.length > 0 ? safeParseJson(raw) : null;
  if (!response.ok) {
    throw new Error(`Prompt localization failed (${response.status})`);
  }

  const content = extractOpenRouterTextContent(parsed);
  const json = content ? safeParseJson(content) : null;
  const prompts = isRecord(json) && Array.isArray(json.prompts) ? json.prompts : [];
  const result = new Map<string, string>();
  for (const item of prompts) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.prompt !== "string") {
      continue;
    }
    const prompt = item.prompt.trim();
    if (prompt.length > 0) {
      result.set(item.key, prompt);
    }
  }

  if (result.size === 0) {
    throw new Error("Prompt localization returned no revised prompts.");
  }

  return result;
}

function applyPromptTranslations<T extends PromptLike>(compiled: T, translations: Map<string, string>): T {
  const variations = (compiled.variations ?? []).map((variation, index) => ({
    ...variation,
    ...(translations.has(`variations.${index}.seedPrompt`)
      ? { seedPrompt: translations.get(`variations.${index}.seedPrompt`) }
      : {}),
    ...(translations.has(`variations.${index}.finalPrompt`)
      ? { finalPrompt: translations.get(`variations.${index}.finalPrompt`) }
      : {})
  }));

  return {
    ...compiled,
    ...(translations.has("root.seedPrompt") ? { seedPrompt: translations.get("root.seedPrompt") } : {}),
    ...(translations.has("root.finalPrompt") ? { finalPrompt: translations.get("root.finalPrompt") } : {}),
    variations
  };
}

function applyCreativeV3CopyTranslations<T extends CreativeV3PromptLike>(compiled: T, translations: Map<string, CopyFields>): T {
  if (translations.size === 0) {
    return compiled;
  }
  const variants = (compiled.variants ?? []).map((variant, index) => {
    const translated = translations.get(`variants.${index}.copy`);
    if (!translated) {
      return variant;
    }
    const renderPackage = isRecord(variant.render_package) ? variant.render_package : null;
    const nextVariant: Record<string, unknown> = {
      ...variant,
      copy: translated,
      copy_contract: translated
    };
    if (renderPackage) {
      nextVariant.render_package = {
        ...renderPackage,
        exact_text_layers: translated
      };
    }
    return nextVariant;
  });

  return {
    ...compiled,
    variants
  };
}

function injectCreativeV3ExactLocalizedCopy<T extends CreativeV3PromptLike>(compiled: T): T {
  const variants = (compiled.variants ?? []).map((variant) => {
    const copy = readCopyFields(variant.copy) ?? readCopyFields(variant.copy_contract);
    if (!copy || !hasAnyCopy(copy)) {
      return variant;
    }
    const renderPackage = isRecord(variant.render_package) ? variant.render_package : null;
    const nextVariant: Record<string, unknown> = {
      ...variant,
      prompt: appendExactCopyInstruction(typeof variant.prompt === "string" ? variant.prompt : "", copy),
      compiled_prompt: appendExactCopyInstruction(typeof variant.compiled_prompt === "string" ? variant.compiled_prompt : "", copy),
    };
    if (renderPackage) {
      nextVariant.render_package = {
        ...renderPackage,
        prompt: appendExactCopyInstruction(typeof renderPackage.prompt === "string" ? renderPackage.prompt : "", copy),
        compiled_prompt: appendExactCopyInstruction(typeof renderPackage.compiled_prompt === "string" ? renderPackage.compiled_prompt : "", copy),
        provider_prompt: appendExactCopyInstruction(typeof renderPackage.provider_prompt === "string" ? renderPackage.provider_prompt : "", copy),
        exact_text_layers: copy
      };
    }
    return nextVariant;
  });

  return {
    ...compiled,
    variants
  };
}

function appendExactCopyInstruction(prompt: string, copy: CopyFields) {
  const clean = stripExistingExactCopyBlocks(prompt.trim());
  if (!clean) {
    return clean;
  }
  const lines = exactCopyLines(copy);
  if (lines.length === 0) {
    return clean;
  }
  const marker = "Render only this exact visible text:";
  const block = `${marker}\n${lines.join("\n")}\nDo not render any other readable poster text. Do not translate or alter logo text, URL, phone, email, RERA number, or brand mark.`;
  return `${clean}\n\n${block}`;
}

function stripExistingExactCopyBlocks(prompt: string) {
  let out = prompt;
  out = out.replace(/Render only this exact visible text:[\s\S]*?(?=(?:Logo instruction:|RERA QR production rule:|Construction visualization rule:|Brand-only festive rule:|$))/gi, "");
  out = out.replace(/\bHeadline\s*:\s*"[^"]*"\s*/gi, "");
  out = out.replace(/\bSubheadline\s*:\s*"[^"]*"\s*/gi, "");
  out = out.replace(/\bCTA(?:\/signature)?\s*:\s*"[^"]*"\s*/gi, "");
  out = out.replace(/Do not (?:add|render) any other readable[^.]*\.\s*/gi, "");
  out = out.replace(/Visible on-poster copy must be in [^.]*\.\s*/gi, "");
  out = out.replace(/Logo production rule:[^.]*post-generation compositing\.\s*/gi, "");
  return out.replace(/\s+/g, " ").trim();
}
function exactCopyLines(copy: CopyFields) {
  const lines: string[] = [];
  if (copy.headline?.trim()) lines.push(`Headline: "${copy.headline.trim()}"`);
  if (copy.subheadline?.trim()) lines.push(`Subheadline: "${copy.subheadline.trim()}"`);
  if (copy.cta?.trim()) lines.push(`CTA: "${copy.cta.trim()}"`);
  return lines;
}

function applyCreativeV3PromptTranslations<T extends CreativeV3PromptLike>(compiled: T, translations: Map<string, string>): T {
  const variants = (compiled.variants ?? []).map((variant, index) => {
    const renderPackage = isRecord(variant.render_package) ? variant.render_package : null;
    return {
      ...variant,
      ...(translations.has(`variants.${index}.prompt`) ? { prompt: translations.get(`variants.${index}.prompt`) } : {}),
      ...(translations.has(`variants.${index}.compiled_prompt`) ? { compiled_prompt: translations.get(`variants.${index}.compiled_prompt`) } : {}),
      ...(renderPackage
        ? {
            render_package: {
              ...renderPackage,
              ...(translations.has(`variants.${index}.render_package.prompt`)
                ? { prompt: translations.get(`variants.${index}.render_package.prompt`) }
                : {}),
              ...(translations.has(`variants.${index}.render_package.compiled_prompt`)
                ? { compiled_prompt: translations.get(`variants.${index}.render_package.compiled_prompt`) }
                : {})
            }
          }
        : {})
    };
  });

  return {
    ...compiled,
    variants
  };
}

function withPromptLocalizationTrace<T extends PromptLike>(compiled: T, trace: Record<string, unknown>): T {
  return {
    ...compiled,
    compilerTrace: {
      ...(compiled.compilerTrace ?? {}),
      promptLocalization: trace
    }
  };
}

function withCreativeV3PromptLocalizationTrace<T extends CreativeV3PromptLike>(compiled: T, trace: Record<string, unknown>): T {
  return {
    ...compiled,
    debug: {
      ...(compiled.debug ?? {}),
      promptLocalization: trace
    }
  };
}

function buildOpenRouterHeaders() {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json"
  };

  if (env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = env.OPENROUTER_HTTP_REFERER;
  }

  if (env.OPENROUTER_X_TITLE) {
    headers["X-Title"] = env.OPENROUTER_X_TITLE;
  }

  return headers;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractOpenRouterTextContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const content = choice.message.content;
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (isRecord(part) && typeof part.text === "string") {
          return part.text;
        }
      }
    }
  }

  return null;
}

function readCopyFields(value: unknown): CopyFields | null {
  if (!isRecord(value)) {
    return null;
  }
  const copy: CopyFields = {};
  if (typeof value.headline === "string") copy.headline = value.headline;
  if (typeof value.subheadline === "string") copy.subheadline = value.subheadline;
  if (typeof value.cta === "string") copy.cta = value.cta;
  return copy;
}

function hasAnyCopy(copy: CopyFields) {
  return Boolean(copy.headline?.trim() || copy.subheadline?.trim() || copy.cta?.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
