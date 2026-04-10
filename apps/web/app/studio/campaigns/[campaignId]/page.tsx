"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CampaignDeliverablePlanRecord,
  CampaignRecord,
  ChannelAccountRecord,
  CreateCampaignDeliverablePlanInput,
  CreativeChannel,
  CreativeFormat,
  ObjectiveCode,
  PostTypeRecord,
  ProjectRecord,
  UpdateCampaignInput,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  createCampaignPlan,
  getBrandPersonas,
  getCampaign,
  getCampaignPlans,
  getChannelAccounts,
  getDeliverables,
  getPlanningTemplateOptions,
  getPostTypes,
  getProjects,
  getWorkspaceMembers,
  materializeCampaignDeliverables,
  type PlanningTemplateOption,
  updateCampaign,
  updateCampaignPlan
} from "../../../../lib/api";
import { getCampaignKpiSummary, getCampaignNextStep, splitCampaignCreatedPostTasks } from "../../../../lib/campaign-detail";
import { mapCreativeFormatToContentFormat } from "../../../../lib/deliverable-helpers";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../../lib/placement-specs";
import { formatDisplayDate, formatDisplayDateRange } from "../../../../lib/formatters";
import { ImagePreviewTrigger } from "../../image-preview";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";
import { PanelSkeleton } from "../../skeleton";

type CampaignEditorState = {
  name: string;
  objectiveCode: ObjectiveCode;
  targetPersonaId: string;
  primaryProjectId: string;
  projectIds: string[];
  ownerUserId: string;
  keyMessage: string;
  ctaText: string;
  startAt: string;
  endAt: string;
  status: CampaignRecord["status"];
  notes: string;
  kpiGoal: string;
};

type PlanEditorState = {
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
  active: boolean;
};

const objectiveOptions: Array<{ value: ObjectiveCode; label: string }> = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "lead_gen", label: "Lead gen" },
  { value: "trust", label: "Trust" },
  { value: "footfall", label: "Footfall" }
];

const campaignStatusOptions: CampaignRecord["status"][] = ["draft", "active", "paused", "completed", "archived"];

function defaultPlanState(): PlanEditorState {
  return {
    name: "",
    postTypeId: "",
    templateId: "",
    channelAccountId: "",
    channel: "instagram-feed",
    format: "square",
    objectiveOverride: "",
    ctaOverride: "",
    briefOverride: "",
    scheduledOffsetDays: "0",
    active: true
  };
}

