"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  CampaignDeliverablePlanRecord,
  CampaignRecord,
  CreateCampaignInput,
  CreateSeriesInput,
  CreativeBrief,
  CreativeChannel,
  CreativeOutputRecord,
  CreativeRunDetail,
  CreativeFormat,
  CreativeTemplateRecord,
  DeliverableRecord,
  FestivalRecord,
  ObjectiveCode,
  PostTypeRecord,
  ProjectRecord,
  SeriesOutputKind,
  SeriesRecord
} from "@image-lab/contracts";
import {
  createCampaign,
  createSeries,
  getCampaignPlans,
  getCampaigns,
  getDeliverables,
  getCreativeRun,
  getFestivals,
  getPlanningTemplates,
  getPostTypes,
  getProjects,
  getSeries
} from "../../../lib/api";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import {
  getAllowedFormats,
  getDefaultFormat,
  getPlacementSpec
} from "../../../lib/placement-specs";
import { formatDisplayDate } from "../../../lib/formatters";
import { getCurrentCreatePostTaskId } from "../../../lib/workflow";
import { ImagePreviewTrigger } from "../image-preview";
import { useRegisterTopbarControls, useRegisterTopbarMeta } from "../topbar-actions-context";
import { useStudio } from "../studio-context";

// ─── Stepper phase enum ───────────────────────────────────────────────────────
type GeneratePhase = "idle" | "exploring" | "picking" | "creating" | "done";
type CreatePicker =
  | "post-task"
  | "project"
  | "post-type"
  | "festival"
  | "template"
  | "references"
  | "series"
  | "campaign"
  | "campaign-plan"
  | "output";
type WorkspaceCreateMode = "post" | "campaign" | "series";
type PostTaskPickerStatusFilter =
  | "all"
  | "open"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "blocked";
type CampaignCreateFormState = {
  name: string;
  objectiveCode: ObjectiveCode;
  primaryProjectId: string;
  keyMessage: string;
  ctaText: string;
  startAt: string;
  endAt: string;
};
type SeriesCreateFormState = {
  name: string;
  description: string;
  startAt: string;
};

const defaultGoalText = "Drive enquiries for a premium residential project";
const legacyDefaultPromptText =
  "Design an elegant Instagram launch graphic for a premium residential development. Showcase architectural form, refined materials, warm natural light, and an aspirational lifestyle without looking like a generic stock ad.";
const defaultPromptText = "Create a premium real-estate post with a clear visual angle and restrained copy.";
const defaultCreateChannel: CreativeChannel = "instagram-feed";
const defaultCreateFormat: CreativeFormat = "square";
const defaultSeriesSlideCount = 5;
const MIN_PROMPT_LENGTH = 10;
const MAX_REFERENCE_SELECTION = 2;
const POST_TYPE_BRIEF_STARTERS: Record<string, string> = {
  "project-launch": "Introduce the project with a premium hero visual and a strong first-impression feel.",
  "site-visit-invite": "Invite buyers to visit the project soon. Keep it premium, welcoming, and action-led.",
  "amenity-spotlight": "Spotlight one amenity with an aspirational lifestyle angle and a calm premium tone.",
  "construction-update": "Show visible progress and build trust through a premium construction update.",
  "festive-greeting": "Create a premium festive greeting that feels respectful, elegant, and brand-safe."
};
const POST_TASK_STATUS_FILTER_OPTIONS: Array<{
  id: PostTaskPickerStatusFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "review", label: "Review" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "blocked", label: "Blocked" }
];
const WORKSPACE_CREATE_MODE_OPTIONS: Array<{
  id: WorkspaceCreateMode;
  label: string;
  meta: string;
}> = [
  { id: "post", label: "Post", meta: "Create a new post or start from a post task" },
  { id: "campaign", label: "Campaign", meta: "Create a new campaign and plan posts inside it" },
  { id: "series", label: "Series", meta: "Create a recurring content track, then add posts there" }
];
const objectiveOptions: Array<{ value: ObjectiveCode; label: string }> = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "lead_gen", label: "Lead gen" },
  { value: "trust", label: "Trust" },
  { value: "footfall", label: "Footfall" }
];

