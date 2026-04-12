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
    if (!sessionToken) {
      setQueue([]);
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
            ...(activeBrandId ? { brandId: activeBrandId } : {}),
            ...(focusedDeliverableId ? { deliverableId: focusedDeliverableId } : {})
          }),
          getWorkspaceMembers(token)
        ]);

        if (!cancelled) {
          setQueue(entries);
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
  }, [activeBrandId, focusedDeliverableId, scope, sessionToken]);

  const tableColumns = useMemo(
    () => [
      {
        id: "preview",
        header: "Preview",
        cell: (entry: ReviewQueueEntry) => (
          <ImagePreviewTrigger
            alt={`Preview for ${entry.deliverable.title}`}
            className="data-table-thumbnail"
            meta={`${formatOrdinal(entry.postVersion.versionNumber)} version`}
            src={entry.previewOutput?.previewUrl}
            title={entry.deliverable.title}
          >
            {entry.previewOutput?.previewUrl ? (
              <img alt={`Preview for ${entry.deliverable.title}`} src={entry.previewOutput.previewUrl} />
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
              {entry.previewOutput ? `${formatOrdinal(entry.postVersion.versionNumber)} version` : "Missing preview output"}
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
          </div>
        </div>
      ) : null}

      <section className="page-grid">
        <article className="panel page-span-12">
          <div className="panel-header">
            <div>
              <h3>
                {focusedDeliverableId
                  ? "Focused review"
                  : activeBrand
                    ? `${activeBrand.name} ${scope === "my" ? "my review" : scope === "unassigned" ? "unassigned review" : "review queue"}`
                    : "Ready for review"}
              </h3>
            </div>
            <span className="panel-count">{queue.length} items</span>
          </div>

          {viewMode === "cards" ? (
            <ReviewCardGallery
              entries={queue}
              loading={loading}
              onDecision={handleDecision}
              pendingAction={pendingAction}
              pendingTargetKey={pendingTargetKey}
              reviewerLabelFor={(reviewerUserId) => reviewerLabel(reviewerUserId, workspaceMembers)}
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
              loading={loading}
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
        </article>
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
  focusedDeliverableId
}: {
  entries: ReviewQueueEntry[];
  loading: boolean;
  onDecision: (outputId: string | null, verdict: ReviewVerdict) => void | Promise<void>;
  pendingAction: string | null;
  pendingTargetKey: string | null;
  reviewerLabelFor: (reviewerUserId: string | null) => string;
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
              <ImagePreviewTrigger
                alt={`Preview for ${entry.deliverable.title}`}
                src={entry.previewOutput?.previewUrl}
                title={entry.deliverable.title}
              >
                {entry.previewOutput?.previewUrl ? (
                  <img alt={`Preview for ${entry.deliverable.title}`} src={entry.previewOutput.previewUrl} />
                ) : (
                  <div className="work-gallery-fallback">
                    <span>{formatOrdinal(entry.postVersion.versionNumber)}</span>
                  </div>
                )}
              </ImagePreviewTrigger>
              <span className="review-option-version">{formatOrdinal(entry.postVersion.versionNumber)} version</span>
            </div>

            <div className="work-gallery-body">
              <div className="work-gallery-copy">
                <Link href={`/studio/deliverables/${entry.deliverable.id}`}>{entry.deliverable.title}</Link>
                <p>Reviewer: {reviewerLabelFor(entry.deliverable.reviewerUserId)}</p>
              </div>
              <div className="work-gallery-meta-row">
                <span>{formatObjective(entry.deliverable.objectiveCode)}</span>
                <span>{entry.deliverable.priority}</span>
              </div>
              <div className="work-gallery-footer">
                <PlacementIcons channel={entry.deliverable.placementCode} compact format={format} interactive={false} />
                <Link className="review-link" href={`/studio/deliverables/${entry.deliverable.id}`}>
                  Open task
                </Link>
              </div>
              <div className="review-card-actions">
                <button
                  className="button button-ghost table-action-button approve-button"
                  disabled={!previewId || isRowPending}
                  onClick={() => void onDecision(previewId, "approved")}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="button button-ghost table-action-button"
                  disabled={!previewId || isRowPending}
                  onClick={() => void onDecision(previewId, "close")}
                  type="button"
                >
                  Needs changes
                </button>
                <button
                  className="button button-ghost table-action-button reject-button"
                  disabled={!previewId || isRowPending}
                  onClick={() => void onDecision(previewId, "off-brand")}
                  type="button"
                >
                  Reject
                </button>
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

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}
