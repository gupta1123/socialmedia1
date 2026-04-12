"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChannelAccountRecord,
  CreativeChannel,
  CreativeFormat,
  DeliverableDetail,
  DeliverablePriority,
  DeliverableStatus,
  ObjectiveCode,
  PostingWindowRecord,
  PostTypeRecord,
  ProjectRecord,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  getBrandPersonas,
  getCampaigns,
  getChannelAccounts,
  getDeliverable,
  getPostingWindows,
  getPlanningTemplateOptions,
  getPostTypes,
  getProjects,
  getWorkspaceMembers,
  updateDeliverable
} from "../../../../lib/api";
import {
  deriveCreativeFormatFromDeliverable,
  mapCreativeFormatToContentFormat
} from "../../../../lib/deliverable-helpers";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../../lib/placement-specs";
import { buildPostingWindowSuggestions } from "../../../../lib/posting-windows";
import { formatDisplayDate, formatDisplayDateTime } from "../../../../lib/formatters";
import { ImagePreviewTrigger } from "../../image-preview";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";

type DeliverableEditorState = {
  projectId: string;
  campaignId: string;
  personaId: string;
  postTypeId: string;
  creativeTemplateId: string;
  channelAccountId: string;
  ownerUserId: string;
  reviewerUserId: string;
  objectiveCode: ObjectiveCode;
  channel: CreativeChannel;
  format: CreativeFormat;
  title: string;
  briefText: string;
  ctaText: string;
  scheduledFor: string;
  priority: DeliverablePriority;
  status: DeliverableStatus;
};

const statusOptions: DeliverableStatus[] = [
  "planned",
  "brief_ready",
  "generating",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
  "blocked"
];

const priorityOptions: DeliverablePriority[] = ["low", "normal", "high", "urgent"];

const objectiveOptions: Array<{ value: ObjectiveCode; label: string }> = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "lead_gen", label: "Lead gen" },
  { value: "trust", label: "Trust" },
  { value: "footfall", label: "Footfall" }
];

