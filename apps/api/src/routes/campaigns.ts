import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CampaignDeliverablePlanSchema,
  CampaignSchema,
  CreateCampaignDeliverablePlanSchema,
  CreateCampaignSchema,
  DeliverableSchema,
  UpdateCampaignDeliverablePlanSchema,
  UpdateCampaignSchema
} from "@image-lab/contracts";
import { assertWorkspaceRole, getBrand, getPrimaryWorkspace } from "../lib/repository.js";
import {
  getBrandPersona,
  getCampaign,
  getCampaignDeliverablePlan,
  getChannelAccount,
  listCampaignDeliverablePlans,
  listCampaigns
} from "../lib/deliverables-repository.js";
import { getCreativeTemplate, getPostType, getProject } from "../lib/planning-repository.js";
import { mapCalendarStatusToDeliverableStatus, materializeScheduledAt } from "../lib/deliverable-utils.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";

const MaterializeDeliverablesSchema = z.object({
  projectId: z.string().uuid().optional(),
  startAt: z.string().optional()
});

export async function registerCampaignRoutes(app: FastifyInstance) {
  app.get("/api/campaigns", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const query = request.query as { brandId?: string; projectId?: string; status?: string };
    const campaigns = await listCampaigns(workspace.id, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status as "draft" | "active" | "paused" | "completed" | "archived" } : {})
    });
    return campaigns.map((campaign) => CampaignSchema.parse(campaign));
  });

  app.get("/api/campaigns/:campaignId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    return CampaignSchema.parse(campaign);
  });

  app.post("/api/campaigns", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const body = CreateCampaignSchema.parse(request.body);
    const brand = await getBrand(body.brandId);
    const workspace = body.workspaceId ? { id: body.workspaceId } : await getPrimaryWorkspace(viewer);

    if (!workspace) {
      return reply.badRequest("No workspace available");
    }

    if (workspace.id !== brand.workspaceId) {
      return reply.badRequest("Brand does not belong to the target workspace");
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor"], request.log);

    if (body.targetPersonaId) {
      const persona = await getBrandPersona(body.targetPersonaId);
      if (persona.workspaceId !== workspace.id || persona.brandId !== brand.id) {
        return reply.badRequest("Persona does not belong to the target brand/workspace");
      }
    }

    if (body.primaryProjectId) {
      const project = await getProject(body.primaryProjectId);
      if (project.workspaceId !== workspace.id || project.brandId !== brand.id) {
        return reply.badRequest("Primary project does not belong to the target brand/workspace");
      }
    }

    for (const projectId of body.projectIds) {
      const project = await getProject(projectId);
      if (project.workspaceId !== workspace.id || project.brandId !== brand.id) {
        return reply.badRequest("One or more campaign projects do not belong to the target brand/workspace");
      }
    }

    const campaignId = randomId();
    const projectIds = Array.from(new Set([...(body.primaryProjectId ? [body.primaryProjectId] : []), ...body.projectIds]));

    const { error } = await supabaseAdmin.from("campaigns").insert({
      id: campaignId,
      workspace_id: workspace.id,
      brand_id: brand.id,
      name: body.name,
      objective_code: body.objectiveCode,
      target_persona_id: body.targetPersonaId ?? null,
      primary_project_id: body.primaryProjectId ?? null,
      key_message: body.keyMessage,
      cta_text: body.ctaText ?? null,
      start_at: body.startAt ?? null,
      end_at: body.endAt ?? null,
      owner_user_id: body.ownerUserId ?? null,
      kpi_goal_json: body.kpiGoalJson,
      status: body.status,
      notes_json: body.notesJson,
      created_by: viewer.userId
    });

    if (error) {
      throw error;
    }

    if (projectIds.length > 0) {
      const { error: projectError } = await supabaseAdmin.from("campaign_projects").insert(
        projectIds.map((projectId) => ({
          campaign_id: campaignId,
          project_id: projectId
        }))
      );

      if (projectError) {
        throw projectError;
      }
    }

    return CampaignSchema.parse(await getCampaign(campaignId));
  });

  app.patch("/api/campaigns/:campaignId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    const body = UpdateCampaignSchema.parse(request.body);
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor"], request.log);

    if (body.targetPersonaId) {
      const persona = await getBrandPersona(body.targetPersonaId);
      if (persona.workspaceId !== campaign.workspaceId || persona.brandId !== campaign.brandId) {
        return reply.badRequest("Persona does not belong to the target brand/workspace");
      }
    }

    if (body.primaryProjectId) {
      const project = await getProject(body.primaryProjectId);
      if (project.workspaceId !== campaign.workspaceId || project.brandId !== campaign.brandId) {
        return reply.badRequest("Primary project does not belong to the target brand/workspace");
      }
    }

    for (const projectId of body.projectIds) {
      const project = await getProject(projectId);
      if (project.workspaceId !== campaign.workspaceId || project.brandId !== campaign.brandId) {
        return reply.badRequest("One or more campaign projects do not belong to the target brand/workspace");
      }
    }

    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({
        name: body.name,
        objective_code: body.objectiveCode,
        target_persona_id: body.targetPersonaId ?? null,
        primary_project_id: body.primaryProjectId ?? null,
        key_message: body.keyMessage,
        cta_text: body.ctaText ?? null,
        start_at: body.startAt ?? null,
        end_at: body.endAt ?? null,
        owner_user_id: body.ownerUserId ?? null,
        kpi_goal_json: body.kpiGoalJson,
        status: body.status,
        notes_json: body.notesJson
      })
      .eq("id", campaign.id);

    if (error) {
      throw error;
    }

    await supabaseAdmin.from("campaign_projects").delete().eq("campaign_id", campaign.id);
    const projectIds = Array.from(new Set([...(body.primaryProjectId ? [body.primaryProjectId] : []), ...body.projectIds]));
    if (projectIds.length > 0) {
      const { error: projectError } = await supabaseAdmin.from("campaign_projects").insert(
        projectIds.map((projectId) => ({
          campaign_id: campaign.id,
          project_id: projectId
        }))
      );

      if (projectError) {
        throw projectError;
      }
    }

    return CampaignSchema.parse(await getCampaign(campaign.id));
  });

  app.get("/api/campaigns/:campaignId/plans", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);
    const plans = await listCampaignDeliverablePlans(campaign.id);
    return plans.map((plan) => CampaignDeliverablePlanSchema.parse(plan));
  });

  app.post("/api/campaigns/:campaignId/plans", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    const body = CreateCampaignDeliverablePlanSchema.parse(request.body);
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor"], request.log);

    await validateCampaignPlanRelations(campaign, body.postTypeId, body.templateId, body.channelAccountId, reply);

    const planId = randomId();
    const { error } = await supabaseAdmin.from("campaign_deliverable_plans").insert({
      id: planId,
      campaign_id: campaign.id,
      name: body.name,
      post_type_id: body.postTypeId,
      template_id: body.templateId ?? null,
      channel_account_id: body.channelAccountId ?? null,
      placement_code: body.placementCode,
      content_format: body.contentFormat,
      objective_override: body.objectiveOverride ?? null,
      cta_override: body.ctaOverride ?? null,
      brief_override: body.briefOverride ?? null,
      scheduled_offset_days: body.scheduledOffsetDays ?? null,
      sort_order: body.sortOrder,
      active: body.active
    });

    if (error) {
      throw error;
    }

    return CampaignDeliverablePlanSchema.parse(await getCampaignDeliverablePlan(planId));
  });

  app.patch("/api/campaigns/:campaignId/plans/:planId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    const plan = await getCampaignDeliverablePlan((request.params as { planId: string }).planId);
    const body = UpdateCampaignDeliverablePlanSchema.parse(request.body);
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor"], request.log);

    if (plan.campaignId !== campaign.id) {
      return reply.badRequest("Plan does not belong to this campaign");
    }

    await validateCampaignPlanRelations(campaign, body.postTypeId, body.templateId, body.channelAccountId, reply);

    const { error } = await supabaseAdmin
      .from("campaign_deliverable_plans")
      .update({
        name: body.name,
        post_type_id: body.postTypeId,
        template_id: body.templateId ?? null,
        channel_account_id: body.channelAccountId ?? null,
        placement_code: body.placementCode,
        content_format: body.contentFormat,
        objective_override: body.objectiveOverride ?? null,
        cta_override: body.ctaOverride ?? null,
        brief_override: body.briefOverride ?? null,
        scheduled_offset_days: body.scheduledOffsetDays ?? null,
        sort_order: body.sortOrder,
        active: body.active
      })
      .eq("id", plan.id);

    if (error) {
      throw error;
    }

    return CampaignDeliverablePlanSchema.parse(await getCampaignDeliverablePlan(plan.id));
  });

  app.post("/api/campaigns/:campaignId/materialize-deliverables", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const campaign = await getCampaign((request.params as { campaignId: string }).campaignId);
    const body = MaterializeDeliverablesSchema.parse(request.body ?? {});
    await assertWorkspaceRole(viewer, campaign.workspaceId, ["owner", "admin", "editor"], request.log);

    const plans = (await listCampaignDeliverablePlans(campaign.id)).filter((plan) => plan.active);
    if (plans.length === 0) {
      return [];
    }

    const projectIds = body.projectId
      ? [body.projectId]
      : campaign.projectIds.length > 0
        ? campaign.projectIds
        : campaign.primaryProjectId
          ? [campaign.primaryProjectId]
          : [];

    if (projectIds.length === 0) {
      return reply.badRequest("Campaign has no project context to materialize deliverables");
    }

    for (const projectId of projectIds) {
      const project = await getProject(projectId);
      if (project.workspaceId !== campaign.workspaceId || project.brandId !== campaign.brandId) {
        return reply.badRequest("One or more campaign projects do not belong to the target brand/workspace");
      }
    }

    const createdIds: string[] = [];

    for (const projectId of projectIds) {
      for (const plan of plans) {
        const { data: existingDeliverables, error: existingError } = await supabaseAdmin
          .from("deliverables")
          .select("id")
          .eq("campaign_id", campaign.id)
          .eq("project_id", projectId)
          .contains("source_json", { campaignPlanId: plan.id })
          .limit(1);

        if (existingError) {
          throw existingError;
        }

        if ((existingDeliverables ?? []).length > 0) {
          continue;
        }

        const deliverableId = randomId();
        const scheduledFor = materializeScheduledAt(
          body.startAt ?? campaign.startAt ?? null,
          plan.scheduledOffsetDays,
          new Date().toISOString()
        );

        const { error } = await supabaseAdmin.from("deliverables").insert({
          id: deliverableId,
          workspace_id: campaign.workspaceId,
          brand_id: campaign.brandId,
          project_id: projectId,
          campaign_id: campaign.id,
          series_id: null,
          persona_id: campaign.targetPersonaId,
          post_type_id: plan.postTypeId,
          creative_template_id: plan.templateId,
          channel_account_id: plan.channelAccountId,
          planning_mode: "campaign",
          objective_code: plan.objectiveOverride ?? campaign.objectiveCode,
          placement_code: plan.placementCode,
          content_format: plan.contentFormat,
          title: `${campaign.name} · ${plan.name}`,
          brief_text: plan.briefOverride ?? campaign.keyMessage ?? null,
          cta_text: plan.ctaOverride ?? campaign.ctaText ?? null,
          scheduled_for: scheduledFor,
          priority: "normal",
          status: mapCalendarStatusToDeliverableStatus("planned"),
          series_occurrence_date: null,
          source_json: {
            source: "campaign_plan",
            campaignPlanId: plan.id,
            campaignId: campaign.id,
            campaignName: campaign.name
          },
          created_by: viewer.userId
        });

        if (error) {
          throw error;
        }

        createdIds.push(deliverableId);
      }
    }

    const { data, error } = await supabaseAdmin
      .from("deliverables")
      .select("id, workspace_id, brand_id, project_id, campaign_id, series_id, persona_id, content_pillar_id, post_type_id, creative_template_id, channel_account_id, planning_mode, objective_code, placement_code, content_format, title, brief_text, cta_text, scheduled_for, due_at, owner_user_id, priority, status, approved_post_version_id, latest_post_version_id, series_occurrence_date, source_json")
      .in("id", createdIds)
      .order("scheduled_for", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((deliverable) =>
      DeliverableSchema.parse({
        id: deliverable.id,
        workspaceId: deliverable.workspace_id,
        brandId: deliverable.brand_id,
        projectId: deliverable.project_id,
        campaignId: deliverable.campaign_id,
        seriesId: deliverable.series_id,
        personaId: deliverable.persona_id,
        contentPillarId: deliverable.content_pillar_id,
        postTypeId: deliverable.post_type_id,
        creativeTemplateId: deliverable.creative_template_id,
        channelAccountId: deliverable.channel_account_id,
        planningMode: deliverable.planning_mode,
        objectiveCode: deliverable.objective_code,
        placementCode: deliverable.placement_code,
        contentFormat: deliverable.content_format,
        title: deliverable.title,
        briefText: deliverable.brief_text,
        ctaText: deliverable.cta_text,
        scheduledFor: deliverable.scheduled_for,
        dueAt: deliverable.due_at,
        ownerUserId: deliverable.owner_user_id,
        priority: deliverable.priority,
        status: deliverable.status,
        approvedPostVersionId: deliverable.approved_post_version_id,
        latestPostVersionId: deliverable.latest_post_version_id,
        seriesOccurrenceDate: deliverable.series_occurrence_date,
        sourceJson: deliverable.source_json ?? {}
      })
    );
  });
}

async function validateCampaignPlanRelations(
  campaign: Awaited<ReturnType<typeof getCampaign>>,
  postTypeId: string,
  templateId: string | undefined,
  channelAccountId: string | undefined,
  reply: { badRequest: (message?: string) => unknown }
) {
  const postType = await getPostType(postTypeId);
  if (postType.workspaceId && postType.workspaceId !== campaign.workspaceId) {
    throw reply.badRequest("Post type does not belong to the target workspace");
  }

  if (templateId) {
    const template = await getCreativeTemplate(templateId);
    if (template.workspaceId !== campaign.workspaceId || template.brandId !== campaign.brandId) {
      throw reply.badRequest("Template does not belong to the target brand/workspace");
    }
  }

  if (channelAccountId) {
    const account = await getChannelAccount(channelAccountId);
    if (account.workspaceId !== campaign.workspaceId || account.brandId !== campaign.brandId) {
      throw reply.badRequest("Channel account does not belong to the target brand/workspace");
    }
  }
}