export default function CampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const { sessionToken, setMessage } = useStudio();
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [plans, setPlans] = useState<CampaignDeliverablePlanRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<PlanningTemplateOption[]>([]);
  const [accounts, setAccounts] = useState<ChannelAccountRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([]);
  const [deliverables, setDeliverables] = useState<
    Array<{ id: string; title: string; status: string; scheduledFor: string; campaignPlanId: string | null; previewUrl?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignEditorState | null>(null);
  const [planForm, setPlanForm] = useState<PlanEditorState>(defaultPlanState);

  const loadCampaign = useCallback(async () => {
    if (!sessionToken || typeof params.campaignId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getCampaign(sessionToken, params.campaignId);
      const [planRecords, projectRecords, postTypeRecords, templateRecords, accountRecords, personaRecords, deliverableRecords, memberRecords] =
        await Promise.all([
          getCampaignPlans(sessionToken, record.id),
          getProjects(sessionToken, { brandId: record.brandId }),
          getPostTypes(sessionToken),
          getPlanningTemplateOptions(sessionToken, { brandId: record.brandId }),
          getChannelAccounts(sessionToken, record.brandId),
          getBrandPersonas(sessionToken, record.brandId),
          getDeliverables(sessionToken, { campaignId: record.id, includePreviews: true }),
          getWorkspaceMembers(sessionToken)
        ]);

      setCampaign(record);
      setPlans(planRecords);
      setProjects(projectRecords);
      setPostTypes(postTypeRecords);
      setTemplates(templateRecords);
      setAccounts(accountRecords);
      setWorkspaceMembers(memberRecords);
      setPersonas(personaRecords.map((persona) => ({ id: persona.id, name: persona.name })));
      setDeliverables(
        deliverableRecords.map((deliverable) => ({
          id: deliverable.id,
          title: deliverable.title,
          status: deliverable.status,
          scheduledFor: deliverable.scheduledFor,
          campaignPlanId:
            typeof deliverable.sourceJson.campaignPlanId === "string" ? deliverable.sourceJson.campaignPlanId : null,
          ...(deliverable.previewUrl ? { previewUrl: deliverable.previewUrl } : {})
        }))
      );
      setCampaignForm(toCampaignEditorState(record));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [params.campaignId, sessionToken]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  const topbarActions = useMemo(
    () => (
      <>
        {campaign ? (
          <button
            className="button button-ghost"
            onClick={() => {
              setEditingPlanId(null);
              setPlanForm(defaultPlanState());
              setIsPlanEditorOpen(true);
            }}
            type="button"
          >
            Add planned post
          </button>
        ) : null}
        {campaign ? (
          <button
            className="button button-ghost"
            disabled={isSavingCampaign}
            onClick={() => {
              setCampaignForm(toCampaignEditorState(campaign));
              setIsEditorOpen(true);
            }}
            type="button"
          >
            {isSavingCampaign ? "Saving…" : "Edit details"}
          </button>
        ) : null}
      </>
    ),
    [campaign, isSavingCampaign]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarMeta = useMemo(() => {
    if (!campaign) {
      return null;
    }

    const linkedProjectIds = Array.from(new Set([...(campaign.projectIds ?? []), ...(campaign.primaryProjectId ? [campaign.primaryProjectId] : [])]));
    const linkedProjectNames = projects.filter((project) => linkedProjectIds.includes(project.id)).map((project) => project.name);
    const windowSummary = formatDisplayDateRange(campaign.startAt, campaign.endAt);
    const subtitle = [linkedProjectNames.length > 0 ? linkedProjectNames.join(" · ") : null, windowSummary].filter(Boolean).join(" · ");

    return {
      backHref: "/studio/campaigns",
      backLabel: "Back to campaigns",
      title: campaign.name,
      subtitle: subtitle || "Campaign detail",
      badges: (
        <>
          <span className="pill">{formatObjective(campaign.objectiveCode)}</span>
          <span className={`pill ${campaign.status === "active" ? "pill-completed" : ""}`}>{campaign.status}</span>
          {plans.length > 0 ? <span className="pill">{plans.length} planned posts</span> : null}
        </>
      )
    };
  }, [campaign, plans.length, projects]);

  useRegisterTopbarMeta(topbarMeta);

  if (loading) {
    return <PanelSkeleton />;
  }

  if (!campaign || !campaignForm || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Campaign detail</p>
          <h3>Unable to load campaign</h3>
          <p>{error ?? "Campaign not found."}</p>
        </article>
      </div>
    );
  }

  const activeCampaign = campaign;
  const linkedProjectIds = Array.from(
    new Set([...(activeCampaign.projectIds ?? []), ...(activeCampaign.primaryProjectId ? [activeCampaign.primaryProjectId] : [])])
  );
  const linkedProjects = projects.filter((project) => linkedProjectIds.includes(project.id));
  const primaryProject = projects.find((project) => project.id === activeCampaign.primaryProjectId) ?? null;
  const targetPersona = personas.find((persona) => persona.id === activeCampaign.targetPersonaId) ?? null;
  const owner = workspaceMembers.find((member) => member.id === activeCampaign.ownerUserId) ?? null;
  const kpiSummary = getCampaignKpiSummary(campaign.kpiGoalJson);
  const reviewCount = deliverables.filter((deliverable) => deliverable.status === "review").length;
  const approvedCount = deliverables.filter((deliverable) => deliverable.status === "approved").length;
  const scheduledCount = deliverables.filter((deliverable) => deliverable.status === "scheduled").length;
  const publishedCount = deliverables.filter((deliverable) => deliverable.status === "published").length;
  const linkedCreatedPostTasks = splitCampaignCreatedPostTasks(
    plans.map((plan) => plan.id),
    deliverables
  );
  const nextStep = getCampaignNextStep({
    campaignId: activeCampaign.id,
    planCount: plans.length,
    createdCount: deliverables.length,
    reviewCount,
    approvedCount,
    scheduledCount,
    publishedCount
  });
  const materializeEstimate = plans.length * Math.max(linkedProjects.length, activeCampaign.primaryProjectId ? 1 : 0);

  async function handleSaveCampaign(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !campaignForm) {
      return;
    }

    setIsSavingCampaign(true);

    try {
      await updateCampaign(sessionToken, activeCampaign.id, {
        name: campaignForm.name,
        objectiveCode: campaignForm.objectiveCode,
        targetPersonaId: campaignForm.targetPersonaId || undefined,
        primaryProjectId: campaignForm.primaryProjectId || undefined,
        projectIds: Array.from(new Set([...(campaignForm.primaryProjectId ? [campaignForm.primaryProjectId] : []), ...campaignForm.projectIds])),
        ownerUserId: campaignForm.ownerUserId || undefined,
        keyMessage: campaignForm.keyMessage,
        ctaText: campaignForm.ctaText || undefined,
        startAt: campaignForm.startAt ? new Date(campaignForm.startAt).toISOString() : undefined,
        endAt: campaignForm.endAt ? new Date(campaignForm.endAt).toISOString() : undefined,
        status: campaignForm.status,
        notesJson: campaignForm.notes ? { summary: campaignForm.notes } : {},
        kpiGoalJson: campaignForm.kpiGoal ? { primary: campaignForm.kpiGoal } : {}
      } satisfies UpdateCampaignInput);

      await loadCampaign();
      setIsEditorOpen(false);
      setMessage("Campaign updated.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Campaign update failed");
    } finally {
      setIsSavingCampaign(false);
    }
  }

  async function handleSavePlan(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken) {
      return;
    }

    setIsSavingPlan(true);

    try {
      const payload = {
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
        sortOrder: editingPlanId ? plans.find((plan) => plan.id === editingPlanId)?.sortOrder ?? 0 : plans.length,
        active: planForm.active
      } satisfies CreateCampaignDeliverablePlanInput;

      if (editingPlanId) {
        await updateCampaignPlan(sessionToken, activeCampaign.id, editingPlanId, payload);
      } else {
        await createCampaignPlan(sessionToken, activeCampaign.id, payload);
      }

      await loadCampaign();
      setEditingPlanId(null);
      setPlanForm(defaultPlanState());
      setIsPlanEditorOpen(false);
      setMessage(editingPlanId ? "Plan updated." : "Plan added.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Plan update failed");
    } finally {
      setIsSavingPlan(false);
    }
  }

  async function handleMaterialize() {
    if (!sessionToken) {
      return;
    }

    setIsMaterializing(true);

    try {
      const created = await materializeCampaignDeliverables(sessionToken, activeCampaign.id, {
        ...(activeCampaign.primaryProjectId ? { projectId: activeCampaign.primaryProjectId } : {}),
        ...(activeCampaign.startAt ? { startAt: activeCampaign.startAt } : {})
      });
      await loadCampaign();
      setMessage(created.length > 0 ? `${created.length} posts created.` : "No new posts were needed.");
    } catch (materializeError) {
      setMessage(materializeError instanceof Error ? materializeError.message : "Materialization failed");
    } finally {
      setIsMaterializing(false);
    }
  }

  function openPlanEditor(plan?: CampaignDeliverablePlanRecord) {
    if (plan) {
      setEditingPlanId(plan.id);
      setPlanForm({
        name: plan.name,
        postTypeId: plan.postTypeId,
        templateId: plan.templateId ?? "",
        channelAccountId: plan.channelAccountId ?? "",
        channel: plan.placementCode,
        format: deriveFormat(plan.placementCode, plan.contentFormat),
        objectiveOverride: plan.objectiveOverride ?? "",
        ctaOverride: plan.ctaOverride ?? "",
        briefOverride: plan.briefOverride ?? "",
        scheduledOffsetDays: typeof plan.scheduledOffsetDays === "number" ? String(plan.scheduledOffsetDays) : "0",
        active: plan.active
      });
    } else {
      setEditingPlanId(null);
      setPlanForm(defaultPlanState());
    }
    setIsPlanEditorOpen(true);
  }

  function toggleProjectSelection(projectId: string) {
    setCampaignForm((state) => {
      if (!state) {
        return state;
      }

      const isSelected = state.projectIds.includes(projectId);
      const projectIds = isSelected
        ? state.projectIds.filter((value) => value !== projectId)
        : [...state.projectIds, projectId];

      return {
        ...state,
        projectIds,
        primaryProjectId: state.primaryProjectId === projectId && isSelected ? "" : state.primaryProjectId
      };
    });
  }

  const allowedFormats = getAllowedFormats(planForm.channel);
  const activePlacement = getPlacementSpec(planForm.channel, planForm.format) ?? allowedFormats[0]!;

  return (
    <div className="page-stack">
      <section className="page-grid">
        <main className="page-span-8 page-stack">
          <section className="campaign-dashboard-hero">
            <div className="strategy-block">
              <p className="panel-label">Campaign strategy</p>
              <h2 className="strategy-title">{campaign.keyMessage || "No key message stored."}</h2>
              {getJsonText(campaign.notesJson, "summary") ? (
                <p className="strategy-notes">{getJsonText(campaign.notesJson, "summary")}</p>
              ) : null}
            </div>

            <div className="next-step-ribbon">
              <div className="next-step-context">
                <div className="next-step-title-row">
                  <span className="next-step-indicator" />
                  <strong>{nextStep.title}</strong>
                </div>
                <p className="next-step-body">{nextStep.body}</p>
              </div>

              <div className="next-step-metric-row">
                <div className="dash-metric">
                  <strong>{plans.length}</strong>
                  <span>Planned</span>
                </div>
                <div className="dash-metric">
                  <strong>{deliverables.length}</strong>
                  <span>Created</span>
                </div>
                <div className="dash-metric">
                  <strong>{reviewCount}</strong>
                  <span>Review</span>
                </div>
                <div className="dash-metric">
                  <strong>{approvedCount}</strong>
                  <span>Approved</span>
                </div>
              </div>

              <div className="next-step-button-area">
                {nextStep.intent === "add-plan" ? (
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setEditingPlanId(null);
                      setPlanForm(defaultPlanState());
                      setIsPlanEditorOpen(true);
                    }}
                    type="button"
                  >
                    {nextStep.primaryLabel}
                  </button>
                ) : null}
                {nextStep.intent === "materialize" ? (
                  <button
                    className="button button-primary"
                    disabled={isMaterializing}
                    onClick={() => void handleMaterialize()}
                    type="button"
                  >
                    {isMaterializing ? "Creating…" : nextStep.primaryLabel}
                  </button>
                ) : null}
                {"primaryHref" in nextStep ? (
                  <Link className="button button-primary" href={nextStep.primaryHref}>
                    {nextStep.primaryLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <section className="planner-section">
            <div className="planner-section-header">
              <div className="planner-section-header-title">
                <p className="panel-label">Planned posts</p>
                <h3>Deliverable roadmap</h3>
              </div>
              <span className="panel-count">{plans.length} planned posts</span>
            </div>

            {plans.length > 0 ? (
              <div className="planner-list dense-list">
                {plans.map((plan) => {
                  const postType = postTypes.find((item) => item.id === plan.postTypeId);
                  const template = templates.find((item) => item.id === plan.templateId);
                  const account = accounts.find((item) => item.id === plan.channelAccountId);
                  const placement = getPlacementSpec(plan.placementCode, deriveFormat(plan.placementCode, plan.contentFormat));
                  const createdPostTasks = linkedCreatedPostTasks.byPlanId.get(plan.id) ?? [];

                  return (
                    <article className="planner-card" key={plan.id}>
                      <div className="campaign-plan-inline-header">
                        <div className="planner-card-top-inner">
                          <p className="panel-label density-label">{postType?.name ?? "Planned post"}</p>
                          <h4>{plan.name}</h4>
                        </div>
                        <div className="planner-card-actions">
                          <span className="pill pill-sm">
                            {typeof plan.scheduledOffsetDays === "number"
                              ? plan.scheduledOffsetDays === 0
                                ? "Launch day"
                                : `Day ${plan.scheduledOffsetDays}`
                              : "No offset"}
                          </span>
                          <button className="button button-ghost button-sm" onClick={() => openPlanEditor(plan)} type="button">
                            Edit
                          </button>
                        </div>
                      </div>

                      {plan.briefOverride ? <p className="planner-copy campaign-plan-copy density-copy">{plan.briefOverride}</p> : null}

                      <div className="campaign-plan-spec-row">
                        <div className="spec-pill">
                          <span className="spec-label">Placement</span>
                          <strong>{placement?.channelLabel ?? plan.placementCode}</strong>
                        </div>
                        <div className="spec-pill">
                          <span className="spec-label">Destination</span>
                          <strong>{account?.displayName || account?.handle || "Planning only"}</strong>
                        </div>
                        <div className="spec-pill">
                          <span className="spec-label">Style</span>
                          <strong>{template?.name ?? "None"}</strong>
                        </div>
                        <div className="spec-pill">
                          <span className="spec-label">CTA</span>
                          <strong>{plan.ctaOverride ?? activeCampaign.ctaText ?? "Use campaign CTA"}</strong>
                        </div>
                      </div>

                      <div className="campaign-plan-linkage">
                        <div className="campaign-plan-linkage-header">
                          <p className="panel-label density-label">Created posts</p>
                          <span className="pill pill-sm">
                            {createdPostTasks.length} {createdPostTasks.length === 1 ? "post" : "posts"}
                          </span>
                        </div>
                        {createdPostTasks.length > 0 ? (
                          <div className="campaign-plan-task-list">
                            {createdPostTasks.map((deliverable) => (
                              <Link className="campaign-plan-task-row density-row" href={`/studio/deliverables/${deliverable.id}`} key={deliverable.id}>
                                <div className="campaign-plan-task-media">
                                  {deliverable.previewUrl ? (
                                    <img alt="" src={deliverable.previewUrl} />
                                  ) : (
                                    <div className="campaign-plan-task-fallback">{getInitials(deliverable.title)}</div>
                                  )}
                                  <div className="density-status-badge">
                                    <span className={`planner-status planner-status-${deliverable.status}`}>{formatStatus(deliverable.status)}</span>
                                  </div>
                                </div>
                                <div className="campaign-plan-task-copy">
                                  <strong>{deliverable.title}</strong>
                                  <span>{formatDisplayDate(deliverable.scheduledFor)}</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="field-hint">No post has been created from this planned post yet.</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No planned posts yet</strong>
                <p>Define the posts this campaign should create before handing work to the team.</p>
              </div>
            )}
          </section>

          {linkedCreatedPostTasks.unmapped.length > 0 ? (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Other campaign posts</p>
                  <h3>Posts not linked to a planned post</h3>
                </div>
                <span className="panel-count">
                  {linkedCreatedPostTasks.unmapped.length} posts
                </span>
              </div>
              <div className="planner-list">
                {linkedCreatedPostTasks.unmapped.map((deliverable) => (
                  <article className="planner-card planner-card-tight" key={deliverable.id}>
                    <div className="planner-card-top">
                      <div>
                        <p className="panel-label">{formatDisplayDate(deliverable.scheduledFor)}</p>
                        <h4>{deliverable.title}</h4>
                      </div>
                      <span className={`planner-status planner-status-${deliverable.status}`}>{formatStatus(deliverable.status)}</span>
                    </div>
                    <div className="campaign-plan-task-list">
                      <Link className="campaign-plan-task-row" href={`/studio/deliverables/${deliverable.id}`}>
                        <div className="campaign-plan-task-media">
                          {deliverable.previewUrl ? (
                            <ImagePreviewTrigger
                              alt={`Preview for ${deliverable.title}`}
                              meta={formatDisplayDate(deliverable.scheduledFor)}
                              mode="inline"
                              src={deliverable.previewUrl}
                              title={deliverable.title}
                            >
                              <img alt="" src={deliverable.previewUrl} />
                            </ImagePreviewTrigger>
                          ) : (
                            <div className="campaign-plan-task-fallback">{getInitials(deliverable.title)}</div>
                          )}
                        </div>
                        <div className="campaign-plan-task-copy">
                          <span>Scheduled for {formatDisplayDate(deliverable.scheduledFor)}</span>
                          <strong>{deliverable.title}</strong>
                        </div>
                        <div className="campaign-plan-task-meta">
                          <span className={`planner-status planner-status-${deliverable.status}`}>{formatStatus(deliverable.status)}</span>
                          <span className="campaign-plan-task-open">Open post task</span>
                        </div>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
        </main>

        <aside className="page-span-4 page-stack">
          <section className="snapshot-sidebar">
            <h3 className="sidebar-title">Snapshot</h3>
            <div className="snapshot-group">
              <p className="panel-label">Context</p>
              <div className="brand-chip-row density-chips">
                {linkedProjects.map((project) => (
                  <span className="pill pill-sm" key={project.id}>{project.name}</span>
                ))}
                {targetPersona ? <span className="pill pill-sm">{targetPersona.name}</span> : null}
              </div>
            </div>
            <div className="property-list">
              {owner ? (
                <div className="property-item">
                  <span>Owner</span>
                  <strong>{owner.displayName ?? owner.email}</strong>
                </div>
              ) : null}
              <div className="property-item">
                <span>Campaign window</span>
                <strong>{formatDisplayDateRange(activeCampaign.startAt, activeCampaign.endAt)}</strong>
              </div>
              {activeCampaign.ctaText ? (
                <div className="property-item">
                  <span>CTA</span>
                  <strong>{activeCampaign.ctaText}</strong>
                </div>
              ) : null}
              {kpiSummary ? (
                <div className="property-item">
                  <span>KPI target</span>
                  <strong>{kpiSummary}</strong>
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </section>

      {isEditorOpen && campaignForm ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Edit campaign</h2>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSaveCampaign}>
                <div className="planner-form-section">
                  <p className="field-group-label">Campaign setup</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Name
                      <input required value={campaignForm.name} onChange={(event) => setCampaignForm((state) => (state ? { ...state, name: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Objective
                      <select value={campaignForm.objectiveCode} onChange={(event) => setCampaignForm((state) => (state ? { ...state, objectiveCode: event.target.value as ObjectiveCode } : state))}>
                        {objectiveOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Status
                      <select value={campaignForm.status} onChange={(event) => setCampaignForm((state) => (state ? { ...state, status: event.target.value as CampaignRecord["status"] } : state))}>
                        {campaignStatusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Primary project
                      <select
                        value={campaignForm.primaryProjectId}
                        onChange={(event) =>
                          setCampaignForm((state) =>
                            state
                              ? {
                                  ...state,
                                  primaryProjectId: event.target.value,
                                  projectIds: event.target.value
                                    ? Array.from(new Set([...state.projectIds, event.target.value]))
                                    : state.projectIds
                                }
                              : state
                          )
                        }
                      >
                        <option value="">None</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </label>
                    <div className="field-label planner-form-span-2">
                      Linked projects
                      <div className="campaign-project-checklist">
                        {projects.map((project) => (
                          <label className="campaign-project-option" key={project.id}>
                            <input
                              checked={campaignForm.projectIds.includes(project.id)}
                              onChange={() => toggleProjectSelection(project.id)}
                              type="checkbox"
                            />
                            <span>{project.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="field-label">
                      Target persona
                      <select value={campaignForm.targetPersonaId} onChange={(event) => setCampaignForm((state) => (state ? { ...state, targetPersonaId: event.target.value } : state))}>
                        <option value="">None</option>
                        {personas.map((persona) => (
                          <option key={persona.id} value={persona.id}>{persona.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Owner
                      <select value={campaignForm.ownerUserId} onChange={(event) => setCampaignForm((state) => (state ? { ...state, ownerUserId: event.target.value } : state))}>
                        <option value="">Unassigned</option>
                        {workspaceMembers.map((member) => (
                          <option key={member.id} value={member.id}>{member.displayName ?? member.email}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label planner-form-span-2">
                      Key message
                      <textarea value={campaignForm.keyMessage} onChange={(event) => setCampaignForm((state) => (state ? { ...state, keyMessage: event.target.value } : state))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      CTA
                      <input value={campaignForm.ctaText} onChange={(event) => setCampaignForm((state) => (state ? { ...state, ctaText: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Start
                      <input type="datetime-local" value={campaignForm.startAt} onChange={(event) => setCampaignForm((state) => (state ? { ...state, startAt: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      End
                      <input type="datetime-local" value={campaignForm.endAt} onChange={(event) => setCampaignForm((state) => (state ? { ...state, endAt: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      KPI target
                      <input value={campaignForm.kpiGoal} onChange={(event) => setCampaignForm((state) => (state ? { ...state, kpiGoal: event.target.value } : state))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Notes
                      <textarea value={campaignForm.notes} onChange={(event) => setCampaignForm((state) => (state ? { ...state, notes: event.target.value } : state))} />
                    </label>
                  </div>
                </div>
                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsEditorOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isSavingCampaign}>
                    {isSavingCampaign ? "Saving…" : "Save campaign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {isPlanEditorOpen ? (
        <div className="drawer-overlay" onClick={() => setIsPlanEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>{editingPlanId ? "Edit planned post" : "Add planned post"}</h2>
              <button className="drawer-close" onClick={() => setIsPlanEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSavePlan}>
                <div className="planner-form-section">
                  <p className="field-group-label">Planned post spec</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Plan name
                      <input required value={planForm.name} onChange={(event) => setPlanForm((state) => ({ ...state, name: event.target.value }))} />
                    </label>
                    <label className="field-label">
                      Post type
                      <select required value={planForm.postTypeId} onChange={(event) => setPlanForm((state) => ({ ...state, postTypeId: event.target.value }))}>
                        <option value="">Select post type</option>
                        {postTypes.map((postType) => (
                          <option key={postType.id} value={postType.id}>{postType.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Template
                      <select value={planForm.templateId} onChange={(event) => setPlanForm((state) => ({ ...state, templateId: event.target.value }))}>
                        <option value="">None</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Channel account
                      <select value={planForm.channelAccountId} onChange={(event) => setPlanForm((state) => ({ ...state, channelAccountId: event.target.value }))}>
                        <option value="">Planning only</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>{account.handle}</option>
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
                      <select value={planForm.format} onChange={(event) => setPlanForm((state) => ({ ...state, format: event.target.value as CreativeFormat }))}>
                        {allowedFormats.map((format) => (
                          <option key={`${format.channel}-${format.format}`} value={format.format}>{format.formatLabel}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="placement-card">
                  <div className="placement-card-top">
                    <div>
                      <p className="panel-label">Placement fit</p>
                      <h4>{activePlacement.channelLabel} · {activePlacement.formatLabel}</h4>
                    </div>
                    <span className="placement-size-pill">{activePlacement.recommendedSize}</span>
                  </div>
                  <p className="placement-purpose">{activePlacement.purpose}</p>
                </div>

                <div className="planner-form-section">
                  <p className="field-group-label">Overrides</p>
                  <div className="planner-form-grid">
                    <label className="field-label">
                      Objective override
                      <select value={planForm.objectiveOverride} onChange={(event) => setPlanForm((state) => ({ ...state, objectiveOverride: event.target.value as ObjectiveCode | "" }))}>
                        <option value="">Use campaign objective</option>
                        {objectiveOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      CTA override
                      <input value={planForm.ctaOverride} onChange={(event) => setPlanForm((state) => ({ ...state, ctaOverride: event.target.value }))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Brief override
                      <textarea value={planForm.briefOverride} onChange={(event) => setPlanForm((state) => ({ ...state, briefOverride: event.target.value }))} />
                    </label>
                    <label className="field-label">
                      Offset days
                      <input value={planForm.scheduledOffsetDays} onChange={(event) => setPlanForm((state) => ({ ...state, scheduledOffsetDays: event.target.value }))} />
                    </label>
                    <label className="field-label">
                      Status
                      <select value={planForm.active ? "active" : "inactive"} onChange={(event) => setPlanForm((state) => ({ ...state, active: event.target.value === "active" }))}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsPlanEditorOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isSavingPlan}>
                    {isSavingPlan ? "Saving…" : editingPlanId ? "Save plan" : "Add plan"}
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

function toCampaignEditorState(campaign: CampaignRecord): CampaignEditorState {
  return {
    name: campaign.name,
    objectiveCode: campaign.objectiveCode,
    targetPersonaId: campaign.targetPersonaId ?? "",
    primaryProjectId: campaign.primaryProjectId ?? "",
    projectIds: campaign.projectIds,
    ownerUserId: campaign.ownerUserId ?? "",
    keyMessage: campaign.keyMessage,
    ctaText: campaign.ctaText ?? "",
    startAt: toLocalDateTimeValue(campaign.startAt),
    endAt: toLocalDateTimeValue(campaign.endAt),
    status: campaign.status,
    notes: getJsonText(campaign.notesJson, "summary") ?? "",
    kpiGoal: getCampaignKpiSummary(campaign.kpiGoalJson) ?? ""
  };
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function deriveFormat(placementCode: CreativeChannel, contentFormat: string): CreativeFormat {
  const allowed = getAllowedFormats(placementCode);
  const match = allowed.find((item) => mapCreativeFormatToContentFormat(item.format) === contentFormat);
  return match?.format ?? getDefaultFormat(placementCode);
}

function formatObjective(value: ObjectiveCode) {
  return value.replaceAll("_", " ");
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function getJsonText(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}
