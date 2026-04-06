"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreativeRunDetail, OutputReviewState, OutputVerdict } from "@image-lab/contracts";
import { getCreativeRun } from "../../../../lib/api";
import { formatDisplayDate } from "../../../../lib/formatters";
import { getPlacementSpec } from "../../../../lib/placement-specs";
import { ImagePreviewTrigger } from "../../image-preview";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions } from "../../topbar-actions-context";

function PromptSection({ label, content }: { label: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 220;
  const displayContent = expanded || !isLong ? content : `${content.slice(0, 200)}...`;

  return (
    <div className="prompt-preview">
      <div className="prompt-section-header">
        <p className="panel-label">{label}</p>
        {isLong ? (
          <button className="panel-link" onClick={() => setExpanded((value) => !value)} type="button">
            {expanded ? "Show less" : "Show full prompt"}
          </button>
        ) : null}
      </div>
      <p className="prompt-section-copy">{displayContent}</p>
    </div>
  );
}

function formatCreativeTypeLabel(value?: string | null) {
  if (!value) {
    return "Custom";
  }

  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function RunDetailPage() {
  const params = useParams<{ runId: string }>();
  const {
    sessionToken,
    pendingAction,
    pendingTargetKey,
    leaveFeedback,
    generateFinalImagesForPackage,
    generateSeedsForPackage
  } = useStudio();
  const [detail, setDetail] = useState<CreativeRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topbarActions = useMemo(
    () => (
      <>
        <Link className="button button-ghost" href="/studio/runs">
          Back to runs
        </Link>
        <Link className="button button-primary" href="/studio/create">
          Start another run
        </Link>
      </>
    ),
    []
  );

  useRegisterTopbarActions(topbarActions);

  const loadRun = useCallback(async () => {
    if (!sessionToken || typeof params.runId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getCreativeRun(sessionToken, params.runId);
      setDetail(record);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [params.runId, sessionToken]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (!detail?.jobs.some((job) => job.status === "queued" || job.status === "processing")) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadRun();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [detail?.jobs, loadRun]);

  const handleFeedback = useCallback(
    async (outputId: string, verdict: OutputVerdict) => {
      const ok = await leaveFeedback(outputId, verdict);
      if (ok) {
        await loadRun();
      }
    },
    [leaveFeedback, loadRun]
  );

  const handleGenerateDirections = useCallback(async () => {
    if (!detail) return;

    const ok = await generateSeedsForPackage(detail.promptPackage.id);
    if (ok) {
      await loadRun();
    }
  }, [detail, generateSeedsForPackage, loadRun]);

  const handleGenerateFinals = useCallback(
    async (selectedTemplateId?: string) => {
      if (!detail) return;

      const ok = await generateFinalImagesForPackage(detail.promptPackage.id, selectedTemplateId);
      if (ok) {
        await loadRun();
      }
    },
    [detail, generateFinalImagesForPackage, loadRun]
  );

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Run detail</p>
          <h3>Loading creative run…</h3>
        </article>
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Run detail</p>
          <h3>Unable to load this run</h3>
          <p>{error ?? "The requested run could not be found."}</p>
        </article>
      </div>
    );
  }

  const placement = getPlacementSpec(detail.run.channel, detail.run.format);
  const pendingFinals = detail.finalOutputs.filter((output) => output.reviewState === "pending_review");
  const resolvedFinals = detail.finalOutputs.filter((output) => output.reviewState !== "pending_review");
  const hasRunningJobs = detail.jobs.some((job) => job.status === "queued" || job.status === "processing");
  const canGenerateReferenceFinal = detail.promptPackage.referenceAssetIds.length > 0;
  const seedTemplateLabelById = new Map(detail.seedTemplates.map((template) => [template.id, template.label]));
  const seedPendingKey = `promptPackage:${detail.promptPackage.id}:seeds`;
  const referenceFinalPendingKey = `promptPackage:${detail.promptPackage.id}:references`;

  return (
    <div className="page-stack brand-detail-page">
      <header className="detail-page-header">
        <div className="run-hero-heading" style={{ marginBottom: "12px" }}>
          <p className="panel-label">{detail.run.brandName}</p>
          <span className={`pill pill-${detail.run.status}`}>{detail.run.status}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "24px" }}>
          <div style={{ flex: 1 }}>
            <h1>{detail.run.promptSummary}</h1>
            <p className="brand-detail-goal">{detail.run.goal}</p>
          </div>
          <div className="run-hero-actions">
            <button
              className="button button-ghost"
              disabled={pendingTargetKey === seedPendingKey}
              onClick={() => void handleGenerateDirections()}
              type="button"
            >
              {pendingAction === "generate-seeds" && pendingTargetKey === seedPendingKey
                ? "Exploring styles…"
                : "Explore styles"}
            </button>
            <button
              className="button button-primary"
              disabled={pendingTargetKey === referenceFinalPendingKey || !canGenerateReferenceFinal}
              onClick={() => void handleGenerateFinals()}
              title={!canGenerateReferenceFinal ? "Upload references if you want to create options from brand references" : ""}
              type="button"
            >
              {pendingAction === "generate-finals" && pendingTargetKey === referenceFinalPendingKey
                ? "Creating options…"
                : "Create with references"}
            </button>
          </div>
        </div>
      </header>

      {hasRunningJobs ? (
        <div className="status-banner" style={{ marginBottom: "24px" }}>
          <span>This run is still processing. New styles and post options will appear here automatically.</span>
        </div>
      ) : null}

      <section className="page-grid">
        <main className="page-span-8 page-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Options</p>
                <h3>Post options</h3>
              </div>
              <span className="panel-count">{detail.finalOutputs.length}</span>
            </div>

            {detail.finalOutputs.length > 0 ? (
              <div className="gallery-review-grid">
                {detail.finalOutputs.map((output) => (
                  <article className="review-card" key={output.id}>
                    <div className="review-card-top">
                      <span className="review-tag">#{output.outputIndex + 1}</span>
                      <span className={`pill pill-review-${output.reviewState}`}>
                        {formatReviewState(output.reviewState)}
                      </span>
                    </div>

                    <div className="creative-preview-frame final-frame run-final-frame">
                      {output.previewUrl ? (
                        <ImagePreviewTrigger
                          alt={`Final candidate ${output.outputIndex + 1}`}
                          src={output.previewUrl}
                          title={`Final candidate ${output.outputIndex + 1}`}
                          meta={detail.run.promptSummary}
                        >
                          <img alt={`Final output ${output.id}`} src={output.previewUrl} />
                        </ImagePreviewTrigger>
                      ) : (
                        <div className="thumb-fallback" />
                      )}
                    </div>

                    <div className="review-card-footer">
                      <div className="review-copy">
                        <strong>{getDecisionHeadline(output.reviewState)}</strong>
                        <p>{getDecisionDescription(output.reviewState, output.latestVerdict, output.reviewedAt)}</p>
                        <p className="field-hint" style={{ marginTop: "6px" }}>
                          {describeRunOutputSource(
                            output.jobId,
                            detail.jobs,
                            seedTemplateLabelById,
                            detail.promptPackage.referenceAssetIds.length
                          )}
                        </p>
                      </div>
                      {output.reviewState === "pending_review" ? (
                        <div className="review-card-actions">
                          <button
                            className="button button-primary approve-button"
                            disabled={pendingTargetKey === `output:${output.id}:feedback`}
                            onClick={() => void handleFeedback(output.id, "approved")}
                            type="button"
                          >
                            {pendingAction === "submit-feedback" && pendingTargetKey === `output:${output.id}:feedback`
                              ? "Saving…"
                              : "Approve"}
                          </button>
                          <button
                            className="button button-ghost"
                            disabled={pendingTargetKey === `output:${output.id}:feedback`}
                            onClick={() => void handleFeedback(output.id, "close")}
                            type="button"
                          >
                            {pendingAction === "submit-feedback" && pendingTargetKey === `output:${output.id}:feedback`
                              ? "Saving…"
                              : "Needs changes"}
                          </button>
                          <button
                            className="button button-ghost reject-button"
                            disabled={pendingTargetKey === `output:${output.id}:feedback`}
                            onClick={() => void handleFeedback(output.id, "off-brand")}
                            type="button"
                          >
                            {pendingAction === "submit-feedback" && pendingTargetKey === `output:${output.id}:feedback`
                              ? "Saving…"
                              : "Reject"}
                          </button>
                        </div>
                      ) : (
                        <span className={`pill pill-review-${output.reviewState}`}>
                          {formatReviewState(output.reviewState)}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No post options yet</strong>
                <p>Explore styles below or create options directly from your selected references.</p>
                <div className="hero-actions">
                <button className="button button-primary" onClick={() => void handleGenerateDirections()} type="button">
                  {pendingAction === "generate-seeds" && pendingTargetKey === seedPendingKey
                    ? "Exploring styles…"
                    : "Explore styles"}
                </button>
                {canGenerateReferenceFinal ? (
                  <button className="button button-ghost" onClick={() => void handleGenerateFinals()} type="button">
                    {pendingAction === "generate-finals" && pendingTargetKey === referenceFinalPendingKey
                      ? "Creating options…"
                      : "Create with references"}
                  </button>
                ) : null}
              </div>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Style exploration</p>
                <h3>Style options</h3>
              </div>
              <span className="panel-count">{detail.seedTemplates.length}</span>
            </div>

            {detail.seedTemplates.length > 0 ? (
              <div className="gallery-grid direction-grid">
                {detail.seedTemplates.map((template, index) => (
                  <article className="review-card direction-card" key={template.id}>
                    <div className="creative-preview-frame direction-frame">
                      {template.previewUrl ? (
                        <ImagePreviewTrigger
                          alt={template.label}
                          src={template.previewUrl}
                          title={template.label}
                          meta={`Direction ${index + 1}`}
                        >
                          <img alt={template.label} src={template.previewUrl} />
                        </ImagePreviewTrigger>
                      ) : (
                        <div className="thumb-fallback" />
                      )}
                    </div>

                    <div className="review-card-footer direction-card-footer">
                      <div className="review-copy">
                        <span className="review-tag">Style {index + 1}</span>
                        <strong>{template.label}</strong>
                      </div>
                      <div className="review-card-actions">
                        <button
                          className="button button-primary"
                          disabled={pendingTargetKey === `template:${template.id}:finals`}
                          onClick={() => void handleGenerateFinals(template.id)}
                          type="button"
                        >
                          {pendingAction === "generate-finals" && pendingTargetKey === `template:${template.id}:finals`
                            ? "Creating…"
                            : "Create options"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No style options yet</strong>
                <p>Explore styles first if you want a few different visual routes before creating more options.</p>
                <button className="button button-primary" onClick={() => void handleGenerateDirections()} type="button">
                  {pendingAction === "generate-seeds" && pendingTargetKey === seedPendingKey
                    ? "Exploring styles…"
                    : "Explore styles"}
                </button>
              </div>
            )}
          </article>
        </main>

        <aside className="page-span-4 page-stack">
          <article className="sidebar-panel">
            <h3>Creative context</h3>
            <div className="property-list">
              <div className="property-item">
                <span>Placement</span>
                <strong>{placement?.channelLabel ?? detail.run.channel}</strong>
              </div>
              <div className="property-item">
                <span>Recommended size</span>
                <strong>{placement?.recommendedSize ?? detail.run.aspectRatio}</strong>
              </div>
              <div className="property-item">
                <span>Format</span>
                <strong>{placement?.formatLabel ?? detail.run.format}</strong>
              </div>
              <div className="property-item">
                <span>Creative type</span>
                <strong>{formatCreativeTypeLabel(detail.run.templateType)}</strong>
              </div>
              <div className="property-item">
                <span>Directions count</span>
                <strong>{detail.seedTemplates.length}</strong>
              </div>
              <div className="property-item">
                <span>Awaiting review</span>
                <strong>{pendingFinals.length}</strong>
              </div>
              <div className="property-item">
                <span>Audience</span>
                <strong>{detail.brief.audience ?? "General"}</strong>
              </div>
              <div className="property-item">
                <span>Offer / CTA</span>
                <strong>{detail.brief.offer ?? "None"}</strong>
              </div>
              <div className="property-item">
                <span>Exact text</span>
                <strong>{detail.brief.exactText ?? "Not forced"}</strong>
              </div>
              <div className="property-item">
                <span>Reference mode</span>
                <strong>{detail.promptPackage.referenceStrategy}</strong>
              </div>
            </div>
          </article>

          <article className="sidebar-panel">
            <h3>Generation logic</h3>
            <div className="property-list">
              <PromptSection label="Direction prompt" content={detail.promptPackage.seedPrompt} />
              <PromptSection label="Final production prompt" content={detail.promptPackage.finalPrompt} />
            </div>
          </article>

          <article className="sidebar-panel">
            <h3>Original brief</h3>
            <div className="property-item">
              <p className="prompt-section-copy" style={{ fontSize: "0.84rem" }}>{detail.brief.prompt}</p>
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}

function formatReviewState(value: OutputReviewState) {
  switch (value) {
    case "pending_review":
      return "Pending review";
    case "needs_revision":
      return "Needs changes";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

function describeRunOutputSource(
  jobId: string,
  jobs: CreativeRunDetail["jobs"],
  seedTemplateLabelById: Map<string, string>,
  referenceAssetCount: number
) {
  const job = jobs.find((item) => item.id === jobId);

  if (job?.selectedTemplateId) {
    const label = seedTemplateLabelById.get(job.selectedTemplateId) ?? "selected style";
    return `Created from ${label}`;
  }

  if (referenceAssetCount > 0) {
    return "Created with selected references";
  }

  return "Created in this run";
}

function getDecisionHeadline(reviewState: OutputReviewState) {
  switch (reviewState) {
    case "approved":
      return "Approved";
    case "closed":
      return "Not selected";
    case "needs_revision":
      return "Needs changes";
    default:
      return "Ready for decision";
  }
}

function getDecisionDescription(
  reviewState: OutputReviewState,
  latestVerdict: OutputVerdict | null,
  reviewedAt: string | null
) {
  if (reviewState === "pending_review") {
    return "Review this option here or open Review if you want to process multiple options together.";
  }

  const dateText = reviewedAt ? ` on ${formatDisplayDate(reviewedAt)}` : "";
  const reasonText = latestVerdict ? `Latest decision: ${formatVerdict(latestVerdict)}.` : "Decision recorded.";
  return `${reasonText}${dateText}`;
}

function formatVerdict(value: OutputVerdict) {
  switch (value) {
    case "close":
      return "needs changes";
    case "off-brand":
      return "rejected";
    default:
      return "approved";
  }
}
