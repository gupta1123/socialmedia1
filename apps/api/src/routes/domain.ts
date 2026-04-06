import type { FastifyInstance } from "fastify";
import {
  BrandPersonaSchema,
  ChannelAccountSchema,
  ContentPillarSchema,
  CreateBrandPersonaSchema,
  CreateChannelAccountSchema,
  CreateContentPillarSchema,
  CreatePostingWindowSchema,
  PostingWindowSchema,
  UpdateBrandPersonaSchema,
  UpdateChannelAccountSchema,
  UpdateContentPillarSchema,
  UpdatePostingWindowSchema
} from "@image-lab/contracts";
import { assertWorkspaceRole, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import {
  getBrandPersona,
  getChannelAccount,
  getContentPillar,
  getPostingWindow,
  listBrandPersonas,
  listChannelAccounts,
  listContentPillars,
  listPostingWindows
} from "../lib/deliverables-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";

export async function registerDomainRoutes(app: FastifyInstance) {
  app.get("/api/brand-personas", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    const personas = await listBrandPersonas(workspace.id, query.brandId);
    return personas.map((persona) => BrandPersonaSchema.parse(persona));
  });

  app.post("/api/brand-personas", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateBrandPersonaSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const personaId = randomId();
    const { error } = await supabaseAdmin.from("brand_personas").insert({
      id: personaId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      name: body.name,
      description: body.description ?? null,
      attributes_json: body.attributesJson,
      active: body.active,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return BrandPersonaSchema.parse(await getBrandPersona(personaId));
  });

  app.patch("/api/brand-personas/:personaId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const persona = await getBrandPersona((request.params as { personaId: string }).personaId);
    const body = UpdateBrandPersonaSchema.parse(request.body);
    await assertWorkspaceRole(viewer, persona.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin
      .from("brand_personas")
      .update({
        name: body.name,
        description: body.description ?? null,
        attributes_json: body.attributesJson,
        active: body.active
      })
      .eq("id", persona.id);

    if (error) {
      throw error;
    }

    return BrandPersonaSchema.parse(await getBrandPersona(persona.id));
  });

  app.get("/api/content-pillars", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    const pillars = await listContentPillars(workspace.id, query.brandId);
    return pillars.map((pillar) => ContentPillarSchema.parse(pillar));
  });

  app.post("/api/content-pillars", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateContentPillarSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const pillarId = randomId();
    const { error } = await supabaseAdmin.from("content_pillars").insert({
      id: pillarId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      active: body.active,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return ContentPillarSchema.parse(await getContentPillar(pillarId));
  });

  app.patch("/api/content-pillars/:pillarId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const pillar = await getContentPillar((request.params as { pillarId: string }).pillarId);
    const body = UpdateContentPillarSchema.parse(request.body);
    await assertWorkspaceRole(viewer, pillar.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin
      .from("content_pillars")
      .update({
        code: body.code,
        name: body.name,
        description: body.description ?? null,
        active: body.active
      })
      .eq("id", pillar.id);

    if (error) {
      throw error;
    }

    return ContentPillarSchema.parse(await getContentPillar(pillar.id));
  });

  app.get("/api/channel-accounts", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    const accounts = await listChannelAccounts(workspace.id, query.brandId);
    return accounts.map((account) => ChannelAccountSchema.parse(account));
  });

  app.get("/api/posting-windows", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    const postingWindows = await listPostingWindows(workspace.id, query.brandId);
    return postingWindows.map((postingWindow) => PostingWindowSchema.parse(postingWindow));
  });

  app.post("/api/posting-windows", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreatePostingWindowSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);
    const duplicatePostingWindow = await findDuplicatePostingWindow(
      workspace.id,
      brand.id,
      body.channel,
      body.weekday,
      body.localTime
    );
    if (duplicatePostingWindow) {
      return reply.badRequest("This channel already has a slot at that day and time");
    }

    const postingWindowId = randomId();
    const { error } = await supabaseAdmin.from("posting_windows").insert({
      id: postingWindowId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      channel: body.channel,
      weekday: body.weekday,
      local_time: body.localTime,
      timezone: body.timezone ?? null,
      label: body.label ?? null,
      active: body.active,
      sort_order: body.sortOrder,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return PostingWindowSchema.parse(await getPostingWindow(postingWindowId));
  });

  app.patch("/api/posting-windows/:postingWindowId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const postingWindow = await getPostingWindow((request.params as { postingWindowId: string }).postingWindowId);
    const body = UpdatePostingWindowSchema.parse(request.body);
    await assertWorkspaceRole(viewer, postingWindow.workspaceId, ["owner", "admin", "editor"], request.log);
    const duplicatePostingWindow = await findDuplicatePostingWindow(
      postingWindow.workspaceId,
      postingWindow.brandId,
      body.channel,
      body.weekday,
      body.localTime,
      postingWindow.id
    );
    if (duplicatePostingWindow) {
      return reply.badRequest("This channel already has a slot at that day and time");
    }

    const { error } = await supabaseAdmin
      .from("posting_windows")
      .update({
        channel: body.channel,
        weekday: body.weekday,
        local_time: body.localTime,
        timezone: body.timezone ?? null,
        label: body.label ?? null,
        active: body.active,
        sort_order: body.sortOrder
      })
      .eq("id", postingWindow.id);

    if (error) {
      throw error;
    }

    return PostingWindowSchema.parse(await getPostingWindow(postingWindow.id));
  });

  app.delete("/api/posting-windows/:postingWindowId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const postingWindow = await getPostingWindow((request.params as { postingWindowId: string }).postingWindowId);
    await assertWorkspaceRole(viewer, postingWindow.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin.from("posting_windows").delete().eq("id", postingWindow.id);
    if (error) {
      throw error;
    }

    return reply.status(204).send();
  });

  app.post("/api/channel-accounts", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateChannelAccountSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const accountId = randomId();
    const { error } = await supabaseAdmin.from("channel_accounts").insert({
      id: accountId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      platform: body.platform,
      handle: body.handle,
      display_name: body.displayName ?? null,
      timezone: body.timezone ?? null,
      external_account_id: body.externalAccountId ?? null,
      config_json: body.configJson,
      active: body.active,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return ChannelAccountSchema.parse(await getChannelAccount(accountId));
  });

  app.patch("/api/channel-accounts/:accountId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const account = await getChannelAccount((request.params as { accountId: string }).accountId);
    const body = UpdateChannelAccountSchema.parse(request.body);
    await assertWorkspaceRole(viewer, account.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin
      .from("channel_accounts")
      .update({
        platform: body.platform,
        handle: body.handle,
        display_name: body.displayName ?? null,
        timezone: body.timezone ?? null,
        external_account_id: body.externalAccountId ?? null,
        config_json: body.configJson,
        active: body.active
      })
      .eq("id", account.id);

    if (error) {
      throw error;
    }

    return ChannelAccountSchema.parse(await getChannelAccount(account.id));
  });
}

async function findDuplicatePostingWindow(
  workspaceId: string,
  brandId: string,
  channel: string,
  weekday: string,
  localTime: string,
  excludeId?: string
) {
  const postingWindows = await listPostingWindows(workspaceId, brandId);
  const normalizedTime = normalizeLocalTime(localTime);
  return postingWindows.find(
    (postingWindow) =>
      postingWindow.id !== excludeId &&
      postingWindow.channel === channel &&
      postingWindow.weekday === weekday &&
      normalizeLocalTime(postingWindow.localTime) === normalizedTime
  );
}

function normalizeLocalTime(localTime: string) {
  return localTime.slice(0, 5);
}
