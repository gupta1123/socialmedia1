import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateSeriesSchema,
  type DeliverableRecord,
  DeliverableSchema,
  HomeOverviewSchema,
  PlanOverviewSchema,
  QueueEntrySchema,
  type QueueStatusGroup,
  SeriesSchema,
  UpdateSeriesSchema,
  WorkspaceMemberSchema
} from "@image-lab/contracts";
import { assertWorkspaceRole, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import {
  getHomeOverview,
  getPlanOverview,
  getSeries,
  listQueueEntries,
  listSeries,
  listWorkspaceMembers
} from "../lib/deliverables-repository.js";
import { getChannelAccount, getContentPillar } from "../lib/deliverables-repository.js";
import { getCreativeTemplate, getPostType, getProject } from "../lib/planning-repository.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";
import { invalidateRuntimeCache } from "../lib/runtime-cache.js";

const MaterializeSeriesSchema = z.object({
  startAt: z.string().optional(),
  endAt: z.string().optional()
});

export async function registerWorkRoutes(app: FastifyInstance) {
  app.get("/api/series", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) return [];

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string; projectId?: string; status?: string };
    const series = await listSeries(workspace.id, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status
        ? { status: query.status as "draft" | "active" | "paused" | "archived" }
        : {})
    });

    return series.map((item) => SeriesSchema.parse(item));
  });

  app.get("/api/series/:seriesId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const series = await getSeries((request.params as { seriesId: string }).seriesId);
    await assertWorkspaceRole(viewer, series.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    return SeriesSchema.parse(series);
  });

  app.post("/api/series", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const body = CreateSeriesSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);
    await validateSeriesRelations({
      workspaceId: workspace.id,
      brandId: brand.id,
      ...(body.projectId ? { projectId: body.projectId } : {}),
      ...(body.contentPillarId ? { contentPillarId: body.contentPillarId } : {}),
      ...(body.postTypeId ? { postTypeId: body.postTypeId } : {}),
      ...(body.creativeTemplateId ? { creativeTemplateId: body.creativeTemplateId } : {}),
      ...(body.channelAccountId ? { channelAccountId: body.channelAccountId } : {})
    });

    const seriesId = randomId();
    const { error } = await supabaseAdmin.from("series").insert({
      id: seriesId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      project_id: body.projectId ?? null,
      content_pillar_id: body.contentPillarId ?? null,
      name: body.name,
      description: body.description ?? null,
      objective_code: body.objectiveCode ?? null,
      post_type_id: body.postTypeId ?? null,
      creative_template_id: body.creativeTemplateId ?? null,
      channel_account_id: body.channelAccountId ?? null,
      placement_code: body.placementCode ?? null,
      content_format: body.contentFormat ?? null,
      owner_user_id: body.ownerUserId ?? null,
      cadence_json: body.cadence,
      start_at: body.startAt ?? null,
      end_at: body.endAt ?? null,
      status: body.status,
      source_brief_json: body.sourceBriefJson,
      created_by: viewer.userId
    });

    if (error) throw error;

    invalidateWorkOverviewCaches(workspace.id);

    return SeriesSchema.parse(await getSeries(seriesId));
  });

  app.patch("/api/series/:seriesId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const series = await getSeries((request.params as { seriesId: string }).seriesId);
    const body = UpdateSeriesSchema.parse(request.body);
    await assertWorkspaceRole(viewer, series.workspaceId, ["owner", "admin", "editor"], request.log);
    await validateSeriesRelations({
      workspaceId: series.workspaceId,
      brandId: series.brandId,
      ...(body.projectId ? { projectId: body.projectId } : {}),
      ...(body.contentPillarId ? { contentPillarId: body.contentPillarId } : {}),
      ...(body.postTypeId ? { postTypeId: body.postTypeId } : {}),
      ...(body.creativeTemplateId ? { creativeTemplateId: body.creativeTemplateId } : {}),
      ...(body.channelAccountId ? { channelAccountId: body.channelAccountId } : {})
    });

    const { error } = await supabaseAdmin
      .from("series")
      .update({
        project_id: body.projectId ?? null,
        content_pillar_id: body.contentPillarId ?? null,
        name: body.name,
        description: body.description ?? null,
        objective_code: body.objectiveCode ?? null,
        post_type_id: body.postTypeId ?? null,
        creative_template_id: body.creativeTemplateId ?? null,
        channel_account_id: body.channelAccountId ?? null,
        placement_code: body.placementCode ?? null,
        content_format: body.contentFormat ?? null,
        owner_user_id: body.ownerUserId ?? null,
        cadence_json: body.cadence,
        start_at: body.startAt ?? null,
        end_at: body.endAt ?? null,
        status: body.status,
        source_brief_json: body.sourceBriefJson
      })
      .eq("id", series.id);

    if (error) throw error;

    invalidateWorkOverviewCaches(series.workspaceId);

    return SeriesSchema.parse(await getSeries(series.id));
  });

  app.post("/api/series/:seriesId/materialize", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const series = await getSeries((request.params as { seriesId: string }).seriesId);
    const body = MaterializeSeriesSchema.parse(request.body ?? {});
    await assertWorkspaceRole(viewer, series.workspaceId, ["owner", "admin", "editor"], request.log);

    if (!series.postTypeId || !series.placementCode || !series.contentFormat) {
      return reply.badRequest("Add post type, placement, and format defaults before recurring post tasks can be created");
    }

    if ((series.cadence.weekdays?.length ?? 0) === 0) {
      return reply.badRequest("Add a planning rhythm before recurring post tasks can be created");
    }

    const start = body.startAt ? new Date(body.startAt) : series.startAt ? new Date(series.startAt) : new Date();
    const end = body.endAt
      ? new Date(body.endAt)
      : series.endAt
        ? new Date(series.endAt)
        : addDays(start, series.cadence.occurrencesAhead ?? 30);

    const occurrenceDates = buildSeriesOccurrences(series, start, end);
    if (occurrenceDates.length === 0) {
      return [];
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("deliverables")
      .select("series_occurrence_date")
      .eq("series_id", series.id)
      .gte("series_occurrence_date", occurrenceDates[0]!.dateKey)
      .lte("series_occurrence_date", occurrenceDates[occurrenceDates.length - 1]!.dateKey);

    if (existingError) throw existingError;

    const existingDates = new Set((existingRows ?? []).map((row) => row.series_occurrence_date as string | null).filter(Boolean));
    const createdIds: string[] = [];

    for (const occurrence of occurrenceDates) {
      if (existingDates.has(occurrence.dateKey)) {
        continue;
      }

      const deliverableId = randomId();
      const { error } = await supabaseAdmin.from("deliverables").insert({
        id: deliverableId,
        workspace_id: series.workspaceId,
        brand_id: series.brandId,
        project_id: series.projectId ?? null,
        campaign_id: null,
        series_id: series.id,
        content_pillar_id: series.contentPillarId ?? null,
        post_type_id: series.postTypeId,
        creative_template_id: series.creativeTemplateId ?? null,
        channel_account_id: series.channelAccountId ?? null,
        planning_mode: "series",
        objective_code: series.objectiveCode ?? "awareness",
        placement_code: series.placementCode,
        content_format: series.contentFormat,
        title: series.name,
        brief_text: series.description ?? null,
        cta_text: typeof series.sourceBriefJson.ctaText === "string" ? series.sourceBriefJson.ctaText : null,
        scheduled_for: occurrence.scheduledAt.toISOString(),
        due_at: occurrence.scheduledAt.toISOString(),
        owner_user_id: series.ownerUserId ?? null,
        priority: "normal",
        status: "planned",
        series_occurrence_date: occurrence.dateKey,
        source_json: {
          source: "series",
          seriesId: series.id,
          seriesName: series.name
        },
        created_by: viewer.userId
      });

      if (error) throw error;
      createdIds.push(deliverableId);
    }

    if (createdIds.length === 0) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from("deliverables")
      .select("id, workspace_id, brand_id, project_id, campaign_id, series_id, persona_id, content_pillar_id, post_type_id, creative_template_id, channel_account_id, planning_mode, objective_code, placement_code, content_format, title, brief_text, cta_text, scheduled_for, due_at, owner_user_id, priority, status, approved_post_version_id, latest_post_version_id, series_occurrence_date, source_json")
      .in("id", createdIds)
      .order("scheduled_for", { ascending: true });

    if (error) throw error;

    invalidateWorkOverviewCaches(series.workspaceId);

    return (data ?? []).map((row) =>
      DeliverableSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        brandId: row.brand_id,
        projectId: row.project_id,
        campaignId: row.campaign_id,
        seriesId: row.series_id,
        personaId: row.persona_id,
        contentPillarId: row.content_pillar_id,
        postTypeId: row.post_type_id,
        creativeTemplateId: row.creative_template_id,
        channelAccountId: row.channel_account_id,
        planningMode: row.planning_mode,
        objectiveCode: row.objective_code,
        placementCode: row.placement_code,
        contentFormat: row.content_format,
        title: row.title,
        briefText: row.brief_text,
        ctaText: row.cta_text,
        scheduledFor: row.scheduled_for,
        dueAt: row.due_at,
        ownerUserId: row.owner_user_id,
        priority: row.priority,
        status: row.status,
        approvedPostVersionId: row.approved_post_version_id,
        latestPostVersionId: row.latest_post_version_id,
        seriesOccurrenceDate: row.series_occurrence_date,
        sourceJson: row.source_json ?? {}
      })
    );
  });

  app.get("/api/home", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return HomeOverviewSchema.parse({
        dueToday: { count: 0, items: [] },
        needsReview: { count: 0, items: [] },
        approvedNotScheduled: { count: 0, items: [] },
        thisWeek: { count: 0, items: [] },
        blocked: { count: 0, items: [] }
      });
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    return HomeOverviewSchema.parse(await getHomeOverview(workspace.id, query.brandId));
  });

  app.get("/api/plan/overview", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return PlanOverviewSchema.parse({
        activeCampaigns: [],
        activeSeries: [],
        unscheduledPostTasks: [],
        upcomingPostTasks: []
      });
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string };
    return PlanOverviewSchema.parse(await getPlanOverview(workspace.id, query.brandId));
  });

  app.get("/api/queue", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as {
      scope?: string;
      brandId?: string;
      projectId?: string;
      statusGroup?: string;
      planningMode?: string;
      dueWindow?: string;
    };

    const entries = await listQueueEntries(workspace.id, viewer.userId, {
      ...(query.scope ? { scope: query.scope as "my" | "team" | "unassigned" } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.statusGroup ? { statusGroup: query.statusGroup as QueueStatusGroup } : {}),
      ...(query.planningMode ? { planningMode: query.planningMode as DeliverableRecord["planningMode"] } : {}),
      ...(query.dueWindow ? { dueWindow: query.dueWindow as "today" | "week" | "overdue" } : {})
    });

    return entries.map((entry) => QueueEntrySchema.parse(entry));
  });

  app.get("/api/workspace-members", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) return reply.unauthorized();

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const members = await listWorkspaceMembers(workspace.id);
    return members.map((member) => WorkspaceMemberSchema.parse(member));
  });
}