export default function DeliverableDetailPage() {
  const params = useParams<{ deliverableId: string }>();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const { sessionToken, setMessage } = useStudio();
  const [detail, setDetail] = useState<DeliverableDetail | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [postingWindows, setPostingWindows] = useState<PostingWindowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"default" | "schedule">("default");
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<DeliverableEditorState | null>(null);
  const [intentHandled, setIntentHandled] = useState(false);

  const loadDeliverable = useCallback(async () => {
    if (!sessionToken || typeof params.deliverableId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getDeliverable(sessionToken, params.deliverableId);
      const [
        projectRecords,
        campaignRecords,
        personaRecords,
        postTypeRecords,
        templateRecords,
        accountRecords,
        postingWindowRecords,
        memberRecords
      ] =
        await Promise.all([
          getProjects(sessionToken, { brandId: record.deliverable.brandId }),
          getCampaigns(sessionToken, { brandId: record.deliverable.brandId }),
          getBrandPersonas(sessionToken, record.deliverable.brandId),
          getPostTypes(sessionToken),
          getPlanningTemplateOptions(sessionToken, { brandId: record.deliverable.brandId }),
          getChannelAccounts(sessionToken, record.deliverable.brandId),
          getPostingWindows(sessionToken, record.deliverable.brandId),
          getWorkspaceMembers(sessionToken)
        ]);

      setDetail(record);
      setProjects(projectRecords);
      setCampaigns(campaignRecords.map((campaign) => ({ id: campaign.id, name: campaign.name })));
      setPersonas(personaRecords.map((persona) => ({ id: persona.id, name: persona.name })));
      setPostTypes(postTypeRecords);
      setTemplates(templateRecords.map((template) => ({ id: template.id, name: template.name })));
      setChannelAccounts(accountRecords);
      setPostingWindows(postingWindowRecords);
      setWorkspaceMembers(memberRecords);
      setFormState(toDeliverableEditorState(record));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load deliverable");
    } finally {
      setLoading(false);
    }
  }, [params.deliverableId, sessionToken]);

  useEffect(() => {
    void loadDeliverable();
  }, [loadDeliverable]);

  useEffect(() => {
    setIntentHandled(false);
  }, [intent, params.deliverableId]);

  const openEditor = useCallback(
    (mode: "default" | "schedule" = "default") => {
      if (!detail) {
        return;
      }

      const nextState = toDeliverableEditorState(detail);

      if (mode === "schedule" && (detail.deliverable.status === "approved" || detail.deliverable.status === "review")) {
        nextState.status = "scheduled";
      }

      setFormState(nextState);
      setEditorMode(mode);
      setIsEditorOpen(true);
    },
    [detail]
  );

  useEffect(() => {
    if (!detail || intentHandled || isEditorOpen) {
      return;
    }

    if (intent === "schedule") {
      openEditor("schedule");
      setIntentHandled(true);
    }
  }, [detail, intent, intentHandled, isEditorOpen, openEditor]);

  const topbarActions = useMemo(
    () => (
      <>
        {detail ? (
          <button
            className="button button-ghost"
            disabled={isSaving}
            onClick={() => {
              openEditor();
            }}
            type="button"
          >
            {isSaving ? "Saving…" : "Edit details"}
          </button>
        ) : null}
      </>
    ),
    [detail, isSaving, openEditor]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarMeta = useMemo(() => {
    if (!detail) {
      return null;
    }

    return {
      backHref: "/studio/deliverables",
      backLabel: "Back to post tasks",
      title: detail.deliverable.title,
      subtitle: detail.deliverable.briefText ?? "Post-task detail",
      badges: (
        <>
          <span className="pill">{formatObjective(detail.deliverable.objectiveCode)}</span>
          <span className={`pill pill-review-${detail.deliverable.status === "review" ? "pending_review" : detail.deliverable.status === "approved" ? "approved" : "closed"}`}>
            {formatStatus(detail.deliverable.status)}
          </span>
          <span className="pill">{formatDisplayDate(detail.deliverable.scheduledFor)}</span>
        </>
      )
    };
  }, [detail]);

  useRegisterTopbarMeta(topbarMeta);

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Post task</p>
          <h3>Loading post task…</h3>
        </article>
      </div>
    );
  }

  if (!detail || !formState || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Post task</p>
          <h3>Unable to load post task</h3>
          <p>{error ?? "Post task not found."}</p>
        </article>
      </div>
    );
  }

  const deliverable = detail.deliverable;
  const project = projects.find((item) => item.id === deliverable.projectId) ?? null;
  const campaign = campaigns.find((item) => item.id === deliverable.campaignId) ?? null;
  const persona = personas.find((item) => item.id === deliverable.personaId) ?? null;
  const postType = postTypes.find((item) => item.id === deliverable.postTypeId) ?? null;
  const template = templates.find((item) => item.id === deliverable.creativeTemplateId) ?? null;
  const account = channelAccounts.find((item) => item.id === deliverable.channelAccountId) ?? null;
  const assignee = workspaceMembers.find((member) => member.id === deliverable.ownerUserId) ?? null;
  const reviewer = workspaceMembers.find((member) => member.id === deliverable.reviewerUserId) ?? null;
  const placement = getPlacementSpec(
    deliverable.placementCode,
    deriveCreativeFormatFromDeliverable(
      deliverable.placementCode,
      deliverable.contentFormat,
      deliverable.sourceJson
    )
  );
  const approvedVersion =
    detail.postVersions.find((version) => version.id === deliverable.approvedPostVersionId) ?? null;
  const latestVersion = detail.postVersions.find((version) => version.id === deliverable.latestPostVersionId) ?? detail.postVersions[0] ?? null;
  const showcaseVersion = approvedVersion ?? latestVersion;
  const suggestedPostingSlots = buildPostingWindowSuggestions(
    postingWindows,
    formState.channel,
    new Date(formState.scheduledFor)
  );
  const isScheduleEditor = editorMode === "schedule";
  const nextStep = getNextStepConfig(deliverable.id, deliverable.status, openEditor);

  async function handleSaveDeliverable(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !formState) {
      return;
    }

    setIsSaving(true);

    try {
      await updateDeliverable(sessionToken, deliverable.id, {
        projectId: formState.projectId,
        campaignId: formState.campaignId || undefined,
        seriesId: deliverable.seriesId ?? undefined,
        personaId: formState.personaId || undefined,
        contentPillarId: deliverable.contentPillarId ?? undefined,
        postTypeId: formState.postTypeId,
        creativeTemplateId: formState.creativeTemplateId || undefined,
        channelAccountId: formState.channelAccountId || undefined,
        ownerUserId: formState.ownerUserId || undefined,
        reviewerUserId: formState.reviewerUserId || null,
        planningMode: deliverable.planningMode,
        objectiveCode: formState.objectiveCode,
        placementCode: formState.channel,
        contentFormat: mapCreativeFormatToContentFormat(formState.format),
        title: formState.title,
        briefText: formState.briefText || undefined,
        ctaText: formState.ctaText || undefined,
        scheduledFor: new Date(formState.scheduledFor).toISOString(),
        priority: formState.priority,
        status: formState.status,
        approvedPostVersionId: deliverable.approvedPostVersionId ?? undefined,
        seriesOccurrenceDate: deliverable.seriesOccurrenceDate ?? undefined,
        sourceJson: {
          ...deliverable.sourceJson,
          creativeFormat: formState.format
        }
      });

      await loadDeliverable();
      setIsEditorOpen(false);
      setMessage("Deliverable updated.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Deliverable update failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-grid">
        <main className="page-span-8 page-stack">
          {showcaseVersion?.previewUrl ? (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">{approvedVersion ? "Approved creative" : "Latest creative"}</p>
                  <h3>{approvedVersion ? "This is the accepted post for the deliverable" : "Most recent candidate on this deliverable"}</h3>
                </div>
                <span className={`planner-status planner-status-${showcaseVersion.status}`}>
                  {showcaseVersion.status}
                </span>
              </div>
              <div className="creative-preview-frame final-frame deliverable-showcase-frame">
                <ImagePreviewTrigger
                  alt={`${deliverable.title} version ${showcaseVersion.versionNumber}`}
                  src={showcaseVersion.previewUrl}
                  title={deliverable.title}
                  meta={`Version ${showcaseVersion.versionNumber}`}
                >
                  <img
                    alt={`${deliverable.title} version ${showcaseVersion.versionNumber}`}
                    src={showcaseVersion.previewUrl}
                  />
                </ImagePreviewTrigger>
              </div>
            </article>
          ) : null}

          <article className="panel deliverable-next-step">
            <div className="deliverable-next-step-copy">
              <p className="panel-label">Next step</p>
              <h3>{nextStep.title}</h3>
              <p className="lede compact">{nextStep.description}</p>
            </div>
            <div className="deliverable-next-step-actions">
              {nextStep.primary.kind === "link" ? (
                <Link className="button button-primary" href={nextStep.primary.href}>
                  {nextStep.primary.label}
                </Link>
              ) : (
                <button className="button button-primary" onClick={nextStep.primary.onClick} type="button">
                  {nextStep.primary.label}
                </button>
              )}
              {nextStep.secondary ? (
                nextStep.secondary.kind === "link" ? (
                  <Link className="button button-ghost" href={nextStep.secondary.href}>
                    {nextStep.secondary.label}
                  </Link>
                ) : (
                  <button className="button button-ghost" onClick={nextStep.secondary.onClick} type="button">
                    {nextStep.secondary.label}
                  </button>
                )
              ) : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Brief</p>
                <h3>What the creative needs to communicate</h3>
              </div>
            </div>
            <p className="lede compact">{deliverable.briefText ?? "No structured brief stored yet."}</p>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Post versions</p>
                <h3>Approved or pending content versions</h3>
              </div>
              <span className="panel-count">{detail.postVersions.length}</span>
            </div>
            {detail.postVersions.length > 0 ? (
              <div className="planner-list">
                {detail.postVersions.map((version) => (
                  <article className="planner-card" key={version.id}>
                    <div className="planner-version-layout">
                      <div className="planner-version-copy">
                        <div className="planner-card-top">
                          <div>
                            <p className="panel-label">Version {version.versionNumber}</p>
                            <h4>{version.headline ?? "No headline stored"}</h4>
                          </div>
                          <span className={`planner-status planner-status-${version.status}`}>{version.status}</span>
                        </div>
                        <p className="planner-copy">{version.caption ?? "No caption saved for this version yet."}</p>
                        {version.hashtags.length > 0 ? (
                          <div className="brand-chip-row">
                            {version.hashtags.map((hashtag) => (
                              <span className="pill" key={hashtag}>{hashtag}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {version.previewUrl ? (
                        <div className="planner-version-preview">
                          <ImagePreviewTrigger
                            alt={`${deliverable.title} version ${version.versionNumber}`}
                            src={version.previewUrl}
                            title={deliverable.title}
                            meta={`Version ${version.versionNumber}`}
                          >
                            <img alt={`${deliverable.title} version ${version.versionNumber}`} src={version.previewUrl} />
                          </ImagePreviewTrigger>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No post versions yet</strong>
                <p>Use Create to generate directions and finals, then promote a final into a post version.</p>
                <Link className="button button-primary" href={`/studio/create?deliverableId=${deliverable.id}`}>
                  Start creation
                </Link>
              </div>
            )}
          </article>

          {detail.publications.length > 0 ? (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-label">Publishing placeholders</p>
                  <h3>Where this deliverable is scheduled to go next</h3>
                </div>
                <span className="panel-count">{detail.publications.length}</span>
              </div>
              <div className="planner-list">
                {detail.publications.map((publication) => (
                  <article className="planner-card planner-card-tight" key={publication.id}>
                    <div className="planner-card-top">
                      <div>
                        <p className="panel-label">{publication.provider ?? "manual"}</p>
                        <h4>{publication.status}</h4>
                      </div>
                      <span className={`planner-status planner-status-${publication.status}`}>{publication.status}</span>
                    </div>
                    <div className="planner-meta-grid">
                      <div>
                        <span>Scheduled for</span>
                        <strong>{publication.scheduledFor ? formatDisplayDateTime(publication.scheduledFor) : "Not scheduled"}</strong>
                      </div>
                      <div>
                        <span>Published</span>
                        <strong>{publication.publishedAt ? formatDisplayDateTime(publication.publishedAt) : "Not published"}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ) : null}
        </main>

        <aside className="page-span-4 page-stack">
          <article className="sidebar-panel">
            <h3>Scope & placement</h3>
            <div className="sidebar-chip-block">
              <p className="panel-label">Context</p>
              <div className="brand-chip-row">
                {project ? <span className="pill">{project.name}</span> : null}
                {campaign ? <span className="pill">{campaign.name}</span> : null}
                {persona ? <span className="pill">{persona.name}</span> : null}
                {postType ? <span className="pill pill-review-approved">{postType.name}</span> : null}
                {template ? <span className="pill">{template.name}</span> : null}
                <span className="pill">{placement?.channelLabel ?? deliverable.placementCode}</span>
                <span className="pill">{placement?.formatLabel ?? deliverable.contentFormat}</span>
                {deliverable.priority !== "normal" ? (
                  <span className={`pill ${deliverable.priority === "urgent" || deliverable.priority === "high" ? "pill-review-needs_revision" : ""}`}>
                    {deliverable.priority}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="property-list">
              <div className="property-item">
                <span>Canvas</span>
                <strong>{placement?.recommendedSize ?? "Not set"}</strong>
              </div>
              <div className="property-item">
                <span>Target account</span>
                <strong>{account?.handle ?? "Planning only"}</strong>
              </div>
              <div className="property-item">
                <span>Assignee</span>
                <strong>{assignee?.displayName ?? assignee?.email ?? "Unassigned"}</strong>
              </div>
              <div className="property-item">
                <span>Reviewer</span>
                <strong>{reviewer?.displayName ?? reviewer?.email ?? "Unassigned"}</strong>
              </div>
              {deliverable.ctaText ? (
                <div className="property-item">
                  <span>CTA</span>
                  <strong>{deliverable.ctaText}</strong>
                </div>
              ) : null}
            </div>
          </article>
        </aside>
      </section>

      {isEditorOpen && formState ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>{isScheduleEditor ? "Schedule post" : "Edit deliverable"}</h2>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSaveDeliverable}>
                <div className="planner-form-section">
                  <p className="field-group-label">{isScheduleEditor ? "Schedule" : "Planning setup"}</p>
                  <div className="planner-form-grid">
                    {!isScheduleEditor ? (
                      <>
                        <label className="field-label planner-form-span-2">
                          Title
                          <input value={formState.title} onChange={(event) => setFormState((state) => (state ? { ...state, title: event.target.value } : state))} />
                        </label>
                        <label className="field-label">
                          Project
                          <select value={formState.projectId} onChange={(event) => setFormState((state) => (state ? { ...state, projectId: event.target.value } : state))}>
                            {projects.map((projectItem) => (
                              <option key={projectItem.id} value={projectItem.id}>{projectItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Campaign
                          <select value={formState.campaignId} onChange={(event) => setFormState((state) => (state ? { ...state, campaignId: event.target.value } : state))}>
                            <option value="">Standalone</option>
                            {campaigns.map((campaignItem) => (
                              <option key={campaignItem.id} value={campaignItem.id}>{campaignItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Persona
                          <select value={formState.personaId} onChange={(event) => setFormState((state) => (state ? { ...state, personaId: event.target.value } : state))}>
                            <option value="">None</option>
                            {personas.map((personaItem) => (
                              <option key={personaItem.id} value={personaItem.id}>{personaItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Post type
                          <select value={formState.postTypeId} onChange={(event) => setFormState((state) => (state ? { ...state, postTypeId: event.target.value } : state))}>
                            {postTypes.map((postTypeItem) => (
                              <option key={postTypeItem.id} value={postTypeItem.id}>{postTypeItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Template
                          <select value={formState.creativeTemplateId} onChange={(event) => setFormState((state) => (state ? { ...state, creativeTemplateId: event.target.value } : state))}>
                            <option value="">None</option>
                            {templates.map((templateItem) => (
                              <option key={templateItem.id} value={templateItem.id}>{templateItem.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Channel account
                          <select value={formState.channelAccountId} onChange={(event) => setFormState((state) => (state ? { ...state, channelAccountId: event.target.value } : state))}>
                            <option value="">Planning only</option>
                            {channelAccounts.map((accountItem) => (
                              <option key={accountItem.id} value={accountItem.id}>{accountItem.handle}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Assignee
                          <select value={formState.ownerUserId} onChange={(event) => setFormState((state) => (state ? { ...state, ownerUserId: event.target.value } : state))}>
                            <option value="">Unassigned</option>
                            {workspaceMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.displayName ?? member.email}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Reviewer
                          <select value={formState.reviewerUserId} onChange={(event) => setFormState((state) => (state ? { ...state, reviewerUserId: event.target.value } : state))}>
                            <option value="">Unassigned</option>
                            {workspaceMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.displayName ?? member.email}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Objective
                          <select value={formState.objectiveCode} onChange={(event) => setFormState((state) => (state ? { ...state, objectiveCode: event.target.value as ObjectiveCode } : state))}>
                            {objectiveOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Placement
                          <select value={formState.channel} onChange={(event) => setFormState((state) => (state ? { ...state, channel: event.target.value as CreativeChannel, format: getDefaultFormat(event.target.value as CreativeChannel) } : state))}>
                            <option value="instagram-feed">Instagram feed</option>
                            <option value="instagram-story">Instagram story</option>
                            <option value="linkedin-feed">LinkedIn feed</option>
                            <option value="x-post">X post</option>
                            <option value="ad-creative">Ad creative</option>
                          </select>
                        </label>
                        <label className="field-label">
                          Format
                          <select value={formState.format} onChange={(event) => setFormState((state) => (state ? { ...state, format: event.target.value as CreativeFormat } : state))}>
                            {getAllowedFormats(formState.channel).map((format) => (
                              <option key={`${format.channel}-${format.format}`} value={format.format}>{format.formatLabel}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <>
                        <div className="field-label planner-form-span-2">
                          <span>Post</span>
                          <div className="placement-card">
                            <div className="placement-card-top">
                              <div>
                                <p className="panel-label">Current placement</p>
                                <h4>{deliverable.title}</h4>
                              </div>
                              <span className="placement-size-pill">
                                {getPlacementSpec(formState.channel, formState.format)?.formatLabel ?? formState.format}
                              </span>
                            </div>
                            <p className="placement-purpose">
                              Placement stays on the post. Pick the posting time here.
                            </p>
                          </div>
                        </div>
                        <label className="field-label">
                          Channel account
                          <select value={formState.channelAccountId} onChange={(event) => setFormState((state) => (state ? { ...state, channelAccountId: event.target.value } : state))}>
                            <option value="">Planning only</option>
                            {channelAccounts.map((accountItem) => (
                              <option key={accountItem.id} value={accountItem.id}>{accountItem.handle}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label className="field-label planner-form-span-2">
                      Scheduled for
                      {suggestedPostingSlots.length > 0 ? (
                        <div className="slot-suggestion-row">
                          {suggestedPostingSlots.map((slot) => (
                            <button
                              key={slot.key}
                              className={formState.scheduledFor === toLocalDateTimeValue(slot.dateTime.toISOString()) ? "slot-suggestion-chip active" : "slot-suggestion-chip"}
                              onClick={() =>
                                setFormState((state) =>
                                  state
                                    ? {
                                        ...state,
                                        scheduledFor: toLocalDateTimeValue(slot.dateTime.toISOString())
                                      }
                                    : state
                                )
                              }
                              type="button"
                            >
                              {slot.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input type="datetime-local" value={formState.scheduledFor} onChange={(event) => setFormState((state) => (state ? { ...state, scheduledFor: event.target.value } : state))} />
                    </label>
                    {!isScheduleEditor ? (
                      <>
                        <label className="field-label">
                          Priority
                          <select value={formState.priority} onChange={(event) => setFormState((state) => (state ? { ...state, priority: event.target.value as DeliverablePriority } : state))}>
                            {priorityOptions.map((priority) => (
                              <option key={priority} value={priority}>{priority}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label">
                          Status
                          <select value={formState.status} onChange={(event) => setFormState((state) => (state ? { ...state, status: event.target.value as DeliverableStatus } : state))}>
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>{formatStatus(status)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="field-label planner-form-span-2">
                          Brief
                          <textarea value={formState.briefText} onChange={(event) => setFormState((state) => (state ? { ...state, briefText: event.target.value } : state))} />
                        </label>
                        <label className="field-label planner-form-span-2">
                          CTA
                          <input value={formState.ctaText} onChange={(event) => setFormState((state) => (state ? { ...state, ctaText: event.target.value } : state))} />
                        </label>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsEditorOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : isScheduleEditor ? "Save schedule" : "Save deliverable"}
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

function toDeliverableEditorState(detail: DeliverableDetail): DeliverableEditorState {
  const creativeFormat = deriveCreativeFormatFromDeliverable(
    detail.deliverable.placementCode,
    detail.deliverable.contentFormat,
    detail.deliverable.sourceJson
  );

  return {
    projectId: detail.deliverable.projectId ?? "",
    campaignId: detail.deliverable.campaignId ?? "",
    personaId: detail.deliverable.personaId ?? "",
    postTypeId: detail.deliverable.postTypeId,
    creativeTemplateId: detail.deliverable.creativeTemplateId ?? "",
    channelAccountId: detail.deliverable.channelAccountId ?? "",
    ownerUserId: detail.deliverable.ownerUserId ?? "",
    reviewerUserId: detail.deliverable.reviewerUserId ?? "",
    objectiveCode: detail.deliverable.objectiveCode,
    channel: detail.deliverable.placementCode,
    format: creativeFormat,
    title: detail.deliverable.title,
    briefText: detail.deliverable.briefText ?? "",
    ctaText: detail.deliverable.ctaText ?? "",
    scheduledFor: toLocalDateTimeValue(detail.deliverable.scheduledFor),
    priority: detail.deliverable.priority,
    status: detail.deliverable.status
  };
}

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatObjective(value: ObjectiveCode) {
  return value.replaceAll("_", " ");
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

type NextStepAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "button"; label: string; onClick: () => void };

function getNextStepConfig(
  deliverableId: string,
  status: DeliverableStatus,
  openEditor: (mode?: "default" | "schedule") => void
): {
  title: string;
  description: string;
  primary: NextStepAction;
  secondary?: NextStepAction;
} {
  switch (status) {
    case "planned":
    case "brief_ready":
      return {
        title: "Create post options",
        description: "This post task is ready to move into creation. Make a few options from the saved brief and context.",
        primary: { kind: "link", label: "Create options", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "generating":
      return {
        title: "Check option progress",
        description: "Options are already being created for this post task. Open Create to watch them arrive.",
        primary: { kind: "link", label: "Open create", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "review":
      return {
        title: "Review and choose an option",
        description: "This post task has options waiting for a decision before it can move to scheduling.",
        primary: { kind: "link", label: "Open review", href: `/studio/review?deliverableId=${deliverableId}` },
        secondary: { kind: "link", label: "Make another option", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "approved":
      return {
        title: "Schedule this approved post",
        description: "The creative is approved. The next move is to assign its posting time and move it into the calendar.",
        primary: { kind: "button", label: "Schedule post", onClick: () => openEditor("schedule") },
        secondary: { kind: "link", label: "Make another option", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "scheduled":
      return {
        title: "Review the scheduled placement",
        description: "This post is scheduled. Use the calendar to confirm the slot or adjust it if the schedule changes.",
        primary: { kind: "button", label: "Edit schedule", onClick: () => openEditor("schedule") },
        secondary: { kind: "link", label: "Open calendar", href: "/studio/calendar" }
      };
    case "published":
      return {
        title: "Track the published deliverable",
        description: "This post has already moved past approval and scheduling. Use the calendar and publication records to verify where it went.",
        primary: { kind: "link", label: "Open calendar", href: "/studio/calendar" },
        secondary: { kind: "link", label: "Make another option", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "archived":
      return {
        title: "Archived record",
        description: "This deliverable is no longer active. Reopen creation only if you need a fresh variation or replacement.",
        primary: { kind: "link", label: "Make another option", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    case "blocked":
      return {
        title: "Unblock the deliverable",
        description: "Something is preventing this deliverable from moving forward. Edit the planning details or brief, then generate again.",
        primary: { kind: "button", label: "Edit deliverable", onClick: () => openEditor() },
        secondary: { kind: "link", label: "Make another option", href: `/studio/create?deliverableId=${deliverableId}` }
      };
    default:
      return {
        title: "Continue the workflow",
        description: "Use the current deliverable state to decide whether to create, review, schedule, or publish next.",
        primary: { kind: "link", label: "Create options", href: `/studio/create?deliverableId=${deliverableId}` }
      };
  }
}
