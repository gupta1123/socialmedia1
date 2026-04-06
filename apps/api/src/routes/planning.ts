import type { FastifyInstance } from "fastify";
import {
  CalendarItemSchema,
  CreateCalendarItemSchema,
  CreateCreativeTemplateSchema,
  CreatePostTypeSchema,
  CreativeTemplateDetailSchema,
  CreativeTemplateSchema,
  FestivalSchema,
  PostTypeSchema,
  UpdateCalendarItemSchema,
  UpdateCreativeTemplateSchema,
  UpdatePostTypeSchema
} from "@image-lab/contracts";
import { getBrand, getPrimaryWorkspace, listBrandAssets, assertWorkspaceRole } from "../lib/repository.js";
import {
  getCalendarItem,
  getCreativeTemplate,
  getCreativeTemplateDetail,
  getPostType,
  getProject,
  listWorkspaceCreativeTemplates,
  listWorkspaceFestivals,
  listWorkspacePostTypes
} from "../lib/planning-repository.js";
import { getDeliverable, listDeliverables, mapDeliverableToCalendarItem } from "../lib/deliverables-repository.js";
import { getSignedPreview } from "../lib/job-sync.js";
import {
  mapCalendarStatusToDeliverableStatus,
  mapCreativeFormatToContentFormat
} from "../lib/deliverable-utils.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";

