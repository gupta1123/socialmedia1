import { createSignedUrl, ingestRemoteImageToStorage } from "./storage.js";
import { supabaseAdmin } from "./supabase.js";
import { getFalResult, getFalStatus } from "./fal.js";
import { buildStoragePath, randomId } from "./utils.js";
import { ensurePostVersionForOutput } from "./deliverable-flow.js";
import { env } from "./config.js";

type FalImage = {
  url: string;
  content_type?: string | null;
  file_name?: string | null;
};

export async function refreshJobOutputs(jobId: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("creative_jobs")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, prompt_package_id, selected_template_id, job_type, status, provider, provider_model, provider_request_id, requested_count, error_json"
    )
    .eq("id", jobId)
    .maybeSingle();

  const row = job as
    | {
        id: string;
        workspace_id: string;
        brand_id: string;
        deliverable_id: string | null;
        project_id: string | null;
        post_type_id: string | null;
        creative_template_id: string | null;
        calendar_item_id: string | null;
        prompt_package_id: string;
        selected_template_id: string | null;
        job_type: "style_seed" | "final";
        status: "queued" | "processing" | "completed" | "failed" | "cancelled";
        provider: string;
        provider_model: string;
        provider_request_id: string | null;
        requested_count: number;
        error_json: Record<string, unknown> | null;
      }
    | null;

  if (jobError) {
    throw jobError;
  }

  if (!row) {
    throw new Error("Job not found");
  }

  const existingOutputs = await supabaseAdmin.from("creative_outputs").select("id").eq("job_id", row.id).limit(1);

  if (!row.provider_request_id || row.status === "failed") {
    return row;
  }

  if (row.status === "completed" && (existingOutputs.data ?? []).length > 0) {
    return row;
  }

  const falEndpoint = resolveFalEndpoint(row.job_type, row.provider_model);

  let status: unknown;

  try {
    status = await getFalStatus(falEndpoint, row.provider_request_id);
  } catch (error) {
    if (shouldMarkJobFailed(error)) {
      await supabaseAdmin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_json: serializeProviderError(error)
        })
        .eq("id", row.id);

      return {
        ...row,
        status: "failed",
        error_json: serializeProviderError(error)
      };
    }

    throw error;
  }

  const normalizedStatus = String((status as { status?: string }).status ?? "").toLowerCase();

  if (normalizedStatus.includes("completed")) {
    let result: unknown;

    try {
      result = await getFalResult(falEndpoint, row.provider_request_id);
    } catch (error) {
      if (shouldMarkJobFailed(error)) {
        await supabaseAdmin
          .from("creative_jobs")
          .update({
            status: "failed",
            error_json: serializeProviderError(error)
          })
          .eq("id", row.id);

        return {
          ...row,
          status: "failed",
          error_json: serializeProviderError(error)
        };
      }

      throw error;
    }

    const images = extractFalImages(result);

    if (images.length === 0) {
      const { error: updateError } = await supabaseAdmin
        .from("creative_jobs")
        .update({
          status: "failed",
          error_json: {
            message: "Fal reported completion but no images were found in the result payload",
            providerResult: result
          }
        })
        .eq("id", row.id);

      if (updateError) {
        throw updateError;
      }

      return row;
    }

    if ((existingOutputs.data ?? []).length === 0) {
      const outputs = await Promise.all(
        images.map(async (image, index) => {
          const outputId = randomId();
          const storagePath = buildStoragePath({
            workspaceId: row.workspace_id,
            brandId: row.brand_id,
            section: "outputs",
            id: row.id,
            fileName: `${outputId}.png`
          });

          await ingestRemoteImageToStorage(storagePath, image.url);

          return {
            id: outputId,
            workspace_id: row.workspace_id,
            brand_id: row.brand_id,
            deliverable_id: row.deliverable_id,
            project_id: row.project_id,
            post_type_id: row.post_type_id,
            creative_template_id: row.creative_template_id,
            calendar_item_id: row.calendar_item_id,
            job_id: row.id,
            post_version_id: null,
            kind: row.job_type,
            storage_path: storagePath,
            provider_url: image.url,
            output_index: index,
            created_by: null
          };
        })
      );

      if (outputs.length > 0) {
        const { error: outputError } = await supabaseAdmin.from("creative_outputs").insert(outputs);
        if (outputError) {
          throw outputError;
        }

        if (row.job_type === "style_seed") {
          const templates = outputs.map((output, index) => ({
            id: randomId(),
            workspace_id: output.workspace_id,
            brand_id: output.brand_id,
            deliverable_id: output.deliverable_id,
            project_id: output.project_id,
            post_type_id: output.post_type_id,
            creative_template_id: output.creative_template_id,
            calendar_item_id: output.calendar_item_id,
            source: "generated",
            label: `Seed ${index + 1}`,
            storage_path: output.storage_path,
            creative_output_id: output.id,
            created_by: null
          }));
          const { error: templateError } = await supabaseAdmin.from("style_templates").insert(templates);
          if (templateError) {
            throw templateError;
          }
        } else {
          await Promise.all(outputs.map((output) => ensurePostVersionForOutput(output.id).catch(() => null)));

          if (row.deliverable_id) {
            await supabaseAdmin
              .from("deliverables")
              .update({ status: "review" })
              .eq("id", row.deliverable_id);
          }

          if (row.calendar_item_id) {
            await supabaseAdmin
              .from("calendar_items")
              .update({ status: "review" })
              .eq("id", row.calendar_item_id);
          }
        }
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("creative_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  } else if (normalizedStatus.includes("failed")) {
    const { error: updateError } = await supabaseAdmin
      .from("creative_jobs")
      .update({
        status: "failed",
        error_json: status
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  }

  return row;
}

export async function getSignedPreview(storagePath: string) {
  return createSignedUrl(storagePath).catch(() => null);
}

function resolveFalEndpoint(jobType: "style_seed" | "final", providerModel: string) {
  if (providerModel.startsWith("fal-ai/")) {
    return providerModel;
  }

  return jobType === "style_seed" ? env.FAL_STYLE_SEED_MODEL : env.FAL_FINAL_MODEL;
}

export function extractFalImages(result: unknown): FalImage[] {
  const payload = getResultPayload(result);

  if (!payload || !Array.isArray(payload.images)) {
    return [];
  }

  return payload.images.flatMap((image) => {
    if (!isRecord(image) || typeof image.url !== "string" || image.url.length === 0) {
      return [];
    }

    return [
      {
        url: image.url,
        content_type: typeof image.content_type === "string" ? image.content_type : null,
        file_name: typeof image.file_name === "string" ? image.file_name : null
      }
    ];
  });
}

function getResultPayload(result: unknown): { images?: unknown[] } | null {
  if (!isRecord(result)) {
    return null;
  }

  if (isRecord(result.data)) {
    return result.data as { images?: unknown[] };
  }

  return result as { images?: unknown[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function shouldMarkJobFailed(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  return statusCode === 400 || statusCode === 404 || statusCode === 422;
}

export function serializeProviderError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: getErrorStatusCode(error)
    };
  }

  if (isRecord(error)) {
    return {
      message: typeof error.message === "string" ? error.message : "Provider request failed",
      statusCode: getErrorStatusCode(error)
    };
  }

  return {
    message: "Provider request failed"
  };
}

function getErrorStatusCode(error: unknown) {
  if (!isRecord(error)) {
    return null;
  }

  const direct = error.status;
  if (typeof direct === "number") {
    return direct;
  }

  const statusCode = error.statusCode;
  if (typeof statusCode === "number") {
    return statusCode;
  }

  if (isRecord(error.response) && typeof error.response.status === "number") {
    return error.response.status;
  }

  return null;
}
