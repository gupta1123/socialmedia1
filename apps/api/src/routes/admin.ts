import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminAuditResponseSchema,
  AdminOpsSummarySchema,
  AdminOrgDetailSchema,
  AdminOrgListResponseSchema,
  AdminOverviewSchema,
  AdminPlatformAdminListResponseSchema,
  AdminPlatformAdminMutationResponseSchema,
  AdminPlatformAdminUpdateRequestSchema,
  AdminPlatformAdminUpsertRequestSchema,
  WorkspaceCreditLedgerResponseSchema
} from "@image-lab/contracts";
import { z } from "zod";
import { assertPlatformAdmin } from "../lib/credits.js";
import {
  getAdminOpsSummary,
  getAdminOrgDetail,
  getAdminOverview,
  listAdminAuditEntries,
  listAdminGlobalCreditLedger,
  listAdminOrgs,
  listPlatformAdmins,
  setPlatformAdminActive,
  upsertPlatformAdminByEmail
} from "../lib/super-admin.js";

const AdminOrgsQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().uuid()
});

const PlatformAdminParamsSchema = z.object({
  userId: z.string().uuid()
});

const AdminAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0)
});

const AdminGlobalCreditLedgerQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0)
});

async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  const viewer = request.viewer;
  if (!viewer) {
    reply.unauthorized();
    return null;
  }

  try {
    await assertPlatformAdmin(viewer, request.log);
    return viewer;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Super admin")) {
      reply.forbidden(error.message);
      return null;
    }

    throw error;
  }
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/overview", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const result = await getAdminOverview();
    return AdminOverviewSchema.parse(result);
  });

  app.get("/api/admin/orgs", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const query = AdminOrgsQuerySchema.parse(request.query ?? {});
    const result = await listAdminOrgs({
      ...(query.query ? { query: query.query } : {}),
      limit: query.limit,
      offset: query.offset
    });
    return AdminOrgListResponseSchema.parse(result);
  });

  app.get("/api/admin/orgs/:workspaceId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    try {
      const result = await getAdminOrgDetail(workspaceId);
      return AdminOrgDetailSchema.parse(result);
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("workspace not found")) {
        return reply.notFound(error.message);
      }
      throw error;
    }
  });

  app.get("/api/admin/credits/ledger", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const query = AdminGlobalCreditLedgerQuerySchema.parse(request.query ?? {});
    const items = await listAdminGlobalCreditLedger({
      limit: query.limit,
      offset: query.offset,
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {})
    });

    return WorkspaceCreditLedgerResponseSchema.parse({
      items,
      limit: query.limit,
      offset: query.offset
    });
  });

  app.get("/api/admin/platform-admins", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const items = await listPlatformAdmins();
    return AdminPlatformAdminListResponseSchema.parse({ items });
  });

  app.post("/api/admin/platform-admins", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const body = AdminPlatformAdminUpsertRequestSchema.parse(request.body ?? {});
    const item = await upsertPlatformAdminByEmail({
      actorUserId: viewer.userId,
      email: body.email,
      ...(typeof body.active === "boolean" ? { active: body.active } : {})
    });

    return AdminPlatformAdminMutationResponseSchema.parse({
      status: "ok",
      item
    });
  });

  app.patch("/api/admin/platform-admins/:userId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const { userId } = PlatformAdminParamsSchema.parse(request.params ?? {});
    const body = AdminPlatformAdminUpdateRequestSchema.parse(request.body ?? {});

    try {
      const item = await setPlatformAdminActive({
        actorUserId: viewer.userId,
        userId,
        active: body.active
      });

      return AdminPlatformAdminMutationResponseSchema.parse({
        status: "ok",
        item
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("last active super admin")) {
        return reply.badRequest(error.message);
      }

      if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
        return reply.notFound(error.message);
      }

      throw error;
    }
  });

  app.get("/api/admin/ops", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const result = await getAdminOpsSummary();
    return AdminOpsSummarySchema.parse(result);
  });

  app.get("/api/admin/audit", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = await requirePlatformAdmin(request, reply);
    if (!viewer) {
      return;
    }

    const query = AdminAuditQuerySchema.parse(request.query ?? {});
    const items = await listAdminAuditEntries(query.limit, query.offset);

    return AdminAuditResponseSchema.parse({
      items,
      limit: query.limit,
      offset: query.offset
    });
  });
}
