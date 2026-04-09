"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChannelAccountRecord,
  CreativeChannel,
  ContentFormat,
  PostTypeRecord,
  ProjectRecord,
  SeriesRecord,
  UpdateSeriesInput
} from "@image-lab/contracts";
import {
  getChannelAccounts,
  getDeliverables,
  getPlanningTemplateOptions,
  getPostTypes,
  getProjects,
  getSeriesDetail,
  materializeSeries,
  type PlanningTemplateOption,
  updateSeries
} from "../../../../lib/api";
import { deriveCreativeFormatFromDeliverable } from "../../../../lib/deliverable-helpers";
import { formatDisplayDate, formatDisplayDateRange } from "../../../../lib/formatters";
import {
  SERIES_WEEKDAY_OPTIONS,
  canMaterializeSeries,
  describeSeriesReadiness,
  sortSeriesWeekdays
} from "../../../../lib/series-workflow";
import { ImagePreviewTrigger } from "../../image-preview";
import { PlacementIcons } from "../../placement-icons";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";

type SeriesEditorState = {
  name: string;
  description: string;
  startAt: string;
  status: SeriesRecord["status"];
  projectId: string;
  postTypeId: string;
  templateId: string;
  channelAccountId: string;
  placementCode: NonNullable<SeriesRecord["placementCode"]> | "";
  contentFormat: NonNullable<SeriesRecord["contentFormat"]> | "";
  weekdays: NonNullable<SeriesRecord["cadence"]["weekdays"]>;
};

type SeriesDeliverablePreview = {
  id: string;
  title: string;
  status: string;
  scheduledFor: string;
  previewUrl?: string;
  placementCode: CreativeChannel;
  contentFormat: ContentFormat;
  sourceJson: Record<string, unknown>;
};

const SERIES_STATUS_OPTIONS: SeriesRecord["status"][] = ["draft", "active", "paused", "archived"];
const SERIES_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "setup", label: "Recurring setup" },
  { id: "tasks", label: "Posts" }
] as const;

type SeriesDetailTab = (typeof SERIES_DETAIL_TABS)[number]["id"];

