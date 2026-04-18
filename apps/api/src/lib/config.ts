import { config } from "dotenv";
import { z } from "zod";

config();

const optionalUrl = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const optionalUrlList = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const urls = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return urls.length > 0 ? urls : undefined;
}, z.array(z.string().url()).optional());

const optionalCsvList = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.length > 0 ? entries : undefined;
}, z.array(z.string()).optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  API_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_ORIGINS: optionalUrlList,
  API_UPLOAD_MAX_FILE_MB: z.coerce.number().int().min(1).max(100).default(25),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("creative-assets"),
  IMAGE_GENERATION_PROVIDER: z.enum(["fal", "openrouter"]).default("fal"),
  FAL_KEY: z.string().optional(),
  FAL_WEBHOOK_URL: z.string().url().optional(),
  FAL_STYLE_SEED_MODEL: z.string().default("fal-ai/nano-banana"),
  FAL_FINAL_MODEL: z.string().default("fal-ai/nano-banana/edit"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_STYLE_SEED_MODEL: z.string().default("google/gemini-2.5-flash-image"),
  OPENROUTER_FINAL_MODEL: z.string().default("google/gemini-2.5-flash-image"),
  OPENROUTER_IMAGE_EDIT_MODEL: z.string().default("google/gemini-2.5-flash-image"),
  OPENROUTER_PROMPT_COMPOSER_MODEL: z.string().default("google/gemini-2.5-flash"),
  OPENROUTER_IMAGE_MODALITIES: optionalCsvList,
  OPENROUTER_IMAGE_SIZE: z.string().optional(),
  OPENROUTER_HTTP_REFERER: optionalUrl,
  OPENROUTER_X_TITLE: z.string().optional(),
  AI_EDIT_FLOW: z.enum(["mask", "direct"]).default("mask"),
  AI_EDIT_DIRECTOR_MODE: z.enum(["auto", "mock", "agno"]).default("auto"),
  AI_EDIT_DIRECTOR_TRANSPORT: z.enum(["server", "worker"]).default("worker"),
  AI_EDIT_DIRECTOR_SCRIPT: z.string().default("./agents/ai_edit_director.py"),
  AI_EDIT_DIRECTOR_SERVER_URL: z.string().url().default("http://127.0.0.1:8787/api/image-edit-plan"),
  AI_EDIT_DIRECTOR_SERVER_TIMEOUT_SEC: z.coerce.number().positive().default(60),
  AI_EDIT_PRIMARY_MODEL: z.string().default("bria/fibo-edit/edit"),
  AI_EDIT_DIRECT_MODEL: z.string().default("fal-ai/nano-banana/edit"),
  AI_EDIT_EXPERIMENTAL_MODEL: z.string().default("gpt-image-1.5"),
  CREATIVE_DIRECTOR_MODE: z.enum(["auto", "mock", "agno"]).default("auto"),
  CREATIVE_DIRECTOR_V2_MODE: z.enum(["auto", "mock", "agno"]).default("auto"),
  CREATIVE_DIRECTOR_V2_TRANSPORT: z.enum(["server", "worker"]).default("worker"),
  CREATIVE_STYLE_FLOW_VERSION: z.enum(["v1", "v2"]).default("v1"),
  CREATIVE_STYLE_VARIATION_COUNT: z.coerce.number().int().min(1).max(6).default(3),
  CREDITS_STYLE_SEED_PER_IMAGE: z.coerce.number().int().min(0).default(1),
  CREDITS_FINAL_PER_IMAGE: z.coerce.number().int().min(0).default(1),
  CREDITS_IMAGE_EDIT_PER_REQUEST: z.coerce.number().int().min(0).default(1),
  AGNO_PYTHON_BIN: z.string().default("python3"),
  AGNO_AGENT_SCRIPT: z.string().default("./agents/creative_director.py"),
  AGNO_AGENT_V2_SCRIPT: z.string().default("./agents/creative_director_v2.py"),
  AGNO_AGENT_V2_SERVER_URL: z.string().url().default("http://127.0.0.1:8787/api/compile-v2"),
  AGNO_AGENT_V2_SERVER_TIMEOUT_SEC: z.coerce.number().positive().default(180),
  AGNO_OPENAI_TIMEOUT_SEC: z.coerce.number().positive().default(20),
  AGNO_OPENAI_MAX_RETRIES: z.coerce.number().min(0).default(1),
  AGNO_RESTRICT_TO_AMENITIES_WITH_IMAGES: z.enum(["0", "1"]).default("0"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_BASE_URL: optionalUrl
});

export const env = EnvSchema.parse(process.env);
