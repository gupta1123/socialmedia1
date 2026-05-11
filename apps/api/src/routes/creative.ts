import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  type CreativeOutputRecord,
  CreativeRunDetailSchema,
  CreativeRunSummarySchema,
  FeedbackRequestSchema
} from "@image-lab/contracts";
import {
  assertWorkspaceRole,
  getBrand,
  getPrimaryWorkspace,
  getPromptPackage,
  getStyleTemplate
} from "../lib/repository.js";
import { createSignedImageUrls, createSignedPreviewUrl, createSignedUrl } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getSignedPreview, refreshJobOutputs } from "../lib/job-sync.js";
import { recordOutputFeedback } from "../lib/deliverable-flow.js";
import { getCreativeRunDetail, listWorkspaceRuns } from "../lib/runs.js";

const CreativeOutputsQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  rootOutputId: z.string().uuid().optional(),
  ids: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined
    )
    .pipe(z.array(z.string().uuid()).max(50).optional()),
  reviewState: z.enum(["pending_review", "approved", "needs_revision", "closed"]).optional(),
  imageMode: z.enum(["full", "thumbnail", "metadata"]).default("full"),
  limit: z.coerce.number().int().min(1).max(200).default(48),
  offset: z.coerce.number().int().min(0).default(0)
});

function isEditorRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneMetadata(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

async function hydrateEditorStateForResponse(metadataJson: Record<string, unknown> | null | undefined) {
  const metadata = cloneMetadata(metadataJson);
  const editorState = isEditorRecord(metadata.editorState) ? metadata.editorState : null;

  if (!editorState) {
    return metadata;
  }

  const source = isEditorRecord(editorState.source) ? editorState.source : null;
  if (source && typeof source.storagePath === "string") {
    const url = await createSignedUrl(source.storagePath).catch(() => null);
    if (url) {
      source.url = url;
    }
  }

  if (Array.isArray(editorState.layers)) {
    await Promise.all(
      editorState.layers.map(async (layer) => {
        if (!isEditorRecord(layer) || layer.type !== "image" || typeof layer.sourceStoragePath !== "string") {
          return;
        }

        const url = await createSignedUrl(layer.sourceStoragePath).catch(() => null);
        if (url) {
          layer.src = url;
        }
      })
    );
  }

  return metadata;
}

export async function registerCreativeRoutes(app: FastifyInstance) {
  app.get("/api/creative/runs", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);
    const runs = await listWorkspaceRuns(workspace.id);
    return runs.map((run) => CreativeRunSummarySchema.parse(run));
  });

  app.get("/api/creative/runs/:runId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const runId = (request.params as { runId: string }).runId;
    let detail = await getCreativeRunDetail(runId);
    await assertWorkspaceRole(viewer, detail.run.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const jobsToRefresh = detail.jobs.filter(
      (job) =>
        job.providerRequestId &&
        job.status !== "failed" &&
        job.status !== "cancelled"
    );

    if (jobsToRefresh.length > 0) {
      await Promise.all(jobsToRefresh.map((job) => refreshJobOutputs(job.id).catch(() => null)));
      detail = await getCreativeRunDetail(runId);
    }

    const [seedPreviewUrls, finalPreviewUrls] = await Promise.all([
      Promise.all(detail.seedTemplates.map((template) => getSignedPreview(template.storagePath))),
      Promise.all(detail.finalOutputs.map((output) => createSignedImageUrls(output.storagePath, output.thumbnailStoragePath)))
    ]);

    return CreativeRunDetailSchema.parse({
      ...detail,
      seedTemplates: detail.seedTemplates.map((template, index) => ({
        ...template,
        previewUrl: seedPreviewUrls[index] ?? undefined
      })),
      finalOutputs: detail.finalOutputs.map((output, index) => ({
        ...output,
        previewUrl: finalPreviewUrls[index]?.originalUrl,
        thumbnailUrl: finalPreviewUrls[index]?.thumbnailUrl,
        originalUrl: finalPreviewUrls[index]?.originalUrl
      }))
    });
  });

  app.get("/api/creative/jobs/:jobId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const jobId = (request.params as { jobId: string }).jobId;
    await refreshJobOutputs(jobId).catch(() => null);

    const { data: job, error: jobError } = await supabaseAdmin
      .from("creative_jobs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, prompt_package_id, selected_template_id, job_type, status, provider, provider_model, provider_request_id, requested_count, error_json"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      throw jobError;
    }

    if (!job) {
      return reply.notFound("Job not found");
    }

    await assertWorkspaceRole(viewer, job.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);
    const promptPackage = await getPromptPackage(job.prompt_package_id);
    const resolved = (promptPackage.resolvedConstraints ?? {}) as Record<string, unknown>;
    const briefContext =
      typeof resolved.channel === "string" && typeof resolved.format === "string"
        ? {
            channel: resolved.channel,
            format: resolved.format,
            aspectRatio: promptPackage.aspectRatio,
            templateType:
              typeof promptPackage.templateType === "string" ? promptPackage.templateType : undefined
          }
        : null;

    const { data: outputs, error: outputsError } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by"
      )
      .eq("job_id", jobId)
      .order("output_index", { ascending: true });

    if (outputsError) {
      throw outputsError;
    }

    const signedUrls = await Promise.all(
      (outputs ?? []).map(async (output) => {
        const outputRow = output as { storage_path: string; thumbnail_storage_path?: string | null };
        return createSignedImageUrls(outputRow.storage_path, outputRow.thumbnail_storage_path);
      })
    );

    return {
      id: job.id,
      workspaceId: job.workspace_id,
      brandId: job.brand_id,
      deliverableId: job.deliverable_id,
      projectId: job.project_id,
      postTypeId: job.post_type_id,
      creativeTemplateId: job.creative_template_id,
      calendarItemId: job.calendar_item_id,
      promptPackageId: job.prompt_package_id,
      selectedTemplateId: job.selected_template_id,
      jobType: job.job_type,
      status: job.status,
      provider: job.provider,
      providerModel: job.provider_model,
      providerRequestId: job.provider_request_id,
      requestedCount: job.requested_count,
      briefContext,
      outputs: (outputs ?? []).map((output, index) => ({
        id: output.id,
        workspaceId: output.workspace_id,
        brandId: output.brand_id,
        deliverableId: output.deliverable_id,
        projectId: output.project_id,
        postTypeId: output.post_type_id,
        creativeTemplateId: output.creative_template_id,
        calendarItemId: output.calendar_item_id,
        jobId: output.job_id,
        postVersionId: output.post_version_id,
        kind: output.kind,
        storagePath: output.storage_path,
        thumbnailStoragePath: output.thumbnail_storage_path,
        providerUrl: output.provider_url,
        outputIndex: output.output_index,
        parentOutputId: output.parent_output_id,
        rootOutputId: output.root_output_id,
        editedFromOutputId: output.edited_from_output_id,
        versionNumber: output.version_number,
        isLatestVersion: output.is_latest_version,
        reviewState: output.review_state,
        latestVerdict: output.latest_feedback_verdict,
        reviewedAt: output.reviewed_at,
        createdBy: output.created_by,
        previewUrl: signedUrls[index]?.originalUrl,
        thumbnailUrl: signedUrls[index]?.thumbnailUrl,
        originalUrl: signedUrls[index]?.originalUrl
      })),
      error: job.error_json
    };
  });

  app.post(
    "/api/creative/outputs/:outputId/feedback",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const viewer = request.viewer;
      if (!viewer) {
        return reply.unauthorized();
      }

      const outputId = (request.params as { outputId: string }).outputId;
      const body = FeedbackRequestSchema.parse(request.body);

      const { data: output, error: outputError } = await supabaseAdmin
        .from("creative_outputs")
        .select("id, workspace_id, deliverable_id, calendar_item_id")
        .eq("id", outputId)
        .maybeSingle();

      const outputRow = output as {
        id: string;
        workspace_id: string;
        deliverable_id: string | null;
        calendar_item_id: string | null;
      } | null;

      if (outputError) {
        throw outputError;
      }

      if (!outputRow) {
        return reply.notFound("Output not found");
      }

      await assertWorkspaceRole(
        viewer,
        outputRow.workspace_id,
        ["owner", "admin", "editor", "viewer"],
        request.log
      );

      const result = await recordOutputFeedback({
        outputId,
        verdict: body.verdict,
        reason: body.reason,
        notes: body.notes ?? null,
        createdBy: viewer.userId
      });

      if (outputRow.calendar_item_id) {
        await supabaseAdmin
          .from("calendar_items")
          .update({
            status: result.deliverable.status === "approved" ? "approved" : "review",
            approved_output_id: result.deliverable.status === "approved" ? outputId : null
          })
          .eq("id", outputRow.calendar_item_id);
      }

      return {
        ok: true,
        reviewState:
          result.deliverable.status === "approved"
            ? "approved"
            : result.deliverable.status === "review"
              ? "pending_review"
              : "needs_revision",
        deliverableId: result.deliverable.id,
        postVersionId: result.postVersion.id
      };
    }
  );

  app.get("/api/creative/templates/:templateId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const templateId = (request.params as { templateId: string }).templateId;
    const template = await getStyleTemplate(templateId);
    await assertWorkspaceRole(viewer, template.workspaceId, ["owner", "admin", "editor", "viewer"], request.log);

    const previewUrl = await getSignedPreview(template.storagePath);
    let jobId: string | null = null;

    if (template.creativeOutputId) {
      const { data: output, error } = await supabaseAdmin
        .from("creative_outputs")
        .select("job_id")
        .eq("id", template.creativeOutputId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      jobId = (output as { job_id: string } | null)?.job_id ?? null;
    }

    return {
      ...template,
      jobId,
      previewUrl: previewUrl ?? undefined
    };
  });

  app.get("/api/creative/outputs", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const workspace = await getPrimaryWorkspace(viewer);
    if (!workspace) {
      return [];
    }

    await assertWorkspaceRole(viewer, workspace.id, ["owner", "admin", "editor", "viewer"], request.log);

    const parsedQuery = CreativeOutputsQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return reply.badRequest(parsedQuery.error.issues[0]?.message ?? "Invalid outputs query");
    }

    const { brandId, rootOutputId, ids, reviewState, imageMode, limit, offset } = parsedQuery.data;

    if (brandId) {
      const brand = await getBrand(brandId);
      if (brand.workspaceId !== workspace.id) {
        return reply.badRequest("Brand does not belong to this workspace");
      }
    }

    let query = supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by, created_at, metadata_json"
      )
      .eq("workspace_id", workspace.id);

    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    if (reviewState) {
      query = query.eq("review_state", reviewState);
    }

    if (ids?.length) {
      query = query.in("id", ids);
    }

    if (rootOutputId) {
      query = query.or(`id.eq.${rootOutputId},root_output_id.eq.${rootOutputId}`);
    }

    const shouldPage = !ids?.length;
    const orderedQuery = query.order("created_at", { ascending: false });
    const finalQuery = shouldPage ? orderedQuery.range(offset, offset + limit - 1) : orderedQuery.limit(Math.min(ids.length, limit));

    const { data, error } = await finalQuery
      .returns<
        Array<{
          id: string;
          workspace_id: string;
          brand_id: string;
          deliverable_id: string | null;
          project_id: string | null;
          post_type_id: string | null;
          creative_template_id: string | null;
          calendar_item_id: string | null;
          job_id: string;
          post_version_id: string | null;
          kind: "style_seed" | "final";
          storage_path: string;
          thumbnail_storage_path: string | null;
          output_index: number;
          parent_output_id: string | null;
          root_output_id: string | null;
          edited_from_output_id: string | null;
          version_number: number;
          is_latest_version: boolean;
          review_state: CreativeOutputRecord["reviewState"];
          latest_feedback_verdict: CreativeOutputRecord["latestVerdict"];
          reviewed_at: string | null;
          created_by: string | null;
          created_at: string;
          metadata_json: Record<string, unknown> | null;
        }>
      >();

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const signedUrls = await Promise.all(
      rows.map((row) =>
        imageMode === "metadata"
          ? Promise.resolve({})
          : imageMode === "thumbnail"
          ? createSignedPreviewUrl(row.storage_path, row.thumbnail_storage_path).then((thumbnailUrl) => ({
              thumbnailUrl: thumbnailUrl ?? undefined
            }))
          : createSignedImageUrls(row.storage_path, row.thumbnail_storage_path)
      )
    );

    return rows.map((output, index) => {
      const urls = signedUrls[index];
      const thumbnailUrl =
        urls && "thumbnailUrl" in urls
          ? (urls as { thumbnailUrl?: string }).thumbnailUrl
          : undefined;
      const originalUrl =
        urls && "originalUrl" in urls
          ? (urls as { originalUrl?: string }).originalUrl
          : undefined;

      return {
        id: output.id,
        workspaceId: output.workspace_id,
        brandId: output.brand_id,
        deliverableId: output.deliverable_id,
        projectId: output.project_id,
        postTypeId: output.post_type_id,
        creativeTemplateId: output.creative_template_id,
        calendarItemId: output.calendar_item_id,
        jobId: output.job_id,
        postVersionId: output.post_version_id,
        kind: output.kind,
        storagePath: output.storage_path,
        thumbnailStoragePath: output.thumbnail_storage_path,
        providerUrl: null,
        outputIndex: output.output_index,
        parentOutputId: output.parent_output_id,
        rootOutputId: output.root_output_id,
        editedFromOutputId: output.edited_from_output_id,
        versionNumber: output.version_number,
        isLatestVersion: output.is_latest_version,
        reviewState: output.review_state,
        latestVerdict: output.latest_feedback_verdict,
        reviewedAt: output.reviewed_at,
        createdBy: output.created_by,
        createdAt: output.created_at,
        metadataJson: output.metadata_json ?? {},
        ...(imageMode === "metadata" ? {} : { previewUrl: imageMode === "thumbnail" ? thumbnailUrl : originalUrl }),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(imageMode === "full" && originalUrl ? { originalUrl } : {})
      };
    });
  });

  app.get("/api/creative/outputs/:outputId/preview-url", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const outputId = (request.params as { outputId: string }).outputId;
    const { data, error } = await supabaseAdmin
      .from("creative_outputs")
      .select("id, workspace_id, storage_path, thumbnail_storage_path")
      .eq("id", outputId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const output = data as {
      id: string;
      workspace_id: string;
      storage_path: string;
      thumbnail_storage_path: string | null;
    } | null;

    if (!output) {
      return reply.notFound("Output not found");
    }

    await assertWorkspaceRole(viewer, output.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);
    const previewUrl = await createSignedPreviewUrl(output.storage_path, output.thumbnail_storage_path);
    return { previewUrl };
  });

  app.get("/api/creative/outputs/:outputId", { preHandler: app.authenticate }, async (request, reply) => {
    const viewer = request.viewer;
    if (!viewer) {
      return reply.unauthorized();
    }

    const outputId = (request.params as { outputId: string }).outputId;
    const { data, error } = await supabaseAdmin
      .from("creative_outputs")
      .select(
        "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, thumbnail_storage_path, provider_url, output_index, parent_output_id, root_output_id, edited_from_output_id, version_number, is_latest_version, review_state, latest_feedback_verdict, reviewed_at, created_by, created_at, metadata_json"
      )
      .eq("id", outputId)
      .maybeSingle();

    const output = data as
      | {
          id: string;
          workspace_id: string;
          brand_id: string;
          deliverable_id: string | null;
          project_id: string | null;
          post_type_id: string | null;
          creative_template_id: string | null;
          calendar_item_id: string | null;
          job_id: string;
          post_version_id: string | null;
          kind: "style_seed" | "final";
          storage_path: string;
          thumbnail_storage_path: string | null;
          provider_url: string | null;
          output_index: number;
          parent_output_id: string | null;
          root_output_id: string | null;
          edited_from_output_id: string | null;
          version_number: number;
          is_latest_version: boolean;
          review_state: "pending_review" | "approved" | "needs_revision" | "closed";
          latest_feedback_verdict: "approved" | "close" | "off-brand" | "wrong-layout" | "wrong-text" | null;
          reviewed_at: string | null;
          created_by: string | null;
          created_at: string;
          metadata_json: Record<string, unknown> | null;
        }
      | null;

    if (error) {
      throw error;
    }

    if (!output) {
      return reply.notFound("Output not found");
    }

    await assertWorkspaceRole(viewer, output.workspace_id, ["owner", "admin", "editor", "viewer"], request.log);

    const signedUrls = await createSignedImageUrls(output.storage_path, output.thumbnail_storage_path);
    const metadataJson = await hydrateEditorStateForResponse(output.metadata_json ?? {});

    return {
      id: output.id,
      workspaceId: output.workspace_id,
      brandId: output.brand_id,
      deliverableId: output.deliverable_id,
      projectId: output.project_id,
      postTypeId: output.post_type_id,
      creativeTemplateId: output.creative_template_id,
      calendarItemId: output.calendar_item_id,
      jobId: output.job_id,
      postVersionId: output.post_version_id,
      kind: output.kind,
      storagePath: output.storage_path,
      thumbnailStoragePath: output.thumbnail_storage_path,
      providerUrl: output.provider_url,
      outputIndex: output.output_index,
      parentOutputId: output.parent_output_id,
      rootOutputId: output.root_output_id,
      editedFromOutputId: output.edited_from_output_id,
      versionNumber: output.version_number,
      isLatestVersion: output.is_latest_version,
      reviewState: output.review_state,
      latestVerdict: output.latest_feedback_verdict,
      reviewedAt: output.reviewed_at,
      createdBy: output.created_by,
      createdAt: output.created_at,
      metadataJson,
      previewUrl: signedUrls.originalUrl,
      thumbnailUrl: signedUrls.thumbnailUrl,
      originalUrl: signedUrls.originalUrl
    };
  });
}
