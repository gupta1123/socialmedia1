import type {
  CreativeChannel,
  CreativeBrief,
  CreativeFormat,
  CreativeJobRecord,
  CreativeOutputRecord,
  CreativeRunDetail,
  CreativeRunSummary,
  PromptPackage,
  StyleTemplateRecord
} from "@image-lab/contracts";
import { supabaseAdmin } from "./supabase.js";

type PromptPackageRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string | null;
  project_id: string | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  calendar_item_id: string | null;
  creative_request_id: string;
  brand_profile_version_id: string;
  prompt_summary: string;
  seed_prompt: string;
  final_prompt: string;
  aspect_ratio: string;
  chosen_model: string;
  template_type: PromptPackage["templateType"] | null;
  reference_strategy: PromptPackage["referenceStrategy"];
  reference_asset_ids: string[];
  variations: PromptPackage["variations"] | null;
  resolved_constraints: Record<string, unknown>;
  compiler_trace: Record<string, unknown> | null;
  created_at: string;
};

type CreativeRequestRow = {
  id: string;
  brand_id: string;
  workspace_id: string;
  brief_json: CreativeBrief;
};

type BrandNameRow = {
  id: string;
  name: string;
};

type JobRow = {
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
  job_type: CreativeJobRecord["jobType"];
  status: CreativeJobRecord["status"];
  provider: string;
  provider_model: string;
  provider_request_id: string | null;
  requested_count: number;
  request_payload: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
  created_at: string;
};

type OutputRow = {
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
  kind: CreativeOutputRecord["kind"];
  storage_path: string;
  provider_url: string | null;
  output_index: number;
  review_state: CreativeOutputRecord["reviewState"];
  latest_feedback_verdict: CreativeOutputRecord["latestVerdict"];
  reviewed_at: string | null;
  created_by: string | null;
};

type StyleTemplateRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  deliverable_id: string | null;
  project_id: string | null;
  post_type_id: string | null;
  creative_template_id: string | null;
  calendar_item_id: string | null;
  source: StyleTemplateRecord["source"];
  label: string;
  storage_path: string;
  creative_output_id: string | null;
};

export async function listWorkspaceRuns(workspaceId: string): Promise<CreativeRunSummary[]> {
  const promptPackages = await listPromptPackagesByWorkspace(workspaceId);

  if (promptPackages.length === 0) {
    return [];
  }

  return buildRunSummaries(promptPackages);
}

export async function getCreativeRunDetail(runId: string): Promise<CreativeRunDetail> {
  const promptPackage = await getPromptPackageRow(runId);
  const [brand, brief, jobs] = await Promise.all([
    getBrandName(promptPackage.brand_id),
    getCreativeBrief(promptPackage.creative_request_id),
    listJobsByPromptPackageIds([runId])
  ]);

  const jobRows = jobs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const outputs = await listOutputsByJobIds(jobRows.map((job) => job.id));
  const latestStyleSeedJobIds = getLatestStyleSeedJobIds(jobRows, promptPackage);
  const latestFinalJobIds = getLatestFinalJobIds(jobRows);
  const latestSeedJobIdOrder = new Map(latestStyleSeedJobIds.map((jobId, index) => [jobId, index]));
  const latestFinalJobIdOrder = new Map(latestFinalJobIds.map((jobId, index) => [jobId, index]));
  const latestSeedOutputs = outputs
    .filter((output) => output.kind === "style_seed" && latestSeedJobIdOrder.has(output.job_id))
    .sort((a, b) => {
      const leftJobIndex = latestSeedJobIdOrder.get(a.job_id) ?? 0;
      const rightJobIndex = latestSeedJobIdOrder.get(b.job_id) ?? 0;
      if (leftJobIndex !== rightJobIndex) return leftJobIndex - rightJobIndex;
      return a.output_index - b.output_index;
    });
  const seedOutputIds = latestSeedOutputs.map((output) => output.id);
  const templates = await listTemplatesByOutputIds(seedOutputIds);
  const latestSeedTemplates = templates
    .filter((template) => template.creative_output_id && seedOutputIds.includes(template.creative_output_id))
    .sort((left, right) => {
      const leftIndex = latestSeedOutputs.find((output) => output.id === left.creative_output_id)?.output_index ?? 0;
      const rightIndex = latestSeedOutputs.find((output) => output.id === right.creative_output_id)?.output_index ?? 0;
      return leftIndex - rightIndex;
    });
  const run = buildRunSummary(promptPackage, brand?.name ?? "Brand", brief, jobs, outputs, templates);
  const orderedJobs = jobRows.map((job) => mapJobRow(job, promptPackage));

  return {
    run,
    brief,
    promptPackage: mapPromptPackageRow(promptPackage),
    jobs: orderedJobs,
    seedTemplates: latestSeedTemplates.map((template) => mapTemplateRow(template, latestSeedOutputs)),
    finalOutputs: outputs
      .filter((output) => output.kind === "final" && latestFinalJobIdOrder.has(output.job_id))
      .sort((a, b) => {
        const leftJobIndex = latestFinalJobIdOrder.get(a.job_id) ?? 0;
        const rightJobIndex = latestFinalJobIdOrder.get(b.job_id) ?? 0;
        if (leftJobIndex !== rightJobIndex) return leftJobIndex - rightJobIndex;
        return a.output_index - b.output_index;
      })
      .map((output, index) => mapOutputRow(output, index))
  };
}