export async function registerPlanningRoutes(app: FastifyInstance) {
  app.get("/api/festivals", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const festivals = await listWorkspaceFestivals(workspace.id);
    return festivals.map((festival) => FestivalSchema.parse(festival));
  });

  app.get("/api/post-types", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const postTypes = await listWorkspacePostTypes(workspace.id);
    return postTypes.map((postType) => PostTypeSchema.parse(postType));
  });

  app.post("/api/post-types", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreatePostTypeSchema.parse(request.body);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const postTypeId = randomId();
    const { error } = await supabaseAdmin.from("post_types").insert({
      id: postTypeId,
      workspace_id: workspace.id,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      config_json: body.config,
      is_system: false,
      active: body.active,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return PostTypeSchema.parse(await getPostType(postTypeId));
  });

  app.patch("/api/post-types/:postTypeId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const postType = await getPostType((request.params as { postTypeId: string }).postTypeId);
    const body = UpdatePostTypeSchema.parse(request.body);

    if (!postType.workspaceId) {
      return reply.badRequest("System post types cannot be edited");
    }

    await assertWorkspaceRole(viewer, postType.workspaceId, ["owner", "admin", "editor"], request.log);

    const { error } = await supabaseAdmin
      .from("post_types")
      .update({
        name: body.name,
        description: body.description ?? null,
        config_json: body.config,
        active: body.active
      })
      .eq("id", postType.id);

    if (error) {
      throw error;
    }

    return PostTypeSchema.parse(await getPostType(postType.id));
  });

  app.get("/api/templates", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);

    const query = request.query as {
      brandId?: string;
      projectId?: string;
      postTypeId?: string;
      status?: string;
    };

    const filters: {
      brandId?: string;
      projectId?: string;
      postTypeId?: string;
      status?: "draft" | "approved" | "archived";
    } = {};

    if (query.brandId) filters.brandId = query.brandId;
    if (query.projectId) filters.projectId = query.projectId;
    if (query.postTypeId) filters.postTypeId = query.postTypeId;
    if (query.status === "draft" || query.status === "approved" || query.status === "archived") {
      filters.status = query.status;
    }

    const templates = await listWorkspaceCreativeTemplates(workspace.id, {
      ...filters
    });

    const previewUrls = await Promise.all(
      templates.map((template) =>
        template.previewStoragePath ? getSignedPreview(template.previewStoragePath) : Promise.resolve(null)
      )
    );

    return templates.map((template, index) =>
      CreativeTemplateSchema.parse({
        ...template,
        previewUrl: previewUrls[index] ?? undefined
      })
    );
  });

  app.get("/api/templates/:templateId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const detail = await getCreativeTemplateDetail((request.params as { templateId: string }).templateId);
    await assertWorkspaceRole(viewer, detail.template.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    return CreativeTemplateDetailSchema.parse(detail);
  });

  app.post("/api/templates", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateCreativeTemplateSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const project = body.projectId ? await getProject(body.projectId) : null;
    if (project && (project.workspaceId !== workspace.id || project.brandId !== brand.id)) {
      return reply.badRequest("Project does not belong to the target brand/workspace");
    }

    const postType = body.postTypeId ? await getPostType(body.postTypeId) : null;
    if (postType && postType.workspaceId && postType.workspaceId !== workspace.id) {
      return reply.badRequest("Post type does not belong to the target workspace");
    }

    const assets = body.assetIds.length > 0 ? await listBrandAssets(brand.id) : [];
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const missingAssetIds = body.assetIds.filter((assetId) => !assetMap.has(assetId));

    if (missingAssetIds.length > 0) {
      return reply.badRequest("One or more template assets do not belong to the selected brand");
    }

    const templateId = randomId();
    const { error } = await supabaseAdmin.from("creative_templates").insert({
      id: templateId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      project_id: body.projectId ?? null,
      post_type_id: body.postTypeId ?? null,
      name: body.name,
      status: body.status,
      channel: body.channel,
      format: body.format,
      base_prompt: body.basePrompt,
      preview_storage_path: body.previewStoragePath ?? null,
      template_json: body.config,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    if (body.assetIds.length > 0) {
      const templateAssets = body.assetIds.map((assetId, index) => ({
        id: randomId(),
        template_id: templateId,
        asset_id: assetId,
        role: index === 0 ? "primary_ref" : "secondary_ref",
        sort_order: index
      }));

      const { error: assetError } = await supabaseAdmin.from("creative_template_assets").insert(templateAssets);
      if (assetError) {
        throw assetError;
      }
    }

    return CreativeTemplateDetailSchema.parse(await getCreativeTemplateDetail(templateId));
  });

  app.patch("/api/templates/:templateId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const template = await getCreativeTemplate((request.params as { templateId: string }).templateId);
    const body = UpdateCreativeTemplateSchema.parse(request.body);
    await assertWorkspaceRole(viewer, template.workspaceId, ["owner", "admin", "editor"], request.log);

    const assets = body.assetIds.length > 0 ? await listBrandAssets(template.brandId) : [];
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const missingAssetIds = body.assetIds.filter((assetId) => !assetMap.has(assetId));

    if (missingAssetIds.length > 0) {
      return reply.badRequest("One or more template assets do not belong to the selected brand");
    }

    const { error } = await supabaseAdmin
      .from("creative_templates")
      .update({
        name: body.name,
        status: body.status,
        channel: body.channel,
        format: body.format,
        base_prompt: body.basePrompt,
        preview_storage_path: body.previewStoragePath ?? null,
        template_json: body.config
      })
      .eq("id", template.id);

    if (error) {
      throw error;
    }

    const { error: deleteError } = await supabaseAdmin
      .from("creative_template_assets")
      .delete()
      .eq("template_id", template.id);

    if (deleteError) {
      throw deleteError;
    }

    if (body.assetIds.length > 0) {
      const templateAssets = body.assetIds.map((assetId, index) => ({
        id: randomId(),
        template_id: template.id,
        asset_id: assetId,
        role: index === 0 ? "primary_ref" : "secondary_ref",
        sort_order: index
      }));

      const { error: assetError } = await supabaseAdmin.from("creative_template_assets").insert(templateAssets);
      if (assetError) {
        throw assetError;
      }
    }

    return CreativeTemplateDetailSchema.parse(await getCreativeTemplateDetail(template.id));
  });

  app.get("/api/calendar-items", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as {
      brandId?: string;
      projectId?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    const filters: {
      brandId?: string;
      projectId?: string;
      status?: "planned" | "brief_ready" | "generating" | "review" | "approved" | "scheduled" | "published" | "archived";
      dateFrom?: string;
      dateTo?: string;
    } = {};

    if (query.brandId) filters.brandId = query.brandId;
    if (query.projectId) filters.projectId = query.projectId;
    if (
      query.status === "planned" ||
      query.status === "brief_ready" ||
      query.status === "generating" ||
      query.status === "review" ||
      query.status === "approved" ||
      query.status === "scheduled" ||
      query.status === "published" ||
      query.status === "archived"
    ) {
      filters.status = query.status;
    }
    if (query.dateFrom) filters.dateFrom = query.dateFrom;
    if (query.dateTo) filters.dateTo = query.dateTo;

    const items = await listDeliverables(workspace.id, {
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: mapCalendarStatusToDeliverableStatus(filters.status) } : {})
    });

    return items
      .filter((item) => !filters.dateFrom || item.scheduledFor >= filters.dateFrom)
      .filter((item) => !filters.dateTo || item.scheduledFor <= filters.dateTo)
      .map((item) => CalendarItemSchema.parse(mapDeliverableToCalendarItem(item)));
  });

  app.get("/api/calendar-items/:calendarItemId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const calendarItemId = (request.params as { calendarItemId: string }).calendarItemId;
    let deliverable = await getDeliverable(calendarItemId).catch(() => null);

    if (!deliverable) {
      const { data, error } = await supabaseAdmin
        .from("deliverables")
        .select("id")
        .eq("legacy_calendar_item_id", calendarItemId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        deliverable = await getDeliverable(data.id);
      }
    }

    if (deliverable) {
      await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
      return CalendarItemSchema.parse(mapDeliverableToCalendarItem(deliverable));
    }

    const item = await getCalendarItem(calendarItemId);
    await assertWorkspaceRole(viewer, item.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    return CalendarItemSchema.parse(item);
  });

  app.post("/api/calendar-items", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateCalendarItemSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    const [project, postType, template] = await Promise.all([
      getProject(body.projectId),
      getPostType(body.postTypeId),
      body.creativeTemplateId ? getCreativeTemplate(body.creativeTemplateId) : Promise.resolve(null)
    ]);

    if (project.workspaceId !== workspace.id || project.brandId !== brand.id) {
      return reply.badRequest("Project does not belong to the target brand/workspace");
    }

    if (postType.workspaceId && postType.workspaceId !== workspace.id) {
      return reply.badRequest("Post type does not belong to the target workspace");
    }

    if (template && template.workspaceId !== workspace.id) {
      return reply.badRequest("Template does not belong to the target workspace");
    }

    const calendarItemId = randomId();
    const { error } = await supabaseAdmin.from("deliverables").insert({
      id: calendarItemId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      project_id: project.id,
      post_type_id: postType.id,
      creative_template_id: body.creativeTemplateId ?? null,
      objective_code: "awareness",
      placement_code: body.channel,
      content_format: mapCreativeFormatToContentFormat(body.format),
      title: body.title,
      brief_text: body.objective ?? null,
      scheduled_for: body.scheduledFor,
      owner_user_id: body.ownerUserId ?? null,
      status: mapCalendarStatusToDeliverableStatus(body.status),
      source_json: {
        source: "calendar_compat",
        creativeFormat: body.format,
        notesJson: body.notesJson
      },
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    return CalendarItemSchema.parse(mapDeliverableToCalendarItem(await getDeliverable(calendarItemId)));
  });

  app.patch("/api/calendar-items/:calendarItemId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;

    if (!viewer) {
      return reply.unauthorized();
    }

    const calendarItemId = (request.params as { calendarItemId: string }).calendarItemId;
    let deliverable = await getDeliverable(calendarItemId).catch(() => null);

    if (!deliverable) {
      const { data, error } = await supabaseAdmin
        .from("deliverables")
        .select("id")
        .eq("legacy_calendar_item_id", calendarItemId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.id) {
        deliverable = await getDeliverable(data.id);
      }
    }

    const body = UpdateCalendarItemSchema.parse(request.body);
    if (!deliverable) {
      const item = await getCalendarItem(calendarItemId);
      await assertWorkspaceRole(viewer, item.workspaceId, ["owner", "admin", "editor"], request.log);
      const { error } = await supabaseAdmin
        .from("calendar_items")
        .update({
          creative_template_id: body.creativeTemplateId ?? null,
          approved_output_id: body.approvedOutputId ?? null,
          title: body.title,
          objective: body.objective ?? null,
          channel: body.channel,
          format: body.format,
          scheduled_for: body.scheduledFor,
          status: body.status,
          owner_user_id: body.ownerUserId ?? null,
          notes_json: body.notesJson
        })
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      return CalendarItemSchema.parse(await getCalendarItem(item.id));
    }

    await assertWorkspaceRole(viewer, deliverable.workspaceId, ["owner", "admin", "editor"], request.log);

    if (body.creativeTemplateId) {
      const template = await getCreativeTemplate(body.creativeTemplateId);
      if (template.workspaceId !== deliverable.workspaceId) {
        return reply.badRequest("Template does not belong to the target workspace");
      }
    }

    let approvedPostVersionId = deliverable.approvedPostVersionId;

    if (body.approvedOutputId) {
      const { data, error } = await supabaseAdmin
        .from("creative_outputs")
        .select("post_version_id")
        .eq("id", body.approvedOutputId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      approvedPostVersionId = (data as { post_version_id: string | null } | null)?.post_version_id ?? null;
    }

    const { error } = await supabaseAdmin
      .from("deliverables")
      .update({
        creative_template_id: body.creativeTemplateId ?? null,
        approved_post_version_id: approvedPostVersionId,
        title: body.title,
        brief_text: body.objective ?? null,
        placement_code: body.channel,
        content_format: mapCreativeFormatToContentFormat(body.format),
        scheduled_for: body.scheduledFor,
        status: mapCalendarStatusToDeliverableStatus(body.status),
        owner_user_id: body.ownerUserId ?? null,
        source_json: {
          ...(deliverable.sourceJson ?? {}),
          creativeFormat: body.format,
          notesJson: body.notesJson,
          approvedOutputId: body.approvedOutputId ?? null
        }
      })
      .eq("id", deliverable.id);

    if (error) {
      throw error;
    }

    return CalendarItemSchema.parse(mapDeliverableToCalendarItem(await getDeliverable(deliverable.id)));
  });
}
