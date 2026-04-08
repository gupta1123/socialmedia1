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
  OPENROUTER_IMAGE_MODALITIES: optionalCsvList,
  OPENROUTER_IMAGE_SIZE: z.string().optional(),
  OPENROUTER_HTTP_REFERER: optionalUrl,
  OPENROUTER_X_TITLE: z.string().optional(),
  CREATIVE_DIRECTOR_MODE: z.enum(["auto", "mock", "agno"]).default("auto"),
  AGNO_PYTHON_BIN: z.string().default("python3"),
  AGNO_AGENT_SCRIPT: z.string().default("./agents/creative_director.py"),
  AGNO_OPENAI_TIMEOUT_SEC: z.coerce.number().positive().default(20),
  AGNO_OPENAI_MAX_RETRIES: z.coerce.number().min(0).default(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_BASE_URL: optionalUrl
});

export const env = EnvSchema.parse(process.env);
