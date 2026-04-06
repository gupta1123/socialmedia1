"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrandDetail, BrandProfile } from "@image-lab/contracts";
import { getBrandDetail, updateBrand } from "../../../../lib/api";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../../topbar-actions-context";

type BrandEditorState = {
  name: string;
  description: string;
  positioning: string;
  promise: string;
  audienceSummary: string;
  voiceSummary: string;
  adjectives: string;
  approvedVocabulary: string;
  bannedPhrases: string;
  styleDescriptors: string;
  doRules: string;
  dontRules: string;
  bannedPatterns: string;
  typographyMood: string;
  compositionPrinciples: string;
  imageTreatment: string;
  textDensity: "minimal" | "balanced" | "dense";
  realismLevel: "documentary" | "elevated_real" | "stylized";
  primary: string;
  secondary: string;
  accent: string;
  neutrals: string;
  bannedClaims: string;
  reviewChecks: string;
  antiReferenceNotes: string;
  referenceUsageNotes: string;
};

export default function BrandDetailPage() {
  const params = useParams<{ brandId: string }>();
  const { sessionToken, activeBrandId, setActiveBrandId, refresh, setMessage } = useStudio();
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState<BrandEditorState | null>(null);

  const topbarActions = useMemo(
    () => (
      <>
        {detail ? (
          <button
            className="button button-ghost"
            disabled={isSaving}
            onClick={() => {
              setFormState(toEditorState(detail));
              setIsEditorOpen(true);
            }}
            type="button"
          >
            {isSaving ? "Saving…" : "Edit brand"}
          </button>
        ) : null}
        {detail ? (
          <button
            className={detail.brand.id === activeBrandId ? "button button-primary" : "button button-ghost"}
            onClick={() => setActiveBrandId(detail.brand.id)}
            type="button"
          >
            {detail.brand.id === activeBrandId ? "Active brand" : "Set active brand"}
          </button>
        ) : null}
      </>
    ),
    [activeBrandId, detail, isSaving, setActiveBrandId]
  );

  useRegisterTopbarActions(topbarActions);

  const topbarMeta = useMemo(() => {
    if (!detail) {
      return null;
    }

    return {
      backHref: "/studio/brands",
      backLabel: "Back to brands",
      title: detail.brand.name,
      subtitle: detail.brand.description ?? "Brand system",
      badges: (
        <>
          <span className="pill">{detail.brand.slug}</span>
          {detail.brand.id === activeBrandId ? <span className="pill pill-completed">Active brand</span> : null}
        </>
      )
    };
  }, [activeBrandId, detail]);

  useRegisterTopbarMeta(topbarMeta);

  const loadBrand = useCallback(async () => {
    if (!sessionToken || typeof params.brandId !== "string") {
      return;
    }

    try {
      setLoading(true);
      const record = await getBrandDetail(sessionToken, params.brandId);
      setDetail(record);
      setFormState(toEditorState(record));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load brand");
    } finally {
      setLoading(false);
    }
  }, [params.brandId, sessionToken]);

  useEffect(() => {
    void loadBrand();
  }, [loadBrand]);

  if (loading) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Brand profile</p>
          <h3>Loading brand system…</h3>
        </article>
      </div>
    );
  }

  if (!detail || error || !detail.activeProfile) {
    return (
      <div className="page-stack">
        <article className="panel">
          <p className="panel-label">Brand profile</p>
          <h3>Unable to load this brand</h3>
          <p>{error ?? "This brand does not have an active profile yet."}</p>
        </article>
      </div>
    );
  }

  const profile = detail.activeProfile.profile;

  async function handleSaveBrand(event: React.FormEvent) {
    event.preventDefault();

    if (!sessionToken || !detail || !formState) {
      return;
    }

    setIsSaving(true);

    try {
      await updateBrand(sessionToken, detail.brand.id, {
        name: formState.name,
        description: formState.description,
        profile: {
          identity: {
            positioning: formState.positioning,
            promise: formState.promise,
            audienceSummary: formState.audienceSummary
          },
          voice: {
            summary: formState.voiceSummary,
            adjectives: splitCommaList(formState.adjectives),
            approvedVocabulary: splitCommaList(formState.approvedVocabulary),
            bannedPhrases: splitCommaList(formState.bannedPhrases)
          },
          palette: {
            primary: formState.primary,
            secondary: formState.secondary,
            accent: formState.accent,
            neutrals: splitCommaList(formState.neutrals)
          },
          styleDescriptors: splitCommaList(formState.styleDescriptors),
          visualSystem: {
            typographyMood: formState.typographyMood,
            compositionPrinciples: splitLineList(formState.compositionPrinciples),
            imageTreatment: splitLineList(formState.imageTreatment),
            textDensity: formState.textDensity,
            realismLevel: formState.realismLevel
          },
          doRules: splitLineList(formState.doRules),
          dontRules: splitLineList(formState.dontRules),
          bannedPatterns: splitLineList(formState.bannedPatterns),
          compliance: {
            bannedClaims: splitLineList(formState.bannedClaims),
            reviewChecks: splitLineList(formState.reviewChecks)
          },
          referenceAssetIds: profile.referenceAssetIds ?? [],
          referenceCanon: {
            antiReferenceNotes: splitLineList(formState.antiReferenceNotes),
            usageNotes: splitLineList(formState.referenceUsageNotes)
          }
        }
      });

      await Promise.all([loadBrand(), refresh(detail.brand.id)]);
      setMessage("Brand updated. A new profile version is now active.");
      setIsEditorOpen(false);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to update brand");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-grid" style={{ gap: "40px", alignItems: "start" }}>
        <main className="page-span-8" style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
          <section>
            <SectionHeader title="Identity" />
            <div className="brand-property-grid" style={{ marginBottom: "18px" }}>
              <PropertyCard label="Positioning" value={profile.identity.positioning || "Not defined"} />
              <PropertyCard label="Brand promise" value={profile.identity.promise || "Not defined"} />
            </div>
            {profile.identity.audienceSummary ? (
              <article className="brand-detail-card">
                <p className="panel-label">Audience summary</p>
                <p className="brand-detail-body">{profile.identity.audienceSummary}</p>
              </article>
            ) : null}
          </section>

          <section>
            <SectionHeader title="Voice" />
            <article className="brand-detail-card" style={{ marginBottom: "20px" }}>
              <p className="brand-detail-body">{profile.voice.summary}</p>
            </article>
            <div className="brand-chip-row" style={{ marginBottom: "20px" }}>
              {profile.voice.adjectives.map((item) => (
                <span className="pill" key={item}>{item}</span>
              ))}
            </div>
            <div className="brand-rule-columns" style={{ marginBottom: "20px" }}>
              <ListCard title="Approved vocabulary" items={profile.voice.approvedVocabulary} emptyLabel="No preferred vocabulary stored" />
              <ListCard title="Banned phrases" items={profile.voice.bannedPhrases} emptyLabel="No banned phrases stored" tone="negative" />
            </div>
          </section>

          <section>
            <SectionHeader title="Visual system" />
            <div className="brand-chip-row" style={{ marginBottom: "20px" }}>
              {profile.styleDescriptors.map((item) => (
                <span className="pill" key={item}>{item}</span>
              ))}
              <span className="pill">{profile.visualSystem.textDensity} text density</span>
              <span className="pill">{profile.visualSystem.realismLevel.replaceAll("_", " ")}</span>
            </div>
            <div className="brand-property-grid" style={{ marginBottom: "20px" }}>
              <PropertyCard label="Typography mood" value={profile.visualSystem.typographyMood || "Not defined"} />
            </div>
            <div className="brand-rule-columns">
              <ListCard title="Composition principles" items={profile.visualSystem.compositionPrinciples} emptyLabel="No composition rules stored" />
              <ListCard title="Image treatment" items={profile.visualSystem.imageTreatment} emptyLabel="No image treatment rules stored" />
            </div>
          </section>

          <section>
            <SectionHeader title="Rules and restrictions" />
            <div className="brand-rule-columns" style={{ marginBottom: "20px" }}>
              <RuleList title="Do" items={profile.doRules} tone="positive" />
              <RuleList title="Don't" items={profile.dontRules} tone="negative" />
            </div>
            <div className="brand-rule-columns">
              <ListCard title="Blocked patterns" items={profile.bannedPatterns} emptyLabel="No blocked patterns stored" tone="negative" />
            </div>
          </section>

          <section>
            <SectionHeader title="Compliance" />
            <div className="brand-rule-columns">
              <ListCard title="Banned claims" items={profile.compliance.bannedClaims} emptyLabel="No banned claims stored" tone="negative" />
              <ListCard title="Review checks" items={profile.compliance.reviewChecks} emptyLabel="No review checks stored" />
            </div>
          </section>

          <section>
            <SectionHeader title="Reference canon" />
            <div className="brand-rule-columns">
              <ListCard title="Anti-references" items={profile.referenceCanon.antiReferenceNotes} emptyLabel="No anti-reference notes stored" tone="negative" />
              <ListCard title="Usage notes" items={profile.referenceCanon.usageNotes} emptyLabel="No usage notes stored" />
            </div>
          </section>
        </main>

        <aside className="page-span-4 page-stack">
          <div className="sidebar-panel">
            <h3 style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-muted)", margin: "0 0 16px" }}>
              Palette
            </h3>
            <div className="sidebar-swatch-grid">
              <ColorCard label="Primary" value={profile.palette.primary} />
              <ColorCard label="Secondary" value={profile.palette.secondary} />
              <ColorCard label="Accent" value={profile.palette.accent} />
            </div>
            {profile.palette.neutrals.length > 0 ? (
              <div className="sidebar-chip-block">
                <p className="panel-label">Neutrals</p>
                <div className="sidebar-neutral-row">
                  {profile.palette.neutrals.map((value, index) => (
                    <div className="sidebar-neutral-chip" key={value}>
                      <span className="sidebar-neutral-dot" style={{ background: value }} />
                      <span>{`N${index + 1}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="property-list" style={{ marginTop: "24px" }}>
              <div className="property-item">
                <span>Profile version</span>
                <strong>v{detail.activeProfile.versionNumber}</strong>
              </div>
              <div className="property-item">
                <span>Reference assets</span>
                <strong>{detail.assetCounts.reference}</strong>
              </div>
              <div className="property-item">
                <span>Review checks</span>
                <strong>{profile.compliance.reviewChecks.length}</strong>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {isEditorOpen && formState ? (
        <div className="drawer-overlay" onClick={() => setIsEditorOpen(false)}>
          <div className="drawer-content brand-edit-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="panel-label">Edit brand system</p>
                <h2>{detail.brand.name}</h2>
              </div>
              <button className="drawer-close" onClick={() => setIsEditorOpen(false)} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="drawer-form">
              <div className="drawer-body">
                <div className="field-group-stack">
                  <div className="field-group">
                    <p className="field-group-label">Identity</p>
                    <div className="field-group-fields">
                      <label className="field-label">
                        Brand name
                        <span className="field-required">*</span>
                        <input
                          required
                          value={formState.name}
                          onChange={(event) => setFormState((current) => current ? { ...current, name: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Description
                        <textarea
                          rows={2}
                          value={formState.description}
                          onChange={(event) => setFormState((current) => current ? { ...current, description: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Positioning
                        <textarea
                          rows={2}
                          value={formState.positioning}
                          onChange={(event) => setFormState((current) => current ? { ...current, positioning: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Brand promise
                        <textarea
                          rows={2}
                          value={formState.promise}
                          onChange={(event) => setFormState((current) => current ? { ...current, promise: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Audience summary
                        <textarea
                          rows={2}
                          value={formState.audienceSummary}
                          onChange={(event) => setFormState((current) => current ? { ...current, audienceSummary: event.target.value } : current)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="field-group">
                    <p className="field-group-label">Voice</p>
                    <div className="field-group-fields">
                      <label className="field-label">
                        Voice summary
                        <textarea
                          rows={2}
                          value={formState.voiceSummary}
                          onChange={(event) => setFormState((current) => current ? { ...current, voiceSummary: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Adjectives
                        <input
                          value={formState.adjectives}
                          onChange={(event) => setFormState((current) => current ? { ...current, adjectives: event.target.value } : current)}
                        />
                        <span className="field-hint">Comma-separated.</span>
                      </label>
                      <label className="field-label">
                        Approved vocabulary
                        <input
                          value={formState.approvedVocabulary}
                          onChange={(event) => setFormState((current) => current ? { ...current, approvedVocabulary: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Banned phrases
                        <input
                          value={formState.bannedPhrases}
                          onChange={(event) => setFormState((current) => current ? { ...current, bannedPhrases: event.target.value } : current)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="field-group">
                    <p className="field-group-label">Visual system</p>
                    <div className="field-group-fields">
                      <label className="field-label">
                        Style descriptors
                        <input
                          value={formState.styleDescriptors}
                          onChange={(event) => setFormState((current) => current ? { ...current, styleDescriptors: event.target.value } : current)}
                        />
                        <span className="field-hint">Comma-separated descriptors.</span>
                      </label>
                      <label className="field-label">
                        Typography mood
                        <textarea
                          rows={2}
                          value={formState.typographyMood}
                          onChange={(event) => setFormState((current) => current ? { ...current, typographyMood: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Composition principles
                        <textarea
                          rows={4}
                          value={formState.compositionPrinciples}
                          onChange={(event) => setFormState((current) => current ? { ...current, compositionPrinciples: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Image treatment
                        <textarea
                          rows={4}
                          value={formState.imageTreatment}
                          onChange={(event) => setFormState((current) => current ? { ...current, imageTreatment: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Text density
                        <select
                          value={formState.textDensity}
                          onChange={(event) => setFormState((current) => current ? { ...current, textDensity: event.target.value as BrandEditorState["textDensity"] } : current)}
                        >
                          <option value="minimal">Minimal</option>
                          <option value="balanced">Balanced</option>
                          <option value="dense">Dense</option>
                        </select>
                      </label>
                      <label className="field-label">
                        Realism level
                        <select
                          value={formState.realismLevel}
                          onChange={(event) => setFormState((current) => current ? { ...current, realismLevel: event.target.value as BrandEditorState["realismLevel"] } : current)}
                        >
                          <option value="documentary">Documentary</option>
                          <option value="elevated_real">Elevated real</option>
                          <option value="stylized">Stylized</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="field-group">
                    <p className="field-group-label">Rules and restrictions</p>
                    <div className="field-group-fields">
                      <label className="field-label">
                        Do rules
                        <textarea
                          rows={4}
                          value={formState.doRules}
                          onChange={(event) => setFormState((current) => current ? { ...current, doRules: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Don't rules
                        <textarea
                          rows={4}
                          value={formState.dontRules}
                          onChange={(event) => setFormState((current) => current ? { ...current, dontRules: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Blocked patterns
                        <textarea
                          rows={3}
                          value={formState.bannedPatterns}
                          onChange={(event) => setFormState((current) => current ? { ...current, bannedPatterns: event.target.value } : current)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="field-group">
                    <p className="field-group-label">Compliance and reference canon</p>
                    <div className="field-group-fields">
                      <label className="field-label">
                        Banned claims
                        <textarea
                          rows={3}
                          value={formState.bannedClaims}
                          onChange={(event) => setFormState((current) => current ? { ...current, bannedClaims: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Review checks
                        <textarea
                          rows={3}
                          value={formState.reviewChecks}
                          onChange={(event) => setFormState((current) => current ? { ...current, reviewChecks: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Anti-reference notes
                        <textarea
                          rows={3}
                          value={formState.antiReferenceNotes}
                          onChange={(event) => setFormState((current) => current ? { ...current, antiReferenceNotes: event.target.value } : current)}
                        />
                      </label>
                      <label className="field-label">
                        Reference usage notes
                        <textarea
                          rows={3}
                          value={formState.referenceUsageNotes}
                          onChange={(event) => setFormState((current) => current ? { ...current, referenceUsageNotes: event.target.value } : current)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="field-group">
                    <p className="field-group-label">Colour palette</p>
                    <div className="drawer-color-grid">
                      {(["primary", "secondary", "accent"] as const).map((key) => (
                        <div key={key} className="drawer-color-item">
                          <label className="field-label">
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                            <div className="field-row-compact">
                              <div className="color-swatch-sm" style={{ background: formState[key] }} />
                              <input
                                className="mono-field"
                                value={formState[key]}
                                onChange={(event) => setFormState((current) => current ? { ...current, [key]: event.target.value } : current)}
                              />
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                    <label className="field-label" style={{ marginTop: "14px" }}>
                      Neutral colours
                      <input
                        className="mono-field"
                        value={formState.neutrals}
                        onChange={(event) => setFormState((current) => current ? { ...current, neutrals: event.target.value } : current)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="drawer-footer">
                <button className="button button-ghost" onClick={() => setIsEditorOpen(false)} type="button" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button className="button button-primary" disabled={isSaving} type="submit" style={{ flex: 2 }}>
                  {isSaving ? "Saving…" : `Update to v${detail.activeProfile.versionNumber + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toEditorState(detail: BrandDetail): BrandEditorState {
  const profile = detail.activeProfile?.profile;

  return {
    name: detail.brand.name,
    description: detail.brand.description ?? "",
    positioning: profile?.identity.positioning ?? "",
    promise: profile?.identity.promise ?? "",
    audienceSummary: profile?.identity.audienceSummary ?? "",
    voiceSummary: profile?.voice.summary ?? "",
    adjectives: joinCommaList(profile?.voice.adjectives),
    approvedVocabulary: joinCommaList(profile?.voice.approvedVocabulary),
    bannedPhrases: joinCommaList(profile?.voice.bannedPhrases),
    styleDescriptors: joinCommaList(profile?.styleDescriptors),
    doRules: joinLineList(profile?.doRules),
    dontRules: joinLineList(profile?.dontRules),
    bannedPatterns: joinLineList(profile?.bannedPatterns),
    typographyMood: profile?.visualSystem.typographyMood ?? "",
    compositionPrinciples: joinLineList(profile?.visualSystem.compositionPrinciples),
    imageTreatment: joinLineList(profile?.visualSystem.imageTreatment),
    textDensity: profile?.visualSystem.textDensity ?? "balanced",
    realismLevel: profile?.visualSystem.realismLevel ?? "elevated_real",
    primary: profile?.palette.primary ?? "#1f2430",
    secondary: profile?.palette.secondary ?? "#f4efe7",
    accent: profile?.palette.accent ?? "#caa56a",
    neutrals: joinCommaList(profile?.palette.neutrals),
    bannedClaims: joinLineList(profile?.compliance.bannedClaims),
    reviewChecks: joinLineList(profile?.compliance.reviewChecks),
    antiReferenceNotes: joinLineList(profile?.referenceCanon.antiReferenceNotes),
    referenceUsageNotes: joinLineList(profile?.referenceCanon.usageNotes),
  };
}

function joinCommaList(values: readonly (string | number)[] | undefined) {
  return values?.join(", ") ?? "";
}

function joinLineList(values: readonly string[] | undefined) {
  return values?.join("\n") ?? "";
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: "24px", paddingBottom: "12px", borderBottom: "1px solid var(--line)" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink)" }}>
        {title}
      </h2>
    </div>
  );
}

function PropertyCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="brand-detail-card">
      <p className="panel-label">{label}</p>
      <p className="brand-detail-body">{value}</p>
    </article>
  );
}

function ListCard({
  title,
  items,
  emptyLabel,
  tone = "default"
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone?: "default" | "negative";
}) {
  return (
    <article className="brand-detail-card">
      <p className="panel-label">{title}</p>
      {items.length > 0 ? (
        <div className="stack-list compact-list">
          {items.map((item) => (
            <div className="brand-rule-row" key={item}>
              {tone === "negative" ? (
                <span className="brand-rule-dot negative" />
              ) : (
                <span className="brand-rule-dot" />
              )}
              <p>{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="brand-detail-muted">{emptyLabel}</p>
      )}
    </article>
  );
}

function RuleList({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "positive" | "negative";
}) {
  return (
    <div className="brand-rule-block">
      <p className="panel-label">{title}</p>
      <div className="stack-list compact-list">
        {items.map((item) => (
          <div className="brand-rule-row" key={item}>
            <div style={{ flexShrink: 0, marginTop: "2px" }}>
              {tone === "positive" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--olive-strong, #10b981)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crimson, #ef4444)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              )}
            </div>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="sidebar-swatch-card">
      <div className="color-swatch-block" style={{ background: value }} />
      <div className="sidebar-swatch-meta">
        <p className="panel-label">{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