export default function SeriesDetailPage() {
  const params = useParams<{ seriesId: string }>();
  const { sessionToken, setMessage } = useStudio();
  const [series, setSeries] = useState<SeriesRecord | null>(null);
  const [form, setForm] = useState<SeriesEditorState | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<PlanningTemplateOption[]>([]);
  const [channels, setChannels] = useState<ChannelAccountRecord[]>([]);
  const [deliverables, setDeliverables] = useState<SeriesDeliverablePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingConcept, setSavingConcept] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [materializing, setMaterializing] = useState(false);
  const [activeTab, setActiveTab] = useState<SeriesDetailTab>("overview");

  const loadSeries = useCallback(async () => {
    if (!sessionToken || typeof params.seriesId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getSeriesDetail(sessionToken, params.seriesId);
      const [projectRecords, postTypeRecords, templateRecords, channelRecords, deliverableRecords] = await Promise.all([
        getProjects(sessionToken, { brandId: record.brandId }),
        getPostTypes(sessionToken),
        getPlanningTemplateOptions(sessionToken, { brandId: record.brandId }),
        getChannelAccounts(sessionToken, record.brandId),
        getDeliverables(sessionToken, { seriesId: record.id, includePreviews: true, limit: 24 })
      ]);

      setSeries(record);
      setForm(seriesToEditorState(record));
      setProjects(projectRecords);
      setPostTypes(postTypeRecords);
      setTemplates(templateRecords);
      setChannels(channelRecords);
      setDeliverables(
        deliverableRecords.map((deliverable) => ({
          id: deliverable.id,
          title: deliverable.title,
          status: deliverable.status,
          scheduledFor: deliverable.scheduledFor,
          ...(deliverable.previewUrl ? { previewUrl: deliverable.previewUrl } : {}),
          placementCode: deliverable.placementCode,
          contentFormat: deliverable.contentFormat,
          sourceJson: deliverable.sourceJson
        }))
      );
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load series");
    } finally {
      setLoading(false);
    }
  }, [params.seriesId, sessionToken]);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  const seriesRecord = useMemo(() => {
    if (!series || !form) return null;
    return mergeSeriesWithForm(series, form);
  }, [form, series]);

  const createdCount = deliverables.length;
  const reviewCount = deliverables.filter((item) => item.status === "review").length;
  const readyToScheduleCount = deliverables.filter((item) => item.status === "approved").length;
  const scheduledCount = deliverables.filter((item) => item.status === "scheduled").length;

  const topbarMeta = useMemo(() => {
    if (!series) {
      return null;
    }

    return {
      backHref: "/studio/plan",
      backLabel: "Back to plan",
      title: series.name,
      subtitle: formatDisplayDateRange(series.startAt, series.endAt) || "Series detail",
      badges: (
        <>
          <span className={`pill ${series.status === "active" ? "pill-completed" : ""}`}>{series.status}</span>
          <span className="pill">{createdCount} posts</span>
        </>
      )
    };
  }, [createdCount, series]);

  useRegisterTopbarMeta(topbarMeta);

  const topbarActions = useMemo(() => {
    if (!seriesRecord) return null;

    if (!canMaterializeSeries(seriesRecord)) {
      return null;
    }

    return (
      <button
        className="button button-primary"
        disabled={materializing}
        onClick={() => void handleMaterialize()}
        type="button"
      >
        {materializing ? "Creating…" : "Create upcoming tasks"}
      </button>
    );
  }, [materializing, seriesRecord]);

  useRegisterTopbarActions(topbarActions);

  async function handleSaveConcept(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !series || !form) return;

    setSavingConcept(true);
    try {
      const updated = await updateSeries(sessionToken, series.id, buildSeriesUpdatePayload(form));
      setSeries(updated);
      setForm(seriesToEditorState(updated));
      setMessage("Series concept saved.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Unable to save series concept");
    } finally {
      setSavingConcept(false);
    }
  }

  async function handleSaveSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !series || !form) return;

    setSavingSetup(true);
    try {
      const updated = await updateSeries(sessionToken, series.id, buildSeriesUpdatePayload(form));
      setSeries(updated);
      setForm(seriesToEditorState(updated));
      setMessage("Recurring setup saved.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Unable to save recurring setup");
    } finally {
      setSavingSetup(false);
    }
  }

  async function handleMaterialize() {
    if (!sessionToken || !series) return;

    setMaterializing(true);
    try {
      const created = await materializeSeries(sessionToken, series.id);
      await loadSeries();
      setMessage(created.length > 0 ? `Created ${created.length} posts.` : "No new posts were needed.");
    } catch (materializeError) {
      setMessage(materializeError instanceof Error ? materializeError.message : "Unable to create posts from this series");
    } finally {
      setMaterializing(false);
    }
  }

  function toggleWeekday(code: SeriesEditorState["weekdays"][number]) {
    setForm((current) =>
      current
        ? {
            ...current,
            weekdays: sortSeriesWeekdays(
              current.weekdays.includes(code)
                ? current.weekdays.filter((value) => value !== code)
                : [...current.weekdays, code]
            )
          }
        : current
    );
  }

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Series detail</p>
          <h3>Loading series…</h3>
        </article>
      </div>
    );
  }

  if (!series || !form || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Series detail</p>
          <h3>Unable to load series</h3>
          <p>{error ?? "Series not found."}</p>
        </article>
      </div>
    );
  }

  const resolvedSeriesRecord = seriesRecord ?? mergeSeriesWithForm(series, form);

  return (
    <div className="page-stack">
      <section className="page-grid">
        <main className="page-span-8 page-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Next step</p>
                <h3>{getSeriesNextStepTitle(resolvedSeriesRecord)}</h3>
              </div>
            </div>
            <div className="campaign-next-step">
              <div className="campaign-next-step-copy">
                <p className="lede compact">{getSeriesNextStepBody(resolvedSeriesRecord)}</p>
                <div className="campaign-progress-strip">
                  <article className="campaign-progress-card">
                    <span>Created</span>
                    <strong>{createdCount}</strong>
                  </article>
                  <article className="campaign-progress-card">
                    <span>In review</span>
                    <strong>{reviewCount}</strong>
                  </article>
                  <article className="campaign-progress-card">
                    <span>Ready to schedule</span>
                    <strong>{readyToScheduleCount}</strong>
                  </article>
                  <article className="campaign-progress-card">
                    <span>Scheduled</span>
                    <strong>{scheduledCount}</strong>
                  </article>
                </div>
              </div>
              <div className="deliverable-next-step-actions">
                {canMaterializeSeries(resolvedSeriesRecord) ? (
                  <button className="button button-primary" disabled={materializing} onClick={() => void handleMaterialize()} type="button">
                    {materializing ? "Creating…" : "Create upcoming tasks"}
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    onClick={() => setActiveTab("setup")}
                    type="button"
                  >
                    Finish recurring setup
                  </button>
                )}
              </div>
            </div>
          </article>

          <section className="series-detail-tab-shell">
            <div className="series-detail-tab-row" role="tablist" aria-label="Series detail sections">
              {SERIES_DETAIL_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const count =
                  tab.id === "tasks"
                    ? deliverables.length
                    : tab.id === "setup"
                      ? form.weekdays.length
                      : null;
                return (
                  <button
                    aria-selected={isActive}
                    className={`series-detail-tab-button${isActive ? " is-active" : ""}`}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    type="button"
                  >
                    <span>{tab.label}</span>
                    {count !== null ? <small>{count}</small> : null}
                  </button>
                );
              })}
            </div>

            {activeTab === "overview" ? (
              <article className="panel" role="tabpanel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">Series concept</p>
                    <h3>What this track is about</h3>
                  </div>
                </div>
                <form className="stack-form" onSubmit={handleSaveConcept}>
                  <div className="field-grid two">
                    <label className="field-label">
                      Series name
                      <input
                        onChange={(event) => setForm((current) => (current ? { ...current, name: event.target.value } : current))}
                        required
                        value={form.name}
                      />
                    </label>
                    <label className="field-label">
                      Start date
                      <input
                        onChange={(event) => setForm((current) => (current ? { ...current, startAt: event.target.value } : current))}
                        type="date"
                        value={form.startAt}
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Description
                    <textarea
                      onChange={(event) => setForm((current) => (current ? { ...current, description: event.target.value } : current))}
                      rows={4}
                      value={form.description}
                    />
                  </label>
                  <label className="field-label">
                    Status
                    <select
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, status: event.target.value as SeriesRecord["status"] } : current
                        )
                      }
                      value={form.status}
                    >
                      {SERIES_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-footer">
                    <button className="button button-primary" disabled={savingConcept} type="submit">
                      {savingConcept ? "Saving…" : "Save concept"}
                    </button>
                    <button
                      className="button button-ghost"
                      onClick={() => setActiveTab("setup")}
                      type="button"
                    >
                      Open recurring setup
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            {activeTab === "setup" ? (
              <article className="panel" id="recurring-setup" role="tabpanel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">Recurring setup</p>
                    <h3>Planning rhythm and defaults</h3>
                  </div>
                </div>
                <form className="stack-form" onSubmit={handleSaveSetup}>
                  <div className="form-section">
                    <div className="form-section-header">
                      <h4>Planning rhythm</h4>
                      <p>Choose which days should create recurring posts from this series.</p>
                    </div>
                    <div className="field-label">
                      Days to plan
                      <div className="weekday-chip-row">
                        {SERIES_WEEKDAY_OPTIONS.map((day) => (
                          <button
                            className={`filter-chip ${form.weekdays.includes(day.code) ? "is-active" : ""}`}
                            key={day.code}
                            onClick={() => toggleWeekday(day.code)}
                            type="button"
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="field-hint">
                      Exact publish time is chosen later from posting windows when an actual post task is scheduled.
                    </p>
                  </div>

                  <div className="form-section">
                    <div className="form-section-header">
                      <h4>Defaults for created posts</h4>
                      <p>Add the defaults recurring posts should inherit. Project is optional.</p>
                    </div>
                    <div className="field-grid two">
                      <label className="field-label">
                        Project (optional)
                        <select
                          onChange={(event) => setForm((current) => (current ? { ...current, projectId: event.target.value } : current))}
                          value={form.projectId}
                        >
                          <option value="">No project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Post type
                        <select
                          onChange={(event) => setForm((current) => (current ? { ...current, postTypeId: event.target.value } : current))}
                          value={form.postTypeId}
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
                          onChange={(event) => setForm((current) => (current ? { ...current, templateId: event.target.value } : current))}
                          value={form.templateId}
                        >
                          <option value="">Set later</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="field-grid two">
                      <label className="field-label">
                        Channel
                        <select
                          onChange={(event) =>
                            setForm((current) => (current ? { ...current, channelAccountId: event.target.value } : current))
                          }
                          value={form.channelAccountId}
                        >
                          <option value="">Set later</option>
                          {channels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                              {channel.displayName || channel.handle}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Placement
                        <select
                          onChange={(event) =>
                            setForm((current) =>
                              current
                                ? {
                                    ...current,
                                    placementCode: event.target.value as SeriesEditorState["placementCode"]
                                  }
                                : current
                            )
                          }
                          value={form.placementCode}
                        >
                          <option value="">Set later</option>
                          <option value="instagram-feed">Instagram feed</option>
                          <option value="instagram-story">Instagram story</option>
                          <option value="linkedin-feed">LinkedIn feed</option>
                          <option value="x-post">X post</option>
                          <option value="tiktok-cover">TikTok cover</option>
                          <option value="ad-creative">Ad creative</option>
                        </select>
                      </label>
                    </div>

                    <div className="field-grid two">
                      <label className="field-label">
                        Format
                        <select
                          onChange={(event) =>
                            setForm((current) =>
                              current
                                ? {
                                    ...current,
                                    contentFormat: event.target.value as SeriesEditorState["contentFormat"]
                                  }
                                : current
                            )
                          }
                          value={form.contentFormat}
                        >
                          <option value="">Set later</option>
                          <option value="static">Static</option>
                          <option value="carousel">Carousel</option>
                          <option value="video">Video</option>
                          <option value="story">Story</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="form-footer">
                    <button className="button button-primary" disabled={savingSetup} type="submit">
                      {savingSetup ? "Saving…" : "Save recurring setup"}
                    </button>
                    {canMaterializeSeries(resolvedSeriesRecord) ? (
                      <button className="button button-ghost" disabled={materializing} onClick={() => void handleMaterialize()} type="button">
                        {materializing ? "Creating…" : "Create upcoming tasks"}
                      </button>
                    ) : null}
                  </div>
                </form>
              </article>
            ) : null}

            {activeTab === "tasks" ? (
              <article className="panel" role="tabpanel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">Posts</p>
                    <h3>Posts already created from this series</h3>
                  </div>
                  <span className="panel-count">{deliverables.length} posts</span>
                </div>
                {deliverables.length > 0 ? (
                  <div className="campaign-plan-task-list">
                    {deliverables.map((deliverable) => (
                      <Link className="campaign-plan-task-row" href={`/studio/deliverables/${deliverable.id}`} key={deliverable.id}>
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
                          <span>{formatDisplayDate(deliverable.scheduledFor)}</span>
                          <strong>{deliverable.title}</strong>
                          <div className="campaign-plan-task-meta">
                            <PlacementIcons
                              channel={deliverable.placementCode}
                              compact
                              format={deriveCreativeFormatFromDeliverable(
                                deliverable.placementCode,
                                deliverable.contentFormat,
                                deliverable.sourceJson
                              )}
                              interactive={false}
                            />
                            <span className={`plan-roadmap-badge plan-roadmap-badge-${getPostTaskTone(deliverable.status)}`}>
                              {deliverable.status.replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="plan-roadmap-empty">
                    <strong>No posts created yet</strong>
                    <p>Save recurring setup, then create upcoming posts when you’re ready.</p>
                  </div>
                )}
              </article>
            ) : null}
          </section>
        </main>

        <aside className="page-span-4 page-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Series snapshot</p>
                <h3>{series.name}</h3>
              </div>
            </div>
            <div className="property-list">
              <div className="property-item">
                <span>Status</span>
                <strong>{series.status}</strong>
              </div>
              <div className="property-item">
                <span>Start date</span>
                <strong>{series.startAt ? formatDisplayDate(series.startAt) : "Not set"}</strong>
              </div>
              <div className="property-item">
                <span>Readiness</span>
                <p>{describeSeriesReadiness(resolvedSeriesRecord)}</p>
              </div>
              <div className="property-item">
                <span>Created posts</span>
                <strong>{createdCount}</strong>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function seriesToEditorState(series: SeriesRecord): SeriesEditorState {
  return {
    name: series.name,
    description: series.description ?? "",
    startAt: series.startAt ? series.startAt.slice(0, 10) : "",
    status: series.status,
    projectId: series.projectId ?? "",
    postTypeId: series.postTypeId ?? "",
    templateId: series.creativeTemplateId ?? "",
    channelAccountId: series.channelAccountId ?? "",
    placementCode: series.placementCode ?? "",
    contentFormat: series.contentFormat ?? "",
    weekdays: sortSeriesWeekdays([...series.cadence.weekdays])
  };
}

function buildSeriesUpdatePayload(form: SeriesEditorState): UpdateSeriesInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    projectId: form.projectId || undefined,
    postTypeId: form.postTypeId || undefined,
    creativeTemplateId: form.templateId || undefined,
    channelAccountId: form.channelAccountId || undefined,
    placementCode: form.placementCode ? (form.placementCode as UpdateSeriesInput["placementCode"]) : undefined,
    contentFormat: form.contentFormat ? (form.contentFormat as UpdateSeriesInput["contentFormat"]) : undefined,
    cadence: {
      frequency: "weekly",
      interval: 1,
      weekdays: form.weekdays as UpdateSeriesInput["cadence"]["weekdays"],
      occurrencesAhead: 30
    },
    startAt: form.startAt || undefined,
    status: form.status,
    sourceBriefJson: {}
  };
}

function mergeSeriesWithForm(series: SeriesRecord, form: SeriesEditorState): SeriesRecord {
  return {
    ...series,
    name: form.name.trim() || series.name,
    description: form.description.trim() || null,
    startAt: form.startAt || null,
    status: form.status,
    projectId: form.projectId || null,
    postTypeId: form.postTypeId || null,
    creativeTemplateId: form.templateId || null,
    channelAccountId: form.channelAccountId || null,
    placementCode: form.placementCode || null,
    contentFormat: form.contentFormat || null,
    cadence: {
      ...series.cadence,
      weekdays: form.weekdays
    }
  };
}

function getSeriesNextStepTitle(series: SeriesRecord | null) {
  if (!series) return "Set up this series";
  if (!series.cadence.weekdays.length) return "Set up recurring work";
  if (!canMaterializeSeries(series)) return "Finish recurring setup";
  return "Create upcoming tasks";
}

function getSeriesNextStepBody(series: SeriesRecord | null) {
  if (!series) return "Finish the recurring setup so this series can start creating posts.";
  if (!series.cadence.weekdays.length) {
    return "This series exists as a concept only. Add a planning rhythm and work defaults when you want it to start creating recurring posts.";
  }
  if (!canMaterializeSeries(series)) {
    return "The planning rhythm is set. Add the remaining defaults so the series can start creating posts.";
  }
  return "This series is ready. Create the next batch of posts and move them into review or schedule.";
}

function getPostTaskTone(status: string) {
  if (status === "approved" || status === "scheduled" || status === "published") return "blue";
  if (status === "review") return "orange";
  if (status === "brief_ready" || status === "generating") return "purple";
  if (status === "blocked") return "red";
  return "gray";
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}
