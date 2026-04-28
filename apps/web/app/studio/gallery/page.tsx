"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreativeOutputRecord, WorkspaceMemberRecord } from "@image-lab/contracts";
import { getCreativeOutput, getCreativeOutputs, getWorkspaceMembers } from "../../../lib/api";
import { formatRelativeTime } from "../../../lib/formatters";
import { buildCreativePreviewSections, type CreativePreviewInput } from "../../../lib/creative-preview-sections";
import { useImagePreview } from "../image-preview";
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
  const imagePreview = useImagePreview();
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
          imageMode: "thumbnail",
          ...(activeBrandId ? { brandId: activeBrandId } : {}),
          ...(reviewFilter === "all" ? {} : { reviewState: reviewFilter })
        };

        const [outputRecords, members] = await Promise.all([
          getCreativeOutputs(token, outputFilters),
          getWorkspaceMembers(token)
        ]);

        if (cancelled) {
          return;
        }

        setHasNextPage(outputRecords.length > GALLERY_PAGE_SIZE);
        setOutputs(outputRecords.slice(0, GALLERY_PAGE_SIZE));
        setWorkspaceMembers(members);
        setError(null);
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

  async function buildGalleryPreviewPayload(
    output: CreativeOutputRecord,
    creator: string,
    statusLabel: string,
    resolved?: CreativeOutputRecord
  ) {
    const source = resolved ?? output;
    const previewSrc =
      source.originalUrl ?? source.previewUrl ?? source.thumbnailUrl ?? output.thumbnailUrl ?? output.previewUrl;
    if (!previewSrc) {
      return null;
    }
    const previewContext = (source as CreativeOutputRecord & { previewContext?: CreativePreviewInput | null })
      .previewContext;

    return {
      id: output.id,
      alt: `Generated option ${output.outputIndex + 1}`,
      actions: [{ href: `/studio/ai-edit?outputId=${output.id}`, label: "Open in Editor", tone: "primary" as const }],
      badges: [`#${output.outputIndex + 1}`, `v${output.versionNumber}`, statusLabel],
      details: [
        { label: "Created by", value: creator }
      ],
      meta: `#${output.outputIndex + 1}`,
      sections: buildCreativePreviewSections({
        brief: previewContext?.brief,
        projectName: previewContext?.projectName,
        postTypeName: previewContext?.postTypeName,
        channel: previewContext?.channel,
        format: previewContext?.format,
        aspectRatio: previewContext?.aspectRatio,
        templateType: previewContext?.templateType
      }),
      src: previewSrc,
      thumbnailSrc: output.thumbnailUrl ?? output.previewUrl ?? previewSrc,
      subtitle: output.kind.replaceAll("_", " "),
      title: `Output ${output.outputIndex + 1} · v${output.versionNumber}`
    };
  }

  async function openOutputPreview(output: CreativeOutputRecord, creator: string, statusLabel: string) {
    const resolved = sessionToken ? await getCreativeOutput(sessionToken, output.id).catch(() => output) : output;
    const activePreview = await buildGalleryPreviewPayload(output, creator, statusLabel, resolved);
    if (!activePreview) {
      return;
    }

    const previewCollection = (
      await Promise.all(
        outputs.map((item) =>
          buildGalleryPreviewPayload(
            item,
            createdByLabel(item.createdBy, workspaceMembers),
            item.reviewState.replaceAll("_", " ")
          )
        )
      )
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));

    imagePreview.openPreview(activePreview, previewCollection);
  }

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
                        <button
                          className="image-preview-trigger"
                          onClick={() => void openOutputPreview(output, creator, statusLabel)}
                          type="button"
                        >
                          {output.thumbnailUrl ?? output.previewUrl ? (
                            <img
                              alt={`Generated option ${output.outputIndex + 1}`}
                              src={output.thumbnailUrl ?? output.previewUrl}
                            />
                          ) : (
                            <div className="work-gallery-fallback" />
                          )}
                        </button>
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