function readSeriesBriefString(
  series: SeriesRecord | null | undefined,
  keys: string[]
) {
  const source = series?.sourceBriefJson;
  if (!source || typeof source !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readSeriesBriefNumber(
  series: SeriesRecord | null | undefined,
  keys: string[]
) {
  const source = series?.sourceBriefJson;
  if (!source || typeof source !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function readSeriesOutputKind(series: SeriesRecord | null | undefined): SeriesOutputKind {
  const source = series?.sourceBriefJson;
  if (source && typeof source === "object") {
    const raw = source.outputKind;
    if (raw === "single_image" || raw === "carousel") {
      return raw;
    }
  }

  return series?.contentFormat === "carousel" ? "carousel" : "single_image";
}

function getTemplateFamilyLabel(template: CreativeTemplateRecord | null | undefined) {
  return template?.config.templateFamily?.trim() || template?.name || "";
}

function getTemplateOutputKinds(template: CreativeTemplateRecord | null | undefined): SeriesOutputKind[] {
  if (!template) {
    return [];
  }

  const configured = template.config.outputKinds.filter(
    (value): value is SeriesOutputKind => value === "single_image" || value === "carousel"
  );

  return configured;
}

function templateSupportsSeriesOutput(
  template: CreativeTemplateRecord,
  outputKind: SeriesOutputKind
) {
  const supported = getTemplateOutputKinds(template);
  return supported.length === 0 || supported.includes(outputKind);
}

function getTemplateSlideOptions(template: CreativeTemplateRecord | null | undefined) {
  const configured = template?.config.allowedSlideCounts
    ?.filter((value): value is number => Number.isInteger(value) && value >= 2 && value <= 10)
    .sort((left, right) => left - right) ?? [];

  return configured.length > 0 ? configured : [4, 5, 6, 7, 8];
}

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const routeMode = searchParams.get("mode");
  const workspaceMode: WorkspaceCreateMode =
    routeMode === "campaign" ? "campaign" : routeMode === "series" ? "series" : "post";
  const appliedQueryRef = useRef(false);
  const handledAdHocKeyRef = useRef<string | null>(null);
  const completedRunRefreshRef = useRef<string | null>(null);
  const {
    activeAssets,
    activeBrandId,
    bootstrap,
    recentOutputs,
    sessionToken,
    briefForm,
    pendingAction,
    pendingTargetKey,
    promptPackage,
    isPending,
    hasRunningJobs,
    setBriefForm,
    resetCreateFlow,
    compilePromptPackage,
    generateSeedsForPackage,
    generateFinalImagesForPackage,
    refresh,
    setMessage
  } = useStudio();

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [festivals, setFestivals] = useState<FestivalRecord[]>([]);
  const [reusableTemplates, setReusableTemplates] = useState<CreativeTemplateRecord[]>([]);
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [series, setSeries] = useState<SeriesRecord[]>([]);
  const [campaignPlans, setCampaignPlans] = useState<CampaignDeliverablePlanRecord[]>([]);
  const [campaignPlansLoading, setCampaignPlansLoading] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(true);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<CreativeRunDetail | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [compiledFingerprint, setCompiledFingerprint] = useState<string | null>(null);
  const [runRefreshToken, setRunRefreshToken] = useState(0);
  const [pendingCanvasAction, setPendingCanvasAction] = useState<"explore" | null>(null);
  const [activePicker, setActivePicker] = useState<CreatePicker | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [postTaskStatusFilter, setPostTaskStatusFilter] = useState<PostTaskPickerStatusFilter>("all");
  const [postTaskProjectFilter, setPostTaskProjectFilter] = useState<string>("all");
  const [campaignCreateForm, setCampaignCreateForm] = useState<CampaignCreateFormState>(
    createDefaultCampaignCreateForm
  );
  const [seriesCreateForm, setSeriesCreateForm] = useState<SeriesCreateFormState>(createEmptySeriesCreateForm);
  const [savingCampaignCreate, setSavingCampaignCreate] = useState(false);
  const [savingSeriesCreate, setSavingSeriesCreate] = useState(false);
  // Sidebar section open/closed state
  const [sidebarSections, setSidebarSections] = useState({
    context: true,
    brief: true,
    style: true
  });

  useEffect(() => {
    appliedQueryRef.current = false;
  }, [searchKey, activeBrandId]);

  useEffect(() => {
    setPickerQuery("");
    setPostTaskStatusFilter("all");
    setPostTaskProjectFilter("all");
  }, [activePicker]);

  useEffect(() => {
    if (routeMode !== "ad-hoc") {
      handledAdHocKeyRef.current = null;
      return;
    }
    if (handledAdHocKeyRef.current === searchKey) return;
    handledAdHocKeyRef.current = searchKey;
    appliedQueryRef.current = true;
    completedRunRefreshRef.current = null;
    setRunRefreshToken(0);
    resetCreateFlow({ createMode: "post" });
  }, [resetCreateFlow, routeMode, searchKey]);

  useEffect(() => {
    if (workspaceMode !== "post") {
      if (activePicker && activePicker !== "project") {
        setActivePicker(null);
      }
      return;
    }

    if (briefForm.createMode === "post") {
      return;
    }

    setBriefForm((state) =>
      state.createMode === "post"
        ? state
        : {
            ...state,
            createMode: "post",
            campaignId: undefined,
            campaignPlanId: undefined,
            seriesId: undefined,
            sourceOutputId: undefined
          }
    );
  }, [activePicker, briefForm.createMode, setBriefForm, workspaceMode]);

  useEffect(() => {
    if (!sessionToken || !activeBrandId) {
      setProjects([]);
      setPostTypes([]);
      setFestivals([]);
      setReusableTemplates([]);
      setDeliverables([]);
      setPlanningLoading(false);
      return;
    }
    const token = sessionToken;
    const brandId = activeBrandId;
    let cancelled = false;

    async function loadPlanning() {
      try {
        setPlanningLoading(true);
        const [projectRecords, postTypeRecords, festivalRecords, templateRecords, deliverableRecords, campaignRecords, seriesRecords] =
          await Promise.all([
            getProjects(token, { brandId }),
            getPostTypes(token),
            getFestivals(token),
            getPlanningTemplates(token, { brandId }),
            getDeliverables(token, { brandId }),
            getCampaigns(token, { brandId, status: "active" }),
            getSeries(token, { brandId })
          ]);
        if (!cancelled) {
          setProjects(projectRecords);
          setPostTypes(postTypeRecords);
          setFestivals(festivalRecords);
          setReusableTemplates(templateRecords);
          setDeliverables(deliverableRecords);
          setCampaigns(campaignRecords);
          setSeries(seriesRecords);
          setPlanningError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPlanningError(error instanceof Error ? error.message : "Failed to load planning context");
        }
      } finally {
        if (!cancelled) setPlanningLoading(false);
      }
    }

    void loadPlanning();
    return () => { cancelled = true; };
  }, [activeBrandId, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !briefForm.campaignId || briefForm.createMode !== "campaign_asset") {
      setCampaignPlans([]);
      setCampaignPlansLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;
    setCampaignPlansLoading(true);

    void getCampaignPlans(token, briefForm.campaignId)
      .then((records) => {
        if (!cancelled) {
          setCampaignPlans(records.filter((plan) => plan.active));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPlanningError(error instanceof Error ? error.message : "Failed to load planned assets");
          setCampaignPlans([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCampaignPlansLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [briefForm.campaignId, briefForm.createMode, sessionToken]);

  const visibleProjects = useMemo(
    () => (activeBrandId ? projects.filter((p) => p.brandId === activeBrandId) : projects),
    [activeBrandId, projects]
  );

  const visibleTemplates = useMemo(
    () =>
      reusableTemplates.filter((t) => {
        if (briefForm.projectId && t.projectId && t.projectId !== briefForm.projectId) return false;
        if (briefForm.postTypeId && t.postTypeId && t.postTypeId !== briefForm.postTypeId) return false;
        if (briefForm.createMode === "series_episode") {
          const outputKind = briefForm.seriesOutputKind ?? "single_image";
          if (!templateSupportsSeriesOutput(t, outputKind)) {
            return false;
          }
        }
        return true;
      }),
    [briefForm.createMode, briefForm.postTypeId, briefForm.projectId, briefForm.seriesOutputKind, reusableTemplates]
  );

  const visibleCampaigns = useMemo(
    () => (activeBrandId ? campaigns.filter((campaign) => campaign.brandId === activeBrandId) : campaigns),
    [activeBrandId, campaigns]
  );

  const visibleSeries = useMemo(
    () => (activeBrandId ? series.filter((item) => item.brandId === activeBrandId) : series),
    [activeBrandId, series]
  );

  const visibleDeliverables = useMemo(
    () =>
      [...deliverables]
        .filter((item) => !briefForm.projectId || item.projectId === briefForm.projectId)
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()),
    [briefForm.projectId, deliverables]
  );

  const selectedProject = useMemo(
    () => visibleProjects.find((p) => p.id === briefForm.projectId) ?? null,
    [briefForm.projectId, visibleProjects]
  );
  const selectedCampaignCreateProject = useMemo(
    () => visibleProjects.find((project) => project.id === campaignCreateForm.primaryProjectId) ?? null,
    [campaignCreateForm.primaryProjectId, visibleProjects]
  );
  const selectedPostType = useMemo(
    () => postTypes.find((p) => p.id === briefForm.postTypeId) ?? null,
    [briefForm.postTypeId, postTypes]
  );
  const selectedFestival = useMemo(
    () => festivals.find((festival) => festival.id === briefForm.festivalId) ?? null,
    [briefForm.festivalId, festivals]
  );
  const selectedReusableTemplate = useMemo(
    () => reusableTemplates.find((t) => t.id === briefForm.creativeTemplateId) ?? null,
    [briefForm.creativeTemplateId, reusableTemplates]
  );
  const selectedCampaign = useMemo(
    () => visibleCampaigns.find((campaign) => campaign.id === briefForm.campaignId) ?? null,
    [briefForm.campaignId, visibleCampaigns]
  );
  const selectedCampaignPlan = useMemo(
    () => campaignPlans.find((plan) => plan.id === briefForm.campaignPlanId) ?? null,
    [briefForm.campaignPlanId, campaignPlans]
  );
  const selectedSeries = useMemo(
    () => visibleSeries.find((item) => item.id === briefForm.seriesId) ?? null,
    [briefForm.seriesId, visibleSeries]
  );
  const selectedDeliverable = useMemo(
    () => deliverables.find((item) => item.id === briefForm.deliverableId) ?? null,
    [briefForm.deliverableId, deliverables]
  );
  const projectMap = useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects]);
  const postTypeMap = useMemo(() => new Map(postTypes.map((item) => [item.id, item])), [postTypes]);
  const campaignMap = useMemo(() => new Map(campaigns.map((item) => [item.id, item])), [campaigns]);
  const seriesMap = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);
  const deliverableMap = useMemo(
    () => new Map(deliverables.map((item) => [item.id, item])),
    [deliverables]
  );
  const adaptationCandidates = useMemo(
    () =>
      recentOutputs.filter(
        (output) =>
          output.kind === "final" &&
          output.reviewState === "approved" &&
          Boolean(output.deliverableId)
      ),
    [recentOutputs]
  );
  const selectedSourceOutput = useMemo(
    () => adaptationCandidates.find((output) => output.id === briefForm.sourceOutputId) ?? null,
    [adaptationCandidates, briefForm.sourceOutputId]
  );
  const selectedReferenceAssets = useMemo(
    () =>
      activeAssets.filter((asset) => briefForm.selectedReferenceAssetIds.includes(asset.id)),
    [activeAssets, briefForm.selectedReferenceAssetIds]
  );
  const normalizedPickerQuery = pickerQuery.trim().toLowerCase();
  const deliverablesForPostTaskPicker = useMemo(
    () =>
      visibleDeliverables.filter((item) => {
        if (postTaskProjectFilter === "__none__" && item.projectId) {
          return false;
        }

        if (postTaskProjectFilter !== "all" && postTaskProjectFilter !== "__none__" && item.projectId !== postTaskProjectFilter) {
          return false;
        }

        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          item.title,
          item.briefText,
          item.status,
          projectMap.get(item.projectId ?? "")?.name ?? "",
          postTypeMap.get(item.postTypeId)?.name ?? "",
          campaignMap.get(item.campaignId ?? "")?.name ?? "",
          seriesMap.get(item.seriesId ?? "")?.name ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [
      campaignMap,
      normalizedPickerQuery,
      postTaskProjectFilter,
      postTypeMap,
      projectMap,
      seriesMap,
      visibleDeliverables
    ]
  );
  const postTaskStatusCounts = useMemo(
    () =>
      POST_TASK_STATUS_FILTER_OPTIONS.reduce<Record<PostTaskPickerStatusFilter, number>>((acc, option) => {
        acc[option.id] = deliverablesForPostTaskPicker.filter((item) =>
          matchesPostTaskStatusFilter(item.status, option.id)
        ).length;
        return acc;
      }, {
        all: 0,
        open: 0,
        review: 0,
        approved: 0,
        scheduled: 0,
        published: 0,
        blocked: 0
      }),
    [deliverablesForPostTaskPicker]
  );
  const filteredDeliverables = useMemo(
    () =>
      deliverablesForPostTaskPicker.filter((item) => matchesPostTaskStatusFilter(item.status, postTaskStatusFilter)),
    [deliverablesForPostTaskPicker, postTaskStatusFilter]
  );
  const postTaskProjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          visibleDeliverables
            .filter((item) => item.projectId)
            .map((item) => {
              const project = projectMap.get(item.projectId ?? "");
              return project ? [project.id, project] : null;
            })
            .filter(Boolean) as Array<[string, ProjectRecord]>
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
    [projectMap, visibleDeliverables]
  );
  const groupedDeliverables = useMemo(
    () => groupDeliverablesForPicker(filteredDeliverables),
    [filteredDeliverables]
  );
  const filteredProjects = useMemo(
    () =>
      visibleProjects.filter((project) =>
        normalizedPickerQuery ? project.name.toLowerCase().includes(normalizedPickerQuery) : true
      ),
    [normalizedPickerQuery, visibleProjects]
  );
  const filteredPostTypes = useMemo(
    () =>
      postTypes.filter((postType) =>
        normalizedPickerQuery ? postType.name.toLowerCase().includes(normalizedPickerQuery) : true
      ),
    [normalizedPickerQuery, postTypes]
  );
  const filteredFestivals = useMemo(
    () =>
      festivals.filter((festival) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          festival.name,
          festival.meaning,
          festival.category,
          festival.community ?? "",
          festival.dateLabel ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [festivals, normalizedPickerQuery]
  );
  const filteredTemplates = useMemo(
    () =>
      visibleTemplates.filter((template) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          template.name,
          template.basePrompt ?? "",
          projects.find((project) => project.id === template.projectId)?.name ?? "",
          postTypes.find((postType) => postType.id === template.postTypeId)?.name ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [normalizedPickerQuery, postTypes, projects, visibleTemplates]
  );
  const filteredCampaigns = useMemo(
    () =>
      visibleCampaigns.filter((campaign) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          campaign.name,
          campaign.keyMessage,
          projects.find((project) => project.id === campaign.primaryProjectId)?.name ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [normalizedPickerQuery, projects, visibleCampaigns]
  );
  const filteredSeries = useMemo(
    () =>
      visibleSeries.filter((item) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          item.name,
          item.description ?? "",
          projects.find((project) => project.id === item.projectId)?.name ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [normalizedPickerQuery, projects, visibleSeries]
  );
  const filteredCampaignPlans = useMemo(
    () =>
      campaignPlans.filter((plan) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const haystack = [
          plan.name,
          plan.briefOverride ?? "",
          postTypes.find((postType) => postType.id === plan.postTypeId)?.name ?? ""
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedPickerQuery);
      }),
    [campaignPlans, normalizedPickerQuery, postTypes]
  );
  const filteredReferenceAssets = useMemo(
    () =>
      activeAssets.filter((asset) =>
        normalizedPickerQuery ? asset.label.toLowerCase().includes(normalizedPickerQuery) : true
      ),
    [activeAssets, normalizedPickerQuery]
  );
  const filteredOutputs = useMemo(
    () =>
      adaptationCandidates.filter((output) => {
        if (!normalizedPickerQuery) {
          return true;
        }

        const deliverableTitle =
          (output.deliverableId ? deliverableMap.get(output.deliverableId)?.title : null) ?? "";
        const haystack = `${deliverableTitle} ${output.id}`.toLowerCase();
        return haystack.includes(normalizedPickerQuery);
      }),
    [adaptationCandidates, deliverableMap, normalizedPickerQuery]
  );
  const currentPostTaskId = useMemo(
    () =>
      getCurrentCreatePostTaskId({
        selectedDeliverableId: selectedDeliverable?.id,
        promptPackageDeliverableId: promptPackage?.deliverableId,
        finalOutputs: runDetail?.finalOutputs
      }),
    [promptPackage?.deliverableId, runDetail?.finalOutputs, selectedDeliverable?.id]
  );
  const productionMode = briefForm.createMode ?? "post";
  const isPostMode = productionMode === "post";
  const isSeriesEpisodeMode = productionMode === "series_episode";
  const isCampaignAssetMode = productionMode === "campaign_asset";
  const isAdaptationMode = productionMode === "adaptation";
  const isFestiveGreeting = selectedPostType?.code === "festive-greeting";
  const isCampaignCreateMode = workspaceMode === "campaign";
  const isSeriesCreateMode = workspaceMode === "series";

  const topbarControls = useMemo(
    () => (
      <label className="create-topbar-mode-control">
        <span className="create-topbar-mode-label">Create</span>
        <select
          className="create-field-select create-topbar-mode-select"
          onChange={(event) => handleWorkspaceModeChange(event.target.value as WorkspaceCreateMode)}
          value={workspaceMode}
        >
          {WORKSPACE_CREATE_MODE_OPTIONS.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
    ),
    [workspaceMode]
  );

  useRegisterTopbarControls(topbarControls);

  const topbarMeta = useMemo(
    () => ({
      title: "Create",
      subtitle:
        workspaceMode === "campaign"
          ? "Create a campaign, then add and manage its posts on the campaign page."
          : workspaceMode === "series"
            ? "Create a series, then manage recurring setup and posts on the series page."
            : "Start from a post task or open an empty brief to create post options."
    }),
    [workspaceMode]
  );

  useRegisterTopbarMeta(topbarMeta);

  const briefFingerprint = useMemo(
    () =>
      JSON.stringify({
        activeBrandId,
        createMode: briefForm.createMode,
        deliverableId: briefForm.deliverableId ?? null,
        campaignId: briefForm.campaignId ?? null,
        campaignPlanId: briefForm.campaignPlanId ?? null,
        seriesId: briefForm.seriesId ?? null,
        festivalId: briefForm.festivalId ?? null,
        sourceOutputId: briefForm.sourceOutputId ?? null,
        projectId: briefForm.projectId ?? null,
        postTypeId: briefForm.postTypeId ?? null,
        creativeTemplateId: briefForm.creativeTemplateId ?? null,
        channel: briefForm.channel,
        format: briefForm.format,
        seriesOutputKind: briefForm.seriesOutputKind ?? null,
        slideCount: briefForm.slideCount ?? null,
        templateType: briefForm.templateType,
        goal: briefForm.goal,
        prompt: briefForm.prompt,
        audience: briefForm.audience ?? "",
        offer: briefForm.offer ?? "",
        exactText: briefForm.exactText ?? "",
        referenceAssetIds: briefForm.selectedReferenceAssetIds
      }),
    [
      activeBrandId,
      briefForm.audience,
      briefForm.campaignId,
      briefForm.campaignPlanId,
      briefForm.channel,
      briefForm.createMode,
      briefForm.creativeTemplateId,
      briefForm.deliverableId,
      briefForm.exactText,
      briefForm.festivalId,
      briefForm.format,
      briefForm.goal,
      briefForm.offer,
      briefForm.postTypeId,
      briefForm.projectId,
      briefForm.prompt,
      briefForm.selectedReferenceAssetIds,
      briefForm.seriesOutputKind,
      briefForm.seriesId,
      briefForm.slideCount,
      briefForm.sourceOutputId,
      briefForm.templateType
    ]
  );

  const isCompiledStale = Boolean(
    promptPackage && compiledFingerprint && compiledFingerprint !== briefFingerprint
  );
  const currentRunId = !isCompiledStale ? promptPackage?.id ?? null : null;
  const runHasRunningJobs = useMemo(
    () => runDetail?.jobs.some((j) => j.status === "queued" || j.status === "processing") ?? false,
    [runDetail]
  );

  useEffect(() => {
    if (workspaceMode !== "post") {
      appliedQueryRef.current = true;
      return;
    }
    if (routeMode === "ad-hoc") { appliedQueryRef.current = true; return; }
    if (appliedQueryRef.current || planningLoading) return;

    const projectId = searchParams.get("projectId");
    const postTypeId = searchParams.get("postTypeId");
    const templateId = searchParams.get("templateId");
    const deliverableId = searchParams.get("deliverableId");

    if (!projectId && !postTypeId && !templateId && !deliverableId) {
      setBriefForm((state) => ({
        ...state,
        createMode: "post"
      }));
      appliedQueryRef.current = true;
      return;
    }

    const deliverable = deliverableId ? deliverables.find((item) => item.id === deliverableId) : null;
    const template = templateId
      ? reusableTemplates.find((item) => item.id === templateId)
      : deliverable?.creativeTemplateId
        ? reusableTemplates.find((item) => item.id === deliverable.creativeTemplateId)
        : null;
    const postType = postTypeId
      ? postTypes.find((item) => item.id === postTypeId)
      : deliverable?.postTypeId
        ? postTypes.find((item) => item.id === deliverable.postTypeId)
        : template?.postTypeId
          ? postTypes.find((item) => item.id === template.postTypeId)
          : null;

    if (deliverableId && !deliverable) {
      setMessage("The selected post task could not be loaded. Check the link or refresh planning data.");
      appliedQueryRef.current = true;
      return;
    }

    setBriefForm((state) => ({
      ...state,
      createMode: "post",
      deliverableId: deliverable?.id ?? state.deliverableId,
      campaignId: undefined,
      campaignPlanId: undefined,
      seriesId: undefined,
      festivalId:
        typeof deliverable?.sourceJson?.festivalId === "string"
          ? deliverable.sourceJson.festivalId
          : undefined,
      sourceOutputId: undefined,
      projectId: deliverable?.projectId ?? projectId ?? template?.projectId ?? state.projectId,
      postTypeId: deliverable?.postTypeId ?? postType?.id ?? state.postTypeId,
      creativeTemplateId: deliverable?.creativeTemplateId ?? template?.id ?? state.creativeTemplateId,
      channel: deliverable?.placementCode ?? template?.channel ?? state.channel,
      format: deliverable
        ? deriveCreativeFormatFromDeliverable(
            deliverable.placementCode,
            deliverable.contentFormat,
            deliverable.sourceJson
          )
        : template?.format ?? state.format,
      seriesOutputKind: deliverable?.contentFormat === "carousel" ? "carousel" : "single_image",
      slideCount:
        typeof deliverable?.sourceJson?.slideCount === "number"
          ? deliverable.sourceJson.slideCount
          : state.slideCount,
      goal: deliverable?.title ?? state.goal,
      prompt: deliverable?.briefText ?? state.prompt,
      offer: deliverable?.ctaText ?? state.offer,
      templateType: postType?.config.recommendedTemplateTypes[0] ?? state.templateType
    }));

    appliedQueryRef.current = true;
  }, [deliverables, planningLoading, postTypes, reusableTemplates, routeMode, searchKey, setBriefForm, setMessage, workspaceMode]);

  useEffect(() => {
    if (sessionToken === null || currentRunId === null) {
      setRunDetail(null);
      setRunError(null);
      setRunLoading(false);
      return;
    }
    const token: string = sessionToken;
    const runId: string = currentRunId;
    let cancelled = false;
    let intervalId: number | null = null;
    let requestInFlight = false;

    async function loadRun(silent = false) {
      if (requestInFlight || cancelled) return;
      requestInFlight = true;
      if (!silent) setRunLoading(true);
      try {
        const detail = await getCreativeRun(token, runId);
        if (cancelled) return;
        setRunDetail(detail);
        setRunError(null);
        const hasActiveJobs = detail.jobs.some(
          (job) => job.status === "queued" || job.status === "processing"
        );
        if (hasActiveJobs && intervalId === null) {
          intervalId = window.setInterval(() => { void loadRun(true); }, 4000);
        }
        if (!hasActiveJobs && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        if (!cancelled) setRunError(error instanceof Error ? error.message : "Failed to load current run");
      } finally {
        requestInFlight = false;
        if (!cancelled && !silent) setRunLoading(false);
      }
    }

    void loadRun();
    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [currentRunId, runRefreshToken, sessionToken]);

  useEffect(() => {
    if (!currentRunId || !runDetail || runHasRunningJobs) return;
    if (completedRunRefreshRef.current === currentRunId) return;
    completedRunRefreshRef.current = currentRunId;
    void refresh(activeBrandId ?? undefined).catch(() => {});
  }, [activeBrandId, currentRunId, refresh, runDetail, runHasRunningJobs]);

  const allowedFormats = getAllowedFormats(briefForm.channel);
  const activePlacement =
    getPlacementSpec(briefForm.channel, briefForm.format) ?? allowedFormats[0]!;
  const compiledPlacement =
    promptPackage &&
    typeof promptPackage.resolvedConstraints.channel === "string" &&
    typeof promptPackage.resolvedConstraints.format === "string"
      ? getPlacementSpec(
          promptPackage.resolvedConstraints.channel as CreativeBrief["channel"],
          promptPackage.resolvedConstraints.format as CreativeBrief["format"]
        )
      : activePlacement;

  const currentSeedTemplates = runDetail?.seedTemplates ?? [];
  const currentFinalOutputs = runDetail?.finalOutputs ?? [];
  const hasActiveSeedJob = useMemo(
    () =>
      runDetail?.jobs.some(
        (job) =>
          job.jobType === "style_seed" &&
          (job.status === "queued" || job.status === "processing")
      ) ?? false,
    [runDetail]
  );

  const seedTemplateLabelById = useMemo(
    () => new Map(currentSeedTemplates.map((t) => [t.id, t.label])),
    [currentSeedTemplates]
  );

  const latestSelectedStyleId = useMemo(() => {
    const jobs = runDetail?.jobs ?? [];
    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i];
      if (!job) continue;
      if (job.jobType === "final" && job.selectedTemplateId) return job.selectedTemplateId;
    }
    return null;
  }, [runDetail?.jobs]);

  const latestStyleLabel = latestSelectedStyleId
    ? seedTemplateLabelById.get(latestSelectedStyleId) ?? null
    : null;

  const canCreateOptionsFromReferences = briefForm.selectedReferenceAssetIds.length > 0;
  const canCreateOptionsFromSourceOutput = Boolean(briefForm.sourceOutputId);
  const canCreateOptionsFromTemplateFamily = Boolean(selectedReusableTemplate);
  const hasFreshSelectedStyle = Boolean(latestSelectedStyleId) && !isCompiledStale;
  const hasFestivalSelection = !isFestiveGreeting || Boolean(selectedFestival);
  const canCreateOptionsDirectly =
    canCreateOptionsFromReferences ||
    canCreateOptionsFromSourceOutput ||
    canCreateOptionsFromTemplateFamily ||
    hasFreshSelectedStyle;
  const canUseDeliverableInheritance = isPostMode && Boolean(selectedDeliverable);
  const styleSourceReady = canUseDeliverableInheritance ? hasFreshSelectedStyle : canCreateOptionsDirectly;
  const requiresExplicitPostType =
    !canUseDeliverableInheritance && (isSeriesEpisodeMode || isCampaignAssetMode || isAdaptationMode);
  const hasRequiredPostType = Boolean(selectedPostType);
  const locksPlacement = canUseDeliverableInheritance || isCampaignAssetMode;
  const locksTemplate = canUseDeliverableInheritance || isCampaignAssetMode;
  const seriesOutputKind = briefForm.seriesOutputKind ?? "single_image";
  const isSeriesCarousel = isSeriesEpisodeMode && seriesOutputKind === "carousel";
  const availableSeriesSlideCounts = useMemo(
    () => getTemplateSlideOptions(selectedReusableTemplate),
    [selectedReusableTemplate]
  );
  const currentReviewHref = currentPostTaskId
    ? `/studio/review?deliverableId=${currentPostTaskId}`
    : "/studio/review";

  const promptLength = briefForm.prompt.trim().length;
  const hasBriefPrompt = promptLength >= MIN_PROMPT_LENGTH;
  const hasSomePromptText = promptLength > 0;
  const promptTooShort = hasSomePromptText && promptLength < MIN_PROMPT_LENGTH;

  // Derive current generate phase for the stepper
  const generatePhase: GeneratePhase = useMemo(() => {
    if (currentFinalOutputs.length > 0 && !isCompiledStale) return "done";
    if (currentSeedTemplates.length > 0 && !isCompiledStale && currentFinalOutputs.length === 0)
      return "picking";
    if (pendingAction === "generate-seeds") return "exploring";
    if (pendingAction === "generate-finals") return "creating";
    return "idle";
  }, [
    currentFinalOutputs.length,
    currentSeedTemplates.length,
    isCompiledStale,
    pendingAction
  ]);
  const isExploringDirections =
    !isAdaptationMode &&
    !isCompiledStale &&
    currentSeedTemplates.length === 0 &&
    currentFinalOutputs.length === 0 &&
    (pendingCanvasAction === "explore" ||
      pendingAction === "generate-seeds" ||
      (hasActiveSeedJob && generatePhase !== "creating"));
  const directionLoadingTitle =
    pendingAction === "compile-prompt"
      ? "Preparing your directions"
      : pendingAction === "generate-seeds"
        ? "Starting the direction run"
        : "Generating style directions";
  const directionLoadingBody =
    pendingAction === "compile-prompt"
      ? "We’re turning your brief into a production-ready prompt before generating directions."
      : pendingAction === "generate-seeds"
        ? "Submitting three direction previews so you can compare the visual language before creating final options."
        : "We’re rendering three direction previews now. They’ll appear here automatically as soon as they’re ready.";

  useEffect(() => {
    if (pendingCanvasAction !== "explore") return;
    if (currentSeedTemplates.length > 0 || currentFinalOutputs.length > 0 || runError) {
      setPendingCanvasAction(null);
      return;
    }
    if (!isPending && !hasActiveSeedJob && !runHasRunningJobs) {
      setPendingCanvasAction(null);
    }
  }, [
    currentFinalOutputs.length,
    currentSeedTemplates.length,
    hasActiveSeedJob,
    isPending,
    pendingCanvasAction,
    runError,
    runHasRunningJobs
  ]);

  // Pre-flight checklist items
  const preflightItems = useMemo(() => [
    {
      id: "context",
      label:
        isSeriesEpisodeMode
          ? selectedSeries
            ? `Series: ${selectedSeries.name}`
            : "Choose a series"
          : isCampaignAssetMode
            ? selectedCampaign && selectedCampaignPlan
              ? `Asset: ${selectedCampaignPlan.name}`
              : "Choose a campaign and planned asset"
            : isAdaptationMode
              ? selectedSourceOutput
                ? "Source post selected"
                : "Choose a source post"
              : canUseDeliverableInheritance
                ? "Post task selected"
                : "Ad hoc post",
      done:
        isSeriesEpisodeMode
          ? Boolean(selectedSeries)
          : isCampaignAssetMode
            ? Boolean(selectedCampaign && selectedCampaignPlan)
            : isAdaptationMode
              ? Boolean(selectedSourceOutput)
              : true
    },
    {
      id: "prompt",
      label: promptTooShort ? `Write at least ${MIN_PROMPT_LENGTH} characters` : "Write a brief prompt",
      done: hasBriefPrompt
    },
    ...(requiresExplicitPostType
      ? [
          {
            id: "post-type",
            label: hasRequiredPostType ? "Post type selected" : "Choose a post type",
            done: hasRequiredPostType
          }
        ]
      : []),
    ...(isFestiveGreeting
      ? [
          {
            id: "festival",
            label: selectedFestival ? `Festival: ${selectedFestival.name}` : "Choose a festival",
            done: Boolean(selectedFestival)
          }
        ]
      : []),
    {
      id: "style-source",
      label: canUseDeliverableInheritance
        ? hasFreshSelectedStyle
          ? `Direction: ${latestStyleLabel ?? "selected"}`
          : Boolean(latestSelectedStyleId) && isCompiledStale
            ? "Explore styles again for this task"
            : "Explore styles to create options from this task"
        : canCreateOptionsFromSourceOutput
          ? "Source post selected"
          : canCreateOptionsFromReferences
            ? `${briefForm.selectedReferenceAssetIds.length} reference${briefForm.selectedReferenceAssetIds.length === 1 ? "" : "s"} selected`
            : canCreateOptionsFromTemplateFamily
              ? `Template family: ${getTemplateFamilyLabel(selectedReusableTemplate)}`
              : hasFreshSelectedStyle
                ? `Style anchor: ${latestStyleLabel ?? "selected"}`
                : Boolean(latestSelectedStyleId) && isCompiledStale
                  ? "Explore styles again for this brief"
                  : isAdaptationMode
                    ? "Pick a source post"
                    : isFestiveGreeting
                      ? "Explore styles to create a festive poster"
                      : "Choose a template, references, or explore styles",
      done: styleSourceReady
    }
  ], [
    briefForm.selectedReferenceAssetIds.length,
    canCreateOptionsDirectly,
    canCreateOptionsFromReferences,
    canCreateOptionsFromSourceOutput,
    canCreateOptionsFromTemplateFamily,
    canUseDeliverableInheritance,
    hasBriefPrompt,
    hasRequiredPostType,
    isFestiveGreeting,
    promptTooShort,
    isAdaptationMode,
    isCampaignAssetMode,
    isSeriesEpisodeMode,
    isCompiledStale,
    latestSelectedStyleId,
    latestStyleLabel,
    requiresExplicitPostType,
    selectedCampaign,
    selectedCampaignPlan,
    selectedFestival,
    selectedReusableTemplate,
    selectedSeries,
    selectedSourceOutput,
    styleSourceReady
  ]);
  const hasRequiredSourceContext = preflightItems[0]?.done ?? true;

  const allPreflightDone = preflightItems.every((item) => item.done);
  const incompletePreflightItems = preflightItems.filter((item) => !item.done);
  const requiresStyleExplorationFirst =
    canUseDeliverableInheritance
      ? !hasFreshSelectedStyle
      : !isAdaptationMode &&
        !canCreateOptionsFromReferences &&
        !canCreateOptionsFromSourceOutput &&
        !canCreateOptionsFromTemplateFamily &&
        !hasFreshSelectedStyle;
  const createDockStatus = allPreflightDone
    ? "Ready to create options"
    : requiresStyleExplorationFirst
      ? "Explore styles first"
      : incompletePreflightItems.length === 1
        ? "1 requirement left"
        : `${incompletePreflightItems.length} requirements left`;

  function rearmRunPolling() {
    completedRunRefreshRef.current = null;
    setRunRefreshToken((v) => v + 1);
  }

  async function handleGenerateCandidates() {
    const nextFingerprint = briefFingerprint;
    const compiled =
      promptPackage && !isCompiledStale
        ? promptPackage
        : await compilePromptPackage({ silentSuccess: true });
    if (!compiled) return;

    const selectedTemplateId =
      !briefForm.sourceOutputId && briefForm.selectedReferenceAssetIds.length === 0
        ? hasFreshSelectedStyle
          ? latestSelectedStyleId ?? undefined
          : undefined
        : undefined;

    if (
      briefForm.selectedReferenceAssetIds.length === 0 &&
      !selectedReusableTemplate &&
      !briefForm.sourceOutputId &&
      !selectedTemplateId
    ) {
      setMessage("Choose a template family, select references, choose a style, or pick a source post before creating options.");
      return;
    }

    setCompiledFingerprint(nextFingerprint);
    const submitted = await generateFinalImagesForPackage(compiled.id, selectedTemplateId);
    if (submitted) rearmRunPolling();
  }

  async function handleExploreDirections() {
    if (isAdaptationMode) {
      setMessage("Adaptation uses the selected source post directly, so style exploration is skipped.");
      return;
    }
    if (!hasRequiredSourceContext) {
      setMessage("Choose the source for this mode before exploring styles.");
      return;
    }
    setPendingCanvasAction("explore");
    const nextFingerprint = briefFingerprint;
    const compiled =
      promptPackage && !isCompiledStale
        ? promptPackage
        : await compilePromptPackage({ silentSuccess: true });
    if (!compiled) {
      setPendingCanvasAction(null);
      return;
    }
    setCompiledFingerprint(nextFingerprint);
    const submitted = await generateSeedsForPackage(compiled.id);
    if (submitted) {
      rearmRunPolling();
    } else {
      setPendingCanvasAction(null);
    }
  }

  async function handleCreateOptionsFromStyle(selectedTemplateId: string) {
    if (!promptPackage || isCompiledStale) return;
    const submitted = await generateFinalImagesForPackage(promptPackage.id, selectedTemplateId);
    if (submitted) rearmRunPolling();
  }

  function handleChannelChange(nextChannel: CreativeChannel) {
    setBriefForm((state) => {
      const nextDefault = getDefaultFormat(nextChannel);
      const currentStillAllowed = getPlacementSpec(nextChannel, state.format);
      return { ...state, channel: nextChannel, format: currentStillAllowed ? state.format : nextDefault };
    });
  }

  function handleProjectChange(projectId: string) {
    const selectedDeliverableRecord = briefForm.deliverableId
      ? deliverables.find((item) => item.id === briefForm.deliverableId)
      : null;
    setBriefForm((state) => ({
      ...state,
      projectId: projectId || undefined,
      deliverableId:
        selectedDeliverableRecord && projectId && selectedDeliverableRecord.projectId !== projectId
          ? undefined
          : state.deliverableId,
      creativeTemplateId:
        state.creativeTemplateId &&
        reusableTemplates.find(
          (t) => t.id === state.creativeTemplateId && (!projectId || t.projectId === projectId || t.projectId === null)
        )
          ? state.creativeTemplateId
          : undefined
    }));
  }

  function handlePostTypeChange(postTypeId: string) {
    const selected = postTypes.find((p) => p.id === postTypeId);
    const nextIsFestiveGreeting = selected?.code === "festive-greeting";
    const selectedDeliverableRecord = briefForm.deliverableId
      ? deliverables.find((item) => item.id === briefForm.deliverableId)
      : null;
    setBriefForm((state) => {
      const nextChannel = selected?.config.defaultChannels[0] ?? state.channel;
      const nextFormat =
        selected?.config.allowedFormats[0] ??
        (getPlacementSpec(nextChannel, state.format) ? state.format : getDefaultFormat(nextChannel));
      const nextFestival = nextIsFestiveGreeting
        ? festivals.find((festival) => festival.id === state.festivalId) ?? null
        : null;
      const shouldResetPrompt =
        state.prompt.trim().length === 0 ||
        isSystemSuggestedBrief(state.prompt, festivals);
      const shouldResetGoal =
        state.goal.trim().length === 0 ||
        state.goal === defaultGoalText ||
        state.goal === "Festive greeting";
      const shouldResetExactText =
        (state.exactText ?? "").trim().length === 0 ||
        state.exactText === "Warm wishes";
      const nextPrompt: string = shouldResetPrompt
        ? getPostTypeBriefStarter(selected, nextFestival)
        : state.prompt;

      return {
        ...state,
        postTypeId: postTypeId || undefined,
        projectId: nextIsFestiveGreeting ? undefined : state.projectId,
        festivalId: nextIsFestiveGreeting ? state.festivalId : undefined,
        creativeTemplateId: nextIsFestiveGreeting ? undefined : state.creativeTemplateId,
        selectedReferenceAssetIds: nextIsFestiveGreeting ? [] : state.selectedReferenceAssetIds,
        deliverableId:
          selectedDeliverableRecord && postTypeId && selectedDeliverableRecord.postTypeId !== postTypeId
            ? undefined
            : state.deliverableId,
        channel: nextChannel,
        format: nextFormat,
        templateType: selected?.config.recommendedTemplateTypes[0] ?? state.templateType,
        goal:
          nextIsFestiveGreeting && shouldResetGoal
            ? nextFestival
              ? getFestivalGoal(nextFestival)
              : "Festive greeting"
            : state.goal,
        prompt: nextPrompt,
        exactText:
          nextIsFestiveGreeting && shouldResetExactText
            ? nextFestival
              ? getFestivalHeadline(nextFestival)
              : "Warm wishes"
            : state.exactText
      };
    });
  }

  function handleFestivalChange(festivalId: string) {
    const selected = festivals.find((festival) => festival.id === festivalId) ?? null;

    setBriefForm((state) => ({
      ...state,
      festivalId: festivalId || undefined,
      goal:
        selected && (state.goal.trim().length === 0 || state.goal === defaultGoalText || state.goal === "Festive greeting")
          ? getFestivalGoal(selected)
          : state.goal,
      prompt:
        selected && (state.prompt.trim().length === 0 || isSystemSuggestedBrief(state.prompt, festivals))
          ? getFestivalBriefStarter(selected)
          : state.prompt,
      exactText:
        selected &&
        ((state.exactText ?? "").trim().length === 0 || state.exactText === "Warm wishes")
          ? getFestivalHeadline(selected)
          : state.exactText
    }));
  }

  function handleReusableTemplateChange(templateId: string) {
    const selected = reusableTemplates.find((t) => t.id === templateId);
    setBriefForm((state) => ({
      ...state,
      creativeTemplateId: templateId || undefined,
      projectId: selected?.projectId ?? state.projectId,
      postTypeId: selected?.postTypeId ?? state.postTypeId,
      channel: selected?.channel ?? state.channel,
      format: selected?.format ?? state.format,
      slideCount:
        state.createMode === "series_episode" && state.seriesOutputKind === "carousel"
          ? selected?.config.defaultSlideCount ?? state.slideCount ?? defaultSeriesSlideCount
          : state.slideCount,
      prompt: state.prompt
    }));
  }

  function handleSeriesOutputKindChange(nextKind: SeriesOutputKind) {
    setBriefForm((state) => ({
      ...state,
      seriesOutputKind: nextKind,
      slideCount:
        nextKind === "carousel"
          ? state.slideCount ?? selectedReusableTemplate?.config.defaultSlideCount ?? defaultSeriesSlideCount
          : defaultSeriesSlideCount
    }));
  }

  function handleSeriesSlideCountChange(nextCount: number) {
    setBriefForm((state) => ({
      ...state,
      slideCount: nextCount
    }));
  }

  function handleDeliverableChange(deliverableId: string) {
    const selected = deliverables.find((item) => item.id === deliverableId);
    setBriefForm((state) => ({
      ...state,
      createMode: "post",
      deliverableId: deliverableId || undefined,
      campaignId: undefined,
      campaignPlanId: undefined,
      seriesId: undefined,
      festivalId:
        typeof selected?.sourceJson?.festivalId === "string"
          ? selected.sourceJson.festivalId
          : undefined,
      sourceOutputId: undefined,
      projectId: selected?.projectId ?? state.projectId,
      postTypeId: selected?.postTypeId ?? state.postTypeId,
      creativeTemplateId: selected?.creativeTemplateId ?? state.creativeTemplateId,
      channel: selected?.placementCode ?? state.channel,
      format: selected
        ? deriveCreativeFormatFromDeliverable(
            selected.placementCode,
            selected.contentFormat,
            selected.sourceJson
          )
        : state.format,
      seriesOutputKind: selected?.contentFormat === "carousel" ? "carousel" : "single_image",
      slideCount:
        typeof selected?.sourceJson?.slideCount === "number"
          ? selected.sourceJson.slideCount
          : state.slideCount,
      goal: selected?.title ?? state.goal,
      prompt: selected?.briefText ?? state.prompt,
      offer: selected?.ctaText ?? state.offer
    }));
  }

  function handleWorkspaceModeChange(nextMode: WorkspaceCreateMode) {
    setActivePicker(null);
    setPickerQuery("");
    completedRunRefreshRef.current = null;
    setRunRefreshToken(0);

    if (nextMode === "post") {
      router.replace("/studio/create?mode=ad-hoc");
      return;
    }

    router.replace(`/studio/create?mode=${nextMode}`);
  }

  async function handleCreateCampaignRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSavingCampaignCreate(true);
    try {
      const createdCampaign = await createCampaign(sessionToken, {
        workspaceId: bootstrap.workspace.id,
        brandId: activeBrandId,
        name: campaignCreateForm.name.trim(),
        objectiveCode: campaignCreateForm.objectiveCode,
        primaryProjectId: campaignCreateForm.primaryProjectId || undefined,
        projectIds: campaignCreateForm.primaryProjectId ? [campaignCreateForm.primaryProjectId] : [],
        keyMessage: campaignCreateForm.keyMessage.trim(),
        ctaText: campaignCreateForm.ctaText.trim() || undefined,
        startAt: new Date(campaignCreateForm.startAt).toISOString(),
        endAt: new Date(campaignCreateForm.endAt).toISOString(),
        status: "draft",
        notesJson: {},
        kpiGoalJson: {}
      } satisfies CreateCampaignInput);

      setCampaignCreateForm(createDefaultCampaignCreateForm());
      setMessage("Campaign created.");
      router.push(`/studio/campaigns/${createdCampaign.id}`);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Campaign creation failed");
    } finally {
      setSavingCampaignCreate(false);
    }
  }

  async function handleCreateSeriesRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !activeBrandId) {
      return;
    }

    setSavingSeriesCreate(true);
    try {
      const createdSeries = await createSeries(sessionToken, {
        brandId: activeBrandId,
        name: seriesCreateForm.name.trim(),
        description: seriesCreateForm.description.trim() || undefined,
        status: "active",
        cadence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [],
          occurrencesAhead: 30
        },
        startAt: seriesCreateForm.startAt || undefined,
        sourceBriefJson: {}
      } satisfies CreateSeriesInput);

      setSeriesCreateForm(createEmptySeriesCreateForm());
      setMessage("Series created.");
      router.push(`/studio/series/${createdSeries.id}`);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Series creation failed");
    } finally {
      setSavingSeriesCreate(false);
    }
  }

  function handleSeriesChange(seriesId: string) {
    const selected = visibleSeries.find((item) => item.id === seriesId);
    const seriesOutputKind = readSeriesOutputKind(selected);
    const seriesSlideCount =
      readSeriesBriefNumber(selected, ["slideCount", "slides"]) ??
      (selected?.creativeTemplateId
        ? reusableTemplates.find((template) => template.id === selected.creativeTemplateId)?.config.defaultSlideCount ?? null
        : null) ??
      defaultSeriesSlideCount;
    const seriesGoal =
      readSeriesBriefString(selected, ["episodeTitle", "title", "goal"]) ??
      (selected ? `${selected.name} episode` : "");
    const seriesPrompt =
      readSeriesBriefString(selected, ["prompt", "episodeBrief", "briefText"]) ??
      selected?.description?.trim() ??
      "";
    const seriesAudience = readSeriesBriefString(selected, ["audience", "targetAudience"]) ?? "";
    const seriesOffer = readSeriesBriefString(selected, ["offer", "ctaText", "cta"]) ?? "";
    const seriesExactText = readSeriesBriefString(selected, ["exactText", "onImageText", "headline"]) ?? "";
    const seriesTemplateType =
      selected?.postTypeId
        ? postTypes.find((postType) => postType.id === selected.postTypeId)?.config.recommendedTemplateTypes[0] ??
          "announcement"
        : "announcement";

    setBriefForm((state) => ({
      ...state,
      createMode: "series_episode",
      deliverableId: undefined,
      campaignId: undefined,
      campaignPlanId: undefined,
      festivalId: undefined,
      sourceOutputId: undefined,
      seriesId: seriesId || undefined,
      projectId: selected?.projectId ?? undefined,
      postTypeId: selected?.postTypeId ?? undefined,
      creativeTemplateId: selected?.creativeTemplateId ?? undefined,
      channel: selected?.placementCode ?? defaultCreateChannel,
      format:
        selected?.placementCode && selected?.contentFormat
          ? deriveCreativeFormatFromDeliverable(
              selected.placementCode,
              selected.contentFormat,
              {}
            )
          : defaultCreateFormat,
      goal: seriesGoal,
      prompt: seriesPrompt,
      audience: seriesAudience,
      offer: seriesOffer,
      exactText: seriesExactText,
      seriesOutputKind: seriesOutputKind,
      slideCount: seriesOutputKind === "carousel" ? seriesSlideCount : defaultSeriesSlideCount,
      templateType: seriesTemplateType
    }));
  }

  function handleCampaignChange(campaignId: string) {
    const selected = visibleCampaigns.find((item) => item.id === campaignId);
    const inheritedProjectId =
      selected?.primaryProjectId ?? selected?.projectIds[0] ?? undefined;
    setBriefForm((state) => ({
      ...state,
      createMode: "campaign_asset",
      deliverableId: undefined,
      seriesId: undefined,
      festivalId: undefined,
      sourceOutputId: undefined,
      campaignId: campaignId || undefined,
      campaignPlanId: undefined,
      projectId: inheritedProjectId ?? undefined,
      postTypeId: undefined,
      creativeTemplateId: undefined,
      channel: defaultCreateChannel,
      format: defaultCreateFormat,
      seriesOutputKind: "single_image",
      slideCount: defaultSeriesSlideCount,
      goal: selected?.name ?? "",
      audience: "",
      offer: selected?.ctaText ?? "",
      exactText: "",
      prompt: selected?.keyMessage ?? ""
    }));
    setCampaignPlans([]);
  }

  function handleCampaignPlanChange(planId: string) {
    const selected = campaignPlans.find((item) => item.id === planId);
    setBriefForm((state) => ({
      ...state,
      createMode: "campaign_asset",
      campaignPlanId: planId || undefined,
      festivalId: undefined,
      projectId:
        selectedCampaign?.primaryProjectId ??
        selectedCampaign?.projectIds[0] ??
        undefined,
      postTypeId: selected?.postTypeId ?? undefined,
      creativeTemplateId: selected?.templateId ?? undefined,
      channel: selected?.placementCode ?? defaultCreateChannel,
      format:
        selected?.placementCode && selected?.contentFormat
          ? deriveCreativeFormatFromDeliverable(
              selected.placementCode,
              selected.contentFormat,
              {}
            )
          : defaultCreateFormat,
      seriesOutputKind: selected?.contentFormat === "carousel" ? "carousel" : "single_image",
      slideCount:
        selected?.contentFormat === "carousel"
          ? defaultSeriesSlideCount
          : defaultSeriesSlideCount,
      goal: selected?.name ?? "",
      prompt:
        selected?.briefOverride ??
        selectedCampaign?.keyMessage ??
        "",
      offer:
        selected?.ctaOverride ??
        selectedCampaign?.ctaText ??
        "",
      templateType:
        selected?.postTypeId
          ? postTypes.find((postType) => postType.id === selected.postTypeId)?.config.recommendedTemplateTypes[0] ??
            "announcement"
          : "announcement"
    }));
  }

  function handleSourceOutputChange(outputId: string) {
    const selected = adaptationCandidates.find((item) => item.id === outputId);
    const sourceDeliverable =
      selected?.deliverableId ? deliverableMap.get(selected.deliverableId) ?? null : null;

    setBriefForm((state) => ({
      ...state,
      createMode: "adaptation",
      deliverableId: undefined,
      campaignId: undefined,
      campaignPlanId: undefined,
      seriesId: undefined,
      festivalId: undefined,
      sourceOutputId: outputId || undefined,
      projectId: sourceDeliverable?.projectId ?? undefined,
      postTypeId: sourceDeliverable?.postTypeId ?? undefined,
      creativeTemplateId: sourceDeliverable?.creativeTemplateId ?? undefined,
      channel: sourceDeliverable?.placementCode ?? defaultCreateChannel,
      format:
        sourceDeliverable
          ? deriveCreativeFormatFromDeliverable(
              sourceDeliverable.placementCode,
              sourceDeliverable.contentFormat,
              sourceDeliverable.sourceJson
            )
          : defaultCreateFormat,
      seriesOutputKind: sourceDeliverable?.contentFormat === "carousel" ? "carousel" : "single_image",
      slideCount:
        typeof sourceDeliverable?.sourceJson?.slideCount === "number"
          ? sourceDeliverable.sourceJson.slideCount
          : defaultSeriesSlideCount,
      goal: sourceDeliverable ? `Adapt ${sourceDeliverable.title}` : "",
      prompt: sourceDeliverable
        ? "Create a new variation based on the selected post while preserving its premium feel and core message."
        : "",
      audience: "",
      offer: sourceDeliverable?.ctaText ?? "",
      exactText: ""
    }));
  }

  function toggleReferenceAsset(assetId: string) {
    if (
      !briefForm.selectedReferenceAssetIds.includes(assetId) &&
      briefForm.selectedReferenceAssetIds.length >= MAX_REFERENCE_SELECTION
    ) {
      setMessage(`Use up to ${MAX_REFERENCE_SELECTION} supporting references. Keep one template and a small reference set.`);
      return;
    }

    setBriefForm((state) => ({
      ...state,
      selectedReferenceAssetIds: state.selectedReferenceAssetIds.includes(assetId)
        ? state.selectedReferenceAssetIds.filter((id) => id !== assetId)
        : [...state.selectedReferenceAssetIds, assetId]
    }));
  }

  function clearActiveTask() {
    handleDeliverableChange("");
  }

  function clearSeries() {
    handleSeriesChange("");
  }

  function clearCampaign() {
    handleCampaignChange("");
  }

  function clearCampaignPlan() {
    handleCampaignPlanChange("");
  }

  function clearSourceOutput() {
    handleSourceOutputChange("");
  }

  function clearSelectedTemplate() {
    handleReusableTemplateChange("");
  }

  function clearSelectedReferences() {
    setBriefForm((state) => ({
      ...state,
      selectedReferenceAssetIds: []
    }));
  }

  function toggleSection(key: keyof typeof sidebarSections) {
    setSidebarSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (isCampaignCreateMode) {
    return (
      <div className="create-v2-shell">
        <aside className="create-v2-sidebar">
          <div className="create-section">
            <form className="create-section-body create-planning-form" onSubmit={handleCreateCampaignRecord}>
              <div className="create-planning-sidebar-head">
                <p className="panel-label">Campaign</p>
                <h3>Create a new campaign</h3>
                <p className="create-hint">Define the push here, then add planned posts on the campaign page.</p>
              </div>

              <div className="create-field-group">
                <label className="create-field-label">
                  Campaign name
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setCampaignCreateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="e.g. Weekend site visit push"
                    required
                    value={campaignCreateForm.name}
                  />
                </label>
                <label className="create-field-label">
                  Objective
                  <select
                    className="create-field-select"
                    onChange={(event) =>
                      setCampaignCreateForm((current) => ({
                        ...current,
                        objectiveCode: event.target.value as ObjectiveCode
                      }))
                    }
                    value={campaignCreateForm.objectiveCode}
                  >
                    {objectiveOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <SelectionRow
                actionLabel={selectedCampaignCreateProject ? "Change" : "Select"}
                emptyLabel="No project"
                helper="Optional. Add one if this campaign is about a specific project."
                label="Primary project"
                onAction={() => setActivePicker("project")}
                onClear={
                  selectedCampaignCreateProject
                    ? () => setCampaignCreateForm((current) => ({ ...current, primaryProjectId: "" }))
                    : undefined
                }
                value={selectedCampaignCreateProject?.name ?? null}
              />

              <label className="create-field-label">
                Key message
                <textarea
                  className="create-prompt-textarea"
                  onChange={(event) =>
                    setCampaignCreateForm((current) => ({ ...current, keyMessage: event.target.value }))
                  }
                  placeholder="What should every post in this campaign reinforce?"
                  required
                  rows={4}
                  value={campaignCreateForm.keyMessage}
                />
              </label>

              <div className="create-field-group">
                <label className="create-field-label">
                  CTA
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setCampaignCreateForm((current) => ({ ...current, ctaText: event.target.value }))
                    }
                    placeholder="e.g. Book a site visit"
                    value={campaignCreateForm.ctaText}
                  />
                </label>
                <label className="create-field-label">
                  Start
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setCampaignCreateForm((current) => ({ ...current, startAt: event.target.value }))
                    }
                    type="datetime-local"
                    value={campaignCreateForm.startAt}
                  />
                </label>
                <label className="create-field-label">
                  End
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setCampaignCreateForm((current) => ({ ...current, endAt: event.target.value }))
                    }
                    type="datetime-local"
                    value={campaignCreateForm.endAt}
                  />
                </label>
              </div>

              <div className="create-planning-actions">
                <button
                  className="button button-primary"
                  disabled={!activeBrandId || !bootstrap?.workspace || savingCampaignCreate}
                  type="submit"
                >
                  {savingCampaignCreate ? "Creating…" : "Create campaign"}
                </button>
              </div>
            </form>
          </div>
        </aside>

        <main className="create-v2-main">
          <div className="create-flow create-planning-flow">
            <article className="panel create-planning-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">What happens next</p>
                  <h3>Plan the campaign on its own page</h3>
                </div>
              </div>
              <p className="lede compact">
                Campaigns are planning containers. Once you create one, you’ll land on the campaign detail page to add
                planned posts, create child posts from those plans, and track review and schedule progress in one place.
              </p>
              <div className="campaign-progress-strip">
                <article className="campaign-progress-card">
                  <span>1</span>
                  <strong>Create campaign</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>2</span>
                  <strong>Add planned posts</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>3</span>
                  <strong>Create posts</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>4</span>
                  <strong>Review and schedule</strong>
                </article>
              </div>
            </article>

            <article className="panel create-planning-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Current setup</p>
                  <h3>{campaignCreateForm.name.trim() || "Untitled campaign"}</h3>
                </div>
              </div>
              <div className="create-chip-row">
                <span className="pill">{objectiveOptions.find((option) => option.value === campaignCreateForm.objectiveCode)?.label ?? "Objective"}</span>
                {selectedCampaignCreateProject ? <span className="pill">{selectedCampaignCreateProject.name}</span> : null}
                {campaignCreateForm.ctaText.trim() ? <span className="pill">{campaignCreateForm.ctaText.trim()}</span> : null}
              </div>
              <p className="create-hint">
                The campaign detail page will show the posts under this campaign as you add planned posts and create them.
              </p>
            </article>
          </div>

          {activePicker === "project" ? (
            <div className="drawer-overlay create-picker-overlay" onClick={() => setActivePicker(null)}>
              <div className="drawer-content create-picker-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="drawer-header create-picker-header">
                  <div>
                    <p className="panel-label">Campaign context</p>
                    <h2>Choose a project</h2>
                  </div>
                  <button className="drawer-close" onClick={() => setActivePicker(null)} type="button">
                    ×
                  </button>
                </div>
                <div className="drawer-body create-picker-body">
                  <div className="create-picker-toolbar">
                    <input
                      className="create-field-input"
                      onChange={(event) => setPickerQuery(event.target.value)}
                      placeholder="Search projects"
                      value={pickerQuery}
                    />
                  </div>
                  <div className="create-picker-list">
                    <button
                      className={`create-picker-row ${!selectedCampaignCreateProject ? "is-selected" : ""}`}
                      onClick={() => {
                        setCampaignCreateForm((current) => ({ ...current, primaryProjectId: "" }));
                        setActivePicker(null);
                      }}
                      type="button"
                    >
                      <div className="create-picker-row-copy">
                        <strong>No project</strong>
                      </div>
                    </button>
                    {filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        className={`create-picker-row ${campaignCreateForm.primaryProjectId === project.id ? "is-selected" : ""}`}
                        onClick={() => {
                          setCampaignCreateForm((current) => ({ ...current, primaryProjectId: project.id }));
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{project.name}</strong>
                          {project.description ? <span>{project.description}</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-footer create-picker-footer">
                  <span />
                  <button className="button button-primary" onClick={() => setActivePicker(null)} type="button">
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    );
  }

  if (isSeriesCreateMode) {
    return (
      <div className="create-v2-shell">
        <aside className="create-v2-sidebar">
          <div className="create-section">
            <form className="create-section-body create-planning-form" onSubmit={handleCreateSeriesRecord}>
              <div className="create-planning-sidebar-head">
                <p className="panel-label">Series</p>
                <h3>Create a new series</h3>
                <p className="create-hint">Start with the concept. Recurring setup and posts live on the series page.</p>
              </div>

              <div className="create-field-group">
                <label className="create-field-label">
                  Series name
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setSeriesCreateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="e.g. City facts"
                    required
                    value={seriesCreateForm.name}
                  />
                </label>
                <label className="create-field-label">
                  Start date
                  <input
                    className="create-field-input"
                    onChange={(event) =>
                      setSeriesCreateForm((current) => ({ ...current, startAt: event.target.value }))
                    }
                    type="date"
                    value={seriesCreateForm.startAt}
                  />
                </label>
              </div>

              <label className="create-field-label">
                Strategic description
                <textarea
                  className="create-prompt-textarea"
                  onChange={(event) =>
                    setSeriesCreateForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What should this recurring track keep covering over time?"
                  rows={4}
                  value={seriesCreateForm.description}
                />
              </label>

              <div className="create-planning-actions">
                <button
                  className="button button-primary"
                  disabled={!activeBrandId || savingSeriesCreate}
                  type="submit"
                >
                  {savingSeriesCreate ? "Creating…" : "Create series"}
                </button>
              </div>
            </form>
          </div>
        </aside>

        <main className="create-v2-main">
          <div className="create-flow create-planning-flow">
            <article className="panel create-planning-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">What happens next</p>
                  <h3>Manage recurring posts on the series page</h3>
                </div>
              </div>
              <p className="lede compact">
                Series are recurring tracks, not final posts. After you create one, you’ll land on its detail page to
                finish recurring setup and see the posts created under that series.
              </p>
              <div className="campaign-progress-strip">
                <article className="campaign-progress-card">
                  <span>1</span>
                  <strong>Create series</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>2</span>
                  <strong>Set recurring setup</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>3</span>
                  <strong>Create posts</strong>
                </article>
                <article className="campaign-progress-card">
                  <span>4</span>
                  <strong>Review and schedule</strong>
                </article>
              </div>
            </article>

            <article className="panel create-planning-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Current setup</p>
                  <h3>{seriesCreateForm.name.trim() || "Untitled series"}</h3>
                </div>
              </div>
              <p className="lede compact">
                {seriesCreateForm.description.trim() || "Add the recurring idea here. You’ll define the actual recurring setup after creation."}
              </p>
              <p className="create-hint">
                The series detail page has a dedicated posts tab so the child work stays visible under the series.
              </p>
            </article>
          </div>
        </main>
      </div>
    );
  }

  // ─── Alerts (merged, priority-sorted) ──────────────────────────────────────
  const alerts: Array<{ kind: "error" | "warning" | "info"; text: string }> = [];
  if (!activeBrandId) alerts.push({ kind: "info", text: "Select a brand to begin generating." });
  if (planningError) alerts.push({ kind: "error", text: planningError });
  if (runError) alerts.push({ kind: "error", text: runError });
  if (hasRunningJobs) alerts.push({ kind: "info", text: "Another generation job is running in the background. Results will refresh automatically." });

  return (
    <div className="create-v2-shell">
      {/* ──────────────────────────────────────────
          SIDEBAR
      ────────────────────────────────────────── */}
      <aside className="create-v2-sidebar">

        {/* ① CONTEXT */}
        <div className="create-section">
          <button
            className="create-section-toggle"
            onClick={() => toggleSection("context")}
            type="button"
          >
            <span className="create-section-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <span className="create-section-label">Context</span>
            <span className={`create-section-chevron ${sidebarSections.context ? "is-open" : ""}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>

          {sidebarSections.context && (
            <div className="create-section-body">
              {isPostMode ? (
                <>
                  <div className="create-mode-switch" role="tablist" aria-label="Post source">
                    <button
                      className={`create-mode-option ${!canUseDeliverableInheritance ? "is-active" : ""}`}
                      onClick={clearActiveTask}
                      role="tab"
                      type="button"
                    >
                      Ad hoc
                    </button>
                    <button
                      className={`create-mode-option ${canUseDeliverableInheritance ? "is-active" : ""}`}
                      onClick={() => setActivePicker("post-task")}
                      role="tab"
                      type="button"
                    >
                      Post task
                    </button>
                  </div>

                  <div className="create-picker-summary">
                    <div>
                      <p className="create-picker-summary-label">
                        {canUseDeliverableInheritance ? "Linked post task" : "Context"}
                      </p>
                      <strong>{canUseDeliverableInheritance ? selectedDeliverable?.title : "Ad hoc"}</strong>
                    </div>
                    <div className="create-picker-summary-actions">
                      <button
                        className="create-inline-action"
                        onClick={() => setActivePicker("post-task")}
                        disabled={planningLoading || !activeBrandId}
                        type="button"
                      >
                        {canUseDeliverableInheritance ? "Change" : "Select task"}
                      </button>
                      {canUseDeliverableInheritance ? (
                        <button className="create-inline-action subtle" onClick={clearActiveTask} type="button">
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {selectedDeliverable ? (
                    <div className="create-task-card">
                      <div className="create-task-card-header">
                        <strong>{selectedDeliverable.title}</strong>
                        <span className={`pill planner-status planner-status-${selectedDeliverable.status}`}>
                          {formatDeliverableStatus(selectedDeliverable.status)}
                        </span>
                      </div>
                      <div className="create-chip-row">
                        {selectedProject && <span className="pill">{selectedProject.name}</span>}
                        {selectedPostType && <span className="pill">{selectedPostType.name}</span>}
                        {selectedReusableTemplate && <span className="pill">{selectedReusableTemplate.name}</span>}
                        <span className="pill">{activePlacement.channelLabel}</span>
                        <span className="pill">{activePlacement.formatLabel}</span>
                        <span className="pill">{formatDisplayDate(selectedDeliverable.scheduledFor)}</span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {isSeriesEpisodeMode ? (
                <>
                  <SelectionRow
                    actionLabel={selectedSeries ? "Change" : "Choose"}
                    emptyLabel="No series"
                    helper="Choose the series."
                    label="Series"
                    onAction={() => setActivePicker("series")}
                    onClear={selectedSeries ? clearSeries : undefined}
                    value={selectedSeries?.name ?? null}
                  />
                  {selectedSeries ? (
                    <div className="create-field-group">
                      <div className="create-field-label">
                        Episode output
                        <div className="create-mode-switch" role="tablist" aria-label="Series episode output type">
                          <button
                            className={`create-mode-option ${seriesOutputKind === "single_image" ? "is-active" : ""}`}
                            onClick={() => handleSeriesOutputKindChange("single_image")}
                            role="tab"
                            type="button"
                          >
                            Single image
                          </button>
                          <button
                            className={`create-mode-option ${seriesOutputKind === "carousel" ? "is-active" : ""}`}
                            onClick={() => handleSeriesOutputKindChange("carousel")}
                            role="tab"
                            type="button"
                          >
                            Carousel
                          </button>
                        </div>
                      </div>
                      {isSeriesCarousel ? (
                        <label className="create-field-label">
                          Slide count
                          <select
                            className="create-field-select"
                            onChange={(event) => handleSeriesSlideCountChange(Number(event.target.value))}
                            value={briefForm.slideCount ?? defaultSeriesSlideCount}
                          >
                            {availableSeriesSlideCounts.map((count) => (
                              <option key={count} value={count}>
                                {count} slides
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedSeries ? (
                    <div className="create-task-card">
                      <div className="create-task-card-header">
                        <strong>{selectedSeries.name}</strong>
                        <span className="pill">Series</span>
                      </div>
                      {selectedSeries.description ? <p className="create-hint">{selectedSeries.description}</p> : null}
                      <div className="create-chip-row">
                        <span className="pill">{isSeriesCarousel ? `${briefForm.slideCount ?? defaultSeriesSlideCount} slide carousel` : "Single image"}</span>
                        {selectedProject && <span className="pill">{selectedProject.name}</span>}
                        {selectedPostType && <span className="pill">{selectedPostType.name}</span>}
                        {selectedReusableTemplate && <span className="pill">{getTemplateFamilyLabel(selectedReusableTemplate)}</span>}
                        {selectedSeries.placementCode ? <span className="pill">{activePlacement.channelLabel}</span> : null}
                      </div>
                    </div>
                  ) : (
                    <p className="create-hint">Choose a series first.</p>
                  )}
                </>
              ) : null}

              {isCampaignAssetMode ? (
                <>
                  <SelectionRow
                    actionLabel={selectedCampaign ? "Change" : "Choose"}
                    emptyLabel="No campaign"
                    helper="Choose the campaign."
                    label="Campaign"
                    onAction={() => setActivePicker("campaign")}
                    onClear={selectedCampaign ? clearCampaign : undefined}
                    value={selectedCampaign?.name ?? null}
                  />
                  <SelectionRow
                    actionLabel={selectedCampaignPlan ? "Change" : "Choose"}
                    actionDisabled={!selectedCampaign}
                    emptyLabel={selectedCampaign ? "No planned asset" : "Choose campaign first"}
                    helper="Choose the planned asset."
                    label="Planned asset"
                    onAction={() => setActivePicker("campaign-plan")}
                    onClear={selectedCampaignPlan ? clearCampaignPlan : undefined}
                    value={selectedCampaignPlan?.name ?? null}
                  />
                  {selectedCampaign ? (
                    <div className="create-task-card">
                      <div className="create-task-card-header">
                        <strong>{selectedCampaign.name}</strong>
                        <span className="pill">{selectedCampaign.status}</span>
                      </div>
                      <p className="create-hint">{selectedCampaign.keyMessage}</p>
                      <div className="create-chip-row">
                        {selectedCampaignPlan ? <span className="pill">{selectedCampaignPlan.name}</span> : null}
                        {selectedProject ? <span className="pill">{selectedProject.name}</span> : null}
                        {selectedPostType ? <span className="pill">{selectedPostType.name}</span> : null}
                        {selectedReusableTemplate ? <span className="pill">{selectedReusableTemplate.name}</span> : null}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {isAdaptationMode ? (
                <>
                  <SelectionRow
                    actionLabel={selectedSourceOutput ? "Change" : "Choose"}
                    emptyLabel="No source post"
                    helper="Choose the source post."
                    label="Source post"
                    mediaSrc={selectedSourceOutput?.previewUrl}
                    onAction={() => setActivePicker("output")}
                    onClear={selectedSourceOutput ? clearSourceOutput : undefined}
                    value={
                      selectedSourceOutput?.deliverableId
                        ? deliverableMap.get(selectedSourceOutput.deliverableId)?.title ?? "Approved post"
                        : null
                    }
                  />
                  {selectedSourceOutput ? (
                    <div className="create-task-card">
                      <div className="create-task-card-header">
                        <strong>
                          {selectedSourceOutput.deliverableId
                            ? deliverableMap.get(selectedSourceOutput.deliverableId)?.title ?? "Approved post"
                            : "Approved post"}
                        </strong>
                        <span className="pill">Adaptation source</span>
                      </div>
                      <div className="create-chip-row">
                        {selectedProject ? <span className="pill">{selectedProject.name}</span> : null}
                        {selectedPostType ? <span className="pill">{selectedPostType.name}</span> : null}
                        <span className="pill">Uses source image directly</span>
                      </div>
                    </div>
                  ) : (
                    <p className="create-hint">Uses the source post directly.</p>
                  )}
                </>
              ) : null}

              {!canUseDeliverableInheritance && !isCampaignAssetMode && (
                <div className="create-editorial-group">
                  <p className="create-editorial-label">Base Configuration</p>
                  <SelectionRow
                    actionLabel={selectedProject ? "Change" : "Select"}
                    emptyLabel="None"
                    label="Project"
                    onAction={() => setActivePicker("project")}
                    onClear={selectedProject ? () => handleProjectChange("") : undefined}
                    value={selectedProject?.name ?? null}
                  />
                  <SelectionRow
                    actionLabel={selectedPostType ? "Change" : "Select"}
                    emptyLabel="None"
                    label="Post type"
                    onAction={() => setActivePicker("post-type")}
                    onClear={selectedPostType ? () => handlePostTypeChange("") : undefined}
                    value={selectedPostType?.name ?? null}
                  />
                </div>
              )}

              {isFestiveGreeting ? (
                <>
                  <SelectionRow
                    actionLabel={
                      canUseDeliverableInheritance
                        ? selectedFestival
                          ? "Inherited"
                          : "Locked"
                        : selectedFestival
                          ? "Change"
                          : "Choose"
                    }
                    actionDisabled={canUseDeliverableInheritance}
                    emptyLabel={canUseDeliverableInheritance ? "No festival on task" : "No festival"}
                    helper={
                      canUseDeliverableInheritance
                        ? "Inherited from the post task."
                        : "Choose the festival or observance for this greeting."
                    }
                    label="Festival"
                    onAction={() => setActivePicker("festival")}
                    onClear={!canUseDeliverableInheritance && selectedFestival ? () => handleFestivalChange("") : undefined}
                    value={selectedFestival?.name ?? null}
                  />
                  {selectedFestival ? (
                    <div className="create-task-card">
                      <div className="create-task-card-header">
                        <strong>{selectedFestival.name}</strong>
                        <span className="pill">{startCase(selectedFestival.category)}</span>
                      </div>
                      <p className="create-hint">{selectedFestival.meaning}</p>
                      <div className="create-chip-row">
                        {selectedFestival.dateLabel ? <span className="pill">{selectedFestival.dateLabel}</span> : null}
                        {selectedFestival.community ? <span className="pill">{selectedFestival.community}</span> : null}
                        {selectedFestival.regions.slice(0, 2).map((region) => (
                          <span key={region} className="pill">{startCase(region)}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="create-hint">Festive posts need a festival selection so the greeting stays occasion-specific.</p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* ② BRIEF */}
        <div className="create-section">
          <button
            className="create-section-toggle"
            onClick={() => toggleSection("brief")}
            type="button"
          >
            <span className="create-section-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
            <span className="create-section-label">Brief</span>
            <span className={`create-section-chevron ${sidebarSections.brief ? "is-open" : ""}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>

          {sidebarSections.brief && (
            <div className="create-section-body">
              {/* Main Prompt */}
              <label className="create-field-label create-field-label-prominent">
                {isSeriesEpisodeMode
                  ? "Episode brief"
                  : isCampaignAssetMode
                    ? "Asset brief"
                    : isAdaptationMode
                      ? "Adaptation brief"
                      : "Creative brief"}
                <textarea
                  className="create-prompt-textarea"
                  value={briefForm.prompt}
                  onChange={(e) => setBriefForm((s) => ({ ...s, prompt: e.target.value }))}
                  placeholder={getCreativeBriefPlaceholder(selectedPostType, selectedFestival)}
                  rows={4}
                />
                <span className="create-hint">
                  Provide specific instructions. Brand, project, festival, and post-type rules are added automatically.
                </span>
                {promptTooShort ? (
                  <span className="create-field-warning">
                    Write at least {MIN_PROMPT_LENGTH} characters for a specific result.
                  </span>
                ) : null}
              </label>
              {promptPackage && !isCompiledStale ? (
                <details className="create-compiled-debug">
                  <summary>View compiled prompt</summary>
                  <div className="create-compiled-debug-body">
                    <div className="create-compiled-debug-section">
                      <p className="panel-label">Summary</p>
                      <p>{promptPackage.promptSummary}</p>
                    </div>
                    <div className="create-compiled-debug-section">
                      <p className="panel-label">Seed prompt</p>
                      <pre>{promptPackage.seedPrompt}</pre>
                    </div>
                    <div className="create-compiled-debug-section">
                      <p className="panel-label">Final prompt</p>
                      <pre>{promptPackage.finalPrompt}</pre>
                    </div>
                  </div>
                </details>
              ) : null}

              {/* Copy & Strategy Group */}
              <div className="create-editorial-group">
                <p className="create-editorial-label">Copy & Strategy</p>
                
                <div className="create-field-group">
                  <label className="create-field-label">
                    {isSeriesEpisodeMode
                      ? "Episode title"
                      : isCampaignAssetMode
                        ? "Asset title"
                        : isAdaptationMode
                          ? "New version title"
                          : "Primary Goal"}
                    <input
                      value={briefForm.goal}
                      onChange={(e) => setBriefForm((s) => ({ ...s, goal: e.target.value }))}
                      placeholder="e.g. Drive enquiry"
                      className="create-field-input"
                    />
                  </label>

                  <label className="create-field-label">
                    Target Audience
                    <input
                      value={briefForm.audience ?? ""}
                      onChange={(e) => setBriefForm((s) => ({ ...s, audience: e.target.value }))}
                      placeholder="e.g. Homebuyers and investors"
                      className="create-field-input"
                    />
                  </label>
                  
                  <label className="create-field-label">
                    Creative family
                    <select
                      value={briefForm.templateType}
                      onChange={(e) =>
                        setBriefForm((s) => ({ ...s, templateType: e.target.value as CreativeBrief["templateType"] }))
                      }
                      className="create-field-select"
                    >
                      <option value="announcement">Announcement</option>
                      <option value="hero">Hero</option>
                      <option value="product-focus">Product</option>
                      <option value="testimonial">Review</option>
                      <option value="quote">Quote</option>
                      <option value="offer">Offer</option>
                    </select>
                  </label>

                  <label className="create-field-label">
                    Offer / CTA
                    <input
                      value={briefForm.offer ?? ""}
                      onChange={(e) => setBriefForm((s) => ({ ...s, offer: e.target.value }))}
                      placeholder="e.g. Site visits now open"
                      className="create-field-input"
                    />
                  </label>

                  <label className="create-field-label">
                    On-image text
                    <input
                      value={briefForm.exactText ?? ""}
                      onChange={(e) => setBriefForm((s) => ({ ...s, exactText: e.target.value }))}
                      placeholder="e.g. Luxury residences"
                      className="create-field-input"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ③ STYLE */}
        <div className="create-section">
          <button
            className="create-section-toggle"
            onClick={() => toggleSection("style")}
            type="button"
          >
            <span className="create-section-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.477-1.125-.288-.29-.472-.686-.472-1.187 0-.926.75-1.688 1.688-1.688H16c2.188 0 4-1.813 4-4 0-4.97-4.478-9-10-9z" />
              </svg>
            </span>
            <span className="create-section-label">Style</span>
            <span className={`create-section-chevron ${sidebarSections.style ? "is-open" : ""}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>

          {sidebarSections.style && (
            <div className="create-section-body">
              <div className="create-field-group-row">
                <label className="create-field-label">
                  Channel
                  <select
                    value={briefForm.channel}
                    onChange={(e) => handleChannelChange(e.target.value as CreativeChannel)}
                    disabled={locksPlacement}
                    className="create-field-select"
                  >
                    <option value="instagram-feed">Instagram</option>
                    <option value="instagram-story">Story</option>
                    <option value="linkedin-feed">LinkedIn</option>
                    <option value="x-post">X (Twitter)</option>
                    <option value="tiktok-cover">TikTok</option>
                  </select>
                </label>
                <label className="create-field-label">
                  Format
                  <select
                    value={briefForm.format}
                    onChange={(e) => setBriefForm((s) => ({ ...s, format: e.target.value as CreativeFormat }))}
                    disabled={locksPlacement}
                    className="create-field-select"
                  >
                    {allowedFormats.map((f) => (
                      <option key={f.format} value={f.format}>{f.formatLabel}</option>
                    ))}
                  </select>
                </label>
              </div>
              {locksPlacement && (
                <p className="create-hint" style={{ marginTop: "-12px", marginBottom: "4px" }}>
                  {isCampaignAssetMode ? "Locked to planned asset" : "Locked to post task"}
                </p>
              )}

              <SelectionRow
                actionLabel={
                  locksTemplate
                    ? selectedReusableTemplate
                      ? "Inherited"
                      : "Locked"
                    : selectedReusableTemplate
                      ? "Change"
                      : "Choose"
                }
                actionDisabled={locksTemplate}
                emptyLabel="None"
                helper={
                  locksTemplate
                    ? selectedReusableTemplate
                      ? isCampaignAssetMode
                        ? "From the planned asset."
                        : "From the post task."
                      : isCampaignAssetMode
                        ? "No template on this planned asset."
                        : "No template on this post task."
                    : isSeriesEpisodeMode
                      ? "Choose a template family to anchor layout and look."
                      : "Choose a template from the library."
                }
                label={isSeriesEpisodeMode ? "Template family" : "Template"}
                mediaSrc={selectedReusableTemplate?.previewUrl || ""}
                onAction={() => setActivePicker("template")}
                onClear={
                  !locksTemplate && selectedReusableTemplate
                    ? clearSelectedTemplate
                    : undefined
                }
                value={selectedReusableTemplate?.name ?? null}
              />

              {/* Reference assets */}
              <div className="create-references-section">
                <p className="create-references-label">
                  Reference images
                  {briefForm.selectedReferenceAssetIds.length > 0 && (
                    <span className="create-references-count">
                      {briefForm.selectedReferenceAssetIds.length} selected
                    </span>
                  )}
                </p>
                {activeAssets.length === 0 ? (
                  <p className="create-hint">No brand assets uploaded yet.</p>
                ) : (
                  <>
                    <div className="create-reference-selection">
                      {selectedReferenceAssets.length > 0 ? (
                        <div className="create-reference-selection-row">
                          {selectedReferenceAssets.slice(0, MAX_REFERENCE_SELECTION).map((asset) => (
                            <button
                              key={asset.id}
                              className="create-reference-pill"
                              onClick={() => setActivePicker("references")}
                              type="button"
                            >
                              {asset.previewUrl ? (
                                <img alt={asset.label} src={asset.previewUrl} />
                              ) : (
                                <span>{getInitials(asset.label)}</span>
                              )}
                            </button>
                          ))}
                          {selectedReferenceAssets.length > MAX_REFERENCE_SELECTION ? (
                            <span className="create-reference-overflow">+{selectedReferenceAssets.length - MAX_REFERENCE_SELECTION}</span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="create-hint">No references selected.</p>
                      )}
                      <div className="create-picker-summary-actions">
                        <button className="create-inline-action" onClick={() => setActivePicker("references")} type="button">
                          {selectedReferenceAssets.length > 0 ? "Change" : "Choose references"}
                        </button>
                        {selectedReferenceAssets.length > 0 ? (
                          <button className="create-inline-action subtle" onClick={clearSelectedReferences} type="button">
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
                {activeAssets.length > 0 &&
                briefForm.selectedReferenceAssetIds.length === 0 &&
                !briefForm.sourceOutputId && (
                  <p className="create-hint">
                    {isFestiveGreeting ? "Festive greetings usually work without uploaded references." : "Add up to 2 supporting references."}
                  </p>
                )}
                {briefForm.sourceOutputId ? (
                  <p className="create-hint">Using source post as reference.</p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ──────────────────────────────────────────
          MAIN CANVAS
      ────────────────────────────────────────── */}
      <main className="create-v2-main">
        {/* Subtle, plain-text alert strip */}
        {alerts.length > 0 && (
          <div className="create-alerts">
            {alerts.map((alert, i) => (
              <div key={i} className={`create-alert create-alert-${alert.kind}`}>
                <span>{alert.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Muted breadcrumb run-bar */}
        {promptPackage && !isCompiledStale && (
          <div className="create-run-bar">
            <div className="create-run-breadcrumbs">
              <span>{compiledPlacement?.recommendedSize}</span>
              <span className="separator">/</span>
              <span>{compiledPlacement?.channelLabel}</span>
              <span className="separator">/</span>
              <span>{compiledPlacement?.formatLabel}</span>
            </div>
            <p className="create-run-prompt-text">{promptPackage?.promptSummary}</p>
          </div>
        )}

        {/* ── Generation flow area ── */}
        <div className="create-flow">

          {/* STEP INDICATOR */}
          <div className="create-stepper">
            {/* Step 1: Explore */}
            <div className={`create-step ${generatePhase === "exploring" || generatePhase === "picking" || generatePhase === "done" ? "is-done" : generatePhase === "idle" ? "is-active" : ""}`}>
              <div className="create-step-num">
                {generatePhase === "picking" || generatePhase === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : "1"}
              </div>
              <span className="create-step-label">{isAdaptationMode ? "Use source post" : "Explore styles"}</span>
              <div className="create-step-connector" />
            </div>

            {/* Step 2: Pick */}
            <div className={`create-step ${generatePhase === "done" ? "is-done" : generatePhase === "picking" ? "is-active" : ""}`}>
              <div className="create-step-num">
                {generatePhase === "done" ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : "2"}
              </div>
              <span className="create-step-label">{isAdaptationMode ? "Adjust brief" : "Pick a direction"}</span>
              <div className="create-step-connector" />
            </div>

            {/* Step 3: Options */}
            <div className={`create-step ${generatePhase === "done" ? "is-active" : ""}`}>
              <div className="create-step-num">3</div>
              <span className="create-step-label">Get options</span>
            </div>

            {/* Skip note when references selected */}
            {canCreateOptionsFromReferences && generatePhase === "idle" && (
              <span className="create-stepper-skip">
                References selected — steps 1 &amp; 2 skipped
              </span>
            )}
          </div>

          {/* ── Final options section ── */}
          <section className="create-section-canvas">
            {currentFinalOutputs.length > 0 && (
              <div className="create-canvas-header">
                <h3 className="create-canvas-title">Options</h3>
                <div className="create-canvas-actions">
                  <Link className="button button-ghost mini create-action-explore" href={currentReviewHref}>
                    Review →
                  </Link>
                  {promptPackage && !isCompiledStale && canCreateOptionsDirectly && (
                    <button
                      className="button button-ghost mini create-action-explore"
                      disabled={pendingAction === "generate-finals"}
                      onClick={() => void handleGenerateCandidates()}
                    >
                      {pendingAction === "generate-finals" ? "Generating…" : "Generate more"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isExploringDirections ? (
              <div className="create-direction-loading">
                <div className="create-direction-loading-copy">
                  <div className="create-direction-loading-status">
                    <span className="create-direction-loading-pulse" />
                    <span>Step 1 in progress</span>
                  </div>
                  <h4>{directionLoadingTitle}</h4>
                  <p>{directionLoadingBody}</p>
                  <span className="create-direction-loading-next">
                    Next, you’ll pick one direction and turn it into final options.
                  </span>
                </div>
                <div className="candidate-grid compact create-direction-loading-grid">
                  {[1, 2, 3].map((index) => (
                    <article className="candidate-card create-direction-loading-card" key={index}>
                      <div className="candidate-media thumb create-generating-shimmer" />
                      <div className="candidate-body mini create-direction-loading-meta">
                        <strong>Direction {index}</strong>
                        <span>Generating preview…</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : !promptPackage ? (
              <div className="create-empty-state">
                <div className="create-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <h4>No options yet</h4>
                <p>
                  {isAdaptationMode
                    ? "Choose a source post, then create a new version."
                    : "Add a brief, then explore styles or create options."}
                </p>
              </div>
            ) : isCompiledStale ? (
              <div className="create-stale-overlay-wrap">
                {/* Show old results behind the stale overlay */}
                <div className={`candidate-grid create-stale-grid`}>
                  {currentFinalOutputs.map((output, idx) => (
                    <article className="candidate-card create-stale-card" key={output.id || idx}>
                      <div className="candidate-media" style={{ aspectRatio: compiledPlacement?.aspectRatio === "9:16" ? "9/16" : "1/1" }}>
                        {output.previewUrl ? (
                          <img alt="" src={output.previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="create-stale-banner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4" /><path d="m16.24 7.76-2.12 2.12" /><path d="M20 12h-4" /><path d="m16.24 16.24-2.12-2.12" /><path d="M12 18v4" /><path d="m7.76 16.24 2.12-2.12" /><path d="M4 12h4" /><path d="m7.76 7.76 2.12 2.12" />
                  </svg>
                  <span>Brief has changed</span>
                  <button
                    className="button button-primary mini"
                    onClick={() => void handleGenerateCandidates()}
                    disabled={isPending || !allPreflightDone}
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            ) : currentFinalOutputs.length === 0 && currentSeedTemplates.length > 0 ? (
              <div className="create-pick-prompt">
                <p>{isAdaptationMode ? "Choose a source post to continue." : "Choose a template family, pick a style, or use references."}</p>
              </div>
            ) : (
              <div className={`candidate-grid ${runLoading ? "create-processing-pulse" : ""}`}>
                {currentFinalOutputs.map((output, idx) => (
                  <article className="candidate-card" key={output.id || idx}>
                    <div
                      className="candidate-media"
                      style={{ aspectRatio: compiledPlacement?.aspectRatio === "9:16" ? "9/16" : "1/1" }}
                    >
                      {output.previewUrl ? (
                        <ImagePreviewTrigger
                          alt={`Option ${output.outputIndex + 1} for ${promptPackage.promptSummary}`}
                          src={output.previewUrl}
                          title={`Option ${output.outputIndex + 1}`}
                          meta={promptPackage.promptSummary}
                        >
                          <img alt="" src={output.previewUrl} />
                        </ImagePreviewTrigger>
                      ) : (
                        <div className="create-generating-shimmer" />
                      )}
                    </div>
                    <div className="candidate-body">
                      <div className="candidate-info">
                        <strong>Option {output.outputIndex + 1}</strong>
                        <span>{output.reviewState.replace("_", " ")}</span>
                      </div>
                      <span className="candidate-action-hint">
                        {describeFinalOutputSource(
                          output.jobId,
                          runDetail?.jobs ?? [],
                          seedTemplateLabelById,
                          briefForm.selectedReferenceAssetIds.length,
                          Boolean(briefForm.sourceOutputId),
                          getTemplateFamilyLabel(selectedReusableTemplate)
                        )}
                      </span>
                    </div>
                  </article>
                ))}
                {runLoading && currentFinalOutputs.length === 0 &&
                  [1, 2, 3, 4].map((n) => (
                    <div key={n} className="candidate-card skeleton">
                      <div className="candidate-media create-generating-shimmer" />
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* ── Styles / Directions section ── */}
          {currentSeedTemplates.length > 0 && !isCompiledStale && !isAdaptationMode && (
            <section className="create-section-canvas">
              <div className="create-canvas-header">
                <h3 className="create-canvas-title">
                  Style directions
                </h3>
              </div>
              <div className="candidate-grid compact">
                {currentSeedTemplates.map((template) => (
                  <article
                    className={`candidate-card ${latestSelectedStyleId === template.id ? "is-style-source" : ""}`}
                    key={template.id}
                  >
                    <div className="candidate-media thumb">
                      {template.previewUrl ? (
                        <ImagePreviewTrigger
                          alt={template.label}
                          src={template.previewUrl}
                          title={template.label}
                          meta="Direction preview"
                        >
                          <img alt="" src={template.previewUrl} />
                        </ImagePreviewTrigger>
                      ) : (
                        <div className="create-generating-shimmer" />
                      )}
                      {latestSelectedStyleId === template.id && currentFinalOutputs.length > 0 && (
                        <div className="create-style-source-badge">Current source</div>
                      )}
                    </div>
                    <div className="candidate-body mini" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                      <strong style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink)' }}>{template.label}</strong>
                      <button
                        className="create-action-explore"
                        onClick={() => void handleCreateOptionsFromStyle(template.id)}
                        disabled={pendingAction === "generate-finals"}
                        style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}
                      >
                      {pendingAction === "generate-finals" &&
                      pendingTargetKey === `template:${template.id}:finals`
                          ? "Generating…"
                          : isCampaignAssetMode
                            ? "Create asset options"
                            : isSeriesEpisodeMode
                              ? isSeriesCarousel
                                ? "Create carousel options"
                                : "Create episode options"
                              : "Create options"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Hyper-Minimal Floating Dock ── */}
        {!activePicker && (
          <div className="create-generate-dock">
            <div className="create-preflight">
              <div className="create-preflight-status">
                <strong>{createDockStatus}</strong>
                <span>
                  {allPreflightDone
                    ? "Brand context and brief are ready."
                    : "Complete setup to enable generation."}
                </span>
              </div>
              <div className="create-preflight-chips">
                {preflightItems.map((item) => (
                  <div
                    key={item.id}
                    className={`create-preflight-chip ${item.done ? "is-done" : "is-pending"}`}
                    data-label={item.label}
                    aria-label={item.label}
                  />
                ))}
              </div>
            </div>

            <div className="create-action-bar">
              <button
                className="create-action-explore"
                type="button"
                disabled={isPending || !hasBriefPrompt || !hasRequiredSourceContext || !hasFestivalSelection || isAdaptationMode}
                onClick={() => void handleExploreDirections()}
              >
                {pendingAction === "generate-seeds" ? "Exploring…" : isAdaptationMode ? "Source post" : "Explore styles"}
              </button>

              <button
                className={`create-action-create ${allPreflightDone ? "" : "create-action-create-blocked"}`}
                type="button"
                disabled={isPending || !allPreflightDone || requiresStyleExplorationFirst}
                onClick={() => void handleGenerateCandidates()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                </svg>
                <span>
                  {pendingAction === "generate-finals"
                    ? "Creating…"
                    : requiresStyleExplorationFirst
                      ? "Explore styles first"
                    : isAdaptationMode
                      ? "Adapt options"
                      : "Create options"}
                </span>
              </button>
            </div>
          </div>
        )}

        {activePicker ? (
          <div className="drawer-overlay create-picker-overlay" onClick={() => setActivePicker(null)}>
            <div className="drawer-content create-picker-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-header create-picker-header">
                <div>
                  <p className="panel-label">{getPickerEyebrow(activePicker)}</p>
                  <h2>{getPickerTitle(activePicker)}</h2>
                </div>
                <button className="drawer-close" onClick={() => setActivePicker(null)} type="button">
                  ×
                </button>
              </div>
              <div className="drawer-body create-picker-body">
                <div className="create-picker-toolbar">
                  <input
                    className="create-field-input"
                    onChange={(event) => setPickerQuery(event.target.value)}
                    placeholder={getPickerPlaceholder(activePicker)}
                    value={pickerQuery}
                  />
                  {activePicker === "references" && selectedReferenceAssets.length > 0 ? (
                    <button className="button button-ghost" onClick={clearSelectedReferences} type="button">
                      Clear selected
                    </button>
                  ) : null}
                </div>

                {activePicker === "post-task" ? (
                  <>
                    <div className="create-picker-filters">
                      <div className="create-picker-filter-summary">
                        <strong>{filteredDeliverables.length}</strong>
                        <span>{filteredDeliverables.length === 1 ? "post task" : "post tasks"} in view</span>
                      </div>
                      <label className="create-picker-filter-select">
                        <span>Project</span>
                        <select
                          className="create-field-select"
                          value={postTaskProjectFilter}
                          onChange={(event) => setPostTaskProjectFilter(event.target.value)}
                        >
                          <option value="all">All projects</option>
                          <option value="__none__">No project</option>
                          {postTaskProjectOptions.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="create-picker-chip-row">
                      {POST_TASK_STATUS_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          className={`create-picker-filter-chip ${postTaskStatusFilter === option.id ? "is-active" : ""}`}
                          onClick={() => setPostTaskStatusFilter(option.id)}
                          type="button"
                        >
                          <span>{option.label}</span>
                          <strong>{postTaskStatusCounts[option.id]}</strong>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {activePicker === "post-task" ? (
                  <div className="create-picker-list">
                    {groupedDeliverables.map((group) => (
                      <section className="create-picker-group" key={group.id}>
                        <div className="create-picker-group-header">
                          <strong>{group.label}</strong>
                          <span>{group.items.length}</span>
                        </div>
                        {group.items.map((deliverable) => {
                          const placement = getPlacementSpec(
                            deliverable.placementCode,
                            deriveCreativeFormatFromDeliverable(
                              deliverable.placementCode,
                              deliverable.contentFormat,
                              deliverable.sourceJson
                            )
                          );

                          return (
                            <button
                              key={deliverable.id}
                              className={`create-picker-row create-picker-task-row ${briefForm.deliverableId === deliverable.id ? "is-selected" : ""}`}
                              onClick={() => {
                                handleDeliverableChange(deliverable.id);
                                setActivePicker(null);
                              }}
                              type="button"
                            >
                              <div className="create-picker-task-mark">
                                {deliverable.previewUrl ? (
                                  <img alt="" src={deliverable.previewUrl} />
                                ) : (
                                  <span>{getInitials(projectMap.get(deliverable.projectId ?? "")?.name ?? deliverable.title)}</span>
                                )}
                              </div>
                              <div className="create-picker-row-copy">
                                <strong>{deliverable.title}</strong>
                                <span>
                                  {[
                                    projectMap.get(deliverable.projectId ?? "")?.name ?? "No project",
                                    postTypeMap.get(deliverable.postTypeId)?.name ?? "Post",
                                    getDeliverableSourceLabel(deliverable, campaignMap, seriesMap)
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                                <div className="create-picker-meta-row">
                                  <span className="create-picker-meta-chip">
                                    {placement?.channelLabel ?? startCase(deliverable.placementCode)}
                                  </span>
                                  <span className="create-picker-meta-chip">
                                    {placement?.formatLabel ?? startCase(deliverable.contentFormat)}
                                  </span>
                                  <span className="create-picker-meta-chip subtle">
                                    {getDeliverableTimingLabel(deliverable)}
                                  </span>
                                </div>
                                {deliverable.briefText ? (
                                  <p className="create-picker-row-note">{deliverable.briefText}</p>
                                ) : null}
                              </div>
                              <div className="create-picker-row-side">
                                <span className={`pill planner-status planner-status-${deliverable.status}`}>
                                  {formatDeliverableStatus(deliverable.status)}
                                </span>
                                <span className="create-picker-row-side-date">
                                  {formatDisplayDate(deliverable.scheduledFor)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </section>
                    ))}
                    {filteredDeliverables.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No post tasks found</strong>
                        <p>Try another project, clear the status filter, or search by post type.</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activePicker === "project" ? (
                  <div className="create-picker-list">
                    <button
                      className={`create-picker-row ${!selectedProject ? "is-selected" : ""}`}
                      onClick={() => {
                        handleProjectChange("");
                        setActivePicker(null);
                      }}
                      type="button"
                    >
                      <div className="create-picker-row-copy">
                        <strong>No project</strong>
                      </div>
                    </button>
                    {filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        className={`create-picker-row ${briefForm.projectId === project.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handleProjectChange(project.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{project.name}</strong>
                          {project.description ? <span>{project.description}</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {activePicker === "post-type" ? (
                  <div className="create-picker-list">
                    <button
                      className={`create-picker-row ${!selectedPostType ? "is-selected" : ""}`}
                      onClick={() => {
                        handlePostTypeChange("");
                        setActivePicker(null);
                      }}
                      type="button"
                    >
                      <div className="create-picker-row-copy">
                        <strong>No post type</strong>
                      </div>
                    </button>
                    {filteredPostTypes.map((postType) => (
                      <button
                        key={postType.id}
                        className={`create-picker-row ${briefForm.postTypeId === postType.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handlePostTypeChange(postType.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{postType.name}</strong>
                          {postType.description ? <span>{postType.description}</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {activePicker === "festival" ? (
                  <div className="create-picker-list">
                    <button
                      className={`create-picker-row ${!selectedFestival ? "is-selected" : ""}`}
                      onClick={() => {
                        handleFestivalChange("");
                        setActivePicker(null);
                      }}
                      type="button"
                    >
                      <div className="create-picker-row-copy">
                        <strong>No festival</strong>
                      </div>
                    </button>
                    {filteredFestivals.map((festival) => (
                      <button
                        key={festival.id}
                        className={`create-picker-row ${briefForm.festivalId === festival.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handleFestivalChange(festival.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{festival.name}</strong>
                          <span>
                            {[festival.dateLabel, festival.community, festival.meaning]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <span className="pill">{startCase(festival.category)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {activePicker === "series" ? (
                  <div className="create-picker-list">
                    {filteredSeries.map((item) => (
                      <button
                        key={item.id}
                        className={`create-picker-row ${briefForm.seriesId === item.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handleSeriesChange(item.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{item.name}</strong>
                          <span>
                            {projects.find((project) => project.id === item.projectId)?.name ?? "No default project"}
                            {item.description ? ` · ${item.description}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredSeries.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No series found</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activePicker === "campaign" ? (
                  <div className="create-picker-list">
                    {filteredCampaigns.map((campaign) => (
                      <button
                        key={campaign.id}
                        className={`create-picker-row ${briefForm.campaignId === campaign.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handleCampaignChange(campaign.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-picker-row-copy">
                          <strong>{campaign.name}</strong>
                          <span>
                            {projects.find((project) => project.id === campaign.primaryProjectId)?.name ?? "No primary project"} ·{" "}
                            {campaign.status}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredCampaigns.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No campaigns found</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activePicker === "campaign-plan" ? (
                  <div className="create-picker-list">
                    {campaignPlansLoading ? (
                      <div className="empty-state compact">
                        <strong>Loading planned assets…</strong>
                      </div>
                    ) : filteredCampaignPlans.length > 0 ? (
                      filteredCampaignPlans.map((plan) => (
                        <button
                          key={plan.id}
                          className={`create-picker-row ${briefForm.campaignPlanId === plan.id ? "is-selected" : ""}`}
                          onClick={() => {
                            handleCampaignPlanChange(plan.id);
                            setActivePicker(null);
                          }}
                          type="button"
                        >
                          <div className="create-picker-row-copy">
                            <strong>{plan.name}</strong>
                            <span>
                              {postTypes.find((postType) => postType.id === plan.postTypeId)?.name ?? "Post type"} ·{" "}
                              {plan.placementCode}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-state compact">
                        <strong>{selectedCampaign ? "No planned assets found" : "Choose a campaign first"}</strong>
                      </div>
                    )}
                  </div>
                ) : null}

                {activePicker === "template" ? (
                  <div className="create-picker-gallery">
                    <button
                      className={`create-gallery-card create-gallery-card-empty ${!selectedReusableTemplate ? "is-selected" : ""}`}
                      onClick={() => {
                        handleReusableTemplateChange("");
                        setActivePicker(null);
                      }}
                      type="button"
                    >
                      <div className="create-gallery-empty-swatch">None</div>
                      <div className="create-gallery-copy">
                        <strong>No template</strong>
                      </div>
                    </button>
                    {filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        className={`create-gallery-card ${briefForm.creativeTemplateId === template.id ? "is-selected" : ""}`}
                        onClick={() => {
                          handleReusableTemplateChange(template.id);
                          setActivePicker(null);
                        }}
                        type="button"
                      >
                        <div className="create-gallery-media">
                          {template.previewUrl ? (
                            <img alt={template.name} src={template.previewUrl} />
                          ) : (
                            <div className="create-gallery-empty-swatch">{getInitials(template.name)}</div>
                          )}
                        </div>
                        <div className="create-gallery-copy">
                          <strong>{getTemplateFamilyLabel(template)}</strong>
                          <span>
                            {[
                              projects.find((project) => project.id === template.projectId)?.name ?? "Shared template",
                              getTemplateOutputKinds(template).length > 0
                                ? getTemplateOutputKinds(template)
                                    .map((kind) => (kind === "carousel" ? "Carousel" : "Single image"))
                                    .join(" · ")
                                : null
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredTemplates.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No templates match</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activePicker === "output" ? (
                  <div className="create-picker-gallery">
                    {filteredOutputs.map((output) => {
                      const deliverableTitle =
                        output.deliverableId
                          ? deliverableMap.get(output.deliverableId)?.title ?? "Approved post"
                          : "Approved post";

                      return (
                        <button
                          key={output.id}
                          className={`create-gallery-card ${briefForm.sourceOutputId === output.id ? "is-selected" : ""}`}
                          onClick={() => {
                            handleSourceOutputChange(output.id);
                            setActivePicker(null);
                          }}
                          type="button"
                        >
                          <div className="create-gallery-media">
                            {output.previewUrl ? (
                              <img alt={deliverableTitle} src={output.previewUrl} />
                            ) : (
                              <div className="create-gallery-empty-swatch">{getInitials(deliverableTitle)}</div>
                            )}
                          </div>
                          <div className="create-gallery-copy">
                            <strong>{deliverableTitle}</strong>
                            <span>{output.reviewState.replaceAll("_", " ")}</span>
                          </div>
                        </button>
                      );
                    })}
                    {filteredOutputs.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No approved recent posts found</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activePicker === "references" ? (
                  <div className="create-picker-gallery">
                    {filteredReferenceAssets.map((asset) => {
                      const selected = briefForm.selectedReferenceAssetIds.includes(asset.id);
                      return (
                        <button
                          key={asset.id}
                          className={`create-gallery-card ${selected ? "is-selected" : ""}`}
                          onClick={() => toggleReferenceAsset(asset.id)}
                          type="button"
                        >
                          <div className="create-gallery-media">
                            {asset.previewUrl ? (
                              <img alt={asset.label} src={asset.previewUrl} />
                            ) : (
                              <div className="create-gallery-empty-swatch">{getInitials(asset.label)}</div>
                            )}
                            {selected ? <div className="create-gallery-check">Selected</div> : null}
                          </div>
                          <div className="create-gallery-copy">
                            <strong>{asset.label}</strong>
                          </div>
                        </button>
                      );
                    })}
                    {filteredReferenceAssets.length === 0 ? (
                      <div className="empty-state compact">
                        <strong>No references found</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="drawer-footer create-picker-footer">
                {activePicker === "references" ? (
                  <p className="create-hint">
                    {selectedReferenceAssets.length === 0
                      ? `No references selected. Add up to ${MAX_REFERENCE_SELECTION}.`
                      : `${selectedReferenceAssets.length} reference${selectedReferenceAssets.length === 1 ? "" : "s"} selected.`}
                  </p>
                ) : (
                  <span />
                )}
                <button className="button button-primary" onClick={() => setActivePicker(null)} type="button">
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createDefaultCampaignCreateForm(): CampaignCreateFormState {
  const now = new Date();
  const later = new Date(now);
  later.setDate(later.getDate() + 21);

  return {
    name: "",
    objectiveCode: "lead_gen",
    primaryProjectId: "",
    keyMessage: "",
    ctaText: "",
    startAt: toLocalDateTimeValue(now),
    endAt: toLocalDateTimeValue(later)
  };
}

function createEmptySeriesCreateForm(): SeriesCreateFormState {
  return {
    name: "",
    description: "",
    startAt: ""
  };
}

function SelectionRow({
  label,
  value,
  emptyLabel,
  helper,
  actionLabel,
  onAction,
  onClear,
  mediaSrc,
  actionDisabled = false
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
  helper?: string;
  actionLabel: string;
  onAction: () => void;
  onClear: (() => void) | undefined;
  mediaSrc?: string | undefined;
  actionDisabled?: boolean;
}) {
  return (
    <div className="create-picker-summary create-picker-summary-card">
      <div className="create-picker-summary-main">
        {mediaSrc ? (
          <div className="create-selection-media">
            <img alt="" src={mediaSrc} />
          </div>
        ) : null}
        <div>
          <p className="create-picker-summary-label">{label}</p>
          <strong>{value ?? emptyLabel}</strong>
          {helper ? <p className="create-hint">{helper}</p> : null}
        </div>
      </div>
      <div className="create-picker-summary-actions">
        <button className="create-inline-action" disabled={actionDisabled} onClick={onAction} type="button">
          {actionLabel}
        </button>
        {onClear ? (
          <button className="create-inline-action subtle" onClick={onClear} type="button">
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatDeliverableStatus(value: DeliverableRecord["status"]) {
  return value.replaceAll("_", " ");
}

function matchesPostTaskStatusFilter(
  status: DeliverableRecord["status"],
  filter: PostTaskPickerStatusFilter
) {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return status === "planned" || status === "brief_ready" || status === "generating";
    case "review":
    case "approved":
    case "scheduled":
    case "published":
    case "blocked":
      return status === filter;
  }
}

function groupDeliverablesForPicker(items: DeliverableRecord[]) {
  const groups = [
    {
      id: "open",
      label: "Open work",
      statuses: new Set<DeliverableRecord["status"]>(["planned", "brief_ready", "generating"])
    },
    {
      id: "review",
      label: "In review",
      statuses: new Set<DeliverableRecord["status"]>(["review"])
    },
    {
      id: "approved",
      label: "Ready",
      statuses: new Set<DeliverableRecord["status"]>(["approved"])
    },
    {
      id: "scheduled",
      label: "Scheduled",
      statuses: new Set<DeliverableRecord["status"]>(["scheduled"])
    },
    {
      id: "published",
      label: "Published",
      statuses: new Set<DeliverableRecord["status"]>(["published"])
    },
    {
      id: "blocked",
      label: "Blocked",
      statuses: new Set<DeliverableRecord["status"]>(["blocked"])
    }
  ];

  return groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: items.filter((item) => group.statuses.has(item.status))
    }))
    .filter((group) => group.items.length > 0);
}

function getDeliverableSourceLabel(
  deliverable: DeliverableRecord,
  campaignMap: Map<string, CampaignRecord>,
  seriesMap: Map<string, SeriesRecord>
) {
  if (deliverable.campaignId) {
    return campaignMap.get(deliverable.campaignId)?.name ?? "Campaign";
  }

  if (deliverable.seriesId) {
    return seriesMap.get(deliverable.seriesId)?.name ?? "Series";
  }

  return startCase(deliverable.planningMode);
}

function getDeliverableTimingLabel(deliverable: DeliverableRecord) {
  const prefix =
    deliverable.status === "published"
      ? "Published"
      : deliverable.status === "scheduled"
        ? "Scheduled"
        : deliverable.status === "approved"
          ? "Ready for"
          : "Target";

  return `${prefix} ${formatDisplayDate(deliverable.scheduledFor)}`;
}

function toLocalDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function startCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getGenericFestivePrompt(): string {
  return POST_TYPE_BRIEF_STARTERS["festive-greeting"] ?? defaultPromptText;
}

function getFestivalBriefStarter(festival: FestivalRecord): string {
  return `Create a premium ${festival.name} greeting that feels respectful, elegant, and brand-safe.`;
}

function getPostTypeBriefStarter(
  postType: Pick<PostTypeRecord, "code"> | null | undefined,
  festival?: FestivalRecord | null
): string {
  if (postType?.code === "festive-greeting") {
    return festival ? getFestivalBriefStarter(festival) : getGenericFestivePrompt();
  }

  const starter = postType?.code ? POST_TYPE_BRIEF_STARTERS[postType.code] : undefined;
  return starter ?? defaultPromptText;
}

function getCreativeBriefPlaceholder(
  postType: Pick<PostTypeRecord, "code" | "name"> | null | undefined,
  festival?: Pick<FestivalRecord, "name"> | null
): string {
  switch (postType?.code) {
    case "project-launch":
      return "Example: Introduce the project with a premium hero image and a strong first-impression feel.";
    case "site-visit-invite":
      return "Example: Invite buyers to visit this weekend. Keep it premium, welcoming, and action-led.";
    case "amenity-spotlight":
      return "Example: Spotlight one hero amenity with an aspirational lifestyle angle and clean premium mood.";
    case "construction-update":
      return "Example: Show visible construction progress and build trust through a polished premium update.";
    case "festive-greeting":
      return festival
        ? `Example: Create a premium ${festival.name} greeting that feels respectful, elegant, and brand-safe.`
        : "Example: Create a premium festive greeting that feels respectful, elegant, and brand-safe.";
    default:
      return "One to three short sentences on what this post should highlight, the tone, and anything special to include.";
  }
}

function isLegacyFestivalPrompt(value: string): boolean {
  return value.includes("Background:") && value.includes("Negative prompt:");
}

function isSystemSuggestedBrief(value: string, festivals: FestivalRecord[]): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return (
    trimmed === defaultPromptText ||
    trimmed === legacyDefaultPromptText ||
    trimmed === getGenericFestivePrompt() ||
    Object.values(POST_TYPE_BRIEF_STARTERS).includes(trimmed) ||
    festivals.some((festival) => trimmed === getFestivalBriefStarter(festival)) ||
    isLegacyFestivalPrompt(trimmed)
  );
}

function getFestivalGoal(festival: FestivalRecord) {
  return `${festival.name} greeting`;
}

function getFestivalHeadline(festival: FestivalRecord) {
  return `Happy ${festival.name}`;
}

function getFestivalCreativeRecipe(code: string) {
  switch (code) {
    case "ugadi":
      return {
        aspectRatio: "9:16 or 4:5",
        background:
          "a soft light grey or warm ivory field with a subtle flowing wave texture and a faint mandala pattern in pale beige behind the subject",
        composition:
          "a ceremonial kalash with mango leaves, marigold flowers, a rich red festive cloth, and simple fruit offerings such as mangoes or bananas, arranged cleanly with one dignified focal cluster",
        typography:
          "small clean sans-serif support text, a large elegant serif festival name, and one short blessing line with generous negative space",
        decorative:
          "restrained marigold and green-leaf accents in opposite corners, keeping the frame balanced but not overcrowded",
        styleMood:
          "clean, minimal, festive, elegant, flat-vector or semi-illustrative, with polished gradients and bright Indian festival colors like red, gold, orange, green, and white",
        negativePrompt:
          "photorealistic 3D render, messy background, dark colors, extra text, watermark, distorted fruit, blurry flowers, asymmetrical layout, crowded design, neon palette"
      };
    case "maha-shivaratri":
      return {
        aspectRatio: "1:1 or 4:5",
        background:
          "a calm moonlit indigo, stone, or charcoal backdrop with subtle sacred geometry or a faint mandala texture and generous quiet negative space",
        composition:
          "one dignified Shiva-linked arrangement such as a brass trishul with a tied damaru, bilva leaves, crescent moon cues, and a soft diya glow, kept devotional and uncluttered",
        typography:
          "an elegant premium serif-sans pairing with the festival name prominent and only one short blessing line, leaving the layout composed and airy",
        decorative:
          "sparse sacred accents such as bilva leaves, rudraksha detail, or subtle mandala flourishes kept secondary to the main arrangement",
        styleMood:
          "serene, devotional, premium, still, respectful, polished illustrated or graphic-poster language rather than loud festive collage",
        negativePrompt:
          "crowded temple scene, photoreal deity portrait, gaudy collage, excessive glow, neon colors, property render, heavy sales text, clipart icons"
      };
    case "diwali":
    case "deepavali":
      return {
        aspectRatio: "1:1 or 4:5",
        background:
          "a warm ivory, muted charcoal, or midnight festive backdrop with subtle rangoli texture and soft golden light bloom",
        composition:
          "a refined arrangement of brass diyas, marigolds, and elegant festive light cues centered cleanly with room for greeting text",
        typography:
          "a graceful greeting hierarchy with a prominent elegant festival name and minimal supporting copy, preserving clear negative space",
        decorative:
          "restrained corner rangoli fragments, marigold petals, or lamp glow accents used sparsely",
        styleMood:
          "warm, luminous, celebratory, polished, premium greeting-poster styling",
        negativePrompt:
          "fireworks overload, gaudy glitter, neon palette, crowded layout, brochure styling, sales CTA, messy collage"
      };
    default:
      return {
        aspectRatio: "1:1 or 4:5",
        background:
          "a soft neutral or festival-appropriate color field with a subtle cultural pattern, faint mandala, or refined textured wash",
        composition:
          "one clear symbolic festive arrangement rooted in the occasion's meaning, using a single focal cluster rather than many unrelated elements",
        typography:
          "a premium greeting-card hierarchy with a small opener, an elegant festival name, and one short blessing line only if needed",
        decorative:
          "minimal culturally appropriate floral, leaf, rangoli, or ceremonial accents in the corners or edges",
        styleMood:
          "clean, premium, culturally respectful, modern social-poster aesthetic in polished illustrated or graphic language",
        negativePrompt:
          "photorealistic 3D render, busy background, excessive objects, neon palette, low quality, watermark, crowded flyer layout, unrelated festival symbols"
      };
  }
}

function describeFinalOutputSource(
  jobId: string,
  jobs: CreativeRunDetail["jobs"],
  seedTemplateLabelById: Map<string, string>,
  referenceAssetCount: number,
  usedSourceOutput: boolean,
  reusableTemplateLabel?: string | null
) {
  const job = jobs.find((item) => item.id === jobId);
  if (job?.selectedTemplateId) {
    const label = seedTemplateLabelById.get(job.selectedTemplateId) ?? "selected style";
    return `Created from ${label}`;
  }
  if (usedSourceOutput) return "Created from source post";
  if (referenceAssetCount > 0) return "Created with selected references";
  if (reusableTemplateLabel) return `Created with ${reusableTemplateLabel}`;
  return "Created in this run";
}

function getPickerEyebrow(activePicker: CreatePicker) {
  switch (activePicker) {
    case "post-task":
      return "Start from work";
    case "series":
      return "Recurring program";
    case "campaign":
    case "campaign-plan":
      return "Campaign source";
    case "output":
      return "Approved source";
    case "project":
    case "post-type":
      return "Optional context";
    case "festival":
      return "Occasion";
    case "template":
      return "Visual system";
    case "references":
      return "Style anchors";
  }
}

function getPickerTitle(activePicker: CreatePicker) {
  switch (activePicker) {
    case "post-task":
      return "Choose a post task";
    case "series":
      return "Choose a series";
    case "campaign":
      return "Choose a campaign";
    case "campaign-plan":
      return "Choose a planned asset";
    case "output":
      return "Choose a source post";
    case "project":
      return "Choose a project";
    case "post-type":
      return "Choose a post type";
    case "festival":
      return "Choose a festival";
    case "template":
      return "Choose a reusable template";
    case "references":
      return "Choose reference images";
  }
}

function getPickerPlaceholder(activePicker: CreatePicker) {
  switch (activePicker) {
    case "post-task":
      return "Search post tasks";
    case "series":
      return "Search series";
    case "campaign":
      return "Search campaigns";
    case "campaign-plan":
      return "Search planned assets";
    case "output":
      return "Search approved posts";
    case "project":
      return "Search projects";
    case "post-type":
      return "Search post types";
    case "festival":
      return "Search festivals";
    case "template":
      return "Search templates";
    case "references":
      return "Search references";
  }
}
