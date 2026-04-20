"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  AssetKind,
  BrandAssetRecord,
  CreativeTemplateRecord,
  PostTypeRecord,
  ProjectReraRegistrationRecord,
  ProjectRecord
} from "@image-lab/contracts";
import {
  deleteBrandAsset,
  getBrandAssets,
  getPlanningTemplates,
  getPostTypes,
  getProjectReraRegistrations,
  getProjects,
  setDefaultProjectReraRegistration
} from "../../../lib/api";
import { ImagePreviewTrigger } from "../image-preview";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarControls } from "../topbar-actions-context";
import { Skeleton } from "../skeleton";

const LIBRARY_TABS = [
  { id: "system", label: "System" },
  { id: "templates", label: "Templates" },
  { id: "assets", label: "Media" }
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];

type LoadedTabsState = {
  system: boolean;
  templates: boolean;
  assets: boolean;
};

const DEFAULT_LOADED_TABS: LoadedTabsState = {
  system: false,
  templates: false,
  assets: false
};

export default function LibraryPage() {
  const { sessionToken, activeBrand, activeBrandId, bootstrap, pendingAction, isPending, uploadBrandAssetFile } =
    useStudio();
  const [tab, setTab] = useState<LibraryTab>("system");
  const [assets, setAssets] = useState<BrandAssetRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [reraRegistrations, setReraRegistrations] = useState<ProjectReraRegistrationRecord[]>([]);
  const [templates, setTemplates] = useState<CreativeTemplateRecord[]>([]);
  const [postTypes, setPostTypes] = useState<PostTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<LoadedTabsState>(DEFAULT_LOADED_TABS);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [assetKind, setAssetKind] = useState<AssetKind>("reference");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [reraNumber, setReraNumber] = useState("");
  const [replacingAssetId, setReplacingAssetId] = useState<string | null>(null);
  const complianceSettings = bootstrap?.workspaceComplianceSettings ?? {
    reraAuthorityLabel: "MahaRERA",
    reraWebsiteUrl: "https://maharera.maharashtra.gov.in",
    reraTextColor: "#111111"
  };

  const topbarActions = useMemo(
    () =>
      tab === "assets" ? (
        <button
          className="button button-primary"
          disabled={!activeBrand || pendingAction === "upload-reference"}
          onClick={() => {
            setAssetKind("reference");
            setSelectedProjectId("");
            setReraNumber("");
            setIsDrawerOpen(true);
          }}
          title={!activeBrand ? "Set an active brand first" : ""}
          type="button"
        >
          {pendingAction === "upload-reference" ? "Uploading…" : "Upload asset"}
        </button>
      ) : null,
    [activeBrand, pendingAction, tab]
  );

  const topbarControls = useMemo(
    () => (
      <div className="queue-scope-switch" role="tablist" aria-label="Library sections">
        {LIBRARY_TABS.map((item) => (
          <button
            key={item.id}
            aria-selected={tab === item.id}
            className={`filter-chip ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    ),
    [tab]
  );

  useRegisterTopbarActions(topbarActions);
  useRegisterTopbarControls(topbarControls);

  useEffect(() => {
    setAssets([]);
    setProjects([]);
    setReraRegistrations([]);
    setTemplates([]);
    setPostTypes([]);
    setLoadedTabs(DEFAULT_LOADED_TABS);
  }, [activeBrandId]);

  useEffect(() => {
    if (!sessionToken || !activeBrandId || loadedTabs.system || (!isDrawerOpen && tab !== "system")) {
      return;
    }

    const token = sessionToken;
    const brandId = activeBrandId;
    let cancelled = false;

    async function loadProjectContext() {
      try {
        const [projectRecords, postTypeRecords, registrations] = await Promise.all([
          getProjects(token, { brandId }),
          getPostTypes(token),
          getProjectReraRegistrations(token, brandId)
        ]);

        if (cancelled) return;

        setProjects(projectRecords);
        setPostTypes(postTypeRecords);
        setReraRegistrations(registrations);
        setLoadedTabs((current) => ({ ...current, system: true }));
        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load project context");
        }
      }
    }

    void loadProjectContext();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, isDrawerOpen, loadedTabs.system, sessionToken, tab]);

  useEffect(() => {
    if (!sessionToken || !activeBrandId || loadedTabs.assets) {
      return;
    }

    const token = sessionToken;
    const brandId = activeBrandId;
    let cancelled = false;

    async function loadAssets() {
      try {
        const [assetRecords, registrations] = await Promise.all([
          getBrandAssets(token, brandId),
          getProjectReraRegistrations(token, brandId)
        ]);
        if (cancelled) return;
        setAssets(assetRecords);
        setReraRegistrations(registrations);
        setError(null);
        setLoadedTabs((current) => ({ ...current, assets: true }));
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load brand assets");
        }
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, loadedTabs.assets, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function loadLibraryTab() {
      try {
        if (tab === "assets") {
          setLoading(false);
          return;
        }

        if ((tab === "system" && loadedTabs.system) || (tab === "templates" && loadedTabs.templates)) {
          setLoading(false);
          return;
        }

        setLoading(true);

        if (tab === "system") {
          const [projectRecords, postTypeRecords, registrations] = await Promise.all([
            getProjects(token, activeBrandId ? { brandId: activeBrandId } : undefined),
            getPostTypes(token),
            activeBrandId ? getProjectReraRegistrations(token, activeBrandId) : Promise.resolve([])
          ]);

          if (cancelled) return;

          setProjects(projectRecords);
          setPostTypes(postTypeRecords);
          setReraRegistrations(registrations);
          setLoadedTabs((current) => ({ ...current, system: true }));
        }

        if (tab === "templates") {
          const templateRecords = await getPlanningTemplates(token, activeBrandId ? { brandId: activeBrandId } : undefined);
          if (cancelled) return;
          setTemplates(templateRecords);
          setLoadedTabs((current) => ({ ...current, templates: true }));
        }

        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load library");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLibraryTab();

    return () => {
      cancelled = true;
    };
  }, [activeBrandId, loadedTabs.system, loadedTabs.templates, sessionToken, tab]);

  const activeBrands = useMemo(
    () => (activeBrandId ? bootstrap?.brands.filter((brand) => brand.id === activeBrandId) ?? [] : bootstrap?.brands ?? []),
    [activeBrandId, bootstrap]
  );

  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === "approved"),
    [templates]
  );
  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "reference"),
    [assets]
  );
  const logoAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "logo"),
    [assets]
  );
  const productAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "product"),
    [assets]
  );
  const inspirationAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "inspiration"),
    [assets]
  );
  const reraQrAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "rera_qr"),
    [assets]
  );
  const visibleMediaAssetCount = useMemo(
    () => assets.length,
    [assets]
  );
  const mediaSections = useMemo(
    () => [
      {
        key: "logos",
        title: "Logos",
        description: "Official brand marks that can be toggled into final creatives when needed.",
        emptyTitle: "No logos yet",
        emptyBody: "Upload the official brand logo so Create can optionally place it in the final image.",
        emptyActionLabel: "Upload logo",
        uploadKind: "logo" as AssetKind,
        tagLabel: "Logo",
        assets: logoAssets
      },
      {
        key: "rera-qr",
        title: "RERA QR codes",
        description: "Approved QR assets that must stay exact when included for compliance.",
        emptyTitle: "No RERA QR codes yet",
        emptyBody: "Upload approved RERA QR assets so they can be placed exactly when required.",
        emptyActionLabel: "Upload RERA QR",
        uploadKind: "rera_qr" as AssetKind,
        tagLabel: "RERA QR",
        assets: reraQrAssets
      },
      {
        key: "references",
        title: "References",
        description: "High-signal references that guide visual language and composition.",
        emptyTitle: "No references yet",
        emptyBody: "Upload high-signal references so templates and creation stay in the right visual language.",
        emptyActionLabel: "Upload reference",
        uploadKind: "reference" as AssetKind,
        tagLabel: "Reference",
        assets: referenceAssets
      },
      {
        key: "project-images",
        title: "Project images",
        description: "Building shots and other project-specific visuals linked on project profiles.",
        emptyTitle: "No project images yet",
        emptyBody: "Project building images appear here once they are linked to project profiles.",
        emptyActionLabel: null,
        uploadKind: "product" as AssetKind,
        tagLabel: "Project image",
        assets: productAssets
      },
      {
        key: "inspiration",
        title: "Inspiration",
        description: "Loose mood and style references that can broaden exploration without acting as the main truth anchor.",
        emptyTitle: "No inspiration assets yet",
        emptyBody: "Upload optional inspiration material if the brand uses a broader visual canon.",
        emptyActionLabel: "Upload inspiration",
        uploadKind: "inspiration" as AssetKind,
        tagLabel: "Inspiration",
        assets: inspirationAssets
      }
    ],
    [inspirationAssets, logoAssets, productAssets, referenceAssets, reraQrAssets]
  );

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (replacingAssetId) {
      if (sessionToken && activeBrandId) {
        await deleteBrandAsset(sessionToken, activeBrandId, replacingAssetId);
      }
    }

    const success = await uploadBrandAssetFile(
      file,
      label || file.name,
      assetKind,
      assetKind === "rera_qr" || assetKind === "product" ? selectedProjectId || null : null,
      assetKind === "rera_qr" && reraNumber.trim() ? { reraNumber: reraNumber.trim() } : undefined
    );
    if (success) {
      if (sessionToken && activeBrandId) {
        const token = sessionToken;
        const brandId = activeBrandId;
        const [assetRecords, registrations] = await Promise.all([
          getBrandAssets(token, brandId),
          getProjectReraRegistrations(token, brandId)
        ]);
        setAssets(assetRecords);
        setReraRegistrations(registrations);
        setError(null);
        setLoadedTabs((current) => ({ ...current, assets: true }));
      }
      setLabel("");
      setFile(null);
      setAssetKind("reference");
      setSelectedProjectId("");
      setReraNumber("");
      setIsDrawerOpen(false);
      setReplacingAssetId(null);
    }
  }

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const reraRegistrationByQrAssetId = useMemo(
    () => new Map(reraRegistrations.filter((registration) => registration.qrAssetId).map((registration) => [registration.qrAssetId!, registration])),
    [reraRegistrations]
  );

  async function handleSetDefaultReraRegistration(registrationId: string) {
    if (!sessionToken || !activeBrandId) return;
    const updated = await setDefaultProjectReraRegistration(sessionToken, activeBrandId, registrationId);
    setReraRegistrations((current) =>
      current.map((registration) =>
        registration.projectId === updated.projectId
          ? { ...registration, isDefault: registration.id === updated.id }
          : registration
      )
    );
  }

  return (
    <div className="page-stack">


      {error ? (
        <div className="status-banner">
          <span>{error}</span>
        </div>
      ) : null}

      <section className="library-tabs-panel">
        {loading ? (
          <div className="library-section-stack">
            {tab === "assets" || tab === "templates" ? (
              <div className="gallery-grid library-gallery-grid">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="review-card" style={{ padding: "12px" }}>
                    <Skeleton style={{ height: "200px", borderRadius: "8px" }} />
                    <div style={{ marginTop: "12px" }}>
                      <Skeleton style={{ height: "16px", width: "60%" }} />
                      <Skeleton style={{ height: "12px", width: "40%", marginTop: "8px" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <Skeleton style={{ height: "20px", width: "120px", marginBottom: "16px" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <Skeleton style={{ height: "48px", borderRadius: "8px" }} />
                      <Skeleton style={{ height: "48px", borderRadius: "8px" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {!loading && tab === "system" ? (
          <div className="library-section-stack" style={{ gap: "48px" }}>
            <section>
              <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Brands</h2>
                <Link className="panel-link" href="/studio/brands" prefetch={false} style={{ fontSize: "12px" }}>
                  Open brands →
                </Link>
              </div>
              <div className="library-system-grid">
                {activeBrands.map((brand) => (
                  <Link className="library-mini-card" href={`/studio/brands/${brand.id}`} key={brand.id} prefetch={false}>
                    <strong>{brand.name}</strong>
                    <p>{brand.description ?? "Brand voice, palette, and creative rules live here."}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Projects</h2>
                <Link className="panel-link" href="/studio/projects" prefetch={false} style={{ fontSize: "12px" }}>
                  Open projects →
                </Link>
              </div>
              <div className="library-list">
                {projects.slice(0, 6).map((project) => (
                  <Link className="library-list-row" href={`/studio/projects/${project.id}`} key={project.id} prefetch={false}>
                    <strong>{project.name}</strong>
                    <span>{project.stage.replaceAll("_", " ")}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Post types</h2>
              </div>
              <div className="planner-tag-row">
                {postTypes.map((postType) => (
                  <span className="planner-tag" key={postType.id}>
                    {postType.name}
                  </span>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && tab === "templates" ? (
          <section className="library-section-stack" style={{ paddingTop: "8px" }}>
            <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Templates</h2>
              <Link className="panel-link" href="/studio/templates" prefetch={false} style={{ fontSize: "12px" }}>
                Open full gallery →
              </Link>
            </div>
            {templates.length > 0 ? (
              <div className="gallery-grid library-gallery-grid">
                {templates.map((template) => (
                  <Link className="review-card" href={`/studio/templates/${template.id}`} key={template.id} prefetch={false} style={{ padding: "12px" }}>
                    <div className="creative-preview-frame" style={{ minHeight: "220px", padding: "8px" }}>
                      {template.previewUrl ? (
                        <ImagePreviewTrigger alt={template.name} mode="inline" src={template.previewUrl} title={template.name}>
                          <img alt={template.name} src={template.previewUrl} />
                        </ImagePreviewTrigger>
                      ) : (
                        <div className="thumb-fallback" />
                      )}
                    </div>
                    <div className="library-asset-meta">
                      <strong>{template.name}</strong>
                      <div className="review-tag-row">
                        <span className={`review-tag ${template.status === "approved" ? "is-approved" : "is-pending"}`}>
                          {template.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <strong>No templates yet</strong>
                <p>Approved templates show up here once the team has reusable visual systems to lean on.</p>
              </div>
            )}
          </section>
        ) : null}

        {!loading && tab === "assets" ? (
          <section className="library-section-stack" style={{ paddingTop: "8px" }}>
            <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>
                {activeBrand ? `${activeBrand.name} media` : "Media library"}
              </h2>
              {visibleMediaAssetCount > 0 ? <span className="panel-count">{visibleMediaAssetCount} items</span> : null}
            </div>

            {!activeBrand ? (
              <div className="empty-state compact">
                <strong>No active brand</strong>
                <p>Pick an active brand before managing media.</p>
              </div>
            ) : (
              <div className="library-section-stack" style={{ gap: "40px" }}>
                {mediaSections.map((section) => (
                  <section key={section.key}>
                    <div style={{ marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" }}>
                      <div>
                        <h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0, color: "var(--ink)" }}>{section.title}</h3>
                        <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "14px" }}>
                          {section.description}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {section.assets.length > 0 ? <span className="panel-count">{section.assets.length} items</span> : null}
                        {section.emptyActionLabel ? (
                          <button
                            className="button button-ghost"
                            onClick={() => {
                              setAssetKind(section.uploadKind);
                              setIsDrawerOpen(true);
                            }}
                            type="button"
                          >
                            {section.emptyActionLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {section.assets.length > 0 ? (
                      <div className="gallery-grid library-gallery-grid library-media-grid">
                        {section.assets.map((asset) => {
                          const reraRegistration = reraRegistrationByQrAssetId.get(asset.id) ?? null;
                          return (
                          <article className="review-card" key={asset.id} style={{ padding: "12px" }}>
                            <div className="creative-preview-frame" style={{ minHeight: "200px", padding: "8px" }}>
                              {asset.thumbnailUrl ?? asset.previewUrl ? (
                                <ImagePreviewTrigger
                                  alt={asset.label}
                                  badges={[section.tagLabel]}
                                  details={[
                                    { label: "Kind", value: asset.kind },
                                    { label: "Label", value: asset.label },
                                    ...(asset.projectId
                                      ? [{ label: "Project", value: projectNameById.get(asset.projectId) ?? "Project-linked" }]
                                      : []),
                                    ...(reraRegistration?.registrationNumber
                                      ? [{ label: "RERA number", value: reraRegistration.registrationNumber }]
                                      : [])
                                  ]}
                                  sections={[
                                    {
                                      title: "Library context",
                                      items: [
                                        { label: "Section", value: section.title },
                                        { label: "Description", value: section.description }
                                      ]
                                    }
                                  ]}
                                  src={asset.originalUrl ?? asset.previewUrl}
                                  subtitle={section.description}
                                  title={asset.label}
                                >
                                  <img alt={asset.label} src={asset.thumbnailUrl ?? asset.previewUrl} />
                                </ImagePreviewTrigger>
                              ) : (
                                <div className="thumb-fallback" />
                              )}
                            </div>
                            <div className="library-asset-meta">
                              <strong>{asset.label}</strong>
                              {asset.projectId ? (
                                <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "12px" }}>
                                  {projectNameById.get(asset.projectId) ?? "Project-linked"}
                                </p>
                              ) : null}
                              {reraRegistration ? (
                                <div className="library-rera-registration-card">
                                  <span>{reraRegistration.isDefault ? "Default RERA" : "RERA registration"}</span>
                                  <strong>{reraRegistration.registrationNumber ?? "QR only"}</strong>
                                  {!reraRegistration.isDefault ? (
                                    <button
                                      className="create-inline-action"
                                      onClick={() => void handleSetDefaultReraRegistration(reraRegistration.id)}
                                      type="button"
                                    >
                                      Make default
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="review-tag-row">
                                <span className="review-tag">{section.tagLabel}</span>
                              </div>
                              {(section.key === "logos" || section.key === "rera-qr") && (
                                <div className="library-asset-actions" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                                  <button
                                    className="button button-ghost"
                                    style={{ fontSize: "12px", padding: "4px 8px" }}
                                    onClick={() => {
                                      setReplacingAssetId(asset.id);
                                      setAssetKind(section.uploadKind);
                                      setLabel(asset.label);
                                      setSelectedProjectId(asset.projectId ?? "");
                                      setIsDrawerOpen(true);
                                    }}
                                    type="button"
                                  >
                                    Replace
                                  </button>
                                  <button
                                    className="button button-ghost"
                                    style={{ fontSize: "12px", padding: "4px 8px", color: "var(--destructive)" }}
                                    onClick={async () => {
                                      if (!sessionToken || !activeBrandId) return;
                                      if (!confirm("Remove this asset?")) return;
                                      await deleteBrandAsset(sessionToken, activeBrandId, asset.id);
                                      const [assetRecords, registrations] = await Promise.all([
                                        getBrandAssets(sessionToken, activeBrandId),
                                        getProjectReraRegistrations(sessionToken, activeBrandId)
                                      ]);
                                      setAssets(assetRecords);
                                      setReraRegistrations(registrations);
                                    }}
                                    type="button"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-state compact">
                        <strong>{section.emptyTitle}</strong>
                        <p>{section.emptyBody}</p>
                        {section.emptyActionLabel ? (
                          <button
                            className="button button-ghost"
                            onClick={() => {
                              setAssetKind(section.uploadKind);
                              setSelectedProjectId("");
                              setIsDrawerOpen(true);
                            }}
                            type="button"
                          >
                            {section.emptyActionLabel}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </section>
        ) : null}

      </section>

      {isDrawerOpen ? (
        <div className="drawer-overlay" onClick={() => { setIsDrawerOpen(false); setReplacingAssetId(null); setSelectedProjectId(""); setReraNumber(""); }}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>{replacingAssetId ? "Replace asset" : "Upload asset"}</h2>
              <button className="drawer-close" onClick={() => { setIsDrawerOpen(false); setReplacingAssetId(null); setSelectedProjectId(""); setReraNumber(""); }} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="stack-form" onSubmit={handleUpload}>
                <div style={{ display: "flex", flexDirection: "column", gap: "24px", paddingTop: "24px" }}>
                  <label className="field-label">
                    Asset type
                    <select
                      onChange={(event) => {
                        const nextKind = event.target.value as AssetKind;
                        setAssetKind(nextKind);
                        if (nextKind !== "rera_qr" && nextKind !== "product") {
                          setSelectedProjectId("");
                        }
                        if (nextKind !== "rera_qr") {
                          setReraNumber("");
                        }
                      }}
                      value={assetKind}
                    >
                      <option value="reference">Reference</option>
                      <option value="logo">Logo</option>
                      <option value="rera_qr">RERA QR</option>
                      <option value="product">Project image</option>
                      <option value="inspiration">Inspiration</option>
                    </select>
                  </label>

                  <label className="field-label">
                    Asset label
                    <input
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder={
                        assetKind === "logo"
                          ? "e.g. Krisala primary logo"
                          : assetKind === "rera_qr"
                            ? "e.g. Project RERA QR code"
                          : "e.g. Landmark tower exterior"
                      }
                      value={label}
                    />
                  </label>

                  {assetKind === "rera_qr" || assetKind === "product" ? (
                    <label className="field-label">
                      Project
                      <select
                        onChange={(event) => setSelectedProjectId(event.target.value)}
                        value={selectedProjectId}
                      >
                        <option value="">{assetKind === "rera_qr" ? "No project / general RERA" : "Brand-level / no project"}</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {assetKind === "rera_qr" ? (
                    <>
                      <label className="field-label">
                        RERA registration number optional
                        <input
                          onChange={(event) => setReraNumber(event.target.value)}
                          placeholder="e.g. P52100012345"
                          value={reraNumber}
                        />
                      </label>
                      <div className="library-rera-block-preview">
                        <span style={{ color: complianceSettings.reraTextColor }}>{complianceSettings.reraAuthorityLabel}</span>
                        <strong style={{ color: complianceSettings.reraTextColor }}>{reraNumber.trim() || "P5210054534"}</strong>
                        <small style={{ color: complianceSettings.reraTextColor }}>{complianceSettings.reraWebsiteUrl}</small>
                        <i aria-hidden="true" />
                      </div>
                      <p className="create-hint">
                        The editor will place this QR with the number and configured website as one compliant top-right block.
                      </p>
                    </>
                  ) : null}

                <label className="field-label">
                  Asset file
                  <div className="library-upload-drop">
                    <input accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
                  </div>
                  </label>
                </div>

                <div className="form-footer" style={{ marginTop: "auto", borderTop: "1px solid var(--line)", padding: "16px 24px", margin: "24px -24px -24px", background: "var(--paper)" }}>
                  <button className="button button-primary" disabled={!file || isPending} type="submit">
                    {pendingAction === "upload-reference" ? "Uploading…" : "Upload to library"}
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
