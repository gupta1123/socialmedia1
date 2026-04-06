"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CreateDeliverableInput,
  CreativeChannel,
  CreativeFormat,
  DeliverablePriority,
  DeliverableRecord,
  DeliverableStatus,
  ObjectiveCode,
  PostTypeRecord,
  ProjectRecord,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  createDeliverable,
  getCampaigns,
  getDeliverables,
  getPlanningTemplates,
  getPostTypes,
  getProjects,
  getWorkspaceMembers
} from "../../../lib/api";
import { DataTable } from "../data-table";
import {
  deriveCreativeFormatFromDeliverable,
  mapCreativeFormatToContentFormat
} from "../../../lib/deliverable-helpers";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../lib/placement-specs";
import { formatDisplayDate } from "../../../lib/formatters";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { PlacementIcons } from "../placement-icons";

type DeliverableFormState = {
  title: string;
  projectId: string;
  campaignId: string;
  postTypeId: string;
  creativeTemplateId: string;
  ownerUserId: string;
  objectiveCode: ObjectiveCode;
  channel: CreativeChannel;
  format: CreativeFormat;
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

function createDefaultDeliverableForm(): DeliverableFormState {
  const nextMorning = new Date();
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(10, 0, 0, 0);

  return {
    title: "",
    projectId: "",
    campaignId: "",
    postTypeId: "",
    creativeTemplateId: "",
    ownerUserId: "",
    objectiveCode: "lead_gen",
    channel: "instagram-feed",
    format: "square",
    briefText: "",
    ctaText: "",
    scheduledFor: toLocalDateTimeValue(nextMorning),
    priority: "normal",
    status: "planned"
  };
}

export default function DeliverablesPage() {
  const searchParams = useSearchParams();
  const campaignFilter = searchParams.get("campaignId") ?? undefined;
  const projectFilter = searchParams.get("projectId") ?? undefined;
  const shouldOpenNew = searchParams.get("new") === "1";
  const { sessionToken, bootstrap, activeBrandId, setMessage } = useStudio();
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; primaryProjectId: string | null }>>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; projectId: string | null; postTypeId: string | null }>>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DeliverableFormState>(createDefaultDeliverableForm);

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => setIsDrawerOpen(true)}
        disabled={!activeBrandId || saving}
      >
        {saving ? "Saving post task…" : "New post task"}
      </button>
    ),
    [activeBrandId, saving]
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
        const [deliverableRecords, projectRecords, campaignRecords, postTypeRecords, templateRecords, memberRecords] =
          await Promise.all([
            getDeliverables(token, {
              brandId,
              ...(projectFilter ? { projectId: projectFilter } : {}),
              ...(campaignFilter ? { campaignId: campaignFilter } : {})
            }),
            getProjects(token),
            getCampaigns(token, { brandId }),
            getPostTypes(token),
            getPlanningTemplates(token, { brandId }),
            getWorkspaceMembers(token)
          ]);

        if (!cancelled) {
          setDeliverables(deliverableRecords);
          setProjects(projectRecords);
          setCampaigns(
            campaignRecords.map((campaign) => ({
              id: campaign.id,
              name: campaign.name,
              primaryProjectId: campaign.primaryProjectId
            }))
          );
          setPostTypes(postTypeRecords);
          setWorkspaceMembers(memberRecords);
          setTemplates(
            templateRecords.map((template) => ({
              id: template.id,
              name: template.name,
              projectId: template.projectId,
              postTypeId: template.postTypeId
            }))
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load post tasks");
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
  }, [activeBrandId, campaignFilter, projectFilter, sessionToken]);

  useEffect(() => {
    if (!loading && shouldOpenNew && activeBrandId) {
      setIsDrawerOpen(true);
    }
  }, [activeBrandId, loading, shouldOpenNew]);

  useEffect(() => {
    if (!projectFilter) {
      return;
    }

    setForm((current) => (
      current.projectId === projectFilter
        ? current
        : {
            ...current,
            projectId: projectFilter
          }
    ));
  }, [projectFilter]);

  const visibleProjects = useMemo(
    () => (activeBrandId ? projects.filter((project) => project.brandId === activeBrandId) : projects),
    [activeBrandId, projects]
  );

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const filteredCampaign = useMemo(
    () => (campaignFilter ? campaigns.find((campaign) => campaign.id === campaignFilter) ?? null : null),
    [campaignFilter, campaigns]
  );

  const filteredProject = useMemo(
    () => (projectFilter ? visibleProjects.find((project) => project.id === projectFilter) ?? null : null),
    [projectFilter, visibleProjects]
  );

  const clearProjectHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("projectId");
    const query = next.toString();
    return query ? `/studio/deliverables?${query}` : "/studio/deliverables";
  }, [searchParams]);

  const clearCampaignHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("campaignId");
    const query = next.toString();
    return query ? `/studio/deliverables?${query}` : "/studio/deliverables";
  }, [searchParams]);

  const clearAllFiltersHref = useMemo(() => "/studio/deliverables", []);

  const visibleTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (form.projectId && template.projectId && template.projectId !== form.projectId) return false;
        if (form.postTypeId && template.postTypeId && template.postTypeId !== form.postTypeId) return false;
        return true;
      }),
    [form.postTypeId, form.projectId, templates]
  );

  const tableColumns = useMemo(
    () => [
      {
        id: "deliverable",
        header: "Post task",
        sortValue: (deliverable: DeliverableRecord) => deliverable.title,
        cell: (deliverable: DeliverableRecord) => (
          <div className="data-table-primary">
            <strong className="data-table-title">{deliverable.title}</strong>
            {deliverable.briefText ? (
              <span className="data-table-subtitle">{deliverable.briefText}</span>
            ) : null}
          </div>
        )
      },
      {
        id: "project",
        header: "Project",
        sortValue: (deliverable: DeliverableRecord) =>
          visibleProjects.find((project) => project.id === deliverable.projectId)?.name ?? "",
        cell: (deliverable: DeliverableRecord) => {
          const projectName = visibleProjects.find((project) => project.id === deliverable.projectId)?.name;
          const campaignName = campaigns.find((campaign) => campaign.id === deliverable.campaignId)?.name;

          return (
            <div className="data-table-primary">
              <strong className="data-table-title">{projectName ?? "Project"}</strong>
              {campaignName ? <span className="data-table-subtitle">{campaignName}</span> : null}
            </div>
          );
        }
      },
      {
        id: "postType",
        header: "Post type",
        sortValue: (deliverable: DeliverableRecord) =>
          postTypes.find((postType) => postType.id === deliverable.postTypeId)?.name ?? "",
        cell: (deliverable: DeliverableRecord) => (
          <span>{postTypes.find((postType) => postType.id === deliverable.postTypeId)?.name ?? "Post type"}</span>
        )
      },
      {
        id: "placement",
        header: "Placement",
        cell: (deliverable: DeliverableRecord) => {
          const format = deriveCreativeFormatFromDeliverable(
            deliverable.placementCode,
            deliverable.contentFormat,
            deliverable.sourceJson
          );

          return <PlacementIcons channel={deliverable.placementCode} format={format} />;
        }
      },
      {
        id: "scheduledFor",
        header: "Due",
        sortValue: (deliverable: DeliverableRecord) => deliverable.scheduledFor,
        cell: (deliverable: DeliverableRecord) => <span>{formatDisplayDate(deliverable.scheduledFor)}</span>
      },
      {
        id: "status",
        header: "Status",
        sortValue: (deliverable: DeliverableRecord) => deliverable.status,
        cell: (deliverable: DeliverableRecord) => (
          <div className="data-table-chip-row">
            <span className={`planner-status planner-status-${deliverable.status}`}>{formatStatus(deliverable.status)}</span>
            {deliverable.priority !== "normal" ? (
              <span className={`pill ${deliverable.priority === "urgent" || deliverable.priority === "high" ? "pill-review-needs_revision" : ""}`}>
                {deliverable.priority}
              </span>
            ) : null}
          </div>
        )
      },
      {
        id: "actions",
        header: "Actions",
        align: "end" as const,
        className: "data-table-actions-cell",
        cell: (deliverable: DeliverableRecord) => (
          <div className="table-action-group">
            <Link className="button button-ghost table-action-button" href={`/studio/create?deliverableId=${deliverable.id}`}>
              Generate
            </Link>
          </div>
        )
      }
    ],
    [campaigns, postTypes, visibleProjects]
  );

  async function handleCreateDeliverable(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSaving(true);

    try {
      await createDeliverable(sessionToken, {
        workspaceId: bootstrap.workspace.id,
        brandId: activeBrandId,
        projectId: form.projectId,
        campaignId: form.campaignId || undefined,
        planningMode: form.campaignId ? "campaign" : "one_off",
        postTypeId: form.postTypeId,
        creativeTemplateId: form.creativeTemplateId || undefined,
        objectiveCode: form.objectiveCode,
        placementCode: form.channel,
        contentFormat: mapCreativeFormatToContentFormat(form.format),
        title: form.title,
        briefText: form.briefText || undefined,
        ctaText: form.ctaText || undefined,
        scheduledFor: new Date(form.scheduledFor).toISOString(),
        ownerUserId: form.ownerUserId || undefined,
        priority: form.priority,
        status: form.status,
        sourceJson: {
          source: "manual_deliverable",
          creativeFormat: form.format
        }
      } satisfies CreateDeliverableInput);

      const refreshed = await getDeliverables(sessionToken, {
        brandId: activeBrandId,
        ...(projectFilter ? { projectId: projectFilter } : {}),
        ...(campaignFilter ? { campaignId: campaignFilter } : {})
      });
      setDeliverables(refreshed);
      setForm({
        ...createDefaultDeliverableForm(),
        projectId: projectFilter ?? ""
      });
      setIsDrawerOpen(false);
      setMessage("Post task created.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Post task creation failed");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Post tasks</p>
          <h3>Pick a brand first</h3>
          <p>Post tasks are scoped to the active brand.</p>
        </article>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Post tasks</p>
          <h3>Loading production work…</h3>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Post tasks</p>
          <h3>Unable to load post tasks</h3>
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
            <h3>{filteredCampaign?.name ?? filteredProject?.name ?? activeBrand?.name ?? "Post tasks"}</h3>
            </div>
            <span className="panel-count">{deliverables.length} post tasks</span>
          </div>

          {filteredProject || filteredCampaign ? (
            <div className="active-scope-strip" aria-label="Active deliverable filters">
              {filteredProject ? (
                <div className="active-scope-chip">
                  <span className="active-scope-label">Project</span>
                  <strong>{filteredProject.name}</strong>
                  <Link className="button button-ghost mini" href={clearProjectHref}>
                    Clear
                  </Link>
                </div>
              ) : null}

              {filteredCampaign ? (
                <div className="active-scope-chip">
                  <span className="active-scope-label">Campaign</span>
                  <strong>{filteredCampaign.name}</strong>
                  <Link className="button button-ghost mini" href={clearCampaignHref}>
                    Clear
                  </Link>
                </div>
              ) : null}

              <Link className="button button-ghost mini" href={clearAllFiltersHref}>
                Clear all
              </Link>
            </div>
          ) : null}

          <DataTable
            columns={tableColumns}
            defaultSort={{ columnId: "scheduledFor", direction: "asc" }}
            emptyAction={
              <button className="button button-primary" onClick={() => setIsDrawerOpen(true)}>
                Create first post task
              </button>
            }
            emptyBody="Create post tasks here or generate them from campaigns and series."
            emptyTitle="No post tasks yet"
            filters={[
              {
                id: "status",
                label: "Status",
                options: statusOptions.map((status) => ({
                  label: formatStatus(status),
                  value: status
                })),
                getValue: (deliverable) => deliverable.status
              },
              {
                id: "objective",
                label: "Objective",
                options: objectiveOptions.map((option) => ({ label: option.label, value: option.value })),
                getValue: (deliverable) => deliverable.objectiveCode
              }
            ]}
            rowHref={(deliverable) => `/studio/deliverables/${deliverable.id}`}
            rowKey={(deliverable) => deliverable.id}
            rows={deliverables}
            search={{
              placeholder: "Search post tasks, projects, or campaigns",
              getText: (deliverable) =>
                [
                  deliverable.title,
                  deliverable.briefText,
                  visibleProjects.find((project) => project.id === deliverable.projectId)?.name,
                  campaigns.find((campaign) => campaign.id === deliverable.campaignId)?.name,
                  postTypes.find((postType) => postType.id === deliverable.postTypeId)?.name
                ]
                  .filter(Boolean)
                  .join(" ")
            }}
          />
        </article>
      </section>

      {isDrawerOpen ? (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Create post task</h2>
              <button className="drawer-close" onClick={() => setIsDrawerOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleCreateDeliverable}>
                <div className="planner-form-section">
                  <p className="field-group-label">Post-task brief</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Title
                      <input
                        required
                        value={form.title}
                        onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
                        placeholder="Instagram launch creative for Asteria Residences"
                      />
                    </label>

                    <label className="field-label">
                      Project
                      <select
                        required
                        value={form.projectId}
                        onChange={(event) => setForm((state) => ({ ...state, projectId: event.target.value }))}
                      >
                        <option value="">Select project</option>
                        {visibleProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Campaign
                      <select
                        value={form.campaignId}
                        onChange={(event) => {
                          const nextCampaignId = event.target.value;
                          const campaign = campaigns.find((entry) => entry.id === nextCampaignId) ?? null;
                          setForm((state) => ({
                            ...state,
                            campaignId: nextCampaignId,
                            projectId: campaign?.primaryProjectId ?? state.projectId
                          }));
                        }}
                      >
                        <option value="">Standalone</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Post type
                      <select
                        required
                        value={form.postTypeId}
                        onChange={(event) => setForm((state) => ({ ...state, postTypeId: event.target.value }))}
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
                        value={form.creativeTemplateId}
                        onChange={(event) => setForm((state) => ({ ...state, creativeTemplateId: event.target.value }))}
                      >
                        <option value="">No template</option>
                        {visibleTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Assignee
                      <select
                        value={form.ownerUserId}
                        onChange={(event) => setForm((state) => ({ ...state, ownerUserId: event.target.value }))}
                      >
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
                      <select
                        value={form.objectiveCode}
                        onChange={(event) =>
                          setForm((state) => ({ ...state, objectiveCode: event.target.value as ObjectiveCode }))
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
                      Placement
                      <select
                        value={form.channel}
                        onChange={(event) =>
                          setForm((state) => ({
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
                        value={form.format}
                        onChange={(event) => setForm((state) => ({ ...state, format: event.target.value as CreativeFormat }))}
                      >
                        {getAllowedFormats(form.channel).map((spec) => (
                          <option key={`${spec.channel}-${spec.format}`} value={spec.format}>
                            {spec.formatLabel}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Scheduled for
                      <input
                        type="datetime-local"
                        value={form.scheduledFor}
                        onChange={(event) => setForm((state) => ({ ...state, scheduledFor: event.target.value }))}
                      />
                    </label>

                    <label className="field-label">
                      Priority
                      <select
                        value={form.priority}
                        onChange={(event) =>
                          setForm((state) => ({ ...state, priority: event.target.value as DeliverablePriority }))
                        }
                      >
                        {priorityOptions.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label">
                      Status
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((state) => ({ ...state, status: event.target.value as DeliverableStatus }))
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {formatStatus(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-label planner-form-span-2">
                      Brief
                      <textarea
                        rows={4}
                        value={form.briefText}
                        onChange={(event) => setForm((state) => ({ ...state, briefText: event.target.value }))}
                        placeholder="Premium launch creative focused on architecture, facade quality, and site visit CTA."
                      />
                    </label>

                    <label className="field-label planner-form-span-2">
                      CTA
                      <input
                        value={form.ctaText}
                        onChange={(event) => setForm((state) => ({ ...state, ctaText: event.target.value }))}
                        placeholder="Book a site visit"
                      />
                    </label>

                    <div className="placement-note planner-form-span-2">
                      <strong>{getPlacementSpec(form.channel, form.format)?.recommendedSize}</strong>
                      <p>{getPlacementSpec(form.channel, form.format)?.safeZone}</p>
                    </div>
                  </div>
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsDrawerOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Create post task"}
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

function formatStatus(value: DeliverableStatus) {
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
