"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  AssetKind,
  BrandDetail,
  BrandAssetRecord,
  ProjectReraRegistrationRecord,
  ProjectRecord
} from "@image-lab/contracts";
import {
  type CreativeV3VisualTemplate,
  getBrandDetail,
  getProjects,
  getProjectReraRegistrations,
  getBrandAssets,
  deleteBrandAsset,
  getCreativeV3VisualTemplates,
  setDefaultProjectReraRegistration
} from "../../../../lib/api";
import { ImagePreviewTrigger } from "../../image-preview";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";
import { Skeleton } from "../../skeleton";

const BRAND_KIT_TABS = [
  { id: "profile", label: "Profile" },
  { id: "logos", label: "Logos" },
  { id: "references", label: "References" },
  { id: "rules", label: "Visual Rules" },
  { id: "visualV3", label: "Templates" },
  { id: "compliance", label: "Compliance" }
] as const;

type BrandKitTab = (typeof BRAND_KIT_TABS)[number]["id"];

type LoadedTabsState = {
  profile: boolean;
  assets: boolean;
  visualV3: boolean;
};

type ReferenceGroupKey =
  | "reference-exteriors"
  | "reference-interiors"
  | "reference-amenities"
  | "reference-location"
  | "reference-other";

const DEFAULT_LOADED_TABS: LoadedTabsState = {
  profile: false,
  assets: false,
  visualV3: false
};

