"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ReviewQueueEntry, WorkspaceMemberRecord } from "@image-lab/contracts";
import {
  getCreativeOutputPreviewUrl,
  getReviewQueue,
  getWorkspaceMembers
} from "../../../lib/api";
import { formatRelativeTime } from "../../../lib/formatters";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarControls } from "../topbar-actions-context";
import { Skeleton } from "../skeleton";
import { FloatingTooltip } from "../floating-tooltip";

const REVIEW_SCOPES = [
  { id: "my", label: "My review" },
  { id: "team", label: "Team review" },
  { id: "unassigned", label: "Unassigned" }
] as const;

type ReviewVerdict = "approved" | "close" | "off-brand";
const REVIEW_PAGE_SIZE = 8;

type CommentDialogState = {
  outputId: string;
  verdict: ReviewVerdict;
  comment: string;
} | null;

type ProgressiveReviewThumbnailProps = {
  children: (src: string | null) => ReactNode;
  outputId: string | null;
  token: string | null;
};

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const {
    sessionToken,
    bootstrap,
    activeBrandId,
    pendingAction,
    pendingTargetKey,
    leaveFeedback,
    setMessage,
    workspaceMembers: contextWorkspaceMembers
  } = useStudio();
  const [queue, setQueue] = useState<ReviewQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentApproval, setRecentApproval] = useState<{ deliverableId: string; postVersionId: string } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const focusedDeliverableId = searchParams.get("deliverableId");
  const initialScope =
    (searchParams.get("scope") as (typeof REVIEW_SCOPES)[number]["id"] | null) ?? "team";
  const [scope, setScope] = useState<(typeof REVIEW_SCOPES)[number]["id"]>(initialScope);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [commentDialog, setCommentDialog] = useState<CommentDialogState>(null);

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
      </div>
    ),
    [scope]
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
        const entries = await getReviewQueue(token, {
          scope,
          limit: REVIEW_PAGE_SIZE + 1,
          offset: (page - 1) * REVIEW_PAGE_SIZE,
          imageMode: "metadata",
          ...(activeBrandId ? { brandId: activeBrandId } : {}),
          ...(focusedDeliverableId ? { deliverableId: focusedDeliverableId } : {})
        });

        if (cancelled) return;

        setHasNextPage(entries.length > REVIEW_PAGE_SIZE);
        setQueue(entries.slice(0, REVIEW_PAGE_SIZE));

        if (!cancelled) {
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

  useEffect(() => {
    if (!sessionToken) {
      setWorkspaceMembers([]);
      return;
    }

    getWorkspaceMembers(sessionToken)
      .then(setWorkspaceMembers)
      .catch(() => setWorkspaceMembers([]));
  }, [sessionToken]);

  const pageStart = queue.length === 0 ? 0 : (page - 1) * REVIEW_PAGE_SIZE + 1;
  const pageEnd = queue.length === 0 ? 0 : pageStart + queue.length - 1;
  const stripIds = useMemo(
    () =>
      queue
        .map((entry) => entry.previewOutput?.id)
        .filter((id): id is string => Boolean(id))
        .join(","),
    [queue]
  );

  async function handleDecision(outputId: string | null, verdict: ReviewVerdict) {
    if (!outputId) {
      setMessage("This review item is missing a preview output.");
      return;
    }

    if (verdict === "close") {
      setCommentDialog({ outputId, verdict, comment: "" });
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

  async function handleCommentSubmit() {
    if (!commentDialog) return;
    const { outputId, verdict, comment } = commentDialog;
    setCommentDialog(null);
    const result = await leaveFeedback(outputId, verdict, comment);
    if (!result || !sessionToken) {
      return;
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
          <ReviewCardGallery
              entries={queue}
              loading={loading}
              onDecision={handleDecision}
              pendingAction={pendingAction}
              pendingTargetKey={pendingTargetKey}
              reviewerLabelFor={(reviewerUserId) => reviewerLabel(reviewerUserId, workspaceMembers)}
              createdByLabelFor={(createdBy) => createdByLabel(createdBy, workspaceMembers)}
              sessionToken={sessionToken}
              focusedDeliverableId={focusedDeliverableId}
              stripIds={stripIds}
            />
          {!loading && queue.length > 0 ? (
            <div className="floating-pagination-bar">
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
      {commentDialog && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)"
          }}
          onClick={() => setCommentDialog(null)}
        >
          <div
            className="comment-dialog"
            style={{
              background: "var(--paper-soft)",
              borderRadius: "12px",
              padding: "24px",
              width: "min(480px, 90vw)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: "8px" }}>Add feedback</h3>
            <p style={{ color: "var(--ink-soft)", marginBottom: "16px" }}>Explain what needs to change for this option.</p>
            <textarea
              className="comment-textarea"
              placeholder="Describe the changes needed..."
              value={commentDialog.comment}
              onChange={(e) => setCommentDialog({ ...commentDialog, comment: e.target.value })}
              rows={4}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                fontSize: "14px",
                resize: "vertical"
              }}
            />
            <div className="comment-dialog-actions" style={{ display: "flex", gap: "12px", marginTop: "16px", justifyContent: "flex-end" }}>
              <button
                className="button button-ghost"
                onClick={() => setCommentDialog(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={commentDialog.comment.trim().length < 3}
                onClick={() => void handleCommentSubmit()}
                type="button"
              >
                Save feedback
              </button>
            </div>
          </div>
        </div>
      )}
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
  sessionToken,
  focusedDeliverableId,
  stripIds
}: {
  entries: ReviewQueueEntry[];
  loading: boolean;
  onDecision: (outputId: string | null, verdict: ReviewVerdict) => void | Promise<void>;
  pendingAction: string | null;
  pendingTargetKey: string | null;
  reviewerLabelFor: (reviewerUserId: string | null) => string;
  createdByLabelFor: (createdBy: string | null) => string;
  sessionToken: string | null;
  focusedDeliverableId: string | null;
  stripIds: string;
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
        const creator = createdByLabelFor(entry.previewOutput?.createdBy ?? null);
        const createdAt = entry.previewOutput?.createdAt ? formatRelativeTime(entry.previewOutput.createdAt) : null;

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
                <FloatingTooltip content="Open preview">
                  <Link
                    className="review-card-media-action"
                    href={previewId ? `/studio/outputs/${previewId}?from=review&stripIds=${encodeURIComponent(stripIds)}` : `/studio/deliverables/${entry.deliverable.id}`}
                    aria-label="Open preview"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 7h10v10" />
                      <path d="M7 17 17 7" />
                    </svg>
                  </Link>
                </FloatingTooltip>
              </div>
              <Link
                className="image-preview-trigger"
                href={
                  previewId
                    ? `/studio/outputs/${previewId}?from=review&stripIds=${encodeURIComponent(stripIds)}`
                    : `/studio/deliverables/${entry.deliverable.id}`
                }
              >
                <ProgressiveReviewThumbnail outputId={entry.previewOutput?.id ?? null} token={sessionToken}>
                  {(src) => src ? (
                    <img alt={`Preview for ${entry.deliverable.title}`} decoding="async" loading="lazy" src={src} />
                  ) : (
                    <div className="work-gallery-fallback" />
                  )}
                </ProgressiveReviewThumbnail>
              </Link>
              <span className={`review-card-status pill-review-${entry.previewOutput?.reviewState ?? "pending_review"}`}>
                {(entry.previewOutput?.reviewState ?? "pending_review").replaceAll("_", " ")}
              </span>
            </div>

<div className="work-gallery-body">
              <div className="work-gallery-copy">
                <Link href={`/studio/deliverables/${entry.deliverable.id}`}>{entry.deliverable.title}</Link>
                <div className="review-card-author-row">
                  <span className="review-card-avatar">{creator.charAt(0).toUpperCase()}</span>
                  <span>{creator}</span>
                  {createdAt ? (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>{createdAt}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="review-decision-group">
                  <FloatingTooltip content="Approve">
                    <button
                      className="button button-primary decision-button approve-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "approved")}
                      type="button"
                      aria-label="Approve"
                      style={{ fontSize: "11px" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Approve</span>
                    </button>
                  </FloatingTooltip>
                  <FloatingTooltip content="Comment">
                    <button
                      className="button button-ghost decision-button revision-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "close")}
                      type="button"
                      aria-label="Comment"
                      style={{ fontSize: "11px" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <line x1="9" y1="10" x2="15" y2="10" />
                        <line x1="9" y1="14" x2="13" y2="14" />
                      </svg>
                      <span>Comment</span>
                    </button>
                  </FloatingTooltip>
                  <FloatingTooltip content="Reject">
                    <button
                      className="button button-ghost decision-button reject-decision"
                      disabled={!previewId || isRowPending}
                      onClick={() => void onDecision(previewId, "off-brand")}
                      type="button"
                      aria-label="Reject"
                      style={{ fontSize: "11px" }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                      <span>Reject</span>
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

function ProgressiveReviewThumbnail({
  children,
  outputId,
  token
}: ProgressiveReviewThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !outputId) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    setSrc(null);
    getCreativeOutputPreviewUrl(token, outputId)
      .then((result) => {
        if (!cancelled) {
          setSrc(result.previewUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [outputId, token]);

  return <>{children(src)}</>;
}

function formatObjective(value: string) {
  return value.replaceAll("_", " ");
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
