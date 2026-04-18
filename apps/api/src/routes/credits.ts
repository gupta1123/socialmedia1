import type { FastifyInstance } from "fastify";
import {
  AdminCreditAdjustRequestSchema,
  AdminCreditGrantRequestSchema,
  AdminCreditMutationResponseSchema,
  AdminCreditWorkspaceListResponseSchema,
  WorkspaceCreditLedgerResponseSchema,
  WorkspaceCreditWalletSchema
} from "@image-lab/contracts";
import { z } from "zod";
import { assertWorkspaceRole, getPrimaryWorkspace } from "../lib/repository.js";
import {
  adjustWorkspaceCredits,
  assertPlatformAdmin,
  getWorkspaceCreditWallet,
  grantWorkspaceCredits,
  isInsufficientWorkspaceCreditsError,
  listAdminCreditWorkspaces,
  listWorkspaceCreditLedger
} from "../lib/credits.js";

const CreditLedgerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

const AdminWorkspaceQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60)
});

const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().uuid()
});

export async function registerCreditRoutes(app: FastifyInstance) {
  app.get("/api/credits/wallet", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const wallet = await getWorkspaceCreditWallet(workspace.id);
    return WorkspaceCreditWalletSchema.parse(wallet);
  });

  app.get("/api/credits/ledger", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = CreditLedgerQuerySchema.parse(request.query ?? {});
    const items = await listWorkspaceCreditLedger(workspace.id, query.limit, query.offset);

    return WorkspaceCreditLedgerResponseSchema.parse({
      items,
      limit: query.limit,
      offset: query.offset
    });
  });

  app.get("/api/admin/credits/workspaces", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    try {
      await assertPlatformAdmin(viewer, request.log);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Super admin")) {
        return reply.forbidden(error.message);
      }

      throw error;
    }

    const query = AdminWorkspaceQuerySchema.parse(request.query ?? {});
    const items = await listAdminCreditWorkspaces({
      ...(query.query ? { query: query.query } : {}),
      limit: query.limit
    });

    return AdminCreditWorkspaceListResponseSchema.parse({ items });
  });

  app.get("/api/admin/credits/workspaces/:workspaceId/wallet", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    try {
      await assertPlatformAdmin(viewer, request.log);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Super admin")) {
        return reply.forbidden(error.message);
      }

      throw error;
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const wallet = await getWorkspaceCreditWallet(workspaceId);
    return WorkspaceCreditWalletSchema.parse(wallet);
  });

  app.get("/api/admin/credits/workspaces/:workspaceId/ledger", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    try {
      await assertPlatformAdmin(viewer, request.log);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Super admin")) {
        return reply.forbidden(error.message);
      }

      throw error;
    }

    const { workspaceId } = WorkspaceParamsSchema.parse(request.params);
    const query = CreditLedgerQuerySchema.parse(request.query ?? {});
    const items = await listWorkspaceCreditLedger(workspaceId, query.limit, query.offset);

    return WorkspaceCreditLedgerResponseSchema.parse({
      items,
      limit: query.limit,
      offset: query.offset
    });
  });

  app.post("/api/admin/credits/grant", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    try {
      await assertPlatformAdmin(viewer, request.log);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Super admin")) {
        return reply.forbidden(error.message);
      }

      throw error;
    }

    const body = AdminCreditGrantRequestSchema.parse(request.body);

    try {
      const result = await grantWorkspaceCredits({
        actorUserId: viewer.userId,
        input: body
      });

      return AdminCreditMutationResponseSchema.parse({
        status: "ok",
        wallet: result.wallet,
        entry: result.entry
      });
    } catch (error) {
      if (isInsufficientWorkspaceCreditsError(error)) {
        return reply.badRequest(error.message);
      }

      throw error;
    }
  });

  app.post("/api/admin/credits/adjust", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    try {
      await assertPlatformAdmin(viewer, request.log);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Super admin")) {
        return reply.forbidden(error.message);
      }

      throw error;
    }

    const body = AdminCreditAdjustRequestSchema.parse(request.body);

    try {
      const result = await adjustWorkspaceCredits({
        actorUserId: viewer.userId,
        input: body
      });

      return AdminCreditMutationResponseSchema.parse({
        status: "ok",
        wallet: result.wallet,
        entry: result.entry
      });
    } catch (error) {
      if (isInsufficientWorkspaceCreditsError(error)) {
        return reply.badRequest(error.message);
      }

      throw error;
    }
  });
}
