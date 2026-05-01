import { ensurePostVersionForOutput } from "../lib/deliverable-flow.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { randomId } from "../lib/utils.js";

type CreativeV3OutputRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  project_id: string | null;
  post_type_id: string | null;
  job_id: string;
  post_version_id: string | null;
  output_index: number;
  metadata_json: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

type CreativeJobRow = {
  id: string;
  prompt_package_id: string | null;
  deliverable_id: string | null;
};

type PromptPackageRow = {
  id: string;
  creative_request_id: string;
  deliverable_id: string | null;
  prompt_summary: string | null;
  final_prompt: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
};

type PostTypeRow = {
  id: string;
  name: string;
};

type Summary = {
  groups: number;
  outputsLinked: number;
  skipped: number;
};

async function main() {
  const summary: Summary = { groups: 0, outputsLinked: 0, skipped: 0 };
  const outputs = await fetchUnlinkedCreativeV3Outputs();
  const grouped = groupBy(outputs, (row) => row.job_id);

  for (const [jobId, rows] of grouped.entries()) {
    const first = rows[0];
    if (!first?.post_type_id) {
      summary.skipped += rows.length;
      console.info(`[creative-v3-review-backfill] skipped job ${jobId}: missing post_type_id`);
      continue;
    }

    const job = await fetchCreativeJob(jobId);
    const promptPackage = job?.prompt_package_id ? await fetchPromptPackage(job.prompt_package_id) : null;
    const deliverableId = job?.deliverable_id ?? promptPackage?.deliverable_id ?? await createReviewDeliverable(first, promptPackage);

    const linkResults = await Promise.all([
      supabaseAdmin.from("creative_jobs").update({ deliverable_id: deliverableId }).eq("id", jobId),
      promptPackage?.id
        ? supabaseAdmin.from("prompt_packages").update({ deliverable_id: deliverableId }).eq("id", promptPackage.id)
        : Promise.resolve({ error: null }),
      promptPackage?.creative_request_id
        ? supabaseAdmin.from("creative_requests").update({ deliverable_id: deliverableId }).eq("id", promptPackage.creative_request_id)
        : Promise.resolve({ error: null })
    ]);
    const linkError = linkResults.find((result) => result.error)?.error;
    if (linkError) {
      throw linkError;
    }

    for (const row of rows.sort((a, b) => a.output_index - b.output_index)) {
      const { error } = await supabaseAdmin
        .from("creative_outputs")
        .update({ deliverable_id: deliverableId })
        .eq("id", row.id);
      if (error) {
        throw error;
      }
      if (!row.post_version_id) {
        await ensurePostVersionForOutput(row.id, { status: "in_review", createdBy: row.created_by });
      }
      summary.outputsLinked += 1;
    }

    summary.groups += 1;
    console.info(`[creative-v3-review-backfill] linked ${rows.length} output(s) for job ${jobId}`);
  }

  console.info(
    `[creative-v3-review-backfill] complete groups=${summary.groups} outputsLinked=${summary.outputsLinked} skipped=${summary.skipped}`
  );
}

async function fetchUnlinkedCreativeV3Outputs() {
  const { data, error } = await supabaseAdmin
    .from("creative_outputs")
    .select("id, workspace_id, brand_id, project_id, post_type_id, job_id, post_version_id, output_index, metadata_json, created_by, created_at")
    .is("deliverable_id", null)
    .eq("kind", "final")
    .contains("metadata_json", { source: "creative_v3" })
    .order("created_at", { ascending: true })
    .returns<CreativeV3OutputRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchCreativeJob(jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("creative_jobs")
    .select("id, prompt_package_id, deliverable_id")
    .eq("id", jobId)
    .maybeSingle()
    .returns<CreativeJobRow | null>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPromptPackage(promptPackageId: string) {
  const { data, error } = await supabaseAdmin
    .from("prompt_packages")
    .select("id, creative_request_id, deliverable_id, prompt_summary, final_prompt")
    .eq("id", promptPackageId)
    .maybeSingle()
    .returns<PromptPackageRow | null>();

  if (error) {
    throw error;
  }

  return data;
}

async function createReviewDeliverable(row: CreativeV3OutputRow, promptPackage: PromptPackageRow | null) {
  const [project, postType] = await Promise.all([
    row.project_id ? fetchProject(row.project_id) : Promise.resolve(null),
    row.post_type_id ? fetchPostType(row.post_type_id) : Promise.resolve(null)
  ]);
  const deliverableId = randomId();
  const createdAt = row.created_at ?? new Date().toISOString();
  const format = inferFormat(row);

  const { error } = await supabaseAdmin.from("deliverables").insert({
    id: deliverableId,
    workspace_id: row.workspace_id,
    brand_id: row.brand_id,
    project_id: row.project_id,
    campaign_id: null,
    series_id: null,
    persona_id: null,
    content_pillar_id: null,
    post_type_id: row.post_type_id,
    creative_template_id: null,
    channel_account_id: null,
    planning_mode: "ad_hoc",
    objective_code: "awareness",
    placement_code: placementCodeForFormat(format),
    content_format: contentFormatForFormat(format),
    title: buildTitle(project, postType),
    brief_text: promptPackage?.final_prompt?.slice(0, 2000) ?? null,
    cta_text: null,
    scheduled_for: createdAt,
    due_at: null,
    owner_user_id: row.created_by,
    reviewer_user_id: row.created_by,
    priority: "normal",
    status: "planned",
    source_json: {
      source: "creative_v3_backfill",
      originalJobId: row.job_id,
      creativeFormat: format
    },
    created_by: row.created_by
  });

  if (error) {
    throw error;
  }

  return deliverableId;
}

async function fetchProject(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle()
    .returns<ProjectRow | null>();
  if (error) throw error;
  return data;
}

async function fetchPostType(postTypeId: string) {
  const { data, error } = await supabaseAdmin
    .from("post_types")
    .select("id, name")
    .eq("id", postTypeId)
    .maybeSingle()
    .returns<PostTypeRow | null>();
  if (error) throw error;
  return data;
}

function buildTitle(project: ProjectRow | null, postType: PostTypeRow | null) {
  if (project?.name && postType?.name) {
    return `${project.name} ${postType.name}`;
  }
  return postType?.name ?? project?.name ?? "Creative V3 generated post";
}

function inferFormat(row: CreativeV3OutputRow) {
  const variant = row.metadata_json?.variant;
  if (variant && typeof variant === "object" && "format" in variant && typeof variant.format === "string") {
    return variant.format;
  }
  return "portrait";
}

function placementCodeForFormat(format: string) {
  if (format === "story" || format === "9:16") return "instagram-story";
  if (format === "landscape" || format === "16:9") return "linkedin-feed";
  return "instagram-feed";
}

function contentFormatForFormat(format: string) {
  if (format === "story" || format === "9:16") return "story";
  return "static";
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

main().catch((error) => {
  console.error("[creative-v3-review-backfill] failed", error);
  process.exitCode = 1;
});
