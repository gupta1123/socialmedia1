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
  const app = Fastify({
    logger: true
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowedOrigins = [
        ...env.API_ORIGIN.split(",").map(o => o.trim()),
        "http://localhost:3000",
        "http://127.0.0.1:3000"
      ];
      if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || allowedOrigins.includes("*")) {
        cb(null, true);
        return;
      }
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  await app.register(multipart);
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
