"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BrandAssetRecord, CreateProjectInput, ProjectRecord } from "@image-lab/contracts";
import { createProject, getBrandAssets, getProjects } from "../../../lib/api";
import {
  defaultProjectForm,
  formStateToProjectProfile,
  type ProjectFormState
} from "../../../lib/project-profile-form";
import { DataTable } from "../data-table";
import { ProjectProfileFormSections } from "./project-form-sections";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";

const stageOptions: Array<{ value: CreateProjectInput["stage"]; label: string }> = [
  { value: "pre_launch", label: "Pre-launch" },
  { value: "launch", label: "Launch" },
  { value: "under_construction", label: "Under construction" },
  { value: "near_possession", label: "Near possession" },
  { value: "delivered", label: "Delivered" }
];

export default function ProjectsPage() {
  const { sessionToken, bootstrap, activeBrandId, message, setMessage } = useStudio();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(defaultProjectForm);
  const [brandAssets, setBrandAssets] = useState<BrandAssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => setIsDrawerOpen(true)}
        disabled={saving || !activeBrandId}
      >
        {saving ? "Saving project…" : "New project"}
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
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const records = await getProjects(token);
        if (!cancelled) {
          setProjects(records);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load projects");
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
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken || !activeBrandId || !isDrawerOpen) {
      return;
    }

    const token = sessionToken;
    const brandId = activeBrandId;
    let cancelled = false;

    async function loadAssets() {
      try {
        setLoadingAssets(true);
        const records = await getBrandAssets(token, brandId);
        if (!cancelled) {
          setBrandAssets(records.filter((asset) => asset.kind === "reference"));
        }
      } catch (assetError) {
        if (!cancelled) {
          setMessage(assetError instanceof Error ? assetError.message : "Failed to load brand references");
        }
      } finally {
        if (!cancelled) {
          setLoadingAssets(false);
        }
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, isDrawerOpen, sessionToken, setMessage]);

  const activeBrand = useMemo(
    () => bootstrap?.brands.find((brand) => brand.id === activeBrandId) ?? null,
    [activeBrandId, bootstrap]
  );

  const visibleProjects = useMemo(
    () => (activeBrandId ? projects.filter((project) => project.brandId === activeBrandId) : projects),
    [activeBrandId, projects]
  );

  const tableColumns = useMemo(
    () => [
      {
        id: "project",
        header: "Project",
        sortValue: (project: ProjectRecord) => project.name,
        cell: (project: ProjectRecord) => (
          <div className="data-table-primary">
            <strong className="data-table-title">{project.name}</strong>
            {project.description ? <span className="data-table-subtitle">{project.description}</span> : null}
          </div>
        )
      },
      {
        id: "location",
        header: "Location",
        sortValue: (project: ProjectRecord) => `${project.city ?? ""} ${project.microLocation ?? ""}`,
        cell: (project: ProjectRecord) => (
          <div className="data-table-primary">
            <strong className="data-table-title">{project.microLocation ?? project.city ?? "Not set"}</strong>
            {project.microLocation && project.city ? (
              <span className="data-table-subtitle">{project.city}</span>
            ) : null}
          </div>
        )
      },
      {
        id: "context",
        header: "Context",
        cell: (project: ProjectRecord) => (
          <div className="data-table-chip-row">
            <span className="pill">{formatStage(project.stage)}</span>
            {project.projectType ? <span className="pill">{project.projectType}</span> : null}
          </div>
        )
      },
      {
        id: "status",
        header: "Status",
        sortValue: (project: ProjectRecord) => project.status,
        cell: (project: ProjectRecord) => (
          <span className={`planner-status planner-status-${project.status}`}>{project.status}</span>
        )
      },
      {
        id: "actions",
        header: "Actions",
        align: "end" as const,
        className: "data-table-actions-cell",
        cell: (project: ProjectRecord) => (
          <div className="table-action-group">
            <Link className="button button-ghost table-action-button" href={`/studio/deliverables?projectId=${project.id}`}>
              Deliverables
            </Link>
          </div>
        )
      }
    ],
    []
  );

  async function handleCreateProject(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !activeBrandId || !bootstrap?.workspace) {
      return;
    }

    setSaving(true);

    try {
      await createProject(sessionToken, {
        workspaceId: bootstrap.workspace.id,
        brandId: activeBrandId,
        name: form.name,
        description: form.description || undefined,
        city: form.city || undefined,
        microLocation: form.microLocation || undefined,
        projectType: form.projectType || undefined,
        stage: form.stage,
        profile: formStateToProjectProfile(form)
      });

      const records = await getProjects(sessionToken);
      setProjects(records);
      setForm(defaultProjectForm);
      setIsDrawerOpen(false);
      setMessage("Project created.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Project creation failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Projects</p>
          <h3>Loading project inventory…</h3>
        </article>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Projects</p>
          <h3>Unable to load projects</h3>
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
              <h3>{activeBrand ? activeBrand.name : "Projects"}</h3>
            </div>
            <span className="panel-count">{visibleProjects.length} projects</span>
          </div>

          <DataTable
            columns={tableColumns}
            defaultSort={{ columnId: "project", direction: "asc" }}
            emptyAction={
              <button className="button button-primary" disabled={!activeBrandId} onClick={() => setIsDrawerOpen(true)}>
                Create first project
              </button>
            }
            emptyBody="Add each development before building templates or deliverables."
            emptyTitle="No projects yet"
            filters={[
              {
                id: "stage",
                label: "Stage",
                options: stageOptions.map((option) => ({ label: option.label, value: option.value })),
                getValue: (project) => project.stage
              },
              {
                id: "status",
                label: "Status",
                options: [
                  { label: "Active", value: "active" },
                  { label: "Archived", value: "archived" }
                ],
                getValue: (project) => project.status
              }
            ]}
            rowHref={(project) => `/studio/projects/${project.id}`}
            rowKey={(project) => project.id}
            rows={visibleProjects}
            search={{
              placeholder: "Search projects or locations",
              getText: (project) =>
                [project.name, project.description, project.city, project.microLocation, project.projectType]
                  .filter(Boolean)
                  .join(" ")
            }}
          />
        </article>
      </section>

      {message ? <p className="field-hint">{message}</p> : null}

      {isDrawerOpen ? (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Create project</h2>
              <button className="drawer-close" onClick={() => setIsDrawerOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              {!activeBrandId ? <div className="status-banner"><span>Choose an active brand before creating a project.</span></div> : null}

              <form className="planner-form" onSubmit={handleCreateProject}>
                <div className="planner-form-section">
                  <p className="field-group-label">Identity</p>
                  <div className="planner-form-grid">
                    <label className="field-label">
                      Project name
                      <input required value={form.name} onChange={(event) => updateForm(setForm, "name", event.target.value)} />
                    </label>
                    <label className="field-label">
                      Stage
                      <select value={form.stage} onChange={(event) => updateForm(setForm, "stage", event.target.value as CreateProjectInput["stage"])}>
                        {stageOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      City
                      <input value={form.city} onChange={(event) => updateForm(setForm, "city", event.target.value)} />
                    </label>
                    <label className="field-label">
                      Micro-location
                      <input value={form.microLocation} onChange={(event) => updateForm(setForm, "microLocation", event.target.value)} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Description
                      <textarea value={form.description} onChange={(event) => updateForm(setForm, "description", event.target.value)} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Project type
                      <input value={form.projectType} onChange={(event) => updateForm(setForm, "projectType", event.target.value)} />
                    </label>
                  </div>
                </div>

                <ProjectProfileFormSections assets={brandAssets} form={form} loadingAssets={loadingAssets} setForm={setForm} />

                <div className="form-footer">
                  <button className="button button-primary" type="submit" disabled={saving || !activeBrandId}>
                    {saving ? "Saving project…" : "Save project"}
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

function updateForm<K extends keyof ProjectFormState>(
  setForm: Dispatch<SetStateAction<ProjectFormState>>,
  key: K,
  value: ProjectFormState[K]
) {
  setForm((state) => ({ ...state, [key]: value }));
}

function formatStage(value: ProjectRecord["stage"]) {
  return value.replaceAll("_", " ");
}