function invalidateWorkOverviewCaches(workspaceId: string) {
  invalidateRuntimeCache(`home-overview:${workspaceId}:`);
  invalidateRuntimeCache(`plan-overview:${workspaceId}:`);
  invalidateRuntimeCache(`queue:${workspaceId}:`);
}

async function validateSeriesRelations(params: {
  workspaceId: string;
  brandId: string;
  projectId?: string;
  contentPillarId?: string;
  postTypeId?: string;
  creativeTemplateId?: string;
  channelAccountId?: string;
}) {
  if (params.projectId) {
    const project = await getProject(params.projectId);
    if (project.workspaceId !== params.workspaceId || project.brandId !== params.brandId) {
      throw new Error("Project does not belong to the target brand/workspace");
    }
  }

  if (params.contentPillarId) {
    const pillar = await getContentPillar(params.contentPillarId);
    if (pillar.workspaceId !== params.workspaceId || pillar.brandId !== params.brandId) {
      throw new Error("Content pillar does not belong to the target brand/workspace");
    }
  }

  if (params.postTypeId) {
    const postType = await getPostType(params.postTypeId);
    if (postType.workspaceId && postType.workspaceId !== params.workspaceId) {
      throw new Error("Post type does not belong to the target workspace");
    }
  }

  if (params.creativeTemplateId) {
    const template = await getCreativeTemplate(params.creativeTemplateId);
    if (template.workspaceId !== params.workspaceId || template.brandId !== params.brandId) {
      throw new Error("Template does not belong to the target brand/workspace");
    }
  }

  if (params.channelAccountId) {
    const account = await getChannelAccount(params.channelAccountId);
    if (account.workspaceId !== params.workspaceId || account.brandId !== params.brandId) {
      throw new Error("Channel account does not belong to the target brand/workspace");
    }
  }
}

function buildSeriesOccurrences(
  series: Awaited<ReturnType<typeof getSeries>>,
  start: Date,
  end: Date
) {
  const weekdays = new Set(series.cadence.weekdays);
  const interval = Math.max(1, series.cadence.interval ?? 1);
  const startAnchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const occurrences: Array<{ dateKey: string; scheduledAt: Date }> = [];

  if (weekdays.size === 0) {
    return occurrences;
  }

  for (let cursor = new Date(startAnchor); cursor <= end; cursor = addDays(cursor, 1)) {
    const weekday = weekdayCode(cursor);
    if (!weekdays.has(weekday)) {
      continue;
    }

    const weekDiff = Math.floor((cursor.getTime() - startAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weekDiff % interval !== 0) {
      continue;
    }

    const scheduledAt = new Date(Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth(),
      cursor.getUTCDate(),
      12,
      0,
      0
    ));

    occurrences.push({
      dateKey: scheduledAt.toISOString().slice(0, 10),
      scheduledAt
    });
  }

  return occurrences;
}

function weekdayCode(date: Date) {
  const weekdays: Array<"sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"> = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ];
  return weekdays[date.getUTCDay()] ?? "sunday";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
