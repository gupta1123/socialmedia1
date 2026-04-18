"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreativeOutputRecord, WorkspaceMemberRecord } from "@image-lab/contracts";
import { getCreativeOutputs, getWorkspaceMembers } from "../../../lib/api";
import { ImagePreviewTrigger } from "../image-preview";
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

export default function GalleryPage() {
  const { sessionToken, activeBrandId, activeBrand } = useStudio();
  const [outputs, setOutputs] = useState<CreativeOutputRecord[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

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
    if (!sessionToken) {
      setOutputs([]);
      setWorkspaceMembers([]);
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const outputFilters: Parameters<typeof getCreativeOutputs>[1] = {
          limit: 200,
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

        setOutputs(outputRecords);
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
  }, [activeBrandId, reviewFilter, sessionToken]);

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
        <article className="panel page-span-12">
          <div className="panel-header">
            <div>
              <h3>{activeBrand ? `${activeBrand.name} generated images` : "Generated images"}</h3>
            </div>
            <span className="panel-count">{outputs.length} images</span>
          </div>
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
            <div className="work-gallery-grid">
              {outputs.map((output) => {
                const creator = createdByLabel(output.createdBy, workspaceMembers);
                const statusLabel = output.reviewState.replaceAll("_", " ");

                return (
                  <article className="work-gallery-card" key={output.id}>
                    <div className="work-gallery-media">
                      <ImagePreviewTrigger
                        alt={`Generated option ${output.outputIndex + 1}`}
                        actions={[{ href: `/studio/ai-edit?outputId=${output.id}`, label: "Open in Editor", tone: "primary" }]}
                        badges={[`#${output.outputIndex + 1}`, statusLabel]}
                        details={[
                          { label: "Created by", value: creator },
                          { label: "Review state", value: statusLabel },
                          { label: "Kind", value: output.kind }
                        ]}
                        src={output.previewUrl}
                        subtitle={`Created by ${creator}`}
                        title={`Output ${output.outputIndex + 1}`}
                      >
                        {output.previewUrl ? <img alt={`Generated option ${output.outputIndex + 1}`} src={output.previewUrl} /> : <div className="work-gallery-fallback" />}
                      </ImagePreviewTrigger>
                    </div>
                    <div className="work-gallery-body">
                      <div className="work-gallery-copy">
                        <strong>{`Output #${output.outputIndex + 1}`}</strong>
                        <p>{statusLabel}</p>
                        <p>Created by {creator}</p>
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
          ) : (
            <div className="empty-state-card">
              <h3>No generated images yet</h3>
              <p>Generate images from Create and they will appear here automatically.</p>
              <Link className="button button-primary" href="/studio/create?mode=ad-hoc">
                Open Create
              </Link>
            </div>
          )}
        </article>
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
