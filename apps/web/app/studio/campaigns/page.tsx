"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CampaignDeliverablePlanRecord,
  CampaignRecord,
  ChannelAccountRecord,
  CreateCampaignInput,
  CreateCampaignDeliverablePlanInput,
  CreativeChannel,
  CreativeFormat,
  ObjectiveCode,
  PostTypeRecord,
  ProjectRecord
} from "@image-lab/contracts";
import {
  createCampaign,
  createCampaignPlan,
  getCampaignPlans,
  getCampaigns,
  getChannelAccounts,
  getPlanningTemplateOptions,
  getPostTypes,
  getProjects,
  materializeCampaignDeliverables,
  type PlanningTemplateOption
} from "../../../lib/api";
import { DataTable } from "../data-table";
import { mapCreativeFormatToContentFormat } from "../../../lib/deliverable-helpers";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../lib/placement-specs";
import { formatDisplayDateRange } from "../../../lib/formatters";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";

type CampaignFormState = {
  name: string;
  objectiveCode: ObjectiveCode;
  primaryProjectId: string;
  keyMessage: string;
  ctaText: string;
  startAt: string;
  endAt: string;
};

type PlanFormState = {
  name: string;
  postTypeId: string;
  templateId: string;
  channelAccountId: string;
  channel: CreativeChannel;
  format: CreativeFormat;
  objectiveOverride: ObjectiveCode | "";
  ctaOverride: string;
  briefOverride: string;
  scheduledOffsetDays: string;
};

const objectiveOptions: Array<{ value: ObjectiveCode; label: string }> = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "lead_gen", label: "Lead gen" },
  { value: "trust", label: "Trust" },
  { value: "footfall", label: "Footfall" }
];

