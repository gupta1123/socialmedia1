import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify } from "jose";
import { env } from "../lib/config.js";
import type { AuthenticatedViewer } from "../lib/viewer.js";

declare module "fastify" {
  interface FastifyRequest {
    viewer?: AuthenticatedViewer;
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("viewer", undefined);

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const header = request.headers.authorization;

      if (!header?.startsWith("Bearer ")) {
        void reply.unauthorized("Missing bearer token");
        return;
      }

      const token = header.replace("Bearer ", "").trim();

      try {
        const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (typeof payload.sub !== "string") {
          throw new Error("JWT subject is missing");
        }

        request.viewer =
          typeof payload.email === "string"
            ? { userId: payload.sub, email: payload.email }
            : { userId: payload.sub };
      } catch (error) {
        request.log.warn({ error }, "authentication failed");
        void reply.unauthorized("Invalid session");
      }
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

export const registerAuth = fp(authPlugin);
