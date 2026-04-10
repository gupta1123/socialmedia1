"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  CreateCreativeTemplateInput,
  CreativeChannel,
  CreativeFormat,
  CreativeTemplateRecord,
  PostTypeRecord,
  ProjectRecord,
  TemplateStatus
} from "@image-lab/contracts";
import { createPlanningTemplate, getPlanningTemplates, getPostTypes, getProjects } from "../../../lib/api";
import { getAllowedFormats, getDefaultFormat, getPlacementSpec } from "../../../lib/placement-specs";
import { ImagePreviewTrigger } from "../image-preview";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";
import { Skeleton } from "../skeleton";
import { PlacementIcons } from "../placement-icons";
import { DataTable } from "../data-table";

type TemplateFormState = {
  name: string;
  projectId: string;
  postTypeId: string;
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

const defaultForm: TemplateFormState = {
  name: "",
  projectId: "",
  postTypeId: "",
  status: "draft",
  channel: "instagram-feed",
  format: "square",
  basePrompt: "",
  promptScaffold: "",
  templateFamily: "",
  outputMode: "both",
  defaultSlideCount: "5",
  allowedSlideCounts: "4, 5, 6, 7, 8",
  seriesUseCases: "",
  carouselRecipe: "",
  safeZoneNotes: "",
  approvedUseCases: "",
  notes: "",
  textZones: "headline, subcopy, cta",
  assetIds: []
};

const statusOptions: TemplateStatus[] = ["draft", "approved", "archived"];

export default function TemplatesPage() {
  const { sessionToken, bootstrap, activeBrandId, activeAssets, setMessage } = useStudio();
  const [templates, setTemplates] = useState<CreativeTemplateRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(defaultForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<CreativeChannel | "all">("all");

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => setIsDrawerOpen(true)}
        disabled={!activeBrandId || saving}
      >
        {saving ? "Saving template…" : "New template"}
      </button>
    ),
    [activeBrandId, saving]
  );

  useRegisterTopbarActions(topbarActions);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    const token = sessionToken;
    const brandId = activeBrandId ?? undefined;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [templateRecords, projectRecords, postTypeRecords] = await Promise.all([
          getPlanningTemplates(token, brandId ? { brandId } : undefined),
          getProjects(token, brandId ? { brandId } : undefined),
          getPostTypes(token)
        ]);

        if (!cancelled) {
          setTemplates(templateRecords);
          setProjects(projectRecords);
          setPostTypes(postTypeRecords);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load templates");
        }
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
  }, [activeBrandId, sessionToken]);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const statusOrder: Record<TemplateStatus, number> = {
      approved: 0,
      draft: 1,
      archived: 2
    };

    return [...templates]
      .filter((template) => (statusFilter === "all" ? true : template.status === statusFilter))
      .filter((template) => (channelFilter === "all" ? true : template.channel === channelFilter))
      .filter((template) => {
        if (!normalizedQuery) {
          return true;
        }

        const projectName = projects.find((project) => project.id === template.projectId)?.name ?? "";
        const postTypeName = postTypes.find((postType) => postType.id === template.postTypeId)?.name ?? "";

        return [
          template.name,
          template.config.templateFamily,
          projectName,
          postTypeName,
          template.basePrompt,
          template.config.approvedUseCases.join(" "),
          template.config.seriesUseCases.join(" "),
          template.config.notes.join(" ")
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => {
        const statusDelta = statusOrder[left.status] - statusOrder[right.status];
        if (statusDelta !== 0) {
          return statusDelta;
        }

        return left.name.localeCompare(right.name);
      });
  }, [channelFilter, postTypes, projects, query, statusFilter, templates]);

  async function handleCreateTemplate(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSaving(true);

    try {
      await createPlanningTemplate(sessionToken, {
        workspaceId: bootstrap.workspace.id,
        brandId: activeBrandId,
        projectId: form.projectId || undefined,
        postTypeId: form.postTypeId || undefined,
        name: form.name,
        status: form.status,
        channel: form.channel,
        format: form.format,
        basePrompt: form.basePrompt,
        config: {
          promptScaffold: form.promptScaffold,
          templateFamily: form.templateFamily,
          outputKinds: parseTemplateOutputKinds(form.outputMode),
          defaultSlideCount: parseNullableSlideCount(form.defaultSlideCount),
          allowedSlideCounts: parseSlideCounts(form.allowedSlideCounts),
          seriesUseCases: splitList(form.seriesUseCases),
          carouselRecipe: splitList(form.carouselRecipe),
          safeZoneNotes: splitList(form.safeZoneNotes),
          approvedUseCases: splitList(form.approvedUseCases),
          notes: splitList(form.notes),
          textZones: splitList(form.textZones).map((name) => ({ name }))
        },
        assetIds: form.assetIds
      });

      const records = await getPlanningTemplates(sessionToken, { brandId: activeBrandId });
      setTemplates(records);
      setForm(defaultForm);
      setIsDrawerOpen(false);
      setMessage("Template saved.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Template creation failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-grid">
        <article className="panel page-span-12">
          <div className="panel-header">
            <div>
              <h3>{activeBrand ? activeBrand.name : "Templates"}</h3>
            </div>
            <span className="panel-count">
              {filteredTemplates.length === templates.length
                ? `${templates.length} templates`
                : `${filteredTemplates.length} of ${templates.length}`}
            </span>
          </div>

          {error ? (
            <div className="status-banner">
              <span>{error}</span>
            </div>
          ) : null}

          <div className="data-table-toolbar">
            <div className="data-table-toolbar-left">
              <label className="data-table-filter">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as TemplateStatus | "all")}
                >
                  <option value="all">All status</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="data-table-filter">
                <span>Channel</span>
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value as CreativeChannel | "all")}
                >
                  <option value="all">All channels</option>
                  <option value="instagram-feed">Instagram feed</option>
                  <option value="instagram-story">Instagram story</option>
                  <option value="linkedin-feed">LinkedIn</option>
                  <option value="x-post">X / Twitter</option>
                  <option value="tiktok-cover">TikTok</option>
                  <option value="ad-creative">Ad creative</option>
                </select>
              </label>
            </div>
          </div>

          <DataTable
            columns={[
              {
                id: "preview",
                header: "",
                cell: (template: CreativeTemplateRecord) => (
                  <div className="work-list-thumb">
                    {template.previewUrl ? <img alt={template.name} src={template.previewUrl} /> : <div className="thumb-fallback" />}
                  </div>
                )
              },
              {
                id: "name",
                header: "Name",
                cell: (template: CreativeTemplateRecord) => (
                  <div className="work-list-main">
                    <strong>{template.name}</strong>
                    <span className="work-list-sub">
                      {template.config.templateFamily || "Reusable starting point"}
                    </span>
                  </div>
                )
              },
              {
                id: "project",
                header: "Project",
                cell: (template: CreativeTemplateRecord) => {
                  const projectName = projects.find((p) => p.id === template.projectId)?.name;
                  return <span>{projectName || "Any project"}</span>;
                }
              },
              {
                id: "placement",
                header: "Placement",
                cell: (template: CreativeTemplateRecord) => (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <PlacementIcons channel={template.channel} format={template.format} interactive={false} />
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {template.channel}
                    </span>
                  </div>
                )
              },
              {
                id: "status",
                header: "Status",
                cell: (template: CreativeTemplateRecord) => <span className={`pill pill-${template.status}`}>{template.status}</span>
              }
            ]}
            emptyAction={
              <button className="button button-ghost" onClick={() => setIsDrawerOpen(true)}>
                Create template
              </button>
            }
            emptyBody="Save your favorite style explorations to reuse them in future runs."
            emptyTitle="No templates yet"
            loading={loading}
            rowHref={(template) => `/studio/templates/${template.id}`}
            rowKey={(template) => template.id}
            rows={filteredTemplates}
            search={{
              placeholder: "Search templates, projects, or notes",
              getText: (template) => [template.name, template.config.templateFamily].filter(Boolean).join(" ")
            }}
          />
        </article>
      </section>

      {isDrawerOpen && (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Create template</h2>
              <button className="drawer-close" onClick={() => setIsDrawerOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleCreateTemplate}>
                <div className="planner-form-section">
                  <p className="field-group-label">Template setup</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Name
                      <input
                        required
                        value={form.name}
                        onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
                        placeholder="Amenities spotlight · warm dusk"
                      />
                    </label>
                    <label className="field-label">
                      Project
                      <select
                        value={form.projectId}
                        onChange={(event) => setForm((state) => ({ ...state, projectId: event.target.value }))}
                      >
                        <option value="">Any project</option>
                        {projects.filter(p => p.brandId === activeBrandId).map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Post type
                      <select
                        value={form.postTypeId}
                        onChange={(event) => setForm((state) => ({ ...state, postTypeId: event.target.value }))}
                      >
                        <option value="">Any post type</option>
                        {postTypes.map((postType) => (
                          <option key={postType.id} value={postType.id}>
                            {postType.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Status
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((state) => ({ ...state, status: event.target.value as TemplateStatus }))
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Channel
                      <select
                        value={form.channel}
                        onChange={(event) =>
                          setForm((state) => {
                            const nextChannel = event.target.value as CreativeChannel;
                            const nextDefault = getDefaultFormat(nextChannel);
                            const currentStillAllowed = getPlacementSpec(nextChannel, state.format);

                            return {
                              ...state,
                              channel: nextChannel,
                              format: currentStillAllowed ? state.format : nextDefault
                            };
                          })
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
                      <select
                        value={form.format}
                        onChange={(event) =>
                          setForm((state) => ({ ...state, format: event.target.value as CreativeFormat }))
                        }
                      >
                        {getAllowedFormats(form.channel).map((option) => (
                          <option key={option.format} value={option.format}>
                            {option.formatLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="placement-card">
                  <div className="placement-card-top">
                    <div>
                      <p className="panel-label">Placement fit</p>
                      {(() => {
                        const placement = getPlacementSpec(form.channel, form.format) ?? getAllowedFormats(form.channel)[0]!;
                        return (
                          <>
                            <h4>
                              {placement.channelLabel} · {placement.formatLabel}
                            </h4>
                            <span className="placement-size-pill">{placement.recommendedSize}</span>
                            <p className="placement-purpose">{placement.purpose}</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="planner-form-section">
                  <p className="field-group-label">Prompt system</p>
                  <div className="planner-form-grid">
                    <label className="field-label planner-form-span-2">
                      Base prompt
                      <textarea
                        value={form.basePrompt}
                        onChange={(event) => setForm((state) => ({ ...state, basePrompt: event.target.value }))}
                        placeholder="What visual structure should this pack reinforce?"
                      />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Prompt scaffold
                      <textarea
                        value={form.promptScaffold}
                        onChange={(event) => setForm((state) => ({ ...state, promptScaffold: event.target.value }))}
                        placeholder="A reusable scaffold for the compiler to fill in."
                      />
                    </label>
                    <label className="field-label">
                      Template family
                      <input
                        value={form.templateFamily}
                        onChange={(event) => setForm((state) => ({ ...state, templateFamily: event.target.value }))}
                        placeholder="City facts editorial"
                      />
                    </label>
                    <label className="field-label">
                      Supports
                      <select
                        value={form.outputMode}
                        onChange={(event) =>
                          setForm((state) => ({
                            ...state,
                            outputMode: event.target.value as TemplateFormState["outputMode"]
                          }))
                        }
                      >
                        <option value="both">Single image + carousel</option>
                        <option value="single_image">Single image only</option>
                        <option value="carousel">Carousel only</option>
                      </select>
                    </label>
                    <label className="field-label">
                      Default slides
                      <input
                        value={form.defaultSlideCount}
                        onChange={(event) => setForm((state) => ({ ...state, defaultSlideCount: event.target.value }))}
                        placeholder="5"
                      />
                    </label>
                    <label className="field-label">
                      Allowed slide counts
                      <input
                        value={form.allowedSlideCounts}
                        onChange={(event) => setForm((state) => ({ ...state, allowedSlideCounts: event.target.value }))}
                        placeholder="4, 5, 6, 7, 8"
                      />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Series use cases
                      <input
                        value={form.seriesUseCases}
                        onChange={(event) => setForm((state) => ({ ...state, seriesUseCases: event.target.value }))}
                        placeholder="City facts, buyer education, amenity spotlight"
                      />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Carousel recipe
                      <input
                        value={form.carouselRecipe}
                        onChange={(event) => setForm((state) => ({ ...state, carouselRecipe: event.target.value }))}
                        placeholder="cover slide, insight slide, proof slide, CTA close"
                      />
                    </label>
                    <label className="field-label">
                      Safe-zone notes
                      <input
                        value={form.safeZoneNotes}
                        onChange={(event) => setForm((state) => ({ ...state, safeZoneNotes: event.target.value }))}
                        placeholder="Headline top third, CTA bottom bar"
                      />
                    </label>
                    <label className="field-label">
                      Approved use cases
                      <input
                        value={form.approvedUseCases}
                        onChange={(event) => setForm((state) => ({ ...state, approvedUseCases: event.target.value }))}
                        placeholder="Launch post, amenities drop, weekend invite"
                      />
                    </label>
                    <label className="field-label">
                      Notes
                      <input
                        value={form.notes}
                        onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))}
                        placeholder="Warm facades, thin gold type, restrained CTA"
                      />
                    </label>
                    <label className="field-label">
                      Text zones
                      <input
                        value={form.textZones}
                        onChange={(event) => setForm((state) => ({ ...state, textZones: event.target.value }))}
                        placeholder="headline, subcopy, cta"
                      />
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
                        const checked = form.assetIds.includes(asset.id);
                        return (
                          <label className={checked ? "asset-check selected" : "asset-check"} key={asset.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setForm((state) => ({
                                  ...state,
                                  assetIds: event.target.checked
                                    ? [...state.assetIds, asset.id]
                                    : state.assetIds.filter((id) => id !== asset.id)
                                }))
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

                <div className="form-footer">
                  <button className="button button-primary" type="submit" disabled={saving || !activeBrandId}>
                    {saving ? "Saving template…" : "Save template"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
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

function parseTemplateOutputKinds(mode: TemplateFormState["outputMode"]) {
  if (mode === "single_image") {
    return ["single_image"] as Array<"single_image" | "carousel">;
  }

  if (mode === "carousel") {
    return ["carousel"] as Array<"single_image" | "carousel">;
  }

  return ["single_image", "carousel"] as Array<"single_image" | "carousel">;
}
