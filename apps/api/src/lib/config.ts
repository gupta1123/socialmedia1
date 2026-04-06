import { config } from "dotenv";
import { z } from "zod";

config();

const optionalUrl = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  API_ORIGIN: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().default("creative-assets"),
  FAL_KEY: z.string().optional(),
  FAL_WEBHOOK_URL: z.string().url().optional(),
  FAL_STYLE_SEED_MODEL: z.string().default("fal-ai/nano-banana"),
  FAL_FINAL_MODEL: z.string().default("fal-ai/nano-banana/edit"),
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
