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

function withPromptLocalizationTrace<T extends PromptLike>(compiled: T, trace: Record<string, unknown>): T {
  return {
    ...compiled,
    compilerTrace: {
      ...(compiled.compilerTrace ?? {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
