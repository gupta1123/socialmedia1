"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CreateSeriesInput, PlanOverview } from "@image-lab/contracts";
import {
  createSeries,
  getPlanOverview,
  materializeSeries
} from "../../../lib/api";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import { formatDisplayDate, formatDisplayDateRange } from "../../../lib/formatters";
import {
  canMaterializeSeries,
  describeSeriesReadiness
} from "../../../lib/series-workflow";
import { ImagePreviewTrigger } from "../image-preview";
import { useStudio } from "../studio-context";
import { PlacementIcons } from "../placement-icons";
import { useRegisterTopbarActions } from "../topbar-actions-context";

const EMPTY_OVERVIEW: PlanOverview = {
  activeCampaigns: [],
  activeSeries: [],
  unscheduledPostTasks: [],
  upcomingPostTasks: []
};

const CAMPAIGN_PREVIEW_LIMIT = 4;
const SERIES_PREVIEW_LIMIT = 4;
const BACKLOG_PREVIEW_LIMIT = 5;
const UPCOMING_PREVIEW_LIMIT = 6;

type SeriesFormState = {
  name: string;
  description: string;
  startAt: string;
};

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledCreateIntentRef = useRef<string | null>(null);
  const expandedSection = searchParams.get("show");
  const { sessionToken, activeBrandId, setMessage } = useStudio();
  const [overview, setOverview] = useState<PlanOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materializingId, setMaterializingId] = useState<string | null>(null);
  const [form, setForm] = useState<SeriesFormState>(createEmptySeriesForm());

  const topbarActions = useMemo(
    () => (
      <>
        <Link className="button button-ghost" href="/studio/campaigns">New campaign</Link>
        <button
          className="button button-ghost"
          onClick={() => {
            void openNewSeriesDrawer();
          }}
          type="button"
        >
          New series
        </button>
        <Link className="button button-primary" href="/studio/deliverables?new=1&planningMode=one_off">New one-off post task</Link>
      </>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  async function load() {
    if (!sessionToken) return;

    setLoading(true);
    setError(null);

    try {
      const planOverview = await getPlanOverview(sessionToken, activeBrandId ?? undefined);
      setOverview(planOverview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load plan");
      setOverview(EMPTY_OVERVIEW);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [activeBrandId, sessionToken]);

  useEffect(() => {
    const createIntent = searchParams.get("new");

    if (createIntent !== "series" || handledCreateIntentRef.current === createIntent) {
      return;
    }

    handledCreateIntentRef.current = createIntent;
    void openNewSeriesDrawer();
  }, [searchParams]);

  async function openNewSeriesDrawer() {
    setForm(createEmptySeriesForm());
    setDrawerOpen(true);
  }

  function closeSeriesDrawer() {
    setDrawerOpen(false);
    setForm(createEmptySeriesForm());
  }

  async function handleCreateSeries(event: React.FormEvent) {
    event.preventDefault();
    if (!sessionToken || !activeBrandId) return;

    const payload: CreateSeriesInput = {
      brandId: activeBrandId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      status: "active",
      cadence: {
        frequency: "weekly",
        interval: 1,
        weekdays: [],
        occurrencesAhead: 30
      },
      startAt: form.startAt || undefined,
      sourceBriefJson: {}
    };

    setSaving(true);
    try {
      const createdSeries = await createSeries(sessionToken, payload);
      closeSeriesDrawer();
      setMessage("Series created.");
      router.push(`/studio/series/${createdSeries.id}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create series");
    } finally {
      setSaving(false);
    }
  }

  async function handleMaterialize(seriesId: string) {
    if (!sessionToken) return;
    setMaterializingId(seriesId);
    try {
      const created = await materializeSeries(sessionToken, seriesId);
      setMessage(created.length > 0 ? `Created ${created.length} post tasks.` : "No new post tasks were needed.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create recurring post tasks");
    } finally {
      setMaterializingId(null);
    }
  }

  const campaignNameById = useMemo(
    () => new Map(overview.activeCampaigns.map((campaign) => [campaign.id, campaign.name])),
    [overview.activeCampaigns]
  );

  const campaignPreview = useMemo(
    () =>
      expandedSection === "campaigns"
        ? overview.activeCampaigns
        : overview.activeCampaigns.slice(0, CAMPAIGN_PREVIEW_LIMIT),
    [expandedSection, overview.activeCampaigns]
  );

  const seriesPreview = useMemo(
    () =>
      expandedSection === "series"
        ? overview.activeSeries
        : overview.activeSeries.slice(0, SERIES_PREVIEW_LIMIT),
    [expandedSection, overview.activeSeries]
  );

  const seriesNameById = useMemo(
    () => new Map(overview.activeSeries.map((series) => [series.id, series.name])),
    [overview.activeSeries]
  );

  const backlogPreview = useMemo(
    () => overview.unscheduledPostTasks.slice(0, BACKLOG_PREVIEW_LIMIT),
    [overview.unscheduledPostTasks]
  );

  const upcomingPreview = useMemo(
    () => overview.upcomingPostTasks.slice(0, UPCOMING_PREVIEW_LIMIT),
    [overview.upcomingPostTasks]
  );

  return (
    <div className="page-stack plan-roadmap">
      <section className="work-home-hero">
        <div className="work-home-signal">
          <div className="work-signal-card is-ready">
            <div className="work-signal-head">
              <span>Active pushes</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
              </svg>
            </div>
            <strong>{overview.activeCampaigns.length}</strong>
          </div>
          <div className="work-signal-card is-upcoming">
            <div className="work-signal-head">
              <span>Recurring series</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
            </div>
            <strong>{overview.activeSeries.length}</strong>
          </div>
          <div className="work-signal-card is-urgent">
            <div className="work-signal-head">
              <span>Open backlog</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h13" />
              </svg>
            </div>
            <strong>{overview.unscheduledPostTasks.length}</strong>
          </div>
          <div className="work-signal-card is-review">
            <div className="work-signal-head">
              <span>Next 30 days</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <strong>{overview.upcomingPostTasks.length}</strong>
          </div>
        </div>
      </section>

      {error ? (
        <div className="status-banner">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="plan-roadmap-grid">
        <section className="plan-roadmap-column" id="campaigns-list">
          <div className="plan-roadmap-section-head">
            <div className="plan-roadmap-section-label">Campaigns</div>
            {overview.activeCampaigns.length > CAMPAIGN_PREVIEW_LIMIT ? (
              <Link className="plan-roadmap-section-link" href="/studio/campaigns" prefetch={false}>
                See all
              </Link>
            ) : null}
          </div>
          <div className="plan-roadmap-platter">
            {loading ? (
              <div className="empty-state compact">
                <strong>Loading</strong>
                <p>Pulling active campaigns.</p>
              </div>
            ) : overview.activeCampaigns.length > 0 ? (
              campaignPreview.map((campaign) => (
                <Link className="plan-roadmap-row" href={`/studio/campaigns/${campaign.id}`} key={campaign.id}>
                  <div className="plan-roadmap-row-main">
                    <span className="plan-roadmap-token plan-roadmap-token-campaign">CP</span>
                    <div className="plan-roadmap-row-copy">
                      <strong>{campaign.name}</strong>
                      <p>{formatDisplayDateRange(campaign.startAt, campaign.endAt)}</p>
                    </div>
                  </div>
                  <span className={`plan-roadmap-badge plan-roadmap-badge-${getCampaignTone(campaign.status)}`}>
                    {formatStatusLabel(campaign.status)}
                  </span>
                </Link>
              ))
            ) : (
              <div className="plan-roadmap-empty">
                <strong>No active campaigns</strong>
                <p>Use campaigns for launches, offers, and time-bound pushes.</p>
              </div>
            )}
          </div>
        </section>

        <section className="plan-roadmap-column" id="series-list">
          <div className="plan-roadmap-section-head">
            <div className="plan-roadmap-section-label">Recurring series</div>
            {overview.activeSeries.length > SERIES_PREVIEW_LIMIT ? (
              <Link
                className="plan-roadmap-section-link"
                href={expandedSection === "series" ? "/studio/plan#series-list" : "/studio/plan?show=series#series-list"}
                prefetch={false}
              >
                {expandedSection === "series" ? "Show less" : "See all"}
              </Link>
            ) : null}
          </div>
          <div className="plan-roadmap-platter">
            {loading ? (
              <div className="empty-state compact">
                <strong>Loading</strong>
                <p>Pulling recurring work.</p>
              </div>
            ) : overview.activeSeries.length > 0 ? (
              seriesPreview.map((series) => (
                <article className="plan-roadmap-series-row" key={series.id}>
                  <div className="plan-roadmap-row-main">
                    <span className="plan-roadmap-token plan-roadmap-token-series">SR</span>
                    <div className="plan-roadmap-row-copy">
                      <strong>{series.name}</strong>
                      <p className="plan-roadmap-series-detail">{describeSeriesReadiness(series)}</p>
                    </div>
                  </div>
                  <div className="plan-roadmap-series-actions">
                    <span className={`plan-roadmap-badge plan-roadmap-badge-${getSeriesTone(series.status)}`}>
                      {formatStatusLabel(series.status)}
                    </span>
                    <Link className="button button-ghost mini" href={`/studio/series/${series.id}`}>
                      Open series
                    </Link>
                    <button
                      className="button button-ghost mini"
                      disabled={materializingId === series.id || !canMaterializeSeries(series)}
                      onClick={() => {
                        if (canMaterializeSeries(series)) {
                          void handleMaterialize(series.id);
                        }
                      }}
                      type="button"
                    >
                      {materializingId === series.id ? "Creating…" : "Create upcoming tasks"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="plan-roadmap-empty plan-roadmap-empty-dashed">
                <strong>No active series</strong>
                <p>Create a recurring content track such as weekly updates or amenity spotlights.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="plan-roadmap-section">
        <div className="plan-roadmap-section-head">
          <div className="plan-roadmap-section-label">Content backlog</div>
          {overview.unscheduledPostTasks.length > BACKLOG_PREVIEW_LIMIT ? (
            <Link className="plan-roadmap-section-link" href="/studio/deliverables" prefetch={false}>
              See all
            </Link>
          ) : null}
        </div>
        <div className="plan-roadmap-platter">
          {loading ? (
            <div className="empty-state compact">
              <strong>Loading</strong>
              <p>Pulling unscheduled work.</p>
            </div>
          ) : overview.unscheduledPostTasks.length > 0 ? (
            backlogPreview.map((task) => (
              <Link className="plan-roadmap-row" href={`/studio/deliverables/${task.id}`} key={task.id}>
                <div className="plan-roadmap-row-main">
                  <PlacementIcons
                    channel={task.placementCode}
                    compact
                    format={deriveCreativeFormatFromDeliverable(task.placementCode, task.contentFormat, task.sourceJson)}
                    interactive={false}
                  />
                  <div className="plan-roadmap-row-copy">
                    <strong>{task.title}</strong>
                    <p>{getPostTaskContext(task, campaignNameById, seriesNameById)}</p>
                  </div>
                </div>
                <div className="plan-roadmap-row-right">
                  <span className="plan-roadmap-inline-date">{formatDisplayDate(task.scheduledFor)}</span>
                  <span className={`plan-roadmap-badge plan-roadmap-badge-${getPostTaskTone(task.status)}`}>
                    {formatStatusLabel(task.status)}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="plan-roadmap-empty">
              <strong>No open backlog</strong>
              <p>Everything is either already scheduled or moving through production.</p>
            </div>
          )}
        </div>
      </section>

      <section className="plan-roadmap-section">
        <div className="plan-roadmap-section-head">
          <div className="plan-roadmap-section-label">Next 30 days</div>
          {overview.upcomingPostTasks.length > UPCOMING_PREVIEW_LIMIT ? (
            <Link className="plan-roadmap-section-link" href="/studio/calendar" prefetch={false}>
              See all
            </Link>
          ) : null}
        </div>
        {loading ? (
          <div className="empty-state compact">
            <strong>Loading</strong>
            <p>Pulling upcoming work.</p>
          </div>
        ) : overview.upcomingPostTasks.length > 0 ? (
          <div className="plan-roadmap-upcoming-grid">
            {upcomingPreview.map((task) => (
              <Link className="plan-roadmap-upcoming-card" href={`/studio/deliverables/${task.id}`} key={task.id}>
                <div className="plan-roadmap-upcoming-top">
                  <span className="plan-roadmap-upcoming-date">{formatDisplayDate(task.scheduledFor)}</span>
                  <PlacementIcons
                    channel={task.placementCode}
                    compact
                    format={deriveCreativeFormatFromDeliverable(task.placementCode, task.contentFormat, task.sourceJson)}
                    interactive={false}
                  />
                </div>
                <div className="plan-roadmap-upcoming-media">
                  {task.previewUrl ? (
                    <ImagePreviewTrigger
                      alt={`Preview for ${task.title}`}
                      meta={formatDisplayDate(task.scheduledFor)}
                      mode="inline"
                      src={task.previewUrl}
                      title={task.title}
                    >
                      <img alt="" src={task.previewUrl} />
                    </ImagePreviewTrigger>
                  ) : (
                    <div className="plan-roadmap-upcoming-fallback">
                      {getInitials(task.title)}
                    </div>
                  )}
                </div>
                <strong>{task.title}</strong>
                <p>{getPostTaskContext(task, campaignNameById, seriesNameById)}</p>
                <span className={`plan-roadmap-badge plan-roadmap-badge-${getPostTaskTone(task.status)}`}>
                  {formatStatusLabel(task.status)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="plan-roadmap-empty">
            <strong>No upcoming work</strong>
            <p>Materialize campaigns or add a planning rhythm to a series to populate the next month.</p>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div
          className="drawer-overlay"
          onClick={closeSeriesDrawer}
        >
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>New series</h2>
              <button
                className="drawer-close"
                onClick={closeSeriesDrawer}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="stack-form" onSubmit={handleCreateSeries}>
                <div className="form-section">
                  <div className="form-section-header">
                    <h4>Series concept</h4>
                    <p>Create the editorial track first. Recurring work setup happens on the series page after this.</p>
                  </div>
                  <div className="field-grid two">
                    <label className="field-label">
                      Series name
                      <input
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="e.g. Weekly Market Insights"
                        required
                        value={form.name}
                      />
                    </label>
                    <label className="field-label">
                      Start date
                      <input
                        onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))}
                        type="date"
                        value={form.startAt}
                      />
                    </label>
                  </div>
                  <label className="field-label">
                    Strategic description
                    <textarea
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Explain what this series should keep covering over time."
                      rows={3}
                      value={form.description}
                    />
                  </label>
                  <p className="field-hint">
                    After creation, you’ll land on a dedicated series page to set planning rhythm, defaults, and create recurring post tasks.
                  </p>
                </div>

                <div className="form-footer">
                  <button className="button button-primary" disabled={!activeBrandId || saving} type="submit">
                    {saving ? "Creating…" : "Create series"}
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

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getCampaignTone(status: string) {
  if (status === "active") return "green";
  if (status === "paused") return "orange";
  if (status === "completed") return "blue";
  return "gray";
}

function getSeriesTone(status: string) {
  if (status === "active") return "green";
  if (status === "paused") return "orange";
  return "gray";
}

function getPostTaskTone(status: string) {
  if (status === "approved" || status === "scheduled" || status === "published") return "blue";
  if (status === "review") return "orange";
  if (status === "brief_ready" || status === "generating") return "purple";
  if (status === "blocked") return "red";
  return "gray";
}

function getPostTaskContext(
  task: PlanOverview["unscheduledPostTasks"][number],
  campaignNameById: Map<string, string>,
  seriesNameById: Map<string, string>
) {
  if (task.campaignId) {
    return campaignNameById.get(task.campaignId) ?? "Campaign";
  }

  if (task.seriesId) {
    return seriesNameById.get(task.seriesId) ?? "Series";
  }

  return task.planningMode.replaceAll("_", " ");
}

function createEmptySeriesForm(): SeriesFormState {
  return {
    name: "",
    description: "",
    startAt: ""
  };
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}