async function buildRunSummaries(promptPackages: PromptPackageRow[]): Promise<CreativeRunSummary[]> {
  const brandIds = uniq(promptPackages.map((pkg) => pkg.brand_id));
  const requestIds = uniq(promptPackages.map((pkg) => pkg.creative_request_id));
  const promptPackageIds = promptPackages.map((pkg) => pkg.id);

  const [brands, creativeRequests, jobs] = await Promise.all([
    listBrandsByIds(brandIds),
    listCreativeRequestsByIds(requestIds),
    listJobsByPromptPackageIds(promptPackageIds)
  ]);

  const outputs = await listOutputsByJobIds(jobs.map((job) => job.id));
  const seedOutputIds = outputs.filter((output) => output.kind === "style_seed").map((output) => output.id);
  const templates = await listTemplatesByOutputIds(seedOutputIds);

  const brandMap = new Map(brands.map((brand) => [brand.id, brand]));
  const briefMap = new Map(creativeRequests.map((row) => [row.id, row.brief_json]));
  const jobsByRun = groupBy(jobs, (job) => job.prompt_package_id);
  const outputsByJob = groupBy(outputs, (output) => output.job_id);
  const templatesByOutput = groupBy(templates, (template) => template.creative_output_id ?? "");

  const runs: CreativeRunSummary[] = [];

  for (const pkg of promptPackages) {
    const brief = briefMap.get(pkg.creative_request_id);
    if (!brief) {
      continue;
    }

    const runJobs = (jobsByRun.get(pkg.id) ?? []).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const runOutputs = runJobs.flatMap((job) => outputsByJob.get(job.id) ?? []);
    const runTemplates = runOutputs.flatMap((output) => templatesByOutput.get(output.id) ?? []);

    runs.push(buildRunSummary(pkg, brandMap.get(pkg.brand_id)?.name ?? "Brand", brief, runJobs, runOutputs, runTemplates));
  }

  return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function listPromptPackagesByWorkspace(workspaceId: string) {
  const { data, error } = await supabaseAdmin
    .from("prompt_packages")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, creative_request_id, brand_profile_version_id, prompt_summary, seed_prompt, final_prompt, aspect_ratio, chosen_model, template_type, reference_strategy, reference_asset_ids, variations, resolved_constraints, compiler_trace, created_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return (data ?? []) as PromptPackageRow[];
}

async function getPromptPackageRow(runId: string) {
  const { data, error } = await supabaseAdmin
    .from("prompt_packages")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, creative_request_id, brand_profile_version_id, prompt_summary, seed_prompt, final_prompt, aspect_ratio, chosen_model, template_type, reference_strategy, reference_asset_ids, variations, resolved_constraints, compiler_trace, created_at"
    )
    .eq("id", runId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as PromptPackageRow | null;

  if (!row) {
    throw new Error("Run not found");
  }

  return row;
}

async function listBrandsByIds(brandIds: string[]) {
  if (brandIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("brands")
    .select("id, name")
    .in("id", brandIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as BrandNameRow[];
}

async function getBrandName(brandId: string) {
  const brands = await listBrandsByIds([brandId]);
  return brands[0] ?? null;
}

async function listCreativeRequestsByIds(requestIds: string[]) {
  if (requestIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("creative_requests")
    .select("id, brand_id, workspace_id, brief_json")
    .in("id", requestIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as CreativeRequestRow[];
}

async function getCreativeBrief(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("creative_requests")
    .select("brief_json")
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as { brief_json: CreativeBrief } | null;

  if (!row) {
    throw new Error("Creative brief not found");
  }

  return row.brief_json;
}

async function listJobsByPromptPackageIds(promptPackageIds: string[]) {
  if (promptPackageIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("creative_jobs")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, prompt_package_id, selected_template_id, job_type, status, provider, provider_model, provider_request_id, requested_count, request_payload, error_json, created_at"
    )
    .in("prompt_package_id", promptPackageIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as JobRow[];
}

async function listOutputsByJobIds(jobIds: string[]) {
  if (jobIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("creative_outputs")
    .select(
      "id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, job_id, post_version_id, kind, storage_path, provider_url, output_index, review_state, latest_feedback_verdict, reviewed_at, created_by"
    )
    .in("job_id", jobIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as OutputRow[];
}

async function listTemplatesByOutputIds(outputIds: string[]) {
  if (outputIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("style_templates")
    .select("id, workspace_id, brand_id, deliverable_id, project_id, post_type_id, creative_template_id, calendar_item_id, source, label, storage_path, creative_output_id")
    .in("creative_output_id", outputIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as StyleTemplateRow[];
}

function mapPromptPackageRow(row: PromptPackageRow): PromptPackage {
  const compilerTrace = row.compiler_trace ?? {};
  const variations = Array.isArray(row.variations)
    ? row.variations
    : Array.isArray(compilerTrace.variations)
      ? compilerTrace.variations
      : [];

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    creativeRequestId: row.creative_request_id,
    brandProfileVersionId: row.brand_profile_version_id,
    promptSummary: row.prompt_summary,
    seedPrompt: row.seed_prompt,
    finalPrompt: row.final_prompt,
    aspectRatio: row.aspect_ratio,
    chosenModel: row.chosen_model,
    templateType: row.template_type ?? undefined,
    referenceStrategy: row.reference_strategy,
    referenceAssetIds: row.reference_asset_ids ?? [],
    variations,
    resolvedConstraints: row.resolved_constraints ?? {},
    compilerTrace
  };
}

function buildRunSummary(
  pkg: PromptPackageRow,
  brandName: string,
  brief: CreativeBrief,
  jobs: JobRow[],
  outputs: OutputRow[],
  templates: StyleTemplateRow[]
): CreativeRunSummary {
  const resolved = pkg.resolved_constraints ?? {};
  const channel =
    typeof resolved.channel === "string" && isCreativeChannel(resolved.channel)
      ? resolved.channel
      : brief.channel;
  const format =
    typeof resolved.format === "string" && isCreativeFormat(resolved.format)
      ? resolved.format
      : brief.format;
  const latestJob = [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const latestStyleSeedJobIds = getLatestStyleSeedJobIds(jobs, pkg);
  const latestFinalJobIds = getLatestFinalJobIds(jobs);
  const latestSeedJobIdSet = new Set(latestStyleSeedJobIds);
  const latestFinalJobIdSet = new Set(latestFinalJobIds);
  const latestSeedOutputIds = new Set(
    outputs
      .filter((output) => output.kind === "style_seed" && latestSeedJobIdSet.has(output.job_id))
      .map((output) => output.id)
  );
  const templatedSeedOutputIds = new Set(
    templates
      .map((template) => template.creative_output_id)
      .filter((outputId): outputId is string => Boolean(outputId))
      .filter((outputId) => latestSeedOutputIds.has(outputId))
  );
  const seedTemplateCount = templatedSeedOutputIds.size;
  const finalOutputCount = outputs.filter((output) => output.kind === "final" && latestFinalJobIdSet.has(output.job_id)).length;

  return {
    id: pkg.id,
    workspaceId: pkg.workspace_id,
    brandId: pkg.brand_id,
    deliverableId: pkg.deliverable_id,
    projectId: pkg.project_id,
    postTypeId: pkg.post_type_id,
    creativeTemplateId: pkg.creative_template_id,
    calendarItemId: pkg.calendar_item_id,
    brandName,
    creativeRequestId: pkg.creative_request_id,
    promptSummary: pkg.prompt_summary,
    chosenModel: pkg.chosen_model,
    referenceStrategy: pkg.reference_strategy,
    templateType: pkg.template_type ?? undefined,
    channel,
    format,
    aspectRatio: pkg.aspect_ratio,
    goal: brief.goal,
    createdAt: pkg.created_at,
    status: latestJob?.status ?? "queued",
    latestJobId: latestJob?.id ?? null,
    seedJobCount: jobs.filter((job) => job.job_type === "style_seed").length,
    finalJobCount: jobs.filter((job) => job.job_type === "final").length,
    seedTemplateCount,
    finalOutputCount
  };
}

function getLatestStyleSeedJobIds(jobs: JobRow[], promptPackage: PromptPackageRow) {
  const sortedSeedJobs = [...jobs]
    .filter((job) => job.job_type === "style_seed")
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const latestSeedJob = sortedSeedJobs[0];

  if (!latestSeedJob) {
    return [];
  }

  const latestBatchId = getJobBatchId(latestSeedJob);
  if (latestBatchId) {
    return sortedSeedJobs
      .filter((job) => getJobBatchId(job) === latestBatchId)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .map((job) => job.id);
  }

  const isV2StyleSeedPackage =
    promptPackage.compiler_trace?.v2StyleSeedGeneration === true ||
    (Array.isArray(promptPackage.compiler_trace?.variations) && promptPackage.compiler_trace.variations.length > 0);

  if (!isV2StyleSeedPackage) {
    return [latestSeedJob.id];
  }

  const latestTime = new Date(latestSeedJob.created_at).getTime();
  return sortedSeedJobs
    .filter((job) => Math.abs(latestTime - new Date(job.created_at).getTime()) <= 120_000)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .map((job) => job.id);
}

function getLatestFinalJobIds(jobs: JobRow[]) {
  const sortedFinalJobs = [...jobs]
    .filter((job) => job.job_type === "final")
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const latestFinalJob = sortedFinalJobs[0];

  if (!latestFinalJob) {
    return [];
  }

  const latestBatchId = getV2OptionBatchId(latestFinalJob);
  if (latestBatchId) {
    return sortedFinalJobs
      .filter((job) => getV2OptionBatchId(job) === latestBatchId)
      .sort(compareJobsChronologically)
      .map((job) => job.id);
  }

  return [latestFinalJob.id];
}

function getJobBatchId(job: JobRow) {
  const payload = job.request_payload;
  return payload && typeof payload.styleSeedBatchId === "string" ? payload.styleSeedBatchId : null;
}

function getV2OptionBatchId(job: JobRow) {
  const payload = job.request_payload;
  return payload && typeof payload.v2OptionBatchId === "string" ? payload.v2OptionBatchId : null;
}

function compareJobsChronologically(left: JobRow, right: JobRow) {
  const timeDelta = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return getVariationIndex(left) - getVariationIndex(right);
}

function getVariationIndex(job: JobRow) {
  const payload = job.request_payload;
  if (!payload || typeof payload.variationId !== "string") {
    return 999;
  }

  const match = payload.variationId.match(/(\d+)$/);
  return match ? Number(match[1]) : 999;
}

function mapJobRow(row: JobRow, promptPackage: PromptPackageRow): CreativeJobRecord {
  const resolved = promptPackage.resolved_constraints ?? {};

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    promptPackageId: row.prompt_package_id,
    selectedTemplateId: row.selected_template_id,
    jobType: row.job_type,
    status: row.status,
    provider: row.provider,
    providerModel: row.provider_model,
    providerRequestId: row.provider_request_id,
    requestedCount: row.requested_count,
    briefContext:
      typeof resolved.channel === "string" &&
      isCreativeChannel(resolved.channel) &&
      typeof resolved.format === "string" &&
      isCreativeFormat(resolved.format)
        ? {
            channel: resolved.channel,
            format: resolved.format,
            aspectRatio: promptPackage.aspect_ratio,
            templateType:
              typeof promptPackage.template_type === "string" ? promptPackage.template_type : undefined
          }
        : null,
    outputs: [],
    error: row.error_json
  };
}

function mapOutputRow(row: OutputRow, outputIndex = row.output_index): CreativeOutputRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    jobId: row.job_id,
    postVersionId: row.post_version_id,
    kind: row.kind,
    storagePath: row.storage_path,
    providerUrl: row.provider_url,
    outputIndex,
    reviewState: row.review_state,
    latestVerdict: row.latest_feedback_verdict,
    reviewedAt: row.reviewed_at,
    createdBy: row.created_by
  };
}

function mapTemplateRow(row: StyleTemplateRow, outputs: OutputRow[]): StyleTemplateRecord {
  const linkedOutput = row.creative_output_id
    ? outputs.find((output) => output.id === row.creative_output_id)
    : null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    deliverableId: row.deliverable_id,
    projectId: row.project_id,
    postTypeId: row.post_type_id,
    creativeTemplateId: row.creative_template_id,
    calendarItemId: row.calendar_item_id,
    source: row.source,
    label: row.label,
    storagePath: row.storage_path,
    creativeOutputId: row.creative_output_id,
    jobId: linkedOutput?.job_id ?? null
  };
}

function groupBy<T, K extends string>(items: T[], getKey: (item: T) => K) {
  const map = new Map<K, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const current = map.get(key);

    if (current) {
      current.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return map;
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function isCreativeChannel(value: string): value is CreativeChannel {
  return [
    "instagram-feed",
    "instagram-story",
    "linkedin-feed",
    "x-post",
    "tiktok-cover",
    "ad-creative"
  ].includes(value);
}

function isCreativeFormat(value: string): value is CreativeFormat {
  return ["square", "portrait", "landscape", "story", "cover"].includes(value);
}
