"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BrandAssetRecord, CreateProjectInput, ProjectDetail, ProjectRecord } from "@image-lab/contracts";
import { getBrandAssets, getProjectDetail, updateProject } from "../../../../lib/api";
import {
  detailToProjectForm,
  formStateToProjectProfile,
  type ProjectFormState
} from "../../../../lib/project-profile-form";
import { ImagePreviewTrigger } from "../../image-preview";
import { ProjectProfileFormSections } from "../project-form-sections";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";

const stageOptions: Array<{ value: CreateProjectInput["stage"]; label: string }> = [
  { value: "pre_launch", label: "Pre-launch" },
  { value: "launch", label: "Launch" },
  { value: "under_construction", label: "Under construction" },
  { value: "near_possession", label: "Near possession" },
  { value: "delivered", label: "Delivered" }
];

const statusOptions: ProjectRecord["status"][] = ["active", "archived"];

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const { sessionToken, setMessage } = useStudio();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [brandAssets, setBrandAssets] = useState<BrandAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<ProjectFormState | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "product" | "experience" | "compliance" | "faq">("overview");

  const applyFormState = useCallback((value: SetStateAction<ProjectFormState>) => {
    setFormState((current) => {
      const base = current ?? (detail ? detailToProjectForm(detail) : null);
      if (!base) {
        return current;
      }

      return typeof value === "function"
        ? (value as (state: ProjectFormState) => ProjectFormState)(base)
        : value;
    });
  }, [detail]);

  const loadProject = useCallback(async () => {
    if (!sessionToken || typeof params.projectId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getProjectDetail(sessionToken, params.projectId);
      const assetRecords = await getBrandAssets(sessionToken, record.project.brandId);
      setDetail(record);
      setFormState(detailToProjectForm(record));
      setBrandAssets(assetRecords.filter((asset) => asset.kind === "reference" || asset.kind === "product"));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [params.projectId, sessionToken]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const topbarActions = useMemo(
    () => (
      <>
        {detail ? (
          <Link className="button button-ghost" href={`/studio/deliverables?projectId=${detail.project.id}`}>
            View deliverables
          </Link>
        ) : null}
        {detail ? (
          <button
            className="button button-primary"
            disabled={isSaving}
            onClick={() => {
              setFormState(detailToProjectForm(detail));
              setIsEditorOpen(true);
            }}
            type="button"
          >
            {isSaving ? "Saving…" : "Edit project"}
          </button>
        ) : null}
      </>
    ),
    [detail, isSaving]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarMeta = useMemo(() => {
    if (!detail) {
      return null;
    }

    const profile = detail.activeProfile?.profile;

    return {
      backHref: "/studio/projects",
      backLabel: "Back to projects",
      title: detail.project.name,
      subtitle: detail.project.description ?? profile?.positioning ?? "Project detail",
      badges: (
        <>
          <span className="pill">{formatStage(detail.project.stage)}</span>
          <span className={`pill ${detail.project.status === "active" ? "pill-completed" : ""}`}>{detail.project.status}</span>
          {detail.project.city ? <span className="pill">{detail.project.city}</span> : null}
          {profile?.possessionStatus ? <span className="pill">{profile.possessionStatus}</span> : null}
        </>
      )
    };
  }, [detail]);

  useRegisterTopbarMeta(topbarMeta);

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Project detail</p>
          <h3>Loading project detail…</h3>
        </article>
      </div>
    );
  }

  if (!detail || !detail.activeProfile || error) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Project detail</p>
          <h3>Unable to load project</h3>
          <p>{error ?? "This project does not have an active profile yet."}</p>
        </article>
      </div>
    );
  }

  const { project, activeProfile } = detail;
  const profile = activeProfile.profile;
  const actualProjectImages = brandAssets.filter((asset) => profile.actualProjectImageIds.includes(asset.id));
  const sampleFlatImages = brandAssets.filter((asset) => profile.sampleFlatImageIds.includes(asset.id));

  async function handleSaveProject(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !detail || !formState) {
      return;
    }

    setIsSaving(true);

    try {
      await updateProject(sessionToken, detail.project.id, {
        name: formState.name,
        description: formState.description || undefined,
        city: formState.city || undefined,
        microLocation: formState.microLocation || undefined,
        projectType: formState.projectType || undefined,
        stage: formState.stage,
        status: formState.status,
        profile: formStateToProjectProfile(formState)
      });

      await loadProject();
      setIsEditorOpen(false);
      setMessage("Project updated.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Project update failed");
    } finally {
      setIsSaving(false);
    }
  }


  return (
    <div className="page-stack" style={{ maxWidth: "1280px", margin: "0 auto", width: "100%", paddingBottom: "100px" }}>
      <section className="page-grid">
        <main className="page-span-8 page-stack">
          {/* HERO */}
          <header className="project-hero">
            <div className="project-hero-eyebrow">
              {project.projectType ? <span className="project-eyebrow-badge">{project.projectType}</span> : null}
              <span className="project-eyebrow-text">RERA · {profile.reraNumber || "Pending"}</span>
            </div>
            <div className="project-hero-title">
              {project.name.split(' ').map((word, i, arr) => 
                i === arr.length - 1 ? <strong key={i}>{word}</strong> : <span key={i}>{word} </span>
              )}
            </div>
            <p className="project-hero-tagline">{profile.positioning || "No positioning note stored yet."}</p>
            <div className="project-hero-rule" />
          </header>

          {/* META BAR */}
          <div className="project-meta-bar" style={{ marginBottom: "24px" }}>
            <div className="project-meta-item">
              <span className="project-meta-label">Configuration</span>
              <span className="project-meta-value">{profile.configurations.length > 0 ? profile.configurations.join(" & ") : "TBD"}</span>
            </div>
            <div className="project-meta-item">
              <span className="project-meta-label">Status</span>
              <span className="project-meta-value">{formatStage(project.stage)}</span>
            </div>
            <div className="project-meta-item">
              <span className="project-meta-label">City</span>
              <span className="project-meta-value">{project.city || "TBD"}</span>
            </div>
            <div className="project-meta-item">
              <span className="project-meta-label">Micro-Location</span>
              <span className="project-meta-value">{project.microLocation || "TBD"}</span>
            </div>
            <div className="project-meta-item">
              <span className="project-meta-label">Investor Readiness</span>
              <span className="project-meta-value" style={{ color: "var(--brand)", fontWeight: 600 }}>
                {profile.investorAngle ? "High ↑" : "Standard"}
              </span>
            </div>
          </div>
          {/* TAB NAV */}
          <nav className="tab-nav high-density-tabs" style={{ marginBottom: "40px" }}>
            <button className={`tab-link ${activeTab === "overview" ? "is-active" : ""}`} onClick={() => setActiveTab("overview")} type="button"><span className="tab-num">01</span>Overview</button>
            <button className={`tab-link ${activeTab === "product" ? "is-active" : ""}`} onClick={() => setActiveTab("product")} type="button"><span className="tab-num">02</span>Product</button>
            <button className={`tab-link ${activeTab === "experience" ? "is-active" : ""}`} onClick={() => setActiveTab("experience")} type="button"><span className="tab-num">03</span>Experience</button>
            <button className={`tab-link ${activeTab === "compliance" ? "is-active" : ""}`} onClick={() => setActiveTab("compliance")} type="button"><span className="tab-num">04</span>Compliance</button>
            <button className={`tab-link ${activeTab === "faq" ? "is-active" : ""}`} onClick={() => setActiveTab("faq")} type="button"><span className="tab-num">05</span>FAQs</button>
          </nav>

      {/* PANELS */}
      {activeTab === "overview" && (
        <div className="page-stack">
          <div className="project-section-header">
            <div>
              <span className="project-section-super">Overview</span>
              <h2 className="project-section-title">Identity & Core Context</h2>
            </div>
          </div>

          <div className="project-stat-strip">
            <div className="project-stat-box">
              <span className="project-stat-num">{profile.towersCount || "—"}</span>
              <span className="project-stat-desc">Tower Blocks</span>
            </div>
            <div className="project-stat-box">
              <span className="project-stat-num">{profile.floorsCount || "—"}</span>
              <span className="project-stat-desc">Floors High</span>
            </div>
            <div className="project-stat-box">
              <span className="project-stat-num">{profile.startingPrice || "—"}</span>
              <span className="project-stat-desc">Starting From</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Project Identity</div>
              <ProjectDataField label="Legal Tagline" value={profile.tagline} isLarge />
              <ProjectDataField label="Micro-Location" value={project.microLocation} />
              <ProjectDataField label="RERA Status" value={profile.reraNumber ? `✓ Registered · ${profile.reraNumber}` : "Pending"} />
            </div>
            <div className="project-card">
              <div className="project-block-head">Audience & Positioning</div>
              <div className="project-data-field">
                <span className="project-df-label">Target Persona</span>
                <div className="project-tag-wrap" style={{ marginTop: "6px" }}>
                  {profile.audienceSegments.length > 0 
                    ? profile.audienceSegments.map(s => <span key={s} className="project-tag is-brand">{s}</span>)
                    : <span className="project-tag">Not defined</span>}
                </div>
              </div>
              <ProjectDataField label="Pricing Band" value={profile.pricingBand} />
              <ProjectDataField label="Primary Brand" value={project.brandId} />
            </div>
          </div>

          {(profile.lifestyleAngle || profile.investorAngle) && (
            <div className="project-card" style={{ marginBottom: "20px" }}>
              <div className="project-block-head">Investment Narrative</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <ProjectDataField label="Lifestyle Angle" value={profile.lifestyleAngle} />
                <ProjectDataField label="Investor Angle" value={profile.investorAngle} />
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "product" && (
        <div className="page-stack">
          <div className="project-section-header">
            <div>
              <span className="project-section-super">Product</span>
              <h2 className="project-section-title">Home Mix, Pricing & Commercials</h2>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Configurations & Sizes</div>
              <div className="project-tag-wrap" style={{ marginBottom: "20px" }}>
                {profile.configurations.length > 0 
                  ? profile.configurations.map(c => <span key={c} className="project-tag is-brand" style={{ padding: "9px 18px", fontSize: "13px" }}>{c}</span>)
                  : <span className="project-tag">No configurations stored</span>}
              </div>
              {profile.sizeRanges.length > 0 ? (
                <ul className="project-list" style={{ marginTop: "16px" }}>
                  {profile.sizeRanges.map(s => <li key={s} className="project-list-item" style={{ padding: "8px 12px", background: "transparent" }}>{s}</li>)}
                </ul>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="project-card">
                <div className="project-block-head">Structure</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <ProjectDataField label="Towers" value={profile.towersCount} isLarge />
                  <ProjectDataField label="Total Units" value={profile.totalUnits} isLarge />
                </div>
              </div>
              <div className="project-card">
                <div className="project-block-head">Pricing Core</div>
                <ProjectDataField label="Starting Price" value={profile.startingPrice} isLarge />
                <ProjectDataField label="Booking Amount" value={profile.bookingAmount} />
                <ProjectDataField label="Payment Plan" value={profile.paymentPlanSummary} />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Config-wise Pricing</div>
              {profile.priceRangeByConfig.length > 0 ? (
                <ul className="project-list">
                  {profile.priceRangeByConfig.map(p => <li key={p} className="project-list-item">{p}</li>)}
                </ul>
              ) : (
                <div style={{ background: "var(--paper-strong)", padding: "24px", borderRadius: "10px", textAlign: "center", fontStyle: "italic", color: "var(--ink-soft)", fontSize: "12px" }}>Pricing not published yet</div>
              )}
            </div>
            <div className="project-card">
              <div className="project-block-head">Active Offers</div>
              {profile.currentOffers.length > 0 ? (
                <ul className="project-list">
                  {profile.currentOffers.map(o => <li key={o} className="project-list-item is-success">{o}</li>)}
                </ul>
              ) : (
                <div style={{ background: "var(--paper-strong)", padding: "24px", borderRadius: "10px", textAlign: "center", fontStyle: "italic", color: "var(--ink-soft)", fontSize: "12px" }}>No active offers at this time</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "experience" && (
        <div className="page-stack">
          <div className="project-section-header">
            <div>
              <span className="project-section-super">Experience</span>
              <h2 className="project-section-title">Living & Accessibility</h2>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Hero Amenities</div>
              <div className="project-tag-wrap">
                {profile.heroAmenities.length > 0
                  ? profile.heroAmenities.map(a => <span key={a} className="project-tag is-brand">{a}</span>)
                  : <span className="project-tag">No hero amenities specified</span>}
              </div>
            </div>
            <div className="project-card">
              <div className="project-block-head">Connectivity Story</div>
              {profile.connectivityPoints.length > 0 ? (
                <ul className="project-list" style={{ gap: "4px" }}>
                  {profile.connectivityPoints.map(c => <li key={c} className="project-list-item" style={{ background: "transparent", border: "none", padding: "4px 0", borderLeft: "2px solid var(--brand)", paddingLeft: "12px", borderRadius: 0 }}>{c}</li>)}
                </ul>
              ) : <span className="project-info-text">No connectivity points listed</span>}
            </div>
          </div>

          <div className="project-card" style={{ marginTop: "20px" }}>
            <div className="project-block-head">All Amenities</div>
            <div className="project-tag-wrap">
              {profile.amenities.length > 0
                ? profile.amenities.map(a => <span key={a} className="project-tag">{a}</span>)
                : <span className="project-tag">No amenities loaded</span>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Travel Times</div>
              <ul className="project-list">
                {profile.travelTimes.map(t => <li key={t} className="project-list-item">{t}</li>)}
              </ul>
            </div>
            <div className="project-card">
              <div className="project-block-head">Location Advantages</div>
              <ul className="project-list">
                {profile.locationAdvantages.map(l => <li key={l} className="project-list-item">{l}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === "compliance" && (
        <div className="page-stack">
          <div className="project-section-header">
            <div>
              <span className="project-section-super">Compliance & Truth</span>
              <h2 className="project-section-title">Progress & Guidelines</h2>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Current Status</div>
              <ProjectDataField label="Construction Phase" value={profile.constructionStatus} />
              <ProjectDataField label="Latest Update" value={profile.latestUpdate} />
              <ProjectDataField label="Legal Summary" value={profile.approvalsSummary} />
              <ProjectDataField label="Posession Window" value={profile.completionWindow} />
            </div>
            <div className="project-card">
              <div className="project-block-head">Milestone History</div>
              <ul className="project-list">
                {profile.milestoneHistory.map(m => (
                  <li key={m} className="project-list-item" style={{ borderLeft: "3px solid var(--brand)", borderRadius: "4px" }}>{m}</li>
                ))}
              </ul>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
            <div className="project-card">
              <div className="project-block-head">Approved Claims</div>
              {profile.approvedClaims.length > 0 ? (
                <ul className="project-list">
                  {profile.approvedClaims.map(c => <li key={c} className="project-list-item is-success">✓ {c}</li>)}
                </ul>
              ) : <div style={{ fontSize: "12px", color: "var(--ink-soft)" }}>No claims formally approved.</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="project-card">
                <div className="project-block-head">Blocked Claims</div>
                <div className="project-tag-wrap">
                  {profile.bannedClaims.length > 0 
                    ? profile.bannedClaims.map(b => <span key={b} className="project-tag is-danger">✕ {b}</span>)
                    : <span className="project-tag">No blocked claims listed</span>}
                </div>
              </div>
              <div className="project-card">
                <div className="project-block-head">Key Objections to Address</div>
                <ul className="project-list">
                  {profile.keyObjections.map(o => <li key={o} className="project-list-item">{o}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "faq" && (
        <div className="page-stack">
          <div className="project-section-header">
            <div>
              <span className="project-section-super">Assistance</span>
              <h2 className="project-section-title">Common Inquiries</h2>
            </div>
          </div>

          {profile.faqs.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "16px" }}>
              {profile.faqs.map((faq) => (
                <div className="project-card" key={`${faq.question}-${faq.answer}`} style={{ padding: "24px" }}>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink)", marginBottom: "10px", lineHeight: 1.35 }}>{faq.question}</p>
                  <p style={{ fontSize: "13px", color: "var(--ink-soft)", lineHeight: 1.75 }}>{faq.answer}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="project-card" style={{ textAlign: "center", padding: "40px" }}>
              <p className="field-hint">No FAQs stored yet.</p>
            </div>
          )}
        </div>
      )}
        </main>

        {/* RIGHT PANEL FOR IMAGES */}
        <aside className="page-span-4 page-stack" style={{ borderLeft: "1px solid var(--line)", paddingLeft: "32px" }}>
          <section className="snapshot-sidebar" style={{ position: "sticky", top: "100px" }}>
            <div className="project-block-head" style={{ marginBottom: "24px", paddingBottom: "10px", borderBottom: "none" }}>Project Assets</div>
            
            <ImageGalleryCard title="Actual project images" assets={actualProjectImages} emptyLabel="No image linked" />
            <ImageGalleryCard title="Sample flat images" assets={sampleFlatImages} emptyLabel="No image linked" />
          </section>
        </aside>
      </section>

      {isEditorOpen && formState ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <h2>Edit project</h2>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="drawer-body">
              <form className="planner-form" onSubmit={handleSaveProject}>
                <div className="planner-form-section">
                  <p className="field-group-label">Identity</p>
                  <div className="planner-form-grid">
                    <label className="field-label">
                      Project name
                      <input required value={formState.name} onChange={(event) => updateForm(setFormState, "name", event.target.value)} />
                    </label>
                    <label className="field-label">
                      Stage
                      <select value={formState.stage} onChange={(event) => updateForm(setFormState, "stage", event.target.value as CreateProjectInput["stage"])}>
                        {stageOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Status
                      <select value={formState.status} onChange={(event) => updateForm(setFormState, "status", event.target.value as ProjectRecord["status"])}>
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      City
                      <input value={formState.city} onChange={(event) => updateForm(setFormState, "city", event.target.value)} />
                    </label>
                    <label className="field-label">
                      Micro-location
                      <input value={formState.microLocation} onChange={(event) => updateForm(setFormState, "microLocation", event.target.value)} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Description
                      <textarea value={formState.description} onChange={(event) => updateForm(setFormState, "description", event.target.value)} />
                    </label>
                    <label className="field-label planner-form-span-2">
                      Project type
                      <input value={formState.projectType} onChange={(event) => updateForm(setFormState, "projectType", event.target.value)} />
                    </label>
                  </div>
                </div>

                <ProjectProfileFormSections assets={brandAssets} form={formState} loadingAssets={false} setForm={applyFormState} />

                <div className="planner-form-actions">
                  <button className="button button-ghost" type="button" onClick={() => setIsEditorOpen(false)}>
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save project"}
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

function ImageGalleryCard({
  title,
  assets,
  emptyLabel
}: {
  title: string;
  assets: BrandAssetRecord[];
  emptyLabel: string;
}) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>{title}</p>
      {assets.length > 0 ? (
        <div style={{ display: "grid", gap: "16px" }}>
          {assets.map((asset) => (
            <div key={asset.id} style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid var(--line)", background: "var(--paper-strong)" }}>
              {asset.previewUrl ? (
                <ImagePreviewTrigger alt={asset.label} src={asset.previewUrl} title={asset.label}>
                  <img alt={asset.label} src={asset.previewUrl} style={{ width: "100%", height: "auto", display: "block", aspectRatio: "4/3", objectFit: "cover" }} />
                </ImagePreviewTrigger>
              ) : (
                <div style={{ padding: "32px", textAlign: "center", color: "var(--ink-soft)", fontSize: "12px" }}>{asset.label}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "12px", color: "var(--ink-soft)", fontStyle: "italic" }}>{emptyLabel}</p>
      )}
    </div>
  );
}

function updateForm<K extends keyof ProjectFormState>(
  setForm: Dispatch<SetStateAction<ProjectFormState | null>>,
  key: K,
  value: ProjectFormState[K]
) {
  setForm((state) => (state ? { ...state, [key]: value } : state));
}

function formatStage(value: ProjectRecord["stage"]) {
  return value.replaceAll("_", " ");
}

function ProjectDataField({ label, value, isLarge }: { label: string; value: string | null | undefined; isLarge?: boolean }) {
  return (
    <div className="project-data-field">
      <span className="project-df-label">{label}</span>
      <div className={`project-df-value ${isLarge ? "is-large" : ""}`}>{value || "—"}</div>
    </div>
  );
}
