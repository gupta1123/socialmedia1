"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReviewQueueEntry, WorkspaceMemberRecord } from "@image-lab/contracts";
import { getReviewQueue, getWorkspaceMembers } from "../../../lib/api";
import { DataTable } from "../data-table";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import { ImagePreviewTrigger } from "../image-preview";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarControls } from "../topbar-actions-context";
import { PlacementIcons } from "../placement-icons";
import { Skeleton } from "../skeleton";
import { FloatingTooltip } from "../floating-tooltip";

const REVIEW_SCOPES = [
  { id: "my", label: "My review" },
  { id: "team", label: "Team review" },
  { id: "unassigned", label: "Unassigned" }
] as const;

const VIEW_MODES = [
  { id: "cards", label: "Cards" },
  { id: "table", label: "Table" }
] as const;

type ReviewVerdict = "approved" | "close" | "off-brand";
const REVIEW_PAGE_SIZE = 24;

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const {
    sessionToken,
    bootstrap,
    activeBrandId,
    pendingAction,
    pendingTargetKey,
    leaveFeedback,
    setMessage
  } = useStudio();
  const [queue, setQueue] = useState<ReviewQueueEntry[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentApproval, setRecentApproval] = useState<{ deliverableId: string; postVersionId: string } | null>(null);
  const focusedDeliverableId = searchParams.get("deliverableId");
  const initialScope =
    (searchParams.get("scope") as (typeof REVIEW_SCOPES)[number]["id"] | null) ?? "team";
  const [scope, setScope] = useState<(typeof REVIEW_SCOPES)[number]["id"]>(initialScope);
  const [viewMode, setViewMode] = useState<(typeof VIEW_MODES)[number]["id"]>("cards");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const topbarActions = useMemo(
    () => (
      <Link
        className="button button-primary"
        href={focusedDeliverableId ? `/studio/deliverables/${focusedDeliverableId}` : "/studio/deliverables"}
      >
        {focusedDeliverableId ? "Open post task" : "Open post tasks"}
      </Link>
    ),
    [focusedDeliverableId]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarControls = useMemo(
    () => (
      <div className="queue-toolbar-controls">
        <div className="queue-scope-switch" role="tablist" aria-label="Review scope">
          {REVIEW_SCOPES.map((item) => (
            <button
              aria-selected={scope === item.id}
              className={`filter-chip ${scope === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={() => setScope(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="queue-scope-switch queue-view-switch" role="tablist" aria-label="Review view">
          {VIEW_MODES.map((item) => (
            <button
              aria-selected={viewMode === item.id}
              className={`filter-chip ${viewMode === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={() => setViewMode(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    ),
    [scope, viewMode]
  );

  useRegisterTopbarControls(topbarControls);

  useEffect(() => {
    setPage(1);
  }, [activeBrandId, focusedDeliverableId, scope]);

  useEffect(() => {
    if (!sessionToken) {
      setQueue([]);
      setHasNextPage(false);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function loadQueue() {
      try {
        setLoading(true);
        const [entries, members] = await Promise.all([
          getReviewQueue(token, {
            scope,
            limit: REVIEW_PAGE_SIZE + 1,
            offset: (page - 1) * REVIEW_PAGE_SIZE,
            ...(activeBrandId ? { brandId: activeBrandId } : {}),
            ...(focusedDeliverableId ? { deliverableId: focusedDeliverableId } : {})
          }),
          getWorkspaceMembers(token)
        ]);

        if (!cancelled) {
          setHasNextPage(entries.length > REVIEW_PAGE_SIZE);
          setQueue(entries.slice(0, REVIEW_PAGE_SIZE));
          setWorkspaceMembers(members);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load review queue");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadQueue();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, focusedDeliverableId, page, scope, sessionToken]);

  const pageStart = queue.length === 0 ? 0 : (page - 1) * REVIEW_PAGE_SIZE + 1;
  const pageEnd = queue.length === 0 ? 0 : pageStart + queue.length - 1;

  const tableColumns = useMemo(
    () => [
      {
        id: "preview",
        header: "Preview",
        cell: (entry: ReviewQueueEntry) => (
          <ImagePreviewTrigger
            alt={`Preview for ${entry.deliverable.title}`}
            actions={
              entry.previewOutput?.id
                ? [{ href: `/studio/ai-edit?outputId=${entry.previewOutput.id}`, label: "Open in Editor", tone: "primary" }]
                : undefined
            }
            badges={[
              formatObjective(entry.deliverable.objectiveCode),
              formatOrdinal(entry.postVersion.versionNumber)
            ]}
            className="data-table-thumbnail"
            details={[
              { label: "Placement", value: entry.deliverable.placementCode },
              { label: "Status", value: entry.deliverable.status },
              { label: "Created by", value: createdByLabel(entry.previewOutput?.createdBy ?? null, workspaceMembers) }
            ]}
            meta={`${formatOrdinal(entry.postVersion.versionNumber)} version`}
            sections={[
              {
                title: "Review",
                items: [
                  { label: "Deliverable", value: entry.deliverable.title },
                  { label: "Version", value: `${formatOrdinal(entry.postVersion.versionNumber)} version` }
                ]
              }
            ]}
            src={entry.previewOutput?.originalUrl ?? entry.previewOutput?.previewUrl}
            title={entry.deliverable.title}
          >
            {entry.previewOutput?.thumbnailUrl ?? entry.previewOutput?.previewUrl ? (
              <img
                alt={`Preview for ${entry.deliverable.title}`}
                src={entry.previewOutput?.thumbnailUrl ?? entry.previewOutput?.previewUrl}
              />
            ) : (
              <div className="table-thumbnail-fallback" />
            )}
          </ImagePreviewTrigger>
        )
      },
      {
        id: "deliverable",
        header: "Post task",
        sortValue: (entry: ReviewQueueEntry) => entry.deliverable.title,
        cell: (entry: ReviewQueueEntry) => (
          <div className="data-table-primary">
            <strong className="data-table-title">{entry.deliverable.title}</strong>
            <span className="data-table-subtitle">
              {entry.previewOutput
                ? `${formatOrdinal(entry.postVersion.versionNumber)} version · Created by ${createdByLabel(entry.previewOutput.createdBy, workspaceMembers)}`
                : "Missing preview output"}
            </span>
          </div>
        )
      },
      {
        id: "placement",
        header: "Placement",
        cell: (entry: ReviewQueueEntry) => {
          const format = deriveCreativeFormatFromDeliverable(
            entry.deliverable.placementCode,
            entry.deliverable.contentFormat,
            entry.deliverable.sourceJson
          );

          return <PlacementIcons channel={entry.deliverable.placementCode} format={format} />;
        }
      },
      {
        id: "objective",
        header: "Objective",
        sortValue: (entry: ReviewQueueEntry) => entry.deliverable.objectiveCode,
        cell: (entry: ReviewQueueEntry) => (
          <div className="data-table-chip-row">
            <span className="pill">{formatObjective(entry.deliverable.objectiveCode)}</span>
            {entry.deliverable.priority === "urgent" || entry.deliverable.priority === "high" ? (
              <span className="pill pill-review-needs_revision">{entry.deliverable.priority}</span>
            ) : null}
          </div>
        )
      },
      {
        id: "reviewer",
        header: "Reviewer",
        sortValue: (entry: ReviewQueueEntry) => reviewerLabel(entry.deliverable.reviewerUserId, workspaceMembers),
        cell: (entry: ReviewQueueEntry) => reviewerLabel(entry.deliverable.reviewerUserId, workspaceMembers)
      },
      {
        id: "actions",
        header: "Actions",
        align: "end" as const,
        className: "data-table-actions-cell",
        cell: (entry: ReviewQueueEntry) => {
          const previewId = entry.previewOutput?.id ?? null;
          const isRowPending = previewId
            ? pendingAction === "submit-feedback" && pendingTargetKey?.startsWith(`output:${previewId}:feedback:`)
            : false;
          const isApprovePending = previewId
            ? pendingAction === "submit-feedback" && pendingTargetKey === `output:${previewId}:feedback:approved`
            : false;
          const isClosePending = previewId
            ? pendingAction === "submit-feedback" && pendingTargetKey === `output:${previewId}:feedback:close`
            : false;
          const isOffBrandPending = previewId
            ? pendingAction === "submit-feedback" && pendingTargetKey === `output:${previewId}:feedback:off-brand`
            : false;

          return (
            <div className="table-action-group">
              <button
                className="button button-ghost table-action-button approve-button"
                disabled={!previewId || isRowPending}
                onClick={() => void handleDecision(previewId, "approved")}
                type="button"
              >
                {isApprovePending ? "Saving…" : "Approve"}
              </button>
              <button
                className="button button-ghost table-action-button"
                disabled={!previewId || isRowPending}
                onClick={() => void handleDecision(previewId, "close")}
                type="button"
              >
                {isClosePending ? "Saving…" : "Needs changes"}
              </button>
              <button
                className="button button-ghost table-action-button reject-button"
                disabled={!previewId || isRowPending}
                onClick={() => void handleDecision(previewId, "off-brand")}
                type="button"
              >
                {isOffBrandPending ? "Saving…" : "Reject"}
              </button>
            </div>
          );
        }
      }
    ],
    [pendingAction, pendingTargetKey, workspaceMembers]
  );

  async function handleDecision(outputId: string | null, verdict: ReviewVerdict) {
    if (!outputId) {
      setMessage("This review item is missing a preview output.");
      return;
    }

    const result = await leaveFeedback(outputId, verdict);
    if (!result || !sessionToken) {
      return;
    }

    if (verdict === "approved") {
      setRecentApproval({
        deliverableId: result.deliverableId,
        postVersionId: result.postVersionId
      });
    }

    try {
      setQueue((current) => current.filter((entry) => entry.previewOutput?.id !== outputId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to update review queue");
    }
  }

  if (!activeBrandId && !loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Review queue</p>
          <h3>Pick a brand first</h3>
          <p>Reviews are scoped to the active brand.</p>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Review queue</p>
          <h3>Unable to load the queue</h3>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="page-stack review-page">
      {recentApproval ? (
        <div className="status-banner status-banner-actions">
          <span>Approved. Schedule this post now or open the post task to keep work moving.</span>
          <div className="status-banner-actions-row">
            <Link className="button button-primary" href={`/studio/deliverables/${recentApproval.deliverableId}?intent=schedule`}>
              Schedule now
            </Link>
            <Link className="button button-ghost" href={`/studio/deliverables/${recentApproval.deliverableId}`}>
              Open post task
            </Link>
            <Link className="button button-ghost" href="/studio/gallery">
              Open gallery
            </Link>
          </div>
        </div>
      ) : null}

      <section className="page-grid">
        <div className="page-span-12">
          {viewMode === "cards" ? (
            <ReviewCardGallery
              entries={queue}
              loading={loading}
              onDecision={handleDecision}
              pendingAction={pendingAction}
              pendingTargetKey={pendingTargetKey}
              reviewerLabelFor={(reviewerUserId) => reviewerLabel(reviewerUserId, workspaceMembers)}
              createdByLabelFor={(createdBy) => createdByLabel(createdBy, workspaceMembers)}
              focusedDeliverableId={focusedDeliverableId}
            />
          ) : (
            <DataTable
              columns={tableColumns}
              defaultSort={{ columnId: "deliverable", direction: "asc" }}
              emptyAction={
                <Link
                  className="button button-primary"
                  href={focusedDeliverableId ? `/studio/deliverables/${focusedDeliverableId}` : "/studio/deliverables"}
                >
                  {focusedDeliverableId ? "Open post task" : "Open post tasks"}
                </Link>
              }
              emptyBody={
                focusedDeliverableId
                  ? "This post task has no options waiting for review right now."
                  : "Create post options from a post task and they will show up here when they are ready for approval."
              }
              emptyTitle={focusedDeliverableId ? "Nothing to review for this post task" : "No post tasks are awaiting review"}
              filters={[
                {
                  id: "objective",
                  label: "Objective",
                  options: Array.from(new Set(queue.map((entry) => entry.deliverable.objectiveCode))).map((value) => ({
                    label: formatObjective(value),
                    value
                  })),
                  getValue: (entry) => entry.deliverable.objectiveCode
                },
                {
                  id: "priority",
                  label: "Priority",
                  options: [
                    { label: "Urgent", value: "urgent" },
                    { label: "High", value: "high" },
                    { label: "Normal", value: "normal" },
                    { label: "Low", value: "low" }
                  ],
                  getValue: (entry) => entry.deliverable.priority
                }
              ]}
              initialPageSize={queue.length || REVIEW_PAGE_SIZE}
              loading={loading}
              pageSizeOptions={[queue.length || REVIEW_PAGE_SIZE]}
              rowHref={(entry) => `/studio/deliverables/${entry.deliverable.id}`}
              rowKey={(entry) => entry.postVersion.id}
              rows={queue}
              search={{
                placeholder: "Search post tasks, reviewers, and option details",
                getText: (entry) =>
                  [
                    entry.deliverable.title,
                    entry.deliverable.briefText,
                    entry.deliverable.ctaText,
                    reviewerLabel(entry.deliverable.reviewerUserId, workspaceMembers)
                  ]
                    .filter(Boolean)
                    .join(" ")
              }}
            />
          )}
          {!loading && queue.length > 0 ? (
            <div className="data-table-footer">
              <p className="data-table-summary">
                Showing {pageStart}-{pageEnd}
              </p>
              <div className="data-table-footer-controls">
                <div className="data-table-pagination">
                  <button
                    className="button button-ghost table-action-button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    type="button"
                  >
                    Prev
                  </button>
                  <span>Page {page}</span>
                  <button
                    className="button button-ghost table-action-button"
                    disabled={!hasNextPage}
                    onClick={() => setPage((value) => value + 1)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ReviewCardGallery({
  entries,
  loading,
  onDecision,
  pendingAction,
  pendingTargetKey,
  reviewerLabelFor,
  createdByLabelFor,
  focusedDeliverableId
}: {
  entries: ReviewQueueEntry[];
  loading: boolean;
  onDecision: (outputId: string | null, verdict: ReviewVerdict) => void | Promise<void>;
  pendingAction: string | null;
  pendingTargetKey: string | null;
  reviewerLabelFor: (reviewerUserId: string | null) => string;
  createdByLabelFor: (createdBy: string | null) => string;
  focusedDeliverableId: string | null;
}) {
  if (loading) {
    return (
      <div className="work-gallery-grid review-option-gallery" aria-label="Loading review cards">
        {Array.from({ length: 8 }).map((_, index) => (
          <article className="work-gallery-card is-loading" key={index}>
            <Skeleton className="work-gallery-media review-option-media" />
            <div className="work-gallery-body">
              <Skeleton width="75%" height="0.85rem" />
              <Skeleton width="45%" height="0.7rem" />
              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                <Skeleton width="55px" height="18px" />
                <Skeleton width="40px" height="18px" />
              </div>
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                <Skeleton width="100%" height="28px" />
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state-card">
        <h3>{focusedDeliverableId ? "Nothing to review for this post task" : "No post tasks are awaiting review"}</h3>
        <p>
          {focusedDeliverableId
            ? "This post task has no options waiting for review right now."
            : "Create post options from a post task and they will show up here when they are ready for approval."}
        </p>
        <Link className="button button-primary" href={focusedDeliverableId ? `/studio/deliverables/${focusedDeliverableId}` : "/studio/deliverables"}>
          {focusedDeliverableId ? "Open post task" : "Open post tasks"}
        </Link>
      </div>
    );
  }

  return (
    <div className="work-gallery-grid review-option-gallery">
      {entries.map((entry) => {
        const previewId = entry.previewOutput?.id ?? null;
        const isRowPending = previewId
          ? pendingAction === "submit-feedback" && pendingTargetKey?.startsWith(`output:${previewId}:feedback:`)
          : false;
        const format = deriveCreativeFormatFromDeliverable(
          entry.deliverable.placementCode,
          entry.deliverable.contentFormat,
          entry.deliverable.sourceJson
        );

        return (
          <article className="work-gallery-card review-option-card" key={entry.postVersion.id}>
            <div className="work-gallery-media review-option-media">
              <div className="review-card-media-actions">
                {previewId ? (
                  <FloatingTooltip content="Edit image">
                    <Link className="review-card-media-action" href={`/studio/ai-edit?outputId=${previewId}`} aria-label="Edit image">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </Link>
                  </FloatingTooltip>
                ) : null}
                <FloatingTooltip content="Open post task">
                  <Link className="review-card-media-action" href={`/studio/deliverables/${entry.deliverable.id}`} aria-label="Open post task">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 7h10v10" />
                      <path d="M7 17 17 7" />
                    </svg>
                  </Link>
                </FloatingTooltip>
              </div>
              <ImagePreviewTrigger
                alt={`Preview for ${entry.deliverable.title}`}
                actions={
                  previewId
                    ? [{ href: `/studio/ai-edit?outputId=${previewId}`, label: "Open in Editor", tone: "primary" }]
                    : undefined
                }
                badges={[
                  entry.deliverable.status.replaceAll("_", " ")
                ]}
                details={[
                  { label: "Placement", value: format },
                  { label: "Created by", value: createdByLabelFor(entry.previewOutput?.createdBy ?? null) }
                ]}
                src={entry.previewOutput?.originalUrl ?? entry.previewOutput?.previewUrl}
                subtitle={entry.deliverable.briefText ?? "Ready for review"}
                title={entry.deliverable.title}
              >
                {entry.previewOutput?.thumbnailUrl ?? entry.previewOutput?.previewUrl ? (
                  <img
                    alt={`Preview for ${entry.deliverable.title}`}
                    src={entry.previewOutput?.thumbnailUrl ?? entry.previewOutput?.previewUrl}
                  />
                ) : (
                  <div className="work-gallery-fallback" />
                )}
              </ImagePreviewTrigger>
            </div>

            <div className="work-gallery-body">
              <div className="work-gallery-copy">
                <Link href={`/studio/deliverables/${entry.deliverable.id}`}>{entry.deliverable.title}</Link>
                <p>Created by: {createdByLabelFor(entry.previewOutput?.createdBy ?? null)}</p>
              </div>
              <div className="work-gallery-footer">
                <PlacementIcons channel={entry.deliverable.placementCode} compact format={format} interactive={false} />
              </div>
                <div className="review-decision-group">
                  <FloatingTooltip content="Approve">
                    <button
                      className="button button-primary decision-button approve-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "approved")}
                      type="button"
                      aria-label="Approve"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </FloatingTooltip>
                  <FloatingTooltip content="Needs changes">
                    <button
                      className="button button-ghost decision-button revision-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "close")}
                      type="button"
                      aria-label="Needs changes"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <line x1="9" y1="10" x2="15" y2="10" />
                        <line x1="9" y1="14" x2="13" y2="14" />
                      </svg>
                    </button>
                  </FloatingTooltip>
                  <FloatingTooltip content="Reject">
                    <button
                      className="button button-ghost decision-button reject-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "off-brand")}
                      type="button"
                      aria-label="Reject"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </FloatingTooltip>
                </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatObjective(value: string) {
  return value.replaceAll("_", " ");
}

function reviewerLabel(reviewerUserId: string | null, members: WorkspaceMemberRecord[]) {
  const reviewer = reviewerUserId ? members.find((member) => member.id === reviewerUserId) : null;
  return reviewer?.displayName ?? reviewer?.email ?? "Unassigned";
}

function createdByLabel(createdBy: string | null, members: WorkspaceMemberRecord[]) {
  if (!createdBy) {
    return "Unknown";
  }

  const creator = members.find((member) => member.id === createdBy);
  return creator?.displayName ?? creator?.email ?? "Unknown";
}

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}
