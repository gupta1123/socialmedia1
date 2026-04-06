"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CreativeChannel,
  CreativeFormat,
  CreativeTemplateDetail,
  PostTypeRecord,
  ProjectRecord,
  TemplateStatus,
  UpdateCreativeTemplateInput
} from "@image-lab/contracts";
import {
  getCreativeJob,
  getPlanningTemplate,
  getPostTypes,
  getProjects,
  getStyleTemplate,
  updatePlanningTemplate
} from "../../../../lib/api";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../../lib/placement-specs";
import { ImagePreviewTrigger } from "../../image-preview";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";

type TemplateEditorState = {
  name: string;
  status: TemplateStatus;
  channel: CreativeChannel;
  format: CreativeFormat;
  basePrompt: string;
  promptScaffold: string;
  templateFamily: string;
  outputMode: "single_image" | "carousel" | "both";
  defaultSlideCount: string;
  allowedSlideCounts: string;
  seriesUseCases: string;
  carouselRecipe: string;
  safeZoneNotes: string;
  approvedUseCases: string;
  notes: string;
  textZones: string;
  assetIds: string[];
};

const statusOptions: TemplateStatus[] = ["draft", "approved", "archived"];

export default function TemplateDetailPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const { sessionToken, activeAssets, setMessage } = useStudio();
  const [detail, setDetail] = useState<CreativeTemplateDetail | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<TemplateEditorState | null>(null);

  const loadTemplate = useCallback(async () => {
    if (!sessionToken || typeof params.templateId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const [record, projectRecords, postTypeRecords] = await Promise.all([
        getPlanningTemplate(sessionToken, params.templateId),
        getProjects(sessionToken),
        getPostTypes(sessionToken)
      ]);

      setDetail(record);
      setProjects(projectRecords.filter((project) => project.brandId === record.template.brandId));
      setPostTypes(postTypeRecords);
      setFormState(toTemplateEditorState(record));
      setError(null);
    } catch (loadError) {
      try {
        const seedTemplate = await getStyleTemplate(sessionToken, params.templateId);
        if (seedTemplate.jobId) {
          const job = await getCreativeJob(sessionToken, seedTemplate.jobId);
          router.replace(`/studio/runs/${job.promptPackageId}`);
          return;
        }
      } catch {
        // fall through to user-facing error
      }

      setError(loadError instanceof Error ? loadError.message : "Unable to load this template");
    } finally {
      setLoading(false);
    }
  }, [params.templateId, router, sessionToken]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const topbarActions = useMemo(
    () => (
      <>
        {detail ? (
          <button
            className="button button-primary"
            disabled={isSaving}
            onClick={() => {
              setFormState(toTemplateEditorState(detail));
              setIsEditorOpen(true);
            }}
            type="button"
          >
            {isSaving ? "Saving…" : "Edit template"}
          </button>
        ) : null}
      </>
    ),
    [detail, isSaving]
  );

  useRegisterTopbarActions(topbarActions);

  const project = useMemo(
    () => (detail ? projects.find((item) => item.id === detail.template.projectId) ?? null : null),
    [detail, projects]
  );

  const postType = useMemo(
    () => (detail ? postTypes.find((item) => item.id === detail.template.postTypeId) ?? null : null),
    [detail, postTypes]
  );

  const placement = useMemo(
    () =>
      detail
        ? getPlacementSpec(detail.template.channel, detail.template.format) ?? getAllowedFormats(detail.template.channel)[0]!
        : null,
    [detail]
  );

  const assetDetails = useMemo(
    () =>
      detail
        ? detail.assets.map((asset) => ({
            ...asset,
            brandAsset: activeAssets.find((item) => item.id === asset.assetId) ?? null
          }))
        : [],
    [activeAssets, detail]
  );

  const topbarMeta = useMemo(() => {
    if (!detail) {
      return null;
    }

    const subtitle =
      [project?.name, postType?.name].filter(Boolean).join(" · ") ||
      detail.template.config.approvedUseCases[0] ||
      "Reusable template";

    return {
      backHref: "/studio/templates",
      backLabel: "Back to templates",
      title: detail.template.name,
      subtitle,
      badges: (
        <>
          <span className={`pill ${detail.template.status === "approved" ? "pill-completed" : ""}`}>{detail.template.status}</span>
          <span className="pill">{placementLabel(detail.template.channel, detail.template.format)}</span>
          {detail.template.projectId ? <span className="pill">Project scoped</span> : null}
        </>
      )
    };
  }, [detail, postType?.name, project?.name]);

  useRegisterTopbarMeta(topbarMeta);

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Template detail</p>
          <h3>Loading template…</h3>
        </article>
      </div>
    );
  }

  if (!detail || !formState || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Template detail</p>
          <h3>Unable to load template</h3>
          <p>{error ?? "Template not found."}</p>
        </article>
      </div>
    );
  }

  const template = detail.template;
  async function handleSaveTemplate(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !formState) {
      return;
    }

    setIsSaving(true);

    try {
      await updatePlanningTemplate(sessionToken, template.id, {
        name: formState.name,
        status: formState.status,
        channel: formState.channel,
        format: formState.format,
        basePrompt: formState.basePrompt,
        config: {
          promptScaffold: formState.promptScaffold,
          templateFamily: formState.templateFamily,
          outputKinds: parseTemplateOutputKinds(formState.outputMode),
          defaultSlideCount: parseNullableSlideCount(formState.defaultSlideCount),
          allowedSlideCounts: parseSlideCounts(formState.allowedSlideCounts),
          seriesUseCases: splitList(formState.seriesUseCases),
          carouselRecipe: splitList(formState.carouselRecipe),
          safeZoneNotes: splitList(formState.safeZoneNotes),
          approvedUseCases: splitList(formState.approvedUseCases),
          notes: splitList(formState.notes),
          textZones: splitList(formState.textZones).map((name) => ({ name }))
        },
        assetIds: formState.assetIds
      } satisfies UpdateCreativeTemplateInput);

      await loadTemplate();
      setIsEditorOpen(false);
      setMessage("Template updated.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Template update failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-grid">
        <main className="page-span-8 page-stack">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Reference imagery</p>
                <h3>The visual system this template should follow</h3>
              </div>
              <span className="panel-count">{detail.assets.length}</span>
            </div>
            {assetDetails.length > 0 ? (
              <div className="template-media-stack">
                <div className="template-hero-media">
                  {assetDetails[0]?.brandAsset?.previewUrl ? (
                    <ImagePreviewTrigger
                      alt={assetDetails[0].brandAsset.label}
                      src={assetDetails[0].brandAsset.previewUrl}
                      title={assetDetails[0].brandAsset.label}
                      meta={assetDetails[0]?.role.replaceAll("_", " ") ?? "reference"}
                    >
                      <img alt={assetDetails[0].brandAsset.label} src={assetDetails[0].brandAsset.previewUrl} />
                    </ImagePreviewTrigger>
                  ) : (
                    <div className="template-hero-fallback">No preview</div>
                  )}
                  <div className="template-hero-meta">
                    <p className="panel-label">{assetDetails[0]?.role.replaceAll("_", " ") ?? "reference"}</p>
                    <h4>{assetDetails[0]?.brandAsset?.label ?? assetDetails[0]?.assetId ?? "Primary reference"}</h4>
                    {assetDetails[0]?.brandAsset?.kind ? <p>{assetDetails[0].brandAsset.kind}</p> : null}
                  </div>
                </div>

                {assetDetails.length > 1 ? (
                  <div className="template-reference-grid">
                    {assetDetails.slice(1).map((asset) => (
                      <article className="thumb-card" key={asset.id}>
                        {asset.brandAsset?.previewUrl ? (
                          <ImagePreviewTrigger
                            alt={asset.brandAsset.label}
                            src={asset.brandAsset.previewUrl}
                            title={asset.brandAsset.label}
                            meta={asset.role.replaceAll("_", " ")}
                          >
                            <img alt={asset.brandAsset.label} src={asset.brandAsset.previewUrl} />
                          </ImagePreviewTrigger>
                        ) : (
                          <div className="thumb-fallback" />
                        )}
                        <div>
                          <strong className="data-table-title">{asset.brandAsset?.label ?? asset.assetId}</strong>
                          <p>{asset.role.replaceAll("_", " ")}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No linked references</strong>
                <p>Add supporting references if this template should carry specific visual context.</p>
              </div>
            )}
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Usage</p>
                <h3>Where this template works best</h3>
              </div>
            </div>
            <div className="brand-rule-columns">
              <RuleBlock title="Approved uses" items={template.config.approvedUseCases} emptyLabel="Reusable across multiple use cases" />
              <RuleBlock title="Safe zones" items={template.config.safeZoneNotes} emptyLabel="No specific safe-zone notes stored" />
              <RuleBlock title="Series use cases" items={template.config.seriesUseCases} emptyLabel="Not scoped to a specific series" />
              <RuleBlock
                title="Output support"
                items={
                  template.config.outputKinds.length > 0
                    ? template.config.outputKinds.map((kind) => (kind === "carousel" ? "Carousel" : "Single image"))
                    : ["Single image", "Carousel"]
                }
                emptyLabel="Single image + carousel"
              />
            </div>
            {template.config.textZones.length > 0 ? (
              <div className="brand-rule-block">
                <p className="panel-label">Text zones</p>
                <div className="brand-chip-row">
                  {template.config.textZones.map((zone) => (
                    <span className="pill" key={zone.name}>{zone.name}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        </main>

        <aside className="page-span-4 page-stack">
          <article className="sidebar-panel">
            <h3>Scope & usage</h3>
            <div className="sidebar-chip-block">
              <p className="panel-label">Context</p>
              <div className="brand-chip-row">
                {project ? <span className="pill">{project.name}</span> : null}
                {postType ? <span className="pill">{postType.name}</span> : null}
                {template.config.approvedUseCases.length > 0 ? (
                  template.config.approvedUseCases.map((item) => (
                    <span className="pill pill-review-approved" key={item}>{item}</span>
                  ))
                ) : (
                  <span className="pill">Multi-use template</span>
                )}
              </div>
            </div>
            <div className="property-list">
              <div className="property-item">
                <span>Canvas</span>
                <strong>{placement?.recommendedSize ?? "Not set"}</strong>
              </div>
              <div className="property-item">
                <span>References</span>
                <strong>{detail.assets.length}</strong>
              </div>
            </div>
          </article>
        </aside>
      </section>

      {isEditorOpen && formState ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Edit template</h2>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSaveTemplate}>
                <div className="planner-form-section">
                  <p className="field-group-label">Template setup</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Name
                      <input value={formState.name} onChange={(event) => setFormState((state) => (state ? { ...state, name: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Status
                      <select value={formState.status} onChange={(event) => setFormState((state) => (state ? { ...state, status: event.target.value as TemplateStatus } : state))}>
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Channel
                      <select
                        value={formState.channel}
                        onChange={(event) =>
                          setFormState((state) =>
                            state
                              ? {
                                  ...state,
                                  channel: event.target.value as CreativeChannel,
                                  format: getDefaultFormat(event.target.value as CreativeChannel)
                                }
                              : state
                          )
                        }
                      >
                        <option value="instagram-feed">Instagram feed</option>
                        <option value="instagram-story">Instagram story</option>
                        <option value="linkedin-feed">LinkedIn feed</option>
                        <option value="x-post">X post</option>
                        <option value="tiktok-cover">TikTok cover</option>
                        <option value="ad-creative">Ad creative</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Format
                      <select value={formState.format} onChange={(event) => setFormState((state) => (state ? { ...state, format: event.target.value as CreativeFormat } : state))}>
                        {getAllowedFormats(formState.channel).map((option) => (
                          <option key={`${option.channel}-${option.format}`} value={option.format}>{option.formatLabel}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="planner-form-section">
                  <p className="field-group-label">Template rules</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Base prompt
                      <textarea value={formState.basePrompt} onChange={(event) => setFormState((state) => (state ? { ...state, basePrompt: event.target.value } : state))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Prompt scaffold
                      <textarea value={formState.promptScaffold} onChange={(event) => setFormState((state) => (state ? { ...state, promptScaffold: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Template family
                      <input value={formState.templateFamily} onChange={(event) => setFormState((state) => (state ? { ...state, templateFamily: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Supports
                      <select value={formState.outputMode} onChange={(event) => setFormState((state) => (state ? { ...state, outputMode: event.target.value as TemplateEditorState["outputMode"] } : state))}>
                        <option value="both">Single image + carousel</option>
                        <option value="single_image">Single image only</option>
                        <option value="carousel">Carousel only</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Default slides
                      <input value={formState.defaultSlideCount} onChange={(event) => setFormState((state) => (state ? { ...state, defaultSlideCount: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Allowed slide counts
                      <input value={formState.allowedSlideCounts} onChange={(event) => setFormState((state) => (state ? { ...state, allowedSlideCounts: event.target.value } : state))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Series use cases
                      <input value={formState.seriesUseCases} onChange={(event) => setFormState((state) => (state ? { ...state, seriesUseCases: event.target.value } : state))} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Carousel recipe
                      <input value={formState.carouselRecipe} onChange={(event) => setFormState((state) => (state ? { ...state, carouselRecipe: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Safe-zone notes
                      <input value={formState.safeZoneNotes} onChange={(event) => setFormState((state) => (state ? { ...state, safeZoneNotes: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Approved use cases
                      <input value={formState.approvedUseCases} onChange={(event) => setFormState((state) => (state ? { ...state, approvedUseCases: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Notes
                      <input value={formState.notes} onChange={(event) => setFormState((state) => (state ? { ...state, notes: event.target.value } : state))} />
                    </label>
                    <label className="field-label">
                      Text zones
                      <input value={formState.textZones} onChange={(event) => setFormState((state) => (state ? { ...state, textZones: event.target.value } : state))} />
                    </label>
                  </div>
                </div>

                <div className="planner-form-section">
                  <p className="field-group-label">Linked references</p>
                  <p className="create-hint" style={{ marginBottom: "12px" }}>
                    Optional. These references travel with the template as supporting visuals; they do not replace the template itself.
                  </p>
                  {activeAssets.length > 0 ? (
                    <div className="asset-check-grid">
                      {activeAssets.map((asset) => {
                        const checked = formState.assetIds.includes(asset.id);
                        return (
                          <label className={checked ? "asset-check selected" : "asset-check"} key={asset.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setFormState((state) =>
                                  state
                                    ? {
                                        ...state,
                                        assetIds: event.target.checked
                                          ? [...state.assetIds, asset.id]
                                          : state.assetIds.filter((id) => id !== asset.id)
                                      }
                                    : state
                                )
                              }
                            />
                            <span>{asset.label}</span>
                            <small>{asset.kind}</small>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-inline-state">
                      <strong>No references yet</strong>
                      <p>Upload references in Library if this template should carry supporting visuals.</p>
                    </div>
                  )}
                </div>

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsEditorOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save template"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toTemplateEditorState(detail: CreativeTemplateDetail): TemplateEditorState {
  return {
    name: detail.template.name,
    status: detail.template.status,
    channel: detail.template.channel,
    format: detail.template.format,
    basePrompt: detail.template.basePrompt,
    promptScaffold: detail.template.config.promptScaffold,
    templateFamily: detail.template.config.templateFamily,
    outputMode:
      detail.template.config.outputKinds.length === 1 &&
      (detail.template.config.outputKinds[0] === "single_image" ||
        detail.template.config.outputKinds[0] === "carousel")
        ? detail.template.config.outputKinds[0]
        : "both",
    defaultSlideCount:
      detail.template.config.defaultSlideCount !== null && detail.template.config.defaultSlideCount !== undefined
        ? String(detail.template.config.defaultSlideCount)
        : "",
    allowedSlideCounts: detail.template.config.allowedSlideCounts.join(", "),
    seriesUseCases: detail.template.config.seriesUseCases.join(", "),
    carouselRecipe: detail.template.config.carouselRecipe.join(", "),
    safeZoneNotes: detail.template.config.safeZoneNotes.join(", "),
    approvedUseCases: detail.template.config.approvedUseCases.join(", "),
    notes: detail.template.config.notes.join(", "),
    textZones: detail.template.config.textZones.map((zone) => zone.name).join(", "),
    assetIds: detail.assets.map((asset) => asset.assetId)
  };
}

function RuleBlock({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="brand-rule-block">
      <p className="panel-label">{title}</p>
      <div className="brand-chip-row">
        {items.length > 0 ? items.map((item) => <span className="pill" key={item}>{item}</span>) : <span className="pill">{emptyLabel}</span>}
      </div>
    </div>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSlideCounts(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item >= 2 && item <= 10)
    )
  ).sort((left, right) => left - right);
}

function parseNullableSlideCount(value: string) {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 10 ? parsed : null;
}

function parseTemplateOutputKinds(mode: TemplateEditorState["outputMode"]) {
  if (mode === "single_image") {
    return ["single_image"] as Array<"single_image" | "carousel">;
  }

  if (mode === "carousel") {
    return ["carousel"] as Array<"single_image" | "carousel">;
  }

  return ["single_image", "carousel"] as Array<"single_image" | "carousel">;
}

function placementLabel(channel: CreativeChannel, format: CreativeFormat) {
  const placement = getPlacementSpec(channel, format);
  return placement ? `${placement.channelLabel} · ${placement.formatLabel}` : channel;
}
