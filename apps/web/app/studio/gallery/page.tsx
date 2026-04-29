"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreativeOutputRecord, WorkspaceMemberRecord } from "@image-lab/contracts";
import { getCreativeOutputPreviewUrl, getCreativeOutputs, getWorkspaceMembers } from "../../../lib/api";
import { formatRelativeTime } from "../../../lib/formatters";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { Skeleton } from "../skeleton";

const REVIEW_FILTERS = [
  { id: "all", label: "All" },
  { id: "approved", label: "Approved" },
  { id: "pending_review", label: "Pending" },
  { id: "needs_revision", label: "Needs changes" },
  { id: "closed", label: "Closed" }
] as const;

type ReviewFilter = (typeof REVIEW_FILTERS)[number]["id"];
const GALLERY_PAGE_SIZE = 10;

export default function GalleryPage() {
  const { sessionToken, activeBrandId } = useStudio();
  const [outputs, setOutputs] = useState<CreativeOutputRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const topbarActions = useMemo(
    () => (
      <div style={{ display: "flex", gap: "10px" }}>
        <Link className="button button-ghost" href="/studio/review">
          Open review
        </Link>
        <Link className="button button-primary" href="/studio/create?mode=ad-hoc">
          Generate more
        </Link>
      </div>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    setPage(1);
  }, [activeBrandId, reviewFilter, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setOutputs([]);
      setWorkspaceMembers([]);
      setHasNextPage(false);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const outputFilters: Parameters<typeof getCreativeOutputs>[1] = {
          limit: GALLERY_PAGE_SIZE + 1,
          offset: (page - 1) * GALLERY_PAGE_SIZE,
          imageMode: "metadata",
          ...(activeBrandId ? { brandId: activeBrandId } : {}),
          ...(reviewFilter === "all" ? {} : { reviewState: reviewFilter })
        };

        const outputRecords = await getCreativeOutputs(token, outputFilters);

        if (cancelled) {
          return;
        }

        setHasNextPage(outputRecords.length > GALLERY_PAGE_SIZE);
        setOutputs(outputRecords.slice(0, GALLERY_PAGE_SIZE));
        setError(null);
        void getWorkspaceMembers(token)
          .then((members) => {
            if (!cancelled) {
              setWorkspaceMembers(members);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setWorkspaceMembers([]);
            }
          });
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "Unable to load gallery outputs.");
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
  }, [activeBrandId, page, reviewFilter, sessionToken]);

  const pageStart = outputs.length === 0 ? 0 : (page - 1) * GALLERY_PAGE_SIZE + 1;
  const pageEnd = outputs.length === 0 ? 0 : pageStart + outputs.length - 1;
  const stripIds = useMemo(() => outputs.map((output) => output.id).join(","), [outputs]);

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Gallery</p>
          <h3>Unable to load generated images</h3>
          <p>{error}</p>
        </article>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-grid">
        <div className="page-span-12">
          <div className="queue-scope-switch" role="tablist" aria-label="Gallery filter" style={{ marginBottom: "16px" }}>
            {REVIEW_FILTERS.map((item) => (
              <button
                aria-selected={reviewFilter === item.id}
                className={`filter-chip ${reviewFilter === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => setReviewFilter(item.id)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="work-gallery-grid" aria-label="Loading gallery">
              {Array.from({ length: 8 }).map((_, index) => (
                <article className="work-gallery-card is-loading" key={index}>
                  <Skeleton className="work-gallery-media" />
                  <div className="work-gallery-body">
                    <Skeleton width="70%" height="0.8rem" />
                    <Skeleton width="45%" height="0.72rem" />
                  </div>
                </article>
              ))}
            </div>
          ) : outputs.length > 0 ? (
            <>
              <div className="work-gallery-grid">
                {outputs.map((output) => {
                  const creator = createdByLabel(output.createdBy, workspaceMembers);
                  const statusLabel = output.reviewState.replaceAll("_", " ");

                  return (
                    <article className="work-gallery-card" key={output.id}>
                      <div className="work-gallery-media">
                        <Link
                          className="image-preview-trigger"
                          href={`/studio/outputs/${output.id}?from=gallery&stripIds=${encodeURIComponent(stripIds)}`}
                        >
                          <ProgressiveOutputThumbnail
                            alt={`Generated option ${output.outputIndex + 1}`}
                            outputId={output.id}
                            token={sessionToken}
                          />
                        </Link>
                      </div>
                      <div className="work-gallery-body">
                        <div className="work-gallery-copy">
                          <strong>{`Output #${output.outputIndex + 1} · v${output.versionNumber}`}</strong>
                          <p>{statusLabel}</p>
                          <p>Created by {creator}</p>
                          {output.createdAt && <p className="work-gallery-time">{formatRelativeTime(output.createdAt)}</p>}
                        </div>
                        <div className="work-gallery-footer">
                          <Link className="button button-ghost button-sm" href={`/studio/ai-edit?outputId=${output.id}`}>
                            Open in Editor
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
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
            </>
          ) : (
            <div className="empty-state-card">
              <h3>No generated images yet</h3>
              <p>Generate images from Create and they will appear here automatically.</p>
              <Link className="button button-primary" href="/studio/create?mode=ad-hoc">
                Open Create
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function createdByLabel(createdBy: string | null, members: WorkspaceMemberRecord[]) {
  if (!createdBy) {
    return "Unknown";
  }

  const creator = members.find((member) => member.id === createdBy);
  return creator?.displayName ?? creator?.email ?? "Unknown";
}

function ProgressiveOutputThumbnail({
  alt,
  outputId,
  token
}: {
  alt: string;
  outputId: string;
  token: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
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

  if (src) {
    return <img alt={alt} decoding="async" loading="lazy" src={src} />;
  }

  return <div className="work-gallery-fallback" />;
}
