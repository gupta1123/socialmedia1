"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReviewQueueEntry } from "@image-lab/contracts";
import { getReviewQueue } from "../../../lib/api";
import { DataTable } from "../data-table";
import { deriveCreativeFormatFromDeliverable } from "../../../lib/deliverable-helpers";
import { ImagePreviewTrigger } from "../image-preview";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { PlacementIcons } from "../placement-icons";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentApproval, setRecentApproval] = useState<{ deliverableId: string; postVersionId: string } | null>(null);
  const focusedDeliverableId = searchParams.get("deliverableId");

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
        const entries = await getReviewQueue(token, {
          ...(activeBrandId ? { brandId: activeBrandId } : {}),
          ...(focusedDeliverableId ? { deliverableId: focusedDeliverableId } : {})
        });

        if (!cancelled) {
          setQueue(entries);
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
  }, [activeBrandId, focusedDeliverableId, sessionToken]);

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
    [pendingAction, pendingTargetKey]
  );

  async function handleDecision(outputId: string | null, verdict: "approved" | "close" | "off-brand") {
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

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Review queue</p>
          <h3>Loading post options awaiting approval…</h3>
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
                    ? `${activeBrand.name} review queue`
                    : "Ready for review"}
              </h3>
            </div>
            <span className="panel-count">{queue.length} items</span>
          </div>

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
            rowHref={(entry) => `/studio/deliverables/${entry.deliverable.id}`}
            rowKey={(entry) => entry.postVersion.id}
            rows={queue}
            search={{
              placeholder: "Search post tasks and option details",
              getText: (entry) =>
                [entry.deliverable.title, entry.deliverable.briefText, entry.deliverable.ctaText]
                  .filter(Boolean)
                  .join(" ")
            }}
          />
        </article>
      </section>
    </div>
  );
}

function formatObjective(value: string) {
  return value.replaceAll("_", " ");
}

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}
