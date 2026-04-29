"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreativeJobRecord,
  CreativeOutputRecord,
  DeliverableDetail,
  OutputVerdict,
  PostTypeRecord,
  ProjectRecord,
  WorkspaceMemberRecord
} from "@image-lab/contracts";
import {
  getCreativeJob,
  getCreativeOutput,
  getCreativeOutputPreviewUrl,
  getCreativeOutputs,
  getDeliverable,
  getPostTypes,
  getProjects,
  getWorkspaceMembers
} from "../../../../lib/api";
import { deriveCreativeFormatFromDeliverable } from "../../../../lib/deliverable-helpers";
import { formatRelativeTime } from "../../../../lib/formatters";
import { getPlacementSpec } from "../../../../lib/placement-specs";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";
import { OutputDetailSkeleton, Skeleton } from "../../skeleton";

type NeighborOutput = CreativeOutputRecord & {
  resolvedPreviewUrl?: string | null;
};

const NEIGHBOR_LIMIT = 24;
const MIN_PREVIEW_ZOOM = 0.6;
const MAX_PREVIEW_ZOOM = 2.5;
const PREVIEW_ZOOM_STEP = 0.1;

export default function OutputDetailPage() {
  const params = useParams<{ outputId: string }>();
  const searchParams = useSearchParams();
  const {
    sessionToken,
    pendingAction,
    pendingTargetKey,
    leaveFeedback,
    setMessage
  } = useStudio();
  const routeOutputId = typeof params.outputId === "string" ? params.outputId : "";
  const from = searchParams.get("from");
  const stripIdsParam = searchParams.get("stripIds") ?? "";
  const sourceStripIds = useMemo(
    () =>
      stripIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    [stripIdsParam]
  );

  const [selectedOutputId, setSelectedOutputId] = useState(routeOutputId);
  const [output, setOutput] = useState<CreativeOutputRecord | null>(null);
  const [job, setJob] = useState<CreativeJobRecord | null>(null);
  const [deliverableDetail, setDeliverableDetail] = useState<DeliverableDetail | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingOutput, setSwitchingOutput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [isBriefExpanded, setIsBriefExpanded] = useState(false);

  const outputCacheRef = useRef(new Map<string, CreativeOutputRecord>());
  const jobCacheRef = useRef(new Map<string, CreativeJobRecord | null>());
  const deliverableCacheRef = useRef(new Map<string, DeliverableDetail | null>());
  const projectCacheRef = useRef(new Map<string, ProjectRecord[]>());
  const postTypesLoadedRef = useRef(false);
  const membersLoadedRef = useRef(false);
  const neighborsBrandRef = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const backHref = from === "review" ? "/studio/review" : "/studio/gallery";
  const showReviewActions = from === "review";
  const activeImageUrl = output?.originalUrl ?? output?.previewUrl ?? output?.thumbnailUrl ?? null;
  const activeIndex = useMemo(() => neighbors.findIndex((item) => item.id === selectedOutputId), [neighbors, selectedOutputId]);
  const previousOutput = activeIndex > 0 ? neighbors[activeIndex - 1] ?? null : null;
  const nextOutput = activeIndex >= 0 && activeIndex < neighbors.length - 1 ? neighbors[activeIndex + 1] ?? null : null;

  const topbarActions = useMemo(
    () => (
      <div style={{ display: "flex", gap: "10px" }}>
        <Link className="button button-ghost" href={backHref}>
          Back
        </Link>
        {output ? (
          <Link className="button button-primary" href={`/studio/ai-edit?outputId=${output.id}`}>
            Open in Editor
          </Link>
        ) : null}
      </div>
    ),
    [backHref, output]
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    if (routeOutputId) {
      setSelectedOutputId(routeOutputId);
    }
  }, [routeOutputId]);

  useEffect(() => {
    setPreviewZoom(1);
  }, [selectedOutputId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      setPreviewZoom((current) => clampPreviewZoom(current + direction * PREVIEW_ZOOM_STEP));
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    function handlePopState() {
      const match = window.location.pathname.match(/\/studio\/outputs\/([^/]+)/);
      if (match?.[1]) {
        setSelectedOutputId(decodeURIComponent(match[1]));
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const tagName = target instanceof HTMLElement ? target.tagName.toLowerCase() : "";
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select");

      if (isEditable || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (event.key === "ArrowLeft" && previousOutput) {
        event.preventDefault();
        navigateToNeighbor(previousOutput);
      }

      if (event.key === "ArrowRight" && nextOutput) {
        event.preventDefault();
        navigateToNeighbor(nextOutput);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextOutput, previousOutput]);

  useEffect(() => {
    if (!sessionToken || !selectedOutputId) {
      return;
    }

    let cancelled = false;
    const token = sessionToken;

    async function loadSelectedOutput() {
      try {
        const isInitialLoad = !outputCacheRef.current.size && !output;
        setLoading(isInitialLoad);
        setSwitchingOutput(!isInitialLoad);
        setError(null);
        const cachedOutput = outputCacheRef.current.get(selectedOutputId) ?? null;
        const activeOutput =
          cachedOutput?.originalUrl || cachedOutput?.previewUrl
            ? cachedOutput
            : await getCreativeOutput(token, selectedOutputId);
        outputCacheRef.current.set(activeOutput.id, activeOutput);

        if (cancelled) return;
        setOutput(activeOutput);

        const jobPromise = jobCacheRef.current.has(activeOutput.jobId)
          ? Promise.resolve(jobCacheRef.current.get(activeOutput.jobId) ?? null)
          : getCreativeJob(token, activeOutput.jobId)
              .then((record) => {
                jobCacheRef.current.set(activeOutput.jobId, record);
                return record;
              })
              .catch(() => {
                jobCacheRef.current.set(activeOutput.jobId, null);
                return null;
              });

        const projectPromise = projectCacheRef.current.has(activeOutput.brandId)
          ? Promise.resolve(projectCacheRef.current.get(activeOutput.brandId) ?? [])
          : getProjects(token, { brandId: activeOutput.brandId })
              .then((records) => {
                projectCacheRef.current.set(activeOutput.brandId, records);
                return records;
              })
              .catch(() => {
                projectCacheRef.current.set(activeOutput.brandId, []);
                return [];
              });

        const postTypePromise = postTypesLoadedRef.current
          ? Promise.resolve(postTypes)
          : getPostTypes(token)
              .then((records) => {
                postTypesLoadedRef.current = true;
                return records;
              })
              .catch(() => {
                postTypesLoadedRef.current = true;
                return [];
              });

        const memberPromise = membersLoadedRef.current
          ? Promise.resolve(workspaceMembers)
          : getWorkspaceMembers(token)
              .then((records) => {
                membersLoadedRef.current = true;
                return records;
              })
              .catch(() => {
                membersLoadedRef.current = true;
                return [];
              });

        const deliverablePromise = activeOutput.deliverableId
          ? deliverableCacheRef.current.has(activeOutput.deliverableId)
            ? Promise.resolve(deliverableCacheRef.current.get(activeOutput.deliverableId) ?? null)
            : getDeliverable(token, activeOutput.deliverableId)
                .then((record) => {
                  deliverableCacheRef.current.set(activeOutput.deliverableId as string, record);
                  return record;
                })
                .catch(() => {
                  deliverableCacheRef.current.set(activeOutput.deliverableId as string, null);
                  return null;
                })
          : Promise.resolve(null);

        const [jobRecord, projectRecords, postTypeRecords, memberRecords, deliverableRecord] = await Promise.all([
          jobPromise,
          projectPromise,
          postTypePromise,
          memberPromise,
          deliverablePromise
        ]);

        if (cancelled) return;
        setJob(jobRecord);
        setProjects(projectRecords);
        setPostTypes(postTypeRecords);
        setWorkspaceMembers(memberRecords);
        setDeliverableDetail(deliverableRecord);

        if (sourceStripIds.length > 0) {
          const existingById = new Map(neighbors.map((item) => [item.id, item]));
          const missingStripIds = sourceStripIds.filter((id) => id !== activeOutput.id && !existingById.has(id) && !outputCacheRef.current.has(id));
          const fetchedStripRecords =
            missingStripIds.length > 0
              ? await getCreativeOutputs(token, {
                  ids: missingStripIds,
                  imageMode: "thumbnail",
                  limit: Math.min(missingStripIds.length, NEIGHBOR_LIMIT)
                }).catch(() => [])
              : [];
          fetchedStripRecords.forEach((record) => outputCacheRef.current.set(record.id, record));

          const orderedSeed: NeighborOutput[] = sourceStripIds
            .map((id) => existingById.get(id) ?? outputCacheRef.current.get(id) ?? fetchedStripRecords.find((record) => record.id === id))
            .filter((item): item is CreativeOutputRecord => Boolean(item))
            .map((item) => {
              const maybeNeighbor = item as NeighborOutput;
              return { ...item, resolvedPreviewUrl: maybeNeighbor.resolvedPreviewUrl ?? item.thumbnailUrl ?? item.previewUrl ?? null };
            });
          const hasActive = orderedSeed.some((item) => item.id === activeOutput.id);
          const ordered: NeighborOutput[] = hasActive
            ? orderedSeed
            : [{ ...activeOutput, resolvedPreviewUrl: activeOutput.thumbnailUrl ?? activeOutput.previewUrl ?? activeOutput.originalUrl ?? null }, ...orderedSeed].slice(0, NEIGHBOR_LIMIT);

          setNeighbors(ordered);
          void Promise.all(
            ordered.map(async (item) => {
              if (item.id === activeOutput.id) {
                return {
                  ...item,
                  ...activeOutput,
                  resolvedPreviewUrl: item.resolvedPreviewUrl ?? activeOutput.thumbnailUrl ?? activeOutput.previewUrl ?? activeOutput.originalUrl ?? null
                };
              }

              if (item.resolvedPreviewUrl) {
                return item;
              }

              const preview = await getCreativeOutputPreviewUrl(token, item.id).catch(() => ({ previewUrl: null }));
              return { ...item, resolvedPreviewUrl: preview.previewUrl };
            })
          ).then((resolved) => {
            if (!cancelled) {
              setNeighbors(resolved);
            }
          });
        } else if (neighborsBrandRef.current !== activeOutput.brandId || neighbors.length === 0) {
          const neighborFilters: Parameters<typeof getCreativeOutputs>[1] = {
            brandId: activeOutput.brandId,
            imageMode: "metadata",
            limit: NEIGHBOR_LIMIT
          };
          if (from === "review") {
            neighborFilters.reviewState = "pending_review";
          }

          const neighborRecords = await getCreativeOutputs(token, neighborFilters).catch(() => []);

          if (cancelled) return;
          neighborsBrandRef.current = activeOutput.brandId;
          const withActive = neighborRecords.some((item) => item.id === activeOutput.id)
            ? neighborRecords
            : [activeOutput, ...neighborRecords].slice(0, NEIGHBOR_LIMIT);

          setNeighbors(withActive);
          void Promise.all(
            withActive.map(async (item) => {
              if (item.id === activeOutput.id) {
                return {
                  ...item,
                  resolvedPreviewUrl: activeOutput.thumbnailUrl ?? activeOutput.previewUrl ?? activeOutput.originalUrl ?? null
                };
              }

              const preview = await getCreativeOutputPreviewUrl(token, item.id).catch(() => ({ previewUrl: null }));
              return { ...item, resolvedPreviewUrl: preview.previewUrl };
            })
          ).then((resolved) => {
            if (!cancelled) {
              setNeighbors(resolved);
            }
          });
        } else {
          setNeighbors((current) =>
            current.map((item) =>
              item.id === activeOutput.id
                ? {
                    ...item,
                    ...activeOutput,
                    resolvedPreviewUrl: item.resolvedPreviewUrl ?? activeOutput.thumbnailUrl ?? activeOutput.previewUrl ?? activeOutput.originalUrl ?? null
                  }
                : item
            )
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to open this output");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSwitchingOutput(false);
        }
      }
    }

    void loadSelectedOutput();

    return () => {
      cancelled = true;
    };
  }, [from, selectedOutputId, sessionToken, sourceStripIds]);

  const project = output?.projectId ? projects.find((item) => item.id === output.projectId) ?? null : null;
  const postType = output?.postTypeId ? postTypes.find((item) => item.id === output.postTypeId) ?? null : null;
  const deliverable = deliverableDetail?.deliverable ?? null;
  const createdBy = createdByLabel(output?.createdBy ?? null, workspaceMembers);
  const creativeFormat = deliverable
    ? deriveCreativeFormatFromDeliverable(deliverable.placementCode, deliverable.contentFormat, deliverable.sourceJson)
    : job?.briefContext?.format ?? output?.previewContext?.format ?? null;
  const channel = deliverable?.placementCode ?? job?.briefContext?.channel ?? output?.previewContext?.channel ?? null;
  const aspectRatio = job?.briefContext?.aspectRatio ?? output?.previewContext?.aspectRatio ?? null;
  const briefText = output?.previewContext?.brief?.prompt ?? deliverable?.briefText ?? null;
  const placement = channel && creativeFormat ? getPlacementSpec(channel, creativeFormat) : null;
  const settingsChips = [
    postType?.name ? { label: postType.name } : null,
    placement?.channelLabel ? { label: placement.channelLabel } : channel ? { label: formatLabel(channel) } : null,
    aspectRatio ?? placement?.aspectRatio ? { label: aspectRatio ?? placement?.aspectRatio ?? "" } : null,
    placement?.recommendedSize ? { label: placement.recommendedSize } : null,
    placement?.formatLabel ? { label: placement.formatLabel } : creativeFormat ? { label: formatLabel(creativeFormat) } : null
  ].filter((item): item is { label: string } => Boolean(item?.label));

  const topbarMeta = useMemo(
    () => ({
      title: (
        <span className="output-topbar-breadcrumb">
          <Link href="/studio/gallery">Gallery</Link>
          <span>/</span>
          <span>{project?.name ?? "Generated image"}</span>
          {output ? (
            <>
              <span>/</span>
              <span>{`Output #${output.outputIndex + 1} · v${output.versionNumber}`}</span>
            </>
          ) : null}
        </span>
      ),
      subtitle: null
    }),
    [output, project]
  );

  useRegisterTopbarMeta(topbarMeta);

  async function refreshActiveOutput() {
    if (!sessionToken || !selectedOutputId) {
      return;
    }

    const refreshed = await getCreativeOutput(sessionToken, selectedOutputId);
    outputCacheRef.current.set(refreshed.id, refreshed);
    setOutput(refreshed);
  }

  async function submitDecision(verdict: OutputVerdict, notes?: string) {
    if (!output) {
      return;
    }

    const result = await leaveFeedback(output.id, verdict, notes);
    if (!result) {
      return;
    }

    await refreshActiveOutput().catch(() => undefined);
  }

  async function downloadActiveImage(format: "png" | "jpg") {
    if (!activeImageUrl || !output) {
      setMessage("This output does not have a downloadable image yet.");
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(activeImageUrl);
      if (!response.ok) {
        throw new Error("Download failed");
      }
      const sourceBlob = await response.blob();
      const blob = format === "jpg" ? await convertImageBlobToJpeg(sourceBlob) : sourceBlob;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `output-${output.outputIndex + 1}-v${output.versionNumber}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setMessage(downloadError instanceof Error ? downloadError.message : "Unable to download image.");
    } finally {
      setDownloading(false);
    }
  }

  function navigateToNeighbor(target: CreativeOutputRecord | null) {
    if (!target) {
      return;
    }
    setSelectedOutputId(target.id);
    const nextParams = new URLSearchParams();
    if (from) {
      nextParams.set("from", from);
    }
    if (stripIdsParam) {
      nextParams.set("stripIds", stripIdsParam);
    }
    const query = nextParams.toString();
    const nextUrl = `/studio/outputs/${target.id}${query ? `?${query}` : ""}`;
    window.history.pushState(null, "", nextUrl);
  }

  function adjustPreviewZoom(delta: number) {
    setPreviewZoom((current) => clampPreviewZoom(current + delta));
  }

  if (loading) {
    return <OutputDetailSkeleton />;
  }

  if (error || !output) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Output</p>
          <h3>Unable to open this image</h3>
          <p>{error ?? "This output could not be found."}</p>
          <Link className="button button-primary" href={backHref}>
            Back to {from === "review" ? "Review" : "Gallery"}
          </Link>
        </article>
      </div>
    );
  }

  const isApprovePending =
    pendingAction === "submit-feedback" && pendingTargetKey?.startsWith(`output:${output.id}:feedback:approved`);
  const isRevisionPending =
    pendingAction === "submit-feedback" && pendingTargetKey?.startsWith(`output:${output.id}:feedback:close`);
  const isRejectPending =
    pendingAction === "submit-feedback" && pendingTargetKey?.startsWith(`output:${output.id}:feedback:off-brand`);

  return (
    <div className="output-detail-page">
      <section className="output-detail-main" aria-label="Output preview">
        <div className={`output-detail-stage${switchingOutput ? " is-switching" : ""}`} ref={stageRef}>
          {switchingOutput ? <div className="output-detail-switching">Loading image…</div> : null}
          <button
            aria-label="Previous image"
            className="output-detail-nav output-detail-nav-left"
            disabled={!previousOutput}
            onClick={() => navigateToNeighbor(previousOutput)}
            type="button"
          >
            ‹
          </button>

          <div className="output-detail-artwork-wrap">
            {activeImageUrl ? (
              <img
                alt={`Generated output ${output.outputIndex + 1}`}
                className="output-detail-artwork"
                decoding="async"
                src={activeImageUrl}
                style={{ transform: `scale(${previewZoom})` }}
              />
            ) : (
              <div className="output-detail-artwork-fallback">No image preview</div>
            )}
          </div>

          <div className="output-detail-zoom-controls" aria-label="Image zoom controls">
            <button aria-label="Zoom out" onClick={() => adjustPreviewZoom(-PREVIEW_ZOOM_STEP)} type="button">
              −
            </button>
            <span>{Math.round(previewZoom * 100)}%</span>
            <button aria-label="Zoom in" onClick={() => adjustPreviewZoom(PREVIEW_ZOOM_STEP)} type="button">
              +
            </button>
            <button aria-label="Reset zoom" onClick={() => setPreviewZoom(1)} type="button">
              Fit
            </button>
          </div>

          <button
            aria-label="Next image"
            className="output-detail-nav output-detail-nav-right"
            disabled={!nextOutput}
            onClick={() => navigateToNeighbor(nextOutput)}
            type="button"
          >
            ›
          </button>
        </div>

        <div className="output-detail-strip" aria-label="Generated image variations">
          {neighbors.map((item) => (
            <button
              aria-label={`Open output ${item.outputIndex + 1}`}
              className={`output-detail-thumb${item.id === output.id ? " is-active" : ""}`}
              key={item.id}
              onClick={() => navigateToNeighbor(item)}
              type="button"
            >
              {item.resolvedPreviewUrl ? (
                <img alt="" decoding="async" loading="lazy" src={item.resolvedPreviewUrl} />
              ) : (
                <span />
              )}
            </button>
          ))}
          {neighbors.length > 0 ? <span className="output-detail-strip-count">{neighbors.length} shown</span> : null}
        </div>
      </section>

      <aside className="output-detail-rail" aria-label="Output details">
        <div className="output-detail-rail-header">
          <div>
            <span className={`review-status-pill pill-review-${output.reviewState}`}>{formatReviewState(output.reviewState)}</span>
            <p className="output-detail-saved-line">
              {output.createdAt ? <span>{formatRelativeTime(output.createdAt)}</span> : null}
              {output.createdAt && project?.name ? <span aria-hidden="true">•</span> : null}
              {project?.name ? (
                <span>
                  Saved in <strong>{project.name}</strong>
                </span>
              ) : null}
            </p>
          </div>
          <Link aria-label="Close output details" className="output-detail-close" href={backHref}>
            ×
          </Link>
        </div>

        <div className="output-detail-panel">
          <div className="output-detail-icon-actions">
            <details className="output-detail-download-menu">
              <summary aria-label="Download image">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{downloading ? "Saving…" : "PNG"}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="output-detail-download-options">
                <button disabled={downloading} onClick={() => void downloadActiveImage("png")} type="button">
                  PNG
                </button>
                <button disabled={downloading} onClick={() => void downloadActiveImage("jpg")} type="button">
                  JPG
                </button>
              </div>
            </details>
          </div>

          {briefText ? (
            <section className="output-detail-section output-detail-brief-section">
              <h2>Brief</h2>
              <p className={`output-detail-brief-text${isBriefExpanded ? " is-expanded" : ""}`}>{briefText}</p>
              {briefText.length > 180 ? (
                <button className="output-detail-see-more" type="button" onClick={() => setIsBriefExpanded((value) => !value)}>
                  {isBriefExpanded ? "See less" : "See more"}
                </button>
              ) : null}
            </section>
          ) : null}

          {settingsChips.length > 0 ? (
            <section className="output-detail-section output-detail-settings-section">
              <h2>Settings</h2>
              <div className="output-detail-settings-chips">
                {settingsChips.map((chip) => (
                  <span key={chip.label}>{chip.label}</span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="output-detail-section">
            <h2>Creation info</h2>
            <dl className="output-detail-meta-list">
              <div>
                <dt>Created by</dt>
                <dd>{createdBy}</dd>
              </div>
              <div>
                <dt>Review status</dt>
                <dd>{formatReviewState(output.reviewState)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="output-detail-actions">
          <Link className="button button-primary" href={`/studio/ai-edit?outputId=${output.id}`}>
            Open in Editor
          </Link>
          {showReviewActions ? (
            <>
              <button
                className="button button-ghost"
                disabled={isApprovePending}
                onClick={() => void submitDecision("approved")}
                type="button"
              >
                {isApprovePending ? "Saving…" : "Approve"}
              </button>
              <button
                className="button button-ghost"
                disabled={isRevisionPending}
                onClick={() => void submitDecision("close", "Needs changes.")}
                type="button"
              >
                {isRevisionPending ? "Saving…" : "Needs changes"}
              </button>
              <button
                className="button button-ghost reject-button"
                disabled={isRejectPending}
                onClick={() => void submitDecision("off-brand")}
                type="button"
              >
                {isRejectPending ? "Saving…" : "Reject"}
              </button>
            </>
          ) : null}
        </div>
      </aside>
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

function formatReviewState(value: CreativeOutputRecord["reviewState"]) {
  return value.replaceAll("_", " ");
}

function formatLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampPreviewZoom(value: number) {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, Number(value.toFixed(2))));
}

async function convertImageBlobToJpeg(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to prepare JPG download."));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to prepare JPG download.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (jpegBlob) => {
          if (jpegBlob) {
            resolve(jpegBlob);
          } else {
            reject(new Error("Unable to prepare JPG download."));
          }
        },
        "image/jpeg",
        0.92
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
