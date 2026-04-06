"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CampaignRecord,
  CreateDeliverableInput,
  CreativeChannel,
  CreativeFormat,
  CreativeTemplateRecord,
  DeliverablePriority,
  DeliverableRecord,
  DeliverableStatus,
  ObjectiveCode,
  PostingWindowRecord,
  PostTypeRecord,
  ProjectRecord,
  UpdateDeliverableInput,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  createDeliverable,
  deleteDeliverable,
  getCampaigns,
  getDeliverables,
  getPostingWindows,
  getPlanningTemplates,
  getPostTypes,
  getProjects,
  getWorkspaceMembers,
  updateDeliverable
} from "../../../lib/api";
import { mapCreativeFormatToContentFormat } from "../../../lib/deliverable-helpers";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../lib/placement-specs";
import { buildPostingWindowSuggestions } from "../../../lib/posting-windows";
import { DEFAULT_CALENDAR_SURFACE_STATUSES, isEligibleCalendarCandidate, isVisibleOnCalendar } from "../../../lib/workflow";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { FloatingTooltip } from "../floating-tooltip";
import { ImagePreviewTrigger } from "../image-preview";
import { PlacementIcons, PlatformGlyph } from "../placement-icons";

type DeliverableFormState = {
  title: string;
  briefText: string;
  ctaText: string;
  projectId: string;
  campaignId: string;
  postTypeId: string;
  creativeTemplateId: string;
  ownerUserId: string;
  objectiveCode: ObjectiveCode;
  channel: CreativeChannel;
  format: CreativeFormat;
  scheduledFor: string;
  status: DeliverableStatus;
  priority: DeliverablePriority;
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

const channelOptions: Array<{ value: CreativeChannel; label: string }> = [
  { value: "instagram-feed", label: "Instagram feed" },
  { value: "instagram-story", label: "Instagram story" },
  { value: "linkedin-feed", label: "LinkedIn feed" },
  { value: "x-post", label: "X post" },
  { value: "tiktok-cover", label: "TikTok cover" },
  { value: "ad-creative", label: "Ad creative" }
];

export default function CalendarPage() {
  const { sessionToken, bootstrap, activeBrandId, setMessage } = useStudio();
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([]);
  const [approvedCandidates, setApprovedCandidates] = useState<DeliverableRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [templates, setTemplates] = useState<CreativeTemplateRecord[]>([]);
  const [postingWindows, setPostingWindows] = useState<PostingWindowRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorDataLoading, setEditorDataLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [channelFilter, setChannelFilter] = useState<"all" | CreativeChannel>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DeliverableStatus>("all");
  const [projectFilter, setProjectFilter] = useState<"all" | string>("all");
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [editingDeliverableId, setEditingDeliverableId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "schedule">("create");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingDeliverableId, setMovingDeliverableId] = useState<string | null>(null);
  const [draggedDeliverableId, setDraggedDeliverableId] = useState<string | null>(null);
  const [form, setForm] = useState<DeliverableFormState>(() => createDefaultDeliverableForm(new Date()));

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => openCreateDrawer(new Date())}
        disabled={!activeBrandId || saving || editorDataLoading}
      >
        {saving ? "Saving…" : editorDataLoading ? "Loading…" : "New post task"}
      </button>
    ),
    [activeBrandId, editorDataLoading, saving]
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
        const range = getCalendarRange(currentDate);
        const visibleStatuses = statusFilter === "all" ? DEFAULT_CALENDAR_SURFACE_STATUSES : [statusFilter];
        const [
          deliverableRecords,
          approvedRecords,
          projectRecords,
          campaignRecords,
          postTypeRecords
        ] = await Promise.all([
          getDeliverables(token, {
            brandId,
            statusIn: visibleStatuses,
            scheduledFrom: range.start.toISOString(),
            scheduledTo: range.end.toISOString(),
            includePreviews: true
          }),
          getDeliverables(token, {
            brandId,
            status: "approved",
            includePreviews: true
          }),
          getProjects(token, { brandId }),
          getCampaigns(token, { brandId }),
          getPostTypes(token)
        ]);

        if (!cancelled) {
          setDeliverables(deliverableRecords);
          setApprovedCandidates(approvedRecords);
          setProjects(projectRecords.filter((project) => project.brandId === brandId));
          setCampaigns(campaignRecords);
          setPostTypes(postTypeRecords);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load calendar");
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
  }, [activeBrandId, currentDate, sessionToken, statusFilter]);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const campaignMap = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);
  const postTypeMap = useMemo(() => new Map(postTypes.map((postType) => [postType.id, postType])), [postTypes]);
  const templateMap = useMemo(() => new Map(templates.map((template) => [template.id, template])), [templates]);

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (form.projectId && template.projectId && template.projectId !== form.projectId) return false;
        if (form.postTypeId && template.postTypeId && template.postTypeId !== form.postTypeId) return false;
        return true;
      }),
    [form.postTypeId, form.projectId, templates]
  );

  const visibleDeliverables = useMemo(() => {
    return deliverables
      .filter((deliverable) => {
        if (!isVisibleOnCalendar(deliverable.status, statusFilter)) return false;
        if (channelFilter !== "all" && deliverable.placementCode !== channelFilter) return false;
        if (projectFilter !== "all" && deliverable.projectId !== projectFilter) return false;
        return true;
      })
      .sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime());
  }, [channelFilter, deliverables, projectFilter, statusFilter]);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const groupedByDay = useMemo(() => groupDeliverablesByDay(visibleDeliverables), [visibleDeliverables]);
  const expandedDayDeliverables = useMemo(
    () => (expandedDay ? groupedByDay.get(dayKey(expandedDay)) ?? [] : []),
    [expandedDay, groupedByDay]
  );
  const allKnownDeliverables = useMemo(
    () => {
      const byId = new Map<string, DeliverableRecord>();
      for (const deliverable of [...deliverables, ...approvedCandidates]) {
        byId.set(deliverable.id, deliverable);
      }
      return [...byId.values()];
    },
    [approvedCandidates, deliverables]
  );
  const availableApprovedPostTasks = useMemo(
    () =>
      approvedCandidates
        .filter((deliverable) => isEligibleCalendarCandidate(deliverable.status))
        .sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime()),
    [approvedCandidates]
  );

  const activePlacement = getPlacementSpec(form.channel, form.format) ?? getAllowedFormats(form.channel)[0]!;
  const editingDeliverable = editingDeliverableId ? allKnownDeliverables.find((item) => item.id === editingDeliverableId) ?? null : null;
  const isScheduleMode = drawerMode === "schedule";
  const suggestedPostingSlots = useMemo(
    () => buildPostingWindowSuggestions(postingWindows, form.channel, new Date(form.scheduledFor)),
    [form.channel, form.scheduledFor, postingWindows]
  );

  async function ensureEditorData() {
    if (!sessionToken || !activeBrandId) return;
    if (templates.length > 0 && postingWindows.length > 0 && workspaceMembers.length > 0) return;

    setEditorDataLoading(true);
    try {
      const [templateRecords, postingWindowRecords, memberRecords] = await Promise.all([
        getPlanningTemplates(sessionToken, { brandId: activeBrandId }),
        getPostingWindows(sessionToken, activeBrandId),
        getWorkspaceMembers(sessionToken)
      ]);
      setTemplates(templateRecords);
      setPostingWindows(postingWindowRecords);
      setWorkspaceMembers(memberRecords);
    } finally {
      setEditorDataLoading(false);
    }
  }

  function openCreateDrawer(date?: Date) {
    void (async () => {
      await ensureEditorData();
      setExpandedDay(null);
      setPickerDate(null);
      setEditingDeliverableId(null);
      setDrawerMode("create");
      setForm(createDefaultDeliverableForm(date ?? currentDate));
      setIsDrawerOpen(true);
    })();
  }

  function openEditDrawer(deliverable: DeliverableRecord) {
    void (async () => {
      await ensureEditorData();
      setExpandedDay(null);
      setPickerDate(null);
      setEditingDeliverableId(deliverable.id);
      setDrawerMode("edit");
      setForm(toDeliverableFormState(deliverable));
      setIsDrawerOpen(true);
    })();
  }

  function openPicker(date: Date) {
    setIsDrawerOpen(false);
    setExpandedDay(null);
    setPickerDate(startOfDay(date));
  }

  function openScheduleDrawer(deliverable: DeliverableRecord, targetDate: Date) {
    const existingDate = new Date(deliverable.scheduledFor);
    const nextDate = new Date(targetDate);
    nextDate.setHours(existingDate.getHours(), existingDate.getMinutes(), 0, 0);

    setPickerDate(null);
    setExpandedDay(null);
    setEditingDeliverableId(deliverable.id);
    setDrawerMode("schedule");
    setForm({
      ...toDeliverableFormState(deliverable),
      scheduledFor: toLocalDateTimeValue(nextDate),
      status: deliverable.status === "approved" ? "scheduled" : deliverable.status
    });
    setIsDrawerOpen(true);
  }

  function openDaySummary(date: Date) {
    setIsDrawerOpen(false);
    setPickerDate(null);
    setExpandedDay(startOfDay(date));
  }

  async function reloadDeliverables() {
    if (!sessionToken || !activeBrandId) return;
    const range = getCalendarRange(currentDate);
    const visibleStatuses = statusFilter === "all" ? DEFAULT_CALENDAR_SURFACE_STATUSES : [statusFilter];
    const [visibleRecords, approvedRecords] = await Promise.all([
      getDeliverables(sessionToken, {
        brandId: activeBrandId,
        statusIn: visibleStatuses,
        scheduledFrom: range.start.toISOString(),
        scheduledTo: range.end.toISOString(),
        includePreviews: true
      }),
      getDeliverables(sessionToken, {
        brandId: activeBrandId,
        status: "approved",
        includePreviews: true
      })
    ]);
    setDeliverables(visibleRecords);
    setApprovedCandidates(approvedRecords);
  }

  async function handleSaveDeliverable(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        projectId: form.projectId,
        campaignId: form.campaignId || undefined,
        seriesId: editingDeliverable?.seriesId ?? undefined,
        postTypeId: form.postTypeId,
        creativeTemplateId: form.creativeTemplateId || undefined,
        planningMode: editingDeliverable?.planningMode ?? (form.campaignId ? "campaign" : "one_off"),
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
        seriesOccurrenceDate: editingDeliverable?.seriesOccurrenceDate ?? undefined,
        sourceJson: {
          ...(editingDeliverable?.sourceJson ?? {}),
          source: editingDeliverable ? editingDeliverable.sourceJson?.source ?? "calendar_planner" : "calendar_planner",
          creativeFormat: form.format
        }
      };

      if (editingDeliverableId) {
        await updateDeliverable(sessionToken, editingDeliverableId, {
          ...payload,
          approvedPostVersionId: editingDeliverable?.approvedPostVersionId ?? undefined
        } satisfies UpdateDeliverableInput);
        setMessage("Post task updated.");
      } else {
        await createDeliverable(sessionToken, {
          workspaceId: bootstrap.workspace.id,
          brandId: activeBrandId,
          ...payload
        } satisfies CreateDeliverableInput);
        setMessage("Post task created.");
      }

      await reloadDeliverables();
      setIsDrawerOpen(false);
      setEditingDeliverableId(null);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Calendar update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDeliverable() {
    if (!sessionToken || !editingDeliverableId) {
      return;
    }

    setDeleting(true);

    try {
      await deleteDeliverable(sessionToken, editingDeliverableId);
      await reloadDeliverables();
      setIsDrawerOpen(false);
      setEditingDeliverableId(null);
      setMessage("Post task deleted.");
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function moveDeliverableToDate(deliverableId: string, targetDate: Date) {
    if (!sessionToken) {
      return false;
    }

    const deliverable = deliverables.find((item) => item.id === deliverableId);
    if (!deliverable) {
      return false;
    }

    const existingDate = new Date(deliverable.scheduledFor);
    const nextDate = new Date(targetDate);
    nextDate.setHours(existingDate.getHours(), existingDate.getMinutes(), 0, 0);

    if (isSameDay(existingDate, nextDate)) {
      return false;
    }

    setMovingDeliverableId(deliverableId);

    try {
      await updateDeliverable(sessionToken, deliverable.id, {
        projectId: deliverable.projectId,
        campaignId: deliverable.campaignId ?? undefined,
        seriesId: deliverable.seriesId ?? undefined,
        personaId: deliverable.personaId ?? undefined,
        contentPillarId: deliverable.contentPillarId ?? undefined,
        postTypeId: deliverable.postTypeId,
        creativeTemplateId: deliverable.creativeTemplateId ?? undefined,
        channelAccountId: deliverable.channelAccountId ?? undefined,
        planningMode: deliverable.planningMode,
        objectiveCode: deliverable.objectiveCode,
        placementCode: deliverable.placementCode,
        contentFormat: deliverable.contentFormat,
        title: deliverable.title,
        briefText: deliverable.briefText ?? undefined,
        ctaText: deliverable.ctaText ?? undefined,
        scheduledFor: nextDate.toISOString(),
        dueAt: deliverable.dueAt ?? undefined,
        ownerUserId: deliverable.ownerUserId ?? undefined,
        priority: deliverable.priority,
        status: deliverable.status === "approved" ? "scheduled" : deliverable.status,
        approvedPostVersionId: deliverable.approvedPostVersionId ?? undefined,
        seriesOccurrenceDate: deliverable.seriesOccurrenceDate ?? undefined,
        sourceJson: deliverable.sourceJson
      } satisfies UpdateDeliverableInput);

      await reloadDeliverables();
      setMessage("Post task rescheduled.");
      return true;
    } catch (moveError) {
      setMessage(moveError instanceof Error ? moveError.message : "Reschedule failed");
      return false;
    } finally {
      setMovingDeliverableId(null);
      setDraggedDeliverableId(null);
    }
  }

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Calendar</p>
          <h3>Pick a brand first</h3>
          <p>The calendar is scoped to the active brand.</p>
        </article>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Calendar</p>
          <h3>Loading calendar…</h3>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Calendar</p>
          <h3>Unable to load calendar</h3>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="page-stack calendar-page">
      <section className="calendar-shell">
        <div className="calendar-toolbar">
          <div className="calendar-toolbar-primary">
            <div className="calendar-period-nav">
              <button className="calendar-nav-button" onClick={() => setCurrentDate(shiftDate(currentDate, -1))} type="button">
                <span aria-hidden="true">←</span>
              </button>
              <button className="calendar-today-button" onClick={() => setCurrentDate(startOfDay(new Date()))} type="button">
                Today
              </button>
              <button className="calendar-nav-button" onClick={() => setCurrentDate(shiftDate(currentDate, 1))} type="button">
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div>
              <h3>{formatCalendarHeading(currentDate)}</h3>
              <p className="calendar-subline">
                {activeBrand?.name ?? "Brand"} · {visibleDeliverables.length} visible post tasks this week
              </p>
            </div>
          </div>

          <div className="calendar-toolbar-filters">
            <div className="data-table-toolbar-left">
              <label className="data-table-filter">
                <span>Channel</span>
                <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value as "all" | CreativeChannel)}>
                  <option value="all">Any channel</option>
                  {channelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="data-table-filter">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | DeliverableStatus)}>
                  <option value="all">Any status</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="data-table-filter">
                <span>Project</span>
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                  <option value="all">Any project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              {(channelFilter !== "all" || statusFilter !== "all" || projectFilter !== "all") && (
                <button
                  className="data-table-clear"
                  onClick={() => {
                    setChannelFilter("all");
                    setStatusFilter("all");
                    setProjectFilter("all");
                  }}
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <WeekView
          onAddToDate={openPicker}
          days={weekDays}
          groupedByDay={groupedByDay}
          movingDeliverableId={movingDeliverableId}
          onEditDeliverable={openEditDrawer}
          onMoveDeliverable={moveDeliverableToDate}
          onSetDraggedDeliverableId={setDraggedDeliverableId}
          postTypeMap={postTypeMap}
          campaignMap={campaignMap}
          draggedDeliverableId={draggedDeliverableId}
        />
      </section>

      {expandedDay ? (
        <div className="drawer-overlay" onClick={() => setExpandedDay(null)}>
          <div className="drawer-content calendar-day-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div className="calendar-day-drawer-copy">
                <p className="panel-label">Day view</p>
                <h2>{formatAgendaHeading(expandedDay)}</h2>
                <p className="calendar-day-drawer-subline">
                  {expandedDayDeliverables.length} scheduled {expandedDayDeliverables.length === 1 ? "post task" : "post tasks"}
                </p>
              </div>
              <div className="calendar-day-drawer-actions">
                <button className="button button-primary" onClick={() => openPicker(expandedDay)} type="button">
                  Add post
                </button>
                <button className="drawer-close" onClick={() => setExpandedDay(null)} type="button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="drawer-body calendar-day-drawer-body">
              {expandedDayDeliverables.length > 0 ? (
                <div className="calendar-day-drawer-list">
                  {expandedDayDeliverables.map((deliverable) => (
                    <CalendarDayListItem
                      key={deliverable.id}
                      campaignMap={campaignMap}
                      deliverable={deliverable}
                      onEdit={openEditDrawer}
                      postTypeMap={postTypeMap}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state empty-state-tall">
                  <strong>No scheduled post tasks on this day</strong>
                  <p>Add an approved post task or create a new one for this date.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pickerDate ? (
        <div className="drawer-overlay" onClick={() => setPickerDate(null)}>
          <div className="drawer-content calendar-picker-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="panel-label">Add Existing</p>
                <h2>{formatAgendaHeading(pickerDate)}</h2>
              </div>
              <button className="drawer-close" onClick={() => setPickerDate(null)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body calendar-picker-body">
              <div className="calendar-picker-toolbar">
                <p>Pick from approved post tasks that are ready to schedule.</p>
                <button className="button button-ghost" onClick={() => openCreateDrawer(pickerDate)} type="button">
                  New post task
                </button>
              </div>

              {availableApprovedPostTasks.length > 0 ? (
                <div className="calendar-picker-list">
                  {availableApprovedPostTasks.map((deliverable) => {
                    const postType = postTypeMap.get(deliverable.postTypeId);
                    const campaign = deliverable.campaignId ? campaignMap.get(deliverable.campaignId) : null;
                    const alreadyOnDate = isSameDay(new Date(deliverable.scheduledFor), pickerDate);

                    return (
                      <button
                        key={deliverable.id}
                        className="calendar-picker-item"
                        disabled={movingDeliverableId === deliverable.id}
                        onClick={() => openScheduleDrawer(deliverable, pickerDate)}
                        type="button"
                      >
                        <div className="calendar-picker-copy">
                          <strong>{deliverable.title}</strong>
                          <span>
                            {postType?.name ?? "Post task"}
                            {campaign ? ` · ${campaign.name}` : ""}
                          </span>
                        </div>
                        <div className="calendar-picker-meta">
                          <span className="calendar-picker-date">{formatMiniDate(deliverable.scheduledFor)}</span>
                          <PlacementIcons channel={deliverable.placementCode} format={deriveFormat(deliverable)} interactive={false} />
                          <CalendarStatusIndicator interactive={false} status={deliverable.status} />
                        </div>
                        {alreadyOnDate ? <span className="calendar-picker-state">Scheduled here</span> : <span className="calendar-picker-state">Choose time</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state empty-state-tall">
                  <strong>No approved post tasks ready to schedule</strong>
                  <p>Approve a candidate in Review first, then place it on the calendar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isDrawerOpen ? (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>
                {isScheduleMode ? "Schedule post" : editingDeliverableId ? "Edit post task" : "Create post task"}
              </h2>
              <button className="drawer-close" onClick={() => setIsDrawerOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSaveDeliverable}>
                {editingDeliverable ? (
                  <div className="calendar-drawer-preview">
                    <div className="calendar-drawer-preview-media">
                      <CalendarPreviewThumbnail deliverable={editingDeliverable} />
                    </div>
                    <div className="calendar-drawer-preview-copy">
                      <div className="calendar-drawer-preview-top">
                        <CalendarPlatformTag deliverable={editingDeliverable} />
                        <CalendarStatusPill status={editingDeliverable.status} />
                      </div>
                      <strong>{editingDeliverable.title}</strong>
                      {editingDeliverable.briefText ? <p>{editingDeliverable.briefText}</p> : null}
                      <div className="calendar-drawer-preview-meta">
                        <span>{formatTime(editingDeliverable.scheduledFor)}</span>
                        <PlacementIcons
                          channel={editingDeliverable.placementCode}
                          compact
                          format={deriveFormat(editingDeliverable)}
                          interactive={false}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {!isScheduleMode ? (
                  <div className="planner-form-section">
                    <p className="field-group-label">Content</p>
                    <div className="planner-form-grid">
                      <label className="field-label planner-form-span-2">
                        Title
                        <input
                          required
                          value={form.title}
                          onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
                          placeholder="Weekend site visit creative"
                        />
                      </label>

                      <label className="field-label planner-form-span-2">
                        Brief
                        <textarea
                          value={form.briefText}
                          onChange={(event) => setForm((state) => ({ ...state, briefText: event.target.value }))}
                          placeholder="What should this post communicate?"
                        />
                      </label>

                      <label className="field-label">
                        Project
                        <select required value={form.projectId} onChange={(event) => setForm((state) => ({ ...state, projectId: event.target.value }))}>
                          <option value="">Select project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label">
                        Campaign
                        <select value={form.campaignId} onChange={(event) => setForm((state) => ({ ...state, campaignId: event.target.value }))}>
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
                        <select required value={form.postTypeId} onChange={(event) => setForm((state) => ({ ...state, postTypeId: event.target.value }))}>
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
                          onChange={(event) => {
                            const templateId = event.target.value;
                            const template = templateMap.get(templateId);
                            setForm((state) => ({
                              ...state,
                              creativeTemplateId: templateId,
                              channel: template?.channel ?? state.channel,
                              format: template?.format ?? state.format
                            }));
                          }}
                        >
                          <option value="">No linked template</option>
                          {filteredTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label">
                        Assignee
                        <select value={form.ownerUserId} onChange={(event) => setForm((state) => ({ ...state, ownerUserId: event.target.value }))}>
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
                        <select value={form.objectiveCode} onChange={(event) => setForm((state) => ({ ...state, objectiveCode: event.target.value as ObjectiveCode }))}>
                          {objectiveOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label">
                        Status
                        <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value as DeliverableStatus }))}>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label">
                        Priority
                        <select value={form.priority} onChange={(event) => setForm((state) => ({ ...state, priority: event.target.value as DeliverablePriority }))}>
                          {priorityOptions.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-label planner-form-span-2">
                        CTA
                        <input value={form.ctaText} onChange={(event) => setForm((state) => ({ ...state, ctaText: event.target.value }))} placeholder="Book a site visit" />
                      </label>
                    </div>
                  </div>
                ) : null}

                <div className="planner-form-section">
                  <p className="field-group-label">{isScheduleMode ? "Schedule" : "Schedule & placement"}</p>
                  <div className="planner-form-grid">
                    {!isScheduleMode ? (
                      <>
                        <label className="field-label">
                          Channel
                          <select
                            value={form.channel}
                            onChange={(event) =>
                              setForm((state) => {
                                const nextChannel = event.target.value as CreativeChannel;
                                const nextDefault = getDefaultFormat(nextChannel);
                                const currentStillAllowed = getPlacementSpec(nextChannel, state.format);

                                return {
                                  ...state,
                                  channel: nextChannel,
                                  format: currentStillAllowed ? state.format : nextDefault
                                };
                              })
                            }
                          >
                            {channelOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field-label">
                          Format
                          <select value={form.format} onChange={(event) => setForm((state) => ({ ...state, format: event.target.value as CreativeFormat }))}>
                            {getAllowedFormats(form.channel).map((option) => (
                              <option key={`${option.channel}-${option.format}`} value={option.format}>
                                {option.formatLabel}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : null}

                    <label className="field-label planner-form-span-2">
                      Scheduled for
                      {suggestedPostingSlots.length > 0 ? (
                        <div className="slot-suggestion-row">
                          {suggestedPostingSlots.map((slot) => (
                            <button
                              key={slot.key}
                              className={form.scheduledFor === toLocalDateTimeValue(slot.dateTime) ? "slot-suggestion-chip active" : "slot-suggestion-chip"}
                              onClick={() =>
                                setForm((state) => ({
                                  ...state,
                                  scheduledFor: toLocalDateTimeValue(slot.dateTime)
                                }))
                              }
                              type="button"
                            >
                              {slot.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input
                        required
                        type="datetime-local"
                        value={form.scheduledFor}
                        onChange={(event) => setForm((state) => ({ ...state, scheduledFor: event.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                {!isScheduleMode ? (
                  <div className="placement-card">
                    <div className="placement-card-top">
                      <div>
                        <p className="panel-label">Placement</p>
                        <h4>{activePlacement.channelLabel} · {activePlacement.formatLabel}</h4>
                      </div>
                      <span className="placement-size-pill">{activePlacement.recommendedSize}</span>
                    </div>
                    <p className="placement-purpose">{activePlacement.purpose}</p>
                  </div>
                ) : (
                  <div className="placement-card">
                    <div className="placement-card-top">
                      <div>
                        <p className="panel-label">Current placement</p>
                        <h4>{activePlacement.channelLabel} · {activePlacement.formatLabel}</h4>
                      </div>
                      <span className="placement-size-pill">{activePlacement.recommendedSize}</span>
                    </div>
                    <p className="placement-purpose">Placement stays on the post. Pick the posting time here.</p>
                  </div>
                )}

                <div className="planner-form-actions planner-form-actions-spread">
                  <div className="planner-form-actions-left">
                    {editingDeliverableId ? (
                      <>
                        <button className="button button-ghost" onClick={() => setIsDrawerOpen(false)} type="button">
                          Cancel
                        </button>
                        <Link className="button button-ghost" href={`/studio/deliverables/${editingDeliverableId}`}>
                          Open detail
                        </Link>
                      </>
                    ) : (
                      <button className="button button-ghost" onClick={() => setIsDrawerOpen(false)} type="button">
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="planner-form-actions-right">
                    {editingDeliverableId && !isScheduleMode ? (
                      <button className="button button-ghost delete-button" disabled={deleting || saving} onClick={() => void handleDeleteDeliverable()} type="button">
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                    <button className="button button-primary" disabled={saving || !form.projectId || !form.postTypeId} type="submit">
                      {saving ? "Saving…" : isScheduleMode ? "Save schedule" : editingDeliverableId ? "Save changes" : "Save post task"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MonthView({
  onAddToDate,
  onOpenDay,
  days,
  groupedByDay,
  movingDeliverableId,
  onEditDeliverable,
  onMoveDeliverable,
  onSetDraggedDeliverableId,
  postTypeMap,
  campaignMap,
  draggedDeliverableId,
  currentDate
}: {
  onAddToDate: (date: Date) => void;
  onOpenDay: (date: Date) => void;
  days: Date[];
  groupedByDay: Map<string, DeliverableRecord[]>;
  movingDeliverableId: string | null;
  onEditDeliverable: (deliverable: DeliverableRecord) => void;
  onMoveDeliverable: (deliverableId: string, targetDate: Date) => Promise<boolean>;
  onSetDraggedDeliverableId: (id: string | null) => void;
  postTypeMap: Map<string, PostTypeRecord>;
  campaignMap: Map<string, CampaignRecord>;
  draggedDeliverableId: string | null;
  currentDate: Date;
}) {
  return (
    <div className="calendar-month-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
        <div className="calendar-weekday-cell" key={label}>
          {label}
        </div>
      ))}

      {days.map((day) => {
        const key = dayKey(day);
        const entries = groupedByDay.get(key) ?? [];
        const inCurrentMonth = isSameMonth(day, currentDate);
        const hasEntries = entries.length > 0;

        return (
          <div
            className={`calendar-day-cell ${inCurrentMonth ? "" : "is-muted"} ${isToday(day) ? "is-today" : ""}`.trim()}
            key={key}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedDeliverableId) {
                void onMoveDeliverable(draggedDeliverableId, day);
              }
            }}
          >
            <div className="calendar-day-header">
              <span>{day.getDate()}</span>
              {hasEntries ? (
                <button
                  aria-label={`Add post to ${formatAgendaHeading(day)}`}
                  className="calendar-hover-add calendar-hover-add-header"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddToDate(day);
                  }}
                  type="button"
                >
                  +
                </button>
              ) : null}
            </div>
            <div className="calendar-day-events">
              {entries.slice(0, 1).map((deliverable) => (
                <CalendarEventCard
                  key={deliverable.id}
                  campaignMap={campaignMap}
                  compact
                  deliverable={deliverable}
                  moving={movingDeliverableId === deliverable.id}
                  onEdit={onEditDeliverable}
                  onSetDraggedDeliverableId={onSetDraggedDeliverableId}
                  postTypeMap={postTypeMap}
                />
              ))}
              {entries.length > 1 ? (
                <button
                  className="calendar-more-chip"
                  key="more"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDay(day);
                  }}
                  type="button"
                >
                  +{entries.length - 1} more
                </button>
              ) : null}
            </div>
            {!hasEntries ? (
              <button
                aria-label={`Add post to ${formatAgendaHeading(day)}`}
                className="calendar-hover-add"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddToDate(day);
                }}
                type="button"
              >
                +
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({
  onAddToDate,
  days,
  groupedByDay,
  movingDeliverableId,
  onEditDeliverable,
  onMoveDeliverable,
  onSetDraggedDeliverableId,
  postTypeMap,
  campaignMap,
  draggedDeliverableId
}: {
  onAddToDate: (date: Date) => void;
  days: Date[];
  groupedByDay: Map<string, DeliverableRecord[]>;
  movingDeliverableId: string | null;
  onEditDeliverable: (deliverable: DeliverableRecord) => void;
  onMoveDeliverable: (deliverableId: string, targetDate: Date) => Promise<boolean>;
  onSetDraggedDeliverableId: (id: string | null) => void;
  postTypeMap: Map<string, PostTypeRecord>;
  campaignMap: Map<string, CampaignRecord>;
  draggedDeliverableId: string | null;
}) {
  return (
    <div className="calendar-week-grid">
      {days.map((day) => {
        const entries = groupedByDay.get(dayKey(day)) ?? [];
        const hasEntries = entries.length > 0;
        return (
          <div
            className={`calendar-week-column ${isToday(day) ? "is-today" : ""}`.trim()}
            key={dayKey(day)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedDeliverableId) {
                void onMoveDeliverable(draggedDeliverableId, day);
              }
            }}
          >
            <div className="calendar-week-column-header">
              <div className="calendar-week-heading-copy">
                <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <strong>{day.getDate()}</strong>
              </div>
              {hasEntries ? (
                <button
                  aria-label={`Add post to ${formatAgendaHeading(day)}`}
                  className="calendar-hover-add calendar-hover-add-header"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddToDate(day);
                  }}
                  type="button"
                >
                  +
                </button>
              ) : null}
            </div>

            <div className="calendar-week-column-body">
              {entries.map((deliverable) => (
                <CalendarEventCard
                  key={deliverable.id}
                  campaignMap={campaignMap}
                  deliverable={deliverable}
                  moving={movingDeliverableId === deliverable.id}
                  onEdit={onEditDeliverable}
                  onSetDraggedDeliverableId={onSetDraggedDeliverableId}
                  postTypeMap={postTypeMap}
                />
              ))}
            </div>
            {!hasEntries ? (
              <button
                aria-label={`Add post to ${formatAgendaHeading(day)}`}
                className="calendar-hover-add"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddToDate(day);
                }}
                type="button"
              >
                +
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({
  groups,
  campaignMap,
  onAddToDate,
  onEditDeliverable,
  postTypeMap
}: {
  groups: Array<{ day: Date; items: DeliverableRecord[] }>;
  campaignMap: Map<string, CampaignRecord>;
  onAddToDate: (date: Date) => void;
  onEditDeliverable: (deliverable: DeliverableRecord) => void;
  postTypeMap: Map<string, PostTypeRecord>;
}) {
  if (groups.length === 0) {
    return (
      <div className="empty-state empty-state-tall">
        <strong>No post tasks match these filters</strong>
        <p>Try another channel, project, or status filter.</p>
      </div>
    );
  }

  return (
    <div className="calendar-agenda">
      {groups.map((group) => (
        <section className="calendar-agenda-group" key={dayKey(group.day)}>
          <div className="calendar-agenda-heading">
            <h4>{formatAgendaHeading(group.day)}</h4>
            <div className="calendar-agenda-heading-actions">
              <span>{group.items.length}</span>
              <button className="calendar-add-button" onClick={() => onAddToDate(group.day)} type="button">
                +
              </button>
            </div>
          </div>
          <div className="calendar-agenda-list">
            {group.items.map((deliverable) => (
              <CalendarEventCard
                key={deliverable.id}
                deliverable={deliverable}
                campaignMap={campaignMap}
                draggableCard={false}
                onEdit={onEditDeliverable}
                onSetDraggedDeliverableId={() => undefined}
                postTypeMap={postTypeMap}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CalendarDayListItem({
  deliverable,
  campaignMap,
  onEdit,
  postTypeMap
}: {
  deliverable: DeliverableRecord;
  campaignMap: Map<string, CampaignRecord>;
  onEdit: (deliverable: DeliverableRecord) => void;
  postTypeMap: Map<string, PostTypeRecord>;
}) {
  const postType = postTypeMap.get(deliverable.postTypeId);
  const campaign = deliverable.campaignId ? campaignMap.get(deliverable.campaignId) : null;

  return (
    <button className="calendar-day-item" onClick={() => onEdit(deliverable)} type="button">
      <div className="calendar-day-item-body">
        <CalendarPreviewThumbnail deliverable={deliverable} />
        <div className="calendar-day-item-content">
          <div className="calendar-day-item-head">
            <CalendarPlatformTag deliverable={deliverable} />
            <div className="calendar-day-item-head-meta">
              <span className="calendar-day-item-time">{formatTime(deliverable.scheduledFor)}</span>
            </div>
          </div>
          <strong className="calendar-day-item-title">{deliverable.title}</strong>
          {deliverable.briefText ? <p className="calendar-day-item-snippet">{deliverable.briefText}</p> : null}
          <div className="calendar-day-item-meta">
            <span className="calendar-meta-chip">{postType?.name ?? "Post"}</span>
            {campaign ? <span className="calendar-meta-chip calendar-meta-chip-muted">{campaign.name}</span> : null}
            <CalendarStatusPill status={deliverable.status} />
          </div>
        </div>
      </div>
    </button>
  );
}

function CalendarEventCard({
  deliverable,
  campaignMap,
  compact = false,
  draggableCard = true,
  moving = false,
  onEdit,
  onSetDraggedDeliverableId,
  postTypeMap
}: {
  deliverable: DeliverableRecord;
  campaignMap: Map<string, CampaignRecord>;
  compact?: boolean;
  draggableCard?: boolean;
  moving?: boolean;
  onEdit: (deliverable: DeliverableRecord) => void;
  onSetDraggedDeliverableId: (id: string | null) => void;
  postTypeMap: Map<string, PostTypeRecord>;
}) {
  const postType = postTypeMap.get(deliverable.postTypeId);
  const campaign = deliverable.campaignId ? campaignMap.get(deliverable.campaignId) : null;

  return (
    <div
      className={`calendar-event-card ${compact ? "is-compact" : ""} ${moving ? "is-moving" : ""}`.trim()}
      draggable={draggableCard}
      onClick={() => onEdit(deliverable)}
      onDragEnd={() => onSetDraggedDeliverableId(null)}
      onDragStart={(event) => {
        if (!draggableCard) {
          event.preventDefault();
          return;
        }
        onSetDraggedDeliverableId(deliverable.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", deliverable.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(deliverable);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="calendar-event-top">
        <CalendarPlatformTag deliverable={deliverable} />
        <div className="calendar-event-top-meta">
          <span className="calendar-event-time">{formatTime(deliverable.scheduledFor)}</span>
          <CalendarStatusIndicator status={deliverable.status} />
        </div>
      </div>
      <CalendarPreviewThumbnail deliverable={deliverable} />
      <div className="calendar-event-copy">
        <strong className="calendar-event-title">{deliverable.title}</strong>
        {deliverable.briefText ? <p className="calendar-event-snippet">{deliverable.briefText}</p> : null}
      </div>
        <div className="calendar-event-footer">
          <div className="calendar-event-meta">
            <span className="calendar-meta-chip">{postType?.name ?? "Post"}</span>
            {!compact && campaign ? <span className="calendar-meta-chip calendar-meta-chip-muted">{campaign.name}</span> : null}
          </div>
          <div className="calendar-event-footer-right">
            <PlacementIcons channel={deliverable.placementCode} compact format={deriveFormat(deliverable)} interactive={false} />
            {deliverable.previewUrl ? <span className="calendar-ai-mark" aria-hidden="true">✦</span> : null}
          </div>
        </div>
    </div>
  );
}

function CalendarPreviewThumbnail({ deliverable }: { deliverable: DeliverableRecord }) {
  return deliverable.previewUrl ? (
    <ImagePreviewTrigger
      alt={`Preview for ${deliverable.title}`}
      className="calendar-event-thumb"
      meta={formatTime(deliverable.scheduledFor)}
      src={deliverable.previewUrl}
      title={deliverable.title}
    >
      <img alt={`Preview for ${deliverable.title}`} src={deliverable.previewUrl} />
    </ImagePreviewTrigger>
  ) : (
    <div className="calendar-event-thumb calendar-event-thumb-fallback" aria-hidden="true">
      <span>{getChannelMonogram(deliverable.placementCode)}</span>
    </div>
  );
}

function CalendarPlatformTag({ deliverable }: { deliverable: DeliverableRecord }) {
  const tag = getPlatformTagMeta(deliverable.placementCode);

  return (
    <span className={`calendar-platform-tag calendar-platform-tag-${tag.tone}`}>
      <PlatformGlyph channel={deliverable.placementCode} />
      <span>{tag.label}</span>
    </span>
  );
}

function CalendarStatusIndicator({ status, interactive = true }: { status: DeliverableStatus; interactive?: boolean }) {
  const label = getStatusLabel(status);
  const Trigger = interactive ? "button" : "span";

  return (
    <FloatingTooltip className="calendar-status-popover" content={<strong>{label}</strong>}>
      <span className={`calendar-status-indicator calendar-status-${status}`}>
        <Trigger
          aria-label={label}
          className="calendar-status-button"
          {...(interactive
            ? {
                onClick: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => event.stopPropagation(),
                onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                type: "button" as const
              }
            : {})}
        >
          <span aria-hidden="true" className="calendar-status-dot" />
        </Trigger>
      </span>
    </FloatingTooltip>
  );
}

function CalendarStatusPill({ status }: { status: DeliverableStatus }) {
  return <span className={`calendar-status-pill calendar-status-pill-${getStatusTone(status)}`}>{getStatusLabel(status)}</span>;
}

function getStatusLabel(status: DeliverableStatus) {
  switch (status) {
    case "planned":
      return "Planned";
    case "brief_ready":
      return "Brief ready";
    case "generating":
      return "Generating";
    case "review":
      return "In review";
    case "approved":
      return "Approved";
    case "scheduled":
      return "Scheduled";
    case "published":
      return "Published";
    case "archived":
      return "Archived";
    case "blocked":
      return "Blocked";
    default:
      return formatStatus(status);
  }
}

function getStatusTone(status: DeliverableStatus) {
  if (status === "approved" || status === "scheduled" || status === "published") {
    return "green";
  }

  if (status === "generating" || status === "review") {
    return "orange";
  }

  if (status === "brief_ready") {
    return "purple";
  }

  if (status === "blocked") {
    return "red";
  }

  return "gray";
}

function createDefaultDeliverableForm(date = new Date()): DeliverableFormState {
  const next = startOfDay(date);
  next.setHours(10, 0, 0, 0);

  return {
    title: "",
    briefText: "",
    ctaText: "",
    projectId: "",
    campaignId: "",
    postTypeId: "",
    creativeTemplateId: "",
    ownerUserId: "",
    objectiveCode: "lead_gen",
    channel: "instagram-feed",
    format: "square",
    scheduledFor: toLocalDateTimeValue(next),
    status: "planned",
    priority: "normal"
  };
}

function toDeliverableFormState(deliverable: DeliverableRecord): DeliverableFormState {
  return {
    title: deliverable.title,
    briefText: deliverable.briefText ?? "",
    ctaText: deliverable.ctaText ?? "",
    projectId: deliverable.projectId ?? "",
    campaignId: deliverable.campaignId ?? "",
    postTypeId: deliverable.postTypeId,
    creativeTemplateId: deliverable.creativeTemplateId ?? "",
    ownerUserId: deliverable.ownerUserId ?? "",
    objectiveCode: deliverable.objectiveCode,
    channel: deliverable.placementCode,
    format: deriveFormat(deliverable),
    scheduledFor: toLocalDateTimeValue(new Date(deliverable.scheduledFor)),
    status: deliverable.status,
    priority: deliverable.priority
  };
}

function deriveFormat(deliverable: DeliverableRecord) {
  return (deliverable.sourceJson?.creativeFormat as CreativeFormat | undefined) ?? mapContentFormatToCreativeFormat(deliverable.contentFormat);
}

function mapContentFormatToCreativeFormat(format: string): CreativeFormat {
  switch (format) {
    case "carousel":
      return "square";
    case "video":
      return "landscape";
    case "story":
      return "story";
    case "static":
    default:
      return "square";
  }
}

function formatStatus(status: DeliverableStatus) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function addDays(date: Date, value: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + value);
  return next;
}

function getCalendarRange(currentDate: Date) {
  const days = getWeekDays(currentDate);
  return {
    start: startOfDay(days[0]!),
    end: addDays(startOfDay(days[days.length - 1]!), 1)
  };
}

function getMonthGrid(date: Date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function getWeekDays(date: Date) {
  const weekStart = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function shiftDate(date: Date, direction: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + direction * 7);
  return next;
}

function formatCalendarHeading(date: Date) {
  const week = getWeekDays(date);
  const first = week.at(0);
  const last = week.at(-1);

  if (!first || !last) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  return `${first.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${last.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

function formatAgendaHeading(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatMiniDate(value: string) {
  return new Date(value).toLocaleDateString([], { day: "numeric", month: "short" });
}

function getChannelMonogram(channel: CreativeChannel) {
  switch (channel) {
    case "instagram-feed":
    case "instagram-story":
      return "IG";
    case "linkedin-feed":
      return "IN";
    case "x-post":
      return "X";
    case "tiktok-cover":
      return "TT";
    case "ad-creative":
      return "AD";
    default:
      return "PT";
  }
}

function getPlatformTagMeta(channel: CreativeChannel) {
  switch (channel) {
    case "instagram-feed":
    case "instagram-story":
      return { label: "Instagram", tone: "instagram" as const };
    case "linkedin-feed":
      return { label: "LinkedIn", tone: "linkedin" as const };
    case "x-post":
      return { label: "X", tone: "x" as const };
    case "tiktok-cover":
      return { label: "TikTok", tone: "tiktok" as const };
    case "ad-creative":
      return { label: "Ads", tone: "ads" as const };
    default:
      return { label: "Post", tone: "neutral" as const };
  }
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function isSameDay(left: Date, right: Date) {
  return dayKey(left) === dayKey(right);
}

function isSameMonth(left: Date, right: Date) {
  return left.getMonth() === right.getMonth() && left.getFullYear() === right.getFullYear();
}

function isToday(date: Date) {
  return isSameDay(date, new Date());
}

function groupDeliverablesByDay(deliverables: DeliverableRecord[]) {
  const map = new Map<string, DeliverableRecord[]>();

  for (const deliverable of deliverables) {
    const key = dayKey(new Date(deliverable.scheduledFor));
    const current = map.get(key) ?? [];
    current.push(deliverable);
    current.sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime());
    map.set(key, current);
  }

  return map;
}

function buildAgendaGroups(deliverables: DeliverableRecord[]) {
  const map = groupDeliverablesByDay(deliverables);
  return Array.from(map.entries())
    .map(([key, items]) => ({ day: new Date(`${key}T00:00:00`), items }))
    .sort((left, right) => left.day.getTime() - right.day.getTime());
}