export default function BrandKitPage() {
  const params = useParams<{ brandId: string }>();
  const routeBrandId = typeof params.brandId === "string" ? params.brandId : "";
  const { sessionToken, activeBrand: contextActiveBrand, activeBrandId, bootstrap, pendingAction, isPending, uploadBrandAssetFile, setActiveBrandId } =
    useStudio();
  const [tab, setTab] = useState<BrandKitTab>("profile");
  const [brandDetail, setBrandDetail] = useState<BrandDetail | null>(null);
  const [assets, setAssets] = useState<BrandAssetRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [reraRegistrations, setReraRegistrations] = useState<ProjectReraRegistrationRecord[]>([]);
  const [visualV3Templates, setVisualV3Templates] = useState<CreativeV3VisualTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingV3, setLoadingV3] = useState(false);
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
  const brands = bootstrap?.brands ?? [];
  const activeBrand = brands.find((brand) => brand.id === routeBrandId) ?? (contextActiveBrand?.id === routeBrandId ? contextActiveBrand : null);

  useEffect(() => {
    if (routeBrandId && activeBrandId !== routeBrandId) {
      setActiveBrandId(routeBrandId);
    }
  }, [activeBrandId, routeBrandId, setActiveBrandId]);

  const topbarActions = useMemo(
    () =>
      tab === "logos" || tab === "references" || tab === "compliance" ? (
        <button
          className="button button-primary"
          disabled={!activeBrand || pendingAction === "upload-reference"}
          onClick={() => {
            setAssetKind(tab === "logos" ? "logo" : tab === "compliance" ? "rera_qr" : "reference");
            setSelectedProjectId("");
            setReraNumber("");
            setIsDrawerOpen(true);
          }}
          title={!activeBrand ? "Set an active brand first" : ""}
          type="button"
        >
          {pendingAction === "upload-reference" ? "Uploading…" : tab === "logos" ? "Add Logo" : tab === "references" ? "Add Reference" : "Add QR"}
        </button>
      ) : null,
    [activeBrand, pendingAction, tab]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarMeta = useMemo(
    () => ({
      backHref: "/studio/brand-kit",
      backLabel: "Back to Brand Kits",
      title: "Brand Kit",
      subtitle: "Brand profile, projects, media, rules, templates, and compliance."
    }),
    []
  );

  useRegisterTopbarMeta(topbarMeta);

  useEffect(() => {
    setTab("profile");
    setBrandDetail(null);
    setAssets([]);
    setProjects([]);
    setReraRegistrations([]);
    setVisualV3Templates([]);
    setLoadedTabs(DEFAULT_LOADED_TABS);
  }, [routeBrandId]);

  useEffect(() => {
    if (!sessionToken || !routeBrandId || loadedTabs.profile || (!isDrawerOpen && tab !== "profile")) {
      return;
    }

    const token = sessionToken;
    const brandId = routeBrandId;
    let cancelled = false;

    async function loadProjectContext() {
      try {
        const [projectRecords, registrations] = await Promise.all([
          getProjects(token, { brandId }),
          getProjectReraRegistrations(token, brandId)
        ]);

        if (cancelled) return;

        setProjects(projectRecords);
        setReraRegistrations(registrations);
        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load brand context");
        }
      }
    }

    void loadProjectContext();

    return () => {
      cancelled = true;
    };
  }, [routeBrandId, isDrawerOpen, loadedTabs.profile, sessionToken, tab]);

  useEffect(() => {
    if (!sessionToken || !routeBrandId || loadedTabs.assets) {
      return;
    }

    const token = sessionToken;
    const brandId = routeBrandId;
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
  }, [routeBrandId, loadedTabs.assets, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }

    const token = sessionToken;
    let cancelled = false;

    async function loadLibraryTab() {
      try {
        if (tab === "logos" || tab === "references") {
          setLoading(false);
          return;
        }

        if (((tab === "profile" || tab === "rules" || tab === "compliance") && loadedTabs.profile) || (tab === "visualV3" && loadedTabs.visualV3)) {
          setLoading(false);
          return;
        }

        setLoading(true);

        if (tab === "profile" || tab === "rules" || tab === "compliance") {
          if (!routeBrandId) {
            setBrandDetail(null);
            setLoadedTabs((current) => ({ ...current, profile: true }));
            return;
          }

          const [detailRecord, projectRecords, registrations] = await Promise.all([
            getBrandDetail(token, routeBrandId),
            getProjects(token, { brandId: routeBrandId }),
            getProjectReraRegistrations(token, routeBrandId)
          ]);

          if (cancelled) return;

          setBrandDetail(detailRecord);
          setProjects(projectRecords);
          setReraRegistrations(registrations);
          setLoadedTabs((current) => ({ ...current, profile: true }));
        }

        if (tab === "visualV3") {
          setLoadingV3(true);
          const v3TemplateRecords = await getCreativeV3VisualTemplates(token, {
            brandId: routeBrandId,
            projectId: null,
            postTypeId: null,
            format: null
          });
          if (cancelled) return;
          setVisualV3Templates(v3TemplateRecords);
          setLoadedTabs((current) => ({ ...current, visualV3: true }));
          setLoadingV3(false);
        }

        setError(null);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load Brand Kit");
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
  }, [routeBrandId, loadedTabs.profile, loadedTabs.visualV3, sessionToken, tab]);

  const referenceAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "reference"),
    [assets]
  );
  const logoAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "logo"),
    [assets]
  );
  const reraQrAssets = useMemo(
    () => assets.filter((asset) => asset.kind === "rera_qr"),
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
        title: "Brand references",
        description: "High-signal brand references that guide visual language and composition.",
        emptyTitle: "No references yet",
        emptyBody: "Upload high-signal brand references so templates and creation stay in the right visual language.",
        emptyActionLabel: "Upload reference",
        uploadKind: "reference" as AssetKind,
        tagLabel: "Reference",
        assets: referenceAssets
      }
    ],
    [logoAssets, referenceAssets, reraQrAssets]
  );
  const referenceMediaSections = useMemo(() => {
    const configs: Array<{
      key: ReferenceGroupKey;
      title: string;
      description: string;
      emptyTitle: string;
      emptyBody: string;
    }> = [
      {
        key: "reference-exteriors",
        title: "Exteriors",
        description: "Towers, facades, entrances, aerials, podiums, and site-level project views.",
        emptyTitle: "No exterior references",
        emptyBody: "Exterior, facade, tower, entrance, aerial, and masterplan references will appear here."
      },
      {
        key: "reference-interiors",
        title: "Interiors",
        description: "Sample flats, lobbies, living areas, bedrooms, kitchens, and interior experience references.",
        emptyTitle: "No interior references",
        emptyBody: "Interior, sample flat, lobby, bedroom, living, and kitchen references will appear here."
      },
      {
        key: "reference-amenities",
        title: "Amenities",
        description: "Pools, gyms, decks, lounges, play areas, clubhouses, gardens, and lifestyle amenities.",
        emptyTitle: "No amenity references",
        emptyBody: "Amenity references such as pool, gym, yoga deck, clubhouse, and gardens will appear here."
      },
      {
        key: "reference-location",
        title: "Location",
        description: "Maps, connectivity, nearby landmarks, roads, transport, and neighbourhood context.",
        emptyTitle: "No location references",
        emptyBody: "Location, connectivity, landmark, map, and neighbourhood references will appear here."
      },
      {
        key: "reference-other",
        title: "Other references",
        description: "Reference assets that are useful but do not fit a specific scene bucket yet.",
        emptyTitle: "No other references",
        emptyBody: "Unclassified reference assets will appear here."
      }
    ];
    return configs
      .map((config) => ({
        ...config,
        emptyActionLabel: "Upload reference",
        uploadKind: "reference" as AssetKind,
        tagLabel: "Reference",
        assets: referenceAssets.filter((asset) => classifyReferenceAsset(asset) === config.key)
      }))
      .filter((section) => section.assets.length > 0 || referenceAssets.length === 0);
  }, [referenceAssets]);
  const activeMediaSections = useMemo(() => {
    if (tab === "logos") {
      return mediaSections.filter((section) => section.key === "logos");
    }
    if (tab === "references") {
      return referenceMediaSections;
    }
    if (tab === "compliance") {
      return mediaSections.filter((section) => section.key === "rera-qr");
    }
    return mediaSections;
  }, [mediaSections, referenceMediaSections, tab]);
  const sectionLinks = useMemo(() => {
    if (tab === "references") {
      return referenceMediaSections.map((section) => ({
        id: `brand-kit-${section.key}-assets`,
        label: section.title,
        count: section.assets.length
      }));
    }
    if (tab === "compliance") {
      return [
        { id: "brand-kit-compliance-rules", label: "Compliance rules" },
        { id: "brand-kit-rera-qr-assets", label: "RERA QR assets", count: reraQrAssets.length }
      ];
    }
    return [];
  }, [referenceMediaSections, reraQrAssets.length, tab]);

  function scrollToBrandKitSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (replacingAssetId) {
      if (sessionToken && routeBrandId) {
        await deleteBrandAsset(sessionToken, routeBrandId, replacingAssetId);
      }
    }

    const success = await uploadBrandAssetFile(
      file,
      label || file.name,
      assetKind,
      assetKind === "rera_qr" ? selectedProjectId || null : null,
      assetKind === "rera_qr" && reraNumber.trim() ? { reraNumber: reraNumber.trim() } : undefined
    );
    if (success) {
      if (sessionToken && routeBrandId) {
        const token = sessionToken;
        const brandId = routeBrandId;
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
    if (!sessionToken || !routeBrandId) return;
    const updated = await setDefaultProjectReraRegistration(sessionToken, routeBrandId, registrationId);
    setReraRegistrations((current) =>
      current.map((registration) =>
        registration.projectId === updated.projectId
          ? { ...registration, isDefault: registration.id === updated.id }
          : registration
      )
    );
  }

  const profile = brandDetail?.activeProfile?.profile ?? null;
  const brandLogoAsset = logoAssets.find((asset) => !asset.projectId) ?? null;
  const activePalette = profile?.palette ?? {
    primary: "#0f2a24",
    secondary: "#688f71",
    accent: "#d9c0a8",
    neutrals: ["#f2eee7", "#1e1e1e"]
  };
  const sectionRail = sectionLinks.length > 0 ? (
    <aside className="library-media-sidebar brand-kit-section-rail">
      <nav className="library-media-nav" aria-label={`${BRAND_KIT_TABS.find((item) => item.id === tab)?.label ?? "Brand Kit"} sections`}>
        {sectionLinks.map((section) => (
          <button
            className="library-media-nav-item"
            key={section.id}
            onClick={() => scrollToBrandKitSection(section.id)}
            type="button"
          >
            <span>{section.label}</span>
            {"count" in section ? <span className="nav-item-count">{section.count}</span> : null}
          </button>
        ))}
      </nav>
    </aside>
  ) : null;

  return (
    <div className="page-stack brand-kit-page">


      {error ? (
        <div className="status-banner">
          <span>{error}</span>
        </div>
      ) : null}

      {activeBrand ? (
        <section className="brand-kit-detail-shell">
          <header className="brand-kit-detail-header">
            <div className="brand-kit-detail-mark" style={{ background: activePalette.primary }}>
              {brandLogoAsset?.thumbnailUrl ?? brandLogoAsset?.previewUrl ? (
                <img alt={brandLogoAsset.label} src={brandLogoAsset.thumbnailUrl ?? brandLogoAsset.previewUrl} />
              ) : (
                <span>{activeBrand.name}</span>
              )}
            </div>
            <div className="brand-kit-detail-title">
              <div className="brand-kit-title-row">
                <h2>{activeBrand.name}</h2>
                <Link className="panel-link" href={`/studio/brands/${activeBrand.id}`} prefetch={false}>Edit</Link>
              </div>
              <p>{activeBrand.description ?? profile?.identity.positioning ?? "Reusable brand identity for consistent real estate creatives."}</p>
              <div className="brand-kit-meta-row">
                <span>{assets.length} Assets</span>
                <span>{visualV3Templates.length} Templates</span>
                <span>Profile v{brandDetail?.activeProfile?.versionNumber ?? 1}</span>
              </div>
            </div>
          </header>

          <nav className="brand-kit-inline-tabs" aria-label="Brand Kit sections">
            {BRAND_KIT_TABS.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "is-active" : ""}
                onClick={() => setTab(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </section>
      ) : null}

      <section className="library-tabs-panel">
        {loading ? (
          <div className="library-section-stack">
            {tab === "logos" || tab === "references" || tab === "compliance" || tab === "visualV3" ? (
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

        {!loading && tab === "profile" ? (
          <div className="library-media-layout brand-kit-section-layout">
            {sectionRail}
            <div className="library-section-stack" style={{ gap: "48px" }}>
            {!activeBrand || !profile ? (
              <div className="empty-state compact">
                <strong>No active brand profile</strong>
                <p>Select or create a brand before building its reusable brand kit.</p>
              </div>
            ) : (
              <>
                <section id="brand-kit-profile-summary" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Brand profile</h2>
                    <Link className="panel-link" href={`/studio/brands/${activeBrand.id}`} prefetch={false} style={{ fontSize: "12px" }}>
                      Edit profile →
                    </Link>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>{activeBrand.name}</strong>
                      <p>{activeBrand.description ?? "Reusable identity, voice, visual rules, and compliance for the active brand."}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>{assets.length} media assets</strong>
                      <p>{logoAssets.length} logos, {referenceAssets.length} references, {reraQrAssets.length} compliance assets.</p>
                    </article>
                  </div>
                </section>

                <section id="brand-kit-profile-projects" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Projects in this kit</h2>
                  </div>
                  {projects.length > 0 ? (
                    <div className="brand-kit-project-grid">
                      {projects.map((project) => (
                        <Link className="brand-kit-project-card" href={`/studio/projects/${project.id}`} key={project.id} prefetch={false}>
                          <strong>{project.name}</strong>
                          <p>{project.description ?? project.microLocation ?? project.city ?? "Project truth and media"}</p>
                          <div>
                            <span>{project.stage.replaceAll("_", " ")}</span>
                            {project.city ? <span>{project.city}</span> : null}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact">
                      <strong>No projects linked yet</strong>
                      <p>Create projects under this brand to make project-specific facts and media available during creation.</p>
                    </div>
                  )}
                </section>

                <section id="brand-kit-profile-identity" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Identity and voice</h2>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>Positioning</strong>
                      <p>{profile.identity.positioning || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Brand promise</strong>
                      <p>{profile.identity.promise || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Audience</strong>
                      <p>{profile.identity.audienceSummary || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Voice</strong>
                      <p>{profile.voice.summary || "Not defined"}</p>
                    </article>
                  </div>
                  <div className="planner-tag-row" style={{ marginTop: "18px" }}>
                    {profile.voice.adjectives.map((item) => (
                      <span className="planner-tag" key={item}>{item}</span>
                    ))}
                  </div>
                </section>

                <section id="brand-kit-profile-visual" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Visual system</h2>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>Style</strong>
                      <p>{profile.styleDescriptors.join(", ") || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Typography</strong>
                      <p>{profile.visualSystem.typographyMood || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Fonts</strong>
                      <p>{[profile.visualSystem.headlineFontFamily, profile.visualSystem.bodyFontFamily].filter(Boolean).join(" / ") || "Not defined"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Image treatment</strong>
                      <p>{profile.visualSystem.imageTreatment.join(", ") || "Not defined"}</p>
                    </article>
                  </div>
                  <div className="color-row" style={{ marginTop: "18px" }}>
                    {(["primary", "secondary", "accent"] as const).map((key) => (
                      <div className="color-field" key={key}>
                        <div className="color-preview" style={{ background: profile.palette[key] }} />
                        <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <strong className="mono-field">{profile.palette[key]}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section id="brand-kit-profile-compliance" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Rules and compliance</h2>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>Do rules</strong>
                      <p>{profile.doRules.join(", ") || "No do rules stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Don't rules</strong>
                      <p>{profile.dontRules.join(", ") || "No don't rules stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Banned patterns</strong>
                      <p>{profile.bannedPatterns.join(", ") || "No banned patterns stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Review checks</strong>
                      <p>{profile.compliance.reviewChecks.join(", ") || "No review checks stored"}</p>
                    </article>
                  </div>
                </section>
              </>
            )}
            </div>
          </div>
        ) : null}

        {!loading && tab === "rules" ? (
          <div className="library-media-layout brand-kit-section-layout">
            {sectionRail}
            <div className="library-section-stack" style={{ gap: "48px" }}>
            {!activeBrand || !profile ? (
              <div className="empty-state compact">
                <strong>No active brand profile</strong>
                <p>Select or create a brand before reviewing visual rules.</p>
              </div>
            ) : (
              <>
                <section id="brand-kit-rules-visual" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Visual rules</h2>
                    <Link className="panel-link" href={`/studio/brands/${activeBrand.id}`} prefetch={false} style={{ fontSize: "12px" }}>
                      Edit rules →
                    </Link>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>Typography notes</strong>
                      <p>{profile.visualSystem.typographyNotes.join(", ") || "No typography notes stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Composition principles</strong>
                      <p>{profile.visualSystem.compositionPrinciples.join(", ") || "No composition principles stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Image treatment</strong>
                      <p>{profile.visualSystem.imageTreatment.join(", ") || "No image treatment rules stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Density and realism</strong>
                      <p>{profile.visualSystem.textDensity} text density, {profile.visualSystem.realismLevel.replaceAll("_", " ")} realism.</p>
                    </article>
                  </div>
                </section>

                <section id="brand-kit-rules-use-avoid" className="brand-kit-scroll-section">
                  <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
                    <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Use and avoid</h2>
                  </div>
                  <div className="library-system-grid">
                    <article className="library-mini-card">
                      <strong>Do</strong>
                      <p>{profile.doRules.join(", ") || "No do rules stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Don't</strong>
                      <p>{profile.dontRules.join(", ") || "No don't rules stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Banned patterns</strong>
                      <p>{profile.bannedPatterns.join(", ") || "No banned patterns stored"}</p>
                    </article>
                    <article className="library-mini-card">
                      <strong>Anti-references</strong>
                      <p>{profile.referenceCanon.antiReferenceNotes.join(", ") || "No anti-reference notes stored"}</p>
                    </article>
                  </div>
                </section>
              </>
            )}
            </div>
          </div>
        ) : null}

        {!loadingV3 && tab === "visualV3" ? (
          <div className="library-media-layout brand-kit-section-layout">
            {sectionRail}
            <section id="brand-kit-template-library" className="library-section-stack brand-kit-scroll-section" style={{ paddingTop: "8px" }}>
              <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>Visual Templates</h2>
              </div>
              {visualV3Templates.length > 0 ? (
                <div className="gallery-grid library-gallery-grid">
                  {visualV3Templates.map((template) => (
                    <div className="review-card" key={template.template_id} style={{ padding: "12px" }}>
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
                          <span className="review-tag is-approved">visual</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">
                  <strong>No visual templates yet</strong>
                  <p>Visual templates for this brand will appear here once available.</p>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {!loading && (tab === "logos" || tab === "references" || tab === "compliance") ? (
          <div className={`library-media-layout${sectionRail ? "" : " brand-kit-no-rail-layout"}`}>
            {sectionRail}

            <section className="library-media-content">


              {!activeBrand ? (
                <div className="empty-state compact">
                  <strong>No active brand</strong>
                  <p>Pick an active brand before managing media.</p>
                </div>
              ) : (
                <div className="library-sections-stack">
                  {tab === "compliance" && profile ? (
                    <section id="brand-kit-compliance-rules" className="library-media-section brand-kit-scroll-section">
                      <header className="library-section-header">
                        <div className="section-header-titles">
                          <h3>Compliance rules</h3>
                          <p>Brand-level claim restrictions and review checks used before content is approved.</p>
                        </div>
                        <Link className="button button-ghost" href={`/studio/brands/${activeBrand.id}`} prefetch={false}>
                          Edit
                        </Link>
                      </header>
                      <div className="library-system-grid">
                        <article className="library-mini-card">
                          <strong>Banned claims</strong>
                          <p>{profile.compliance.bannedClaims.join(", ") || "No banned brand claims stored"}</p>
                        </article>
                        <article className="library-mini-card">
                          <strong>Review checks</strong>
                          <p>{profile.compliance.reviewChecks.join(", ") || "No review checks stored"}</p>
                        </article>
                        <article className="library-mini-card">
                          <strong>Reference usage notes</strong>
                          <p>{profile.referenceCanon.usageNotes.join(", ") || "No reference usage notes stored"}</p>
                        </article>
                      </div>
                    </section>
                  ) : null}
                  {activeMediaSections.map((section) => (
                    <section
                      id={`brand-kit-${section.key}-assets`}
                      key={section.key}
                      className="library-media-section brand-kit-scroll-section"
                    >
                      <header className="library-section-header">
                        <div className="section-header-titles">
                          <h3>{section.title}</h3>
                          <p>{section.description}</p>
                        </div>
                        {section.emptyActionLabel ? (
                          <button
                            className="button button-ghost"
                            onClick={() => {
                              setAssetKind(section.uploadKind);
                              setIsDrawerOpen(true);
                            }}
                            type="button"
                          >
                            Upload
                          </button>
                        ) : null}
                      </header>

                      {section.assets.length > 0 ? (
                        <div className="library-asset-grid">
                          {section.assets.map((asset) => {
                            const reraRegistration = reraRegistrationByQrAssetId.get(asset.id) ?? null;
                            return (
                              <article className="library-asset-card" key={asset.id}>
                                <div className="asset-card-visual">
                                  {asset.thumbnailUrl ?? asset.previewUrl ? (
                                    <ImagePreviewTrigger
                                      alt={asset.label}
                                      badges={[section.tagLabel]}
                                      src={asset.originalUrl ?? asset.previewUrl}
                                      title={asset.label}
                                    >
                                      <img alt={asset.label} src={asset.thumbnailUrl ?? asset.previewUrl} />
                                    </ImagePreviewTrigger>
                                  ) : (
                                    <div className="thumb-fallback" />
                                  )}
                                  
                                  <div className="asset-card-actions">
                                    {(section.key === "logos" || section.key === "rera-qr") && (
                                      <button
                                        className="asset-action-btn"
                                        onClick={() => {
                                          setReplacingAssetId(asset.id);
                                          setAssetKind(section.uploadKind);
                                          setLabel(asset.label);
                                          setSelectedProjectId(asset.projectId ?? "");
                                          setIsDrawerOpen(true);
                                        }}
                                        title="Replace"
                                        type="button"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                                      </button>
                                    )}
                                    <button
                                      className="asset-action-btn is-danger"
                                      onClick={async () => {
                                        if (!sessionToken || !routeBrandId) return;
                                        if (!confirm("Remove this asset?")) return;
                                        await deleteBrandAsset(sessionToken, routeBrandId, asset.id);
                                        const [assetRecords, registrations] = await Promise.all([
                                          getBrandAssets(sessionToken, routeBrandId),
                                          getProjectReraRegistrations(sessionToken, routeBrandId)
                                        ]);
                                        setAssets(assetRecords);
                                        setReraRegistrations(registrations);
                                      }}
                                      title="Remove"
                                      type="button"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                    </button>
                                  </div>
                                </div>
                                <div className="asset-card-footer">
                                  <strong>{asset.label}</strong>
                                  {asset.projectId && (
                                    <span>{projectNameById.get(asset.projectId) ?? "Project-linked"}</span>
                                  )}
                                  {reraRegistration && (
                                    <div className="asset-rera-pill" title={reraRegistration.isDefault ? "Default RERA registration" : "RERA registration"}>
                                      <span>{reraRegistration.registrationNumber ?? "QR"}</span>
                                      {!reraRegistration.isDefault && (
                                        <button onClick={() => void handleSetDefaultReraRegistration(reraRegistration.id)} type="button">Set Default</button>
                                      )}
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
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </section>
          </div>
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

                  {assetKind === "rera_qr" ? (
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
                    {pendingAction === "upload-reference" ? "Uploading…" : "Upload asset"}
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

function classifyReferenceAsset(asset: BrandAssetRecord): ReferenceGroupKey {
  const metadata = assetMetadataRecord(asset);
  const structuredTokens = new Set(
    [
      asset.sceneType,
      asset.visualUse,
      stringMetadata(metadata, "subjectType"),
      stringMetadata(metadata, "assetClass"),
      stringMetadata(metadata, "viewType"),
      stringMetadata(metadata, "usageIntent")
    ]
      .map(normalizeReferenceToken)
      .filter((value): value is string => Boolean(value))
  );

  if (["project_exterior", "exterior", "facade", "elevation", "aerial", "site", "masterplan"].some((token) => structuredTokens.has(token))) {
    return "reference-exteriors";
  }
  if (["interior", "sample_flat", "sample flat"].some((token) => structuredTokens.has(token))) {
    return "reference-interiors";
  }
  if (["amenity", "amenity_anchor"].some((token) => structuredTokens.has(token))) {
    return "reference-amenities";
  }
  if (["location", "location_map", "map", "connectivity"].some((token) => structuredTokens.has(token))) {
    return "reference-location";
  }

  const haystack = searchableAssetText(asset);
  if (/\b(exterior|facade|façade|tower|building|podium|entrance|gate|aerial|masterplan|skyline)\b/.test(haystack)) {
    return "reference-exteriors";
  }
  if (/\b(interior|sample flat|flat|living|bedroom|kitchen|lobby|show apartment|bathroom|washroom)\b/.test(haystack)) {
    return "reference-interiors";
  }
  if (/\b(amenity|pool|swimming|gym|yoga|court|basketball|cricket|clubhouse|deck|lawn|garden|fitness|play area|banquet|cinema|games room)\b/.test(haystack)) {
    return "reference-amenities";
  }
  if (/\b(location|map|landmark|connectivity|nearby|transport|road|railway|mall|hospital|school|metro)\b/.test(haystack)) {
    return "reference-location";
  }
  return "reference-other";
}

function assetMetadataRecord(asset: BrandAssetRecord) {
  return asset.metadataJson && typeof asset.metadataJson === "object" && !Array.isArray(asset.metadataJson)
    ? asset.metadataJson as Record<string, unknown>
    : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function normalizeReferenceToken(value: string | null | undefined) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/façade/g, "facade")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function searchableAssetText(asset: BrandAssetRecord) {
  const parts: string[] = [];
  collectSearchText(asset.label, parts);
  collectSearchText(asset.fileName, parts);
  collectSearchText(asset.assetDescription, parts);
  collectSearchText(asset.sceneType, parts);
  collectSearchText(asset.visualUse, parts);
  collectSearchText(asset.metadataJson, parts);
  return parts.join(" ").toLowerCase();
}

function collectSearchText(value: unknown, parts: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchText(item, parts));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectSearchText(item, parts));
  }
}
