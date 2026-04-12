import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { env } from "./lib/config.js";
import { registerAuth } from "./plugins/auth.js";
import { registerBrandRoutes } from "./routes/brands.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerCreativeRoutes } from "./routes/creative.js";
import { registerDeliverableRoutes } from "./routes/deliverables.js";
import { registerDomainRoutes } from "./routes/domain.js";
import { registerFalRoutes } from "./routes/fal.js";
import { registerPlanningRoutes } from "./routes/planning.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerWorkRoutes } from "./routes/work.js";

export async function buildApp() {
  const maxUploadFileBytes = env.API_UPLOAD_MAX_FILE_MB * 1024 * 1024;
  const app = Fastify({
    logger: true
  });

  const allowedOrigins = new Set([
    env.API_ORIGIN,
    ...(env.API_ORIGINS ?? []),
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);

  const allowedOriginPatterns = [
    /^https:\/\/[a-z0-9-]+\.netlify\.app$/i,
    /^https:\/\/[a-z0-9-]+\.netlify\.live$/i
  ];

  await app.register(sensible);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }

      try {
        const normalizedOrigin = new URL(origin).origin;
        const isAllowed =
          allowedOrigins.has(normalizedOrigin) ||
          allowedOriginPatterns.some((pattern) => pattern.test(normalizedOrigin));

        cb(null, isAllowed);
      } catch {
        cb(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  await app.register(multipart, {
    limits: {
      fileSize: maxUploadFileBytes
    }
  });
  await registerAuth(app);

  app.get("/health", async () => ({ ok: true }));

  await registerSessionRoutes(app);
  await registerBrandRoutes(app);
  await registerProjectRoutes(app);
  await registerDomainRoutes(app);
  await registerCampaignRoutes(app);
  await registerPlanningRoutes(app);
  await registerDeliverableRoutes(app);
  await registerWorkRoutes(app);
  await registerCreativeRoutes(app);
  await registerFalRoutes(app);

  return app;
}