function createDefaultCampaignForm(): CampaignFormState {
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

const defaultPlanForm: PlanFormState = {
  name: "",
  postTypeId: "",
  templateId: "",
  channelAccountId: "",
  channel: "instagram-feed",
  format: "square",
  objectiveOverride: "",
  ctaOverride: "",
  briefOverride: "",
  scheduledOffsetDays: "0"
};

export default function CampaignsPage() {
  const searchParams = useSearchParams();
  const handledCreateIntentRef = useRef<string | null>(null);
  const { sessionToken, bootstrap, activeBrandId, setMessage } = useStudio();
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<PlanningTemplateOption[]>([]);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [plansByCampaign, setPlansByCampaign] = useState<Record<string, CampaignDeliverablePlanRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCampaignDrawerOpen, setIsCampaignDrawerOpen] = useState(false);
  const [planCampaignId, setPlanCampaignId] = useState<string | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [materializingCampaignId, setMaterializingCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(createDefaultCampaignForm);
  const [planForm, setPlanForm] = useState<PlanFormState>(defaultPlanForm);

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => setIsCampaignDrawerOpen(true)}
        disabled={!activeBrandId || savingCampaign}
      >
        {savingCampaign ? "Saving campaign…" : "New campaign"}
      </button>
    ),
    [activeBrandId, savingCampaign]
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    if (!sessionToken || !activeBrandId) {
      setLoading(false);
      return;
    }

    const token = sessionToken;
    const brandId = activeBrandId;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [campaignRecords, projectRecords, postTypeRecords, templateRecords, accountRecords] = await Promise.all([
          getCampaigns(token, { brandId }),
          getProjects(token, { brandId }),
          getPostTypes(token),
          getPlanningTemplateOptions(token, { brandId }),
          getChannelAccounts(token, brandId)
        ]);

        const planLists = await Promise.all(
          campaignRecords.map(async (campaign) => [campaign.id, await getCampaignPlans(token, campaign.id)] as const)
        );

        if (!cancelled) {
          setCampaigns(campaignRecords);
          setProjects(projectRecords);
          setPostTypes(postTypeRecords);
          setTemplates(templateRecords);
          setChannelAccounts(accountRecords);
          setPlansByCampaign(Object.fromEntries(planLists));
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load campaigns");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, sessionToken]);

  useEffect(() => {
    const createIntent = searchParams.get("new");

    if (createIntent !== "1" || handledCreateIntentRef.current === createIntent) {
      return;
    }

    handledCreateIntentRef.current = createIntent;
    setIsCampaignDrawerOpen(true);
  }, [searchParams]);

  const visibleProjects = useMemo(
    () => (activeBrandId ? projects.filter((project) => project.brandId === activeBrandId) : projects),
    [activeBrandId, projects]
  );

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const tableColumns = useMemo(
    () => [
      {
        id: "campaign",
        header: "Campaign",
        sortValue: (campaign: CampaignRecord) => campaign.name,
        cell: (campaign: CampaignRecord) => {
          const summary = campaign.keyMessage || campaign.ctaText || null;

          return (
            <div className="data-table-primary">
              <strong className="data-table-title">{campaign.name}</strong>
              {summary ? <span className="data-table-subtitle">{summary}</span> : null}
            </div>
          );
        }
      },
      {
        id: "project",
        header: "Project",
        sortValue: (campaign: CampaignRecord) =>
          visibleProjects.find((project) => project.id === campaign.primaryProjectId)?.name ?? "",
        cell: (campaign: CampaignRecord) => {
          const projectName = visibleProjects.find((project) => project.id === campaign.primaryProjectId)?.name;
          return <span>{projectName ?? "Not linked"}</span>;
        }
      },
      {
        id: "objective",
        header: "Objective",
        sortValue: (campaign: CampaignRecord) => campaign.objectiveCode,
        cell: (campaign: CampaignRecord) => <span className="pill">{formatObjective(campaign.objectiveCode)}</span>
      },
      {
        id: "window",
        header: "Window",
        sortValue: (campaign: CampaignRecord) => campaign.startAt ?? campaign.endAt ?? "",
        cell: (campaign: CampaignRecord) => (
          <span>{formatDisplayDateRange(campaign.startAt, campaign.endAt)}</span>
        )
      },
      {
        id: "plans",
        header: "Plans",
        align: "end" as const,
        sortValue: (campaign: CampaignRecord) => plansByCampaign[campaign.id]?.length ?? 0,
        cell: (campaign: CampaignRecord) => <strong>{plansByCampaign[campaign.id]?.length ?? 0}</strong>
      },
      {
        id: "status",
        header: "Status",
        sortValue: (campaign: CampaignRecord) => campaign.status,
        cell: (campaign: CampaignRecord) => (
          <span className={`planner-status planner-status-${campaign.status}`}>{campaign.status}</span>
        )
      },
      {
        id: "actions",
        header: "Actions",
        align: "end" as const,
        className: "data-table-actions-cell",
        cell: (campaign: CampaignRecord) => {
          const planCount = plansByCampaign[campaign.id]?.length ?? 0;
          return (
            <div className="table-action-group">
              <button
                className="button button-ghost table-action-button"
                disabled={planCount === 0 || materializingCampaignId === campaign.id}
                onClick={() => void handleMaterialize(campaign)}
                type="button"
              >
                {materializingCampaignId === campaign.id ? "Working…" : "Materialize"}
              </button>
            </div>
          );
        }
      }
    ],
    [materializingCampaignId, plansByCampaign, visibleProjects]
  );

  async function handleCreateCampaign(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSavingCampaign(true);

    try {
      await createCampaign(sessionToken, {
        workspaceId: bootstrap.workspace.id,
        brandId: activeBrandId,
        name: campaignForm.name,
        objectiveCode: campaignForm.objectiveCode,
        primaryProjectId: campaignForm.primaryProjectId || undefined,
        projectIds: campaignForm.primaryProjectId ? [campaignForm.primaryProjectId] : [],
        keyMessage: campaignForm.keyMessage,
        ctaText: campaignForm.ctaText || undefined,
        startAt: new Date(campaignForm.startAt).toISOString(),
        endAt: new Date(campaignForm.endAt).toISOString(),
        status: "draft",
        notesJson: {},
        kpiGoalJson: {}
      } satisfies CreateCampaignInput);

      const refreshedCampaigns = await getCampaigns(sessionToken, { brandId: activeBrandId });
      setCampaigns(refreshedCampaigns);
      setCampaignForm(createDefaultCampaignForm());
      setIsCampaignDrawerOpen(false);
      setMessage("Campaign created.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Campaign creation failed");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function handleCreatePlan(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !planCampaignId) {
      return;
    }

    setSavingPlan(true);

    try {
      const created = await createCampaignPlan(sessionToken, planCampaignId, {
        name: planForm.name,
        postTypeId: planForm.postTypeId,
        templateId: planForm.templateId || undefined,
        channelAccountId: planForm.channelAccountId || undefined,
        placementCode: planForm.channel,
        contentFormat: mapCreativeFormatToContentFormat(planForm.format),
        objectiveOverride: planForm.objectiveOverride || undefined,
        ctaOverride: planForm.ctaOverride || undefined,
        briefOverride: planForm.briefOverride || undefined,
        scheduledOffsetDays: planForm.scheduledOffsetDays ? Number(planForm.scheduledOffsetDays) : undefined,
        sortOrder: plansByCampaign[planCampaignId]?.length ?? 0,
        active: true
      } satisfies CreateCampaignDeliverablePlanInput);

      setPlansByCampaign((state) => ({
        ...state,
        [planCampaignId]: [...(state[planCampaignId] ?? []), created]
      }));
      setPlanForm(defaultPlanForm);
      setPlanCampaignId(null);
      setMessage("Deliverable plan added.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Plan creation failed");
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleMaterialize(campaign: CampaignRecord) {
    if (!sessionToken) {
      return;
    }

    setMaterializingCampaignId(campaign.id);

    try {
      const created = await materializeCampaignDeliverables(sessionToken, campaign.id, {
        ...(campaign.primaryProjectId ? { projectId: campaign.primaryProjectId } : {}),
        ...(campaign.startAt ? { startAt: campaign.startAt } : {})
      });
      setMessage(`${created.length} deliverables materialized.`);
    } catch (materializeError) {
      setMessage(materializeError instanceof Error ? materializeError.message : "Materialization failed");
    } finally {
      setMaterializingCampaignId(null);
    }
  }

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Campaigns</p>
          <h3>Pick a brand first</h3>
          <p>Campaign planning is scoped to the active brand.</p>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Campaigns</p>
          <h3>Unable to load campaigns</h3>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-grid">
        <article className="panel page-span-12">
          <div className="panel-header">
            <div>
              <h3>{activeBrand ? activeBrand.name : "Campaigns"}</h3>
            </div>
            <span className="panel-count">{campaigns.length} campaigns</span>
          </div>

          <DataTable
            columns={tableColumns}
            defaultSort={{ columnId: "window", direction: "desc" }}
            emptyAction={
              <button className="button button-primary" onClick={() => setIsCampaignDrawerOpen(true)}>
                Create first campaign
              </button>
            }
            emptyBody="Create campaigns, then turn their plans into deliverables."
            emptyTitle="No campaigns yet"
            filters={[
              {
                id: "objective",
                label: "Objective",
                options: objectiveOptions.map((option) => ({ label: option.label, value: option.value })),
                getValue: (campaign) => campaign.objectiveCode
              },
              {
                id: "status",
                label: "Status",
                options: [
                  { label: "Draft", value: "draft" },
                  { label: "Active", value: "active" },
                  { label: "Paused", value: "paused" },
                  { label: "Completed", value: "completed" },
                  { label: "Archived", value: "archived" }
                ],
                getValue: (campaign) => campaign.status
              }
            ]}
            loading={loading}
            rowHref={(campaign) => `/studio/campaigns/${campaign.id}`}
            rowKey={(campaign) => campaign.id}
            rows={campaigns}
            search={{
              placeholder: "Search campaigns or linked projects",
              getText: (campaign) =>
                [
                  campaign.name,
                  campaign.keyMessage,
                  campaign.ctaText,
                  visibleProjects.find((project) => project.id === campaign.primaryProjectId)?.name
                ]
                  .filter(Boolean)
                  .join(" ")
            }}
          />
        </article>
      </section>

      {isCampaignDrawerOpen ? (
        <div className="drawer-overlay" onClick={() => setIsCampaignDrawerOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Create campaign</h2>
              <button className="drawer-close" onClick={() => setIsCampaignDrawerOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleCreateCampaign}>
                <div className="planner-form-section">
                  <p className="field-group-label">Campaign setup</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Name
                      <input
                        required
                        value={campaignForm.name}
                        onChange={(event) => setCampaignForm((state) => ({ ...state, name: event.target.value }))}
                        placeholder="Weekend site visit push"
                      />
                    </label>

                    <label className="field-label">
                      Objective
                      <select
                        value={campaignForm.objectiveCode}
                        onChange={(event) =>
                          setCampaignForm((state) => ({
                            ...state,
                            objectiveCode: event.target.value as ObjectiveCode
                          }))
                        }
                      >
                        {objectiveOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Primary project
                      <select
                        required
                        value={campaignForm.primaryProjectId}
                        onChange={(event) =>
                          setCampaignForm((state) => ({ ...state, primaryProjectId: event.target.value }))
                        }
                      >
                        <option value="">Select project</option>
                        {visibleProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label planner-form-span-2">
                      Key message
                      <textarea
                        required
                        rows={3}
                        value={campaignForm.keyMessage}
                        onChange={(event) => setCampaignForm((state) => ({ ...state, keyMessage: event.target.value }))}
                        placeholder="Position this project as the strongest premium family-led address in the micro-market."
                      />
                    </label>

                    <label className="field-label planner-form-span-2">
                      CTA
                      <input
                        value={campaignForm.ctaText}
                        onChange={(event) => setCampaignForm((state) => ({ ...state, ctaText: event.target.value }))}
                        placeholder="Book a site visit"
                      />
                    </label>

                    <label className="field-label">
                      Start
                      <input
                        type="datetime-local"
                        value={campaignForm.startAt}
                        onChange={(event) => setCampaignForm((state) => ({ ...state, startAt: event.target.value }))}
                      />
                    </label>

                    <label className="field-label">
                      End
                      <input
                        type="datetime-local"
                        value={campaignForm.endAt}
                        onChange={(event) => setCampaignForm((state) => ({ ...state, endAt: event.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsCampaignDrawerOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={savingCampaign}>
                    {savingCampaign ? "Saving…" : "Create campaign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {planCampaignId ? (
        <div className="drawer-overlay" onClick={() => setPlanCampaignId(null)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Add deliverable plan</h2>
              <button className="drawer-close" onClick={() => setPlanCampaignId(null)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleCreatePlan}>
                <div className="planner-form-section">
                  <p className="field-group-label">Plan spec</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Plan name
                      <input
                        required
                        value={planForm.name}
                        onChange={(event) => setPlanForm((state) => ({ ...state, name: event.target.value }))}
                        placeholder="Instagram launch feed post"
                      />
                    </label>

                    <label className="field-label">
                      Post type
                      <select
                        required
                        value={planForm.postTypeId}
                        onChange={(event) => setPlanForm((state) => ({ ...state, postTypeId: event.target.value }))}
                      >
                        <option value="">Select post type</option>
                        {postTypes.map((postType) => (
                          <option key={postType.id} value={postType.id}>
                            {postType.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Template
                      <select
                        value={planForm.templateId}
                        onChange={(event) => setPlanForm((state) => ({ ...state, templateId: event.target.value }))}
                      >
                        <option value="">No template</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Placement
                      <select
                        value={planForm.channel}
                        onChange={(event) =>
                          setPlanForm((state) => ({
                            ...state,
                            channel: event.target.value as CreativeChannel,
                            format: getDefaultFormat(event.target.value as CreativeChannel)
                          }))
                        }
                      >
                        <option value="instagram-feed">Instagram feed</option>
                        <option value="instagram-story">Instagram story</option>
                        <option value="linkedin-feed">LinkedIn feed</option>
                        <option value="x-post">X post</option>
                        <option value="ad-creative">Ad creative</option>
                      </select>
                    </label>

                    <label className="field-label">
                      Format
                      <select
                        value={planForm.format}
                        onChange={(event) =>
                          setPlanForm((state) => ({ ...state, format: event.target.value as CreativeFormat }))
                        }
                      >
                        {getAllowedFormats(planForm.channel).map((spec) => (
                          <option key={`${spec.channel}-${spec.format}`} value={spec.format}>
                            {spec.formatLabel}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Offset days
                      <input
                        type="number"
                        value={planForm.scheduledOffsetDays}
                        onChange={(event) =>
                          setPlanForm((state) => ({ ...state, scheduledOffsetDays: event.target.value }))
                        }
                      />
                    </label>

                    <label className="field-label">
                      Channel account
                      <select
                        value={planForm.channelAccountId}
                        onChange={(event) =>
                          setPlanForm((state) => ({ ...state, channelAccountId: event.target.value }))
                        }
                      >
                        <option value="">Not linked</option>
                        {channelAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.platform} · {account.handle}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Objective override
                      <select
                        value={planForm.objectiveOverride}
                        onChange={(event) =>
                          setPlanForm((state) => ({
                            ...state,
                            objectiveOverride: event.target.value as ObjectiveCode | ""
                          }))
                        }
                      >
                        <option value="">Use campaign objective</option>
                        {objectiveOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label planner-form-span-2">
                      Brief override
                      <textarea
                        rows={3}
                        value={planForm.briefOverride}
                        onChange={(event) => setPlanForm((state) => ({ ...state, briefOverride: event.target.value }))}
                        placeholder="Architectural hero with strong launch headline and lead CTA."
                      />
                    </label>

                    <label className="field-label">
                      CTA override
                      <input
                        value={planForm.ctaOverride}
                        onChange={(event) => setPlanForm((state) => ({ ...state, ctaOverride: event.target.value }))}
                        placeholder="Book a site visit"
                      />
                    </label>

                    <div className="placement-note planner-form-span-2">
                      <strong>{getPlacementSpec(planForm.channel, planForm.format)?.formatLabel}</strong>
                      <p>{getPlacementSpec(planForm.channel, planForm.format)?.purpose}</p>
                    </div>
                  </div>
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setPlanCampaignId(null)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={savingPlan}>
                    {savingPlan ? "Saving…" : "Add plan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatObjective(value: ObjectiveCode) {
  return value.replace("_", " ");
}


function toLocalDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
