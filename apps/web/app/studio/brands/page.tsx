"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { InfoPopover } from "../info-popover";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions } from "../topbar-actions-context";

const FIELD_GROUPS = [
  {
    title: "Identity",
    fields: [
      { key: "name", label: "Brand name", type: "input", required: true, hint: "Display name across your workspace." },
      { key: "description", label: "Description", type: "textarea", hint: "A short summary of what this brand does." },
      { key: "positioning", label: "Positioning", type: "textarea", hint: "How the brand should be understood in the market." },
      { key: "promise", label: "Brand promise", type: "input", hint: "What consistent feeling or value the brand should deliver." },
      { key: "audienceSummary", label: "Audience summary", type: "textarea", hint: "Who this brand primarily speaks to." },
    ],
  },
  {
    title: "Voice",
    fields: [
      { key: "voiceSummary", label: "Voice summary", type: "input", hint: "One sentence — e.g. 'Confident, editorial, bright.'" },
      { key: "adjectives", label: "Adjectives", type: "input", hint: "Comma-separated — e.g. editorial, vivid, bold." },
      { key: "approvedVocabulary", label: "Approved vocabulary", type: "input", hint: "Words the system should lean on." },
      { key: "bannedPhrases", label: "Banned phrases", type: "input", hint: "Words or phrases the brand should avoid." },
    ],
  },
  {
    title: "Visual style",
    fields: [
      { key: "styleDescriptors", label: "Style descriptors", type: "input", hint: "e.g. cinematic, graphic, minimalist." },
    ],
  },
  {
    title: "Rules",
    fields: [
      { key: "doRules", label: "Do rules", type: "input", hint: "Always include — e.g. bold cropping, safe zones." },
      { key: "dontRules", label: "Don't rules", type: "input", hint: "Always avoid — e.g. no generic stock scenes." },
      { key: "bannedPatterns", label: "Banned patterns", type: "input", hint: "Visual clichés to block." },
    ],
  },
];

export default function BrandsPage() {
  const {
    bootstrap,
    activeBrandId,
    brandForm,
    pendingAction,
    isPending,
    setActiveBrandId,
    setBrandForm,
    createBrandRecord,
  } = useStudio();

  const [isFormOpen, setIsFormOpen] = useState(false);

  const topbarActions = useMemo(
    () => (
      <button
        className="button button-primary"
        onClick={() => setIsFormOpen(true)}
        disabled={pendingAction === "create-brand"}
      >
        {pendingAction === "create-brand" ? "Saving brand…" : "New Brand"}
      </button>
    ),
    [pendingAction]
  );

  useRegisterTopbarActions(topbarActions);

  if (!bootstrap) return null;

  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault();
    const success = await createBrandRecord();
    if (success) {
      setIsFormOpen(false);
    }
  }

  return (
    <div className="page-stack">

      <section className="page-grid">
        <article className="panel page-span-12">
          <div className="panel-header">
            <h3>Your configured brands</h3>
            <div className="panel-header-actions">
              <InfoPopover
                title="Brand context"
                items={[
                  {
                    label: "What the active brand does",
                    body: "It scopes prompts, templates, assets, projects, and deliverables to the selected brand context."
                  },
                  {
                    label: "Why it matters",
                    body: "The team should switch operating context once, then let every downstream workflow inherit the right rules and tone."
                  },
                  {
                    label: "What to do here",
                    body: "Create or select a brand, then use its profile page to inspect and edit the brand brain in detail."
                  }
                ]}
              />
              <span className="panel-count">{bootstrap.brands.length}</span>
            </div>
          </div>

          {bootstrap.brands.length > 0 ? (
            <div className="stack-list">
              {bootstrap.brands.map((brand) => {
                const active = brand.id === activeBrandId;
                return (
                  <article key={brand.id} className={active ? "brand-card active" : "brand-card"}>
                    <span className="brand-avatar">{brand.name.charAt(0).toUpperCase()}</span>
                    <div className="brand-card-text">
                      <strong>{brand.name}</strong>
                      <p>{brand.description ?? "No description"}</p>
                    </div>
                    <div className="brand-card-actions">
                      <Link className="button button-ghost" href={`/studio/brands/${brand.id}`}>
                        View profile
                      </Link>
                      <button
                        type="button"
                        className={active ? "button button-primary" : "button button-ghost"}
                        onClick={() => setActiveBrandId(brand.id)}
                      >
                        {active ? "Active brand" : "Set active"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No brands yet</strong>
              <p>Create your first brand to unlock the workspace.</p>
              <button className="button button-ghost" onClick={() => setIsFormOpen(true)}>Create a brand</button>
            </div>
          )}
        </article>
      </section>

      {/* Brand Form Drawer */}
      {isFormOpen && (
        <div className="drawer-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Create Brand</h2>
              <button className="drawer-close" onClick={() => setIsFormOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
            
            <div className="drawer-body">
              <form onSubmit={handleCreateBrand}>
                {FIELD_GROUPS.map((group) => (
                  <div key={group.title} className="field-group">
                    <p className="field-group-label">{group.title}</p>
                    <div className="field-group-fields">
                      {group.fields.map((f) => (
                        <label key={f.key} className="field-label">
                          {f.label}
                          {f.required && <span className="field-required">*</span>}
                          {f.type === "textarea" ? (
                            <textarea
                              value={(brandForm as any)[f.key]}
                              onChange={(e) => setBrandForm((s) => ({ ...s, [f.key]: e.target.value }))}
                            />
                          ) : (
                            <input
                              value={(brandForm as any)[f.key]}
                              onChange={(e) => setBrandForm((s) => ({ ...s, [f.key]: e.target.value }))}
                              required={f.required}
                            />
                          )}
                          {f.hint && <span className="field-hint">{f.hint}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Colour palette */}
                <div className="field-group">
                  <p className="field-group-label">Colour palette</p>
                  <div className="color-row">
                    {(["primary", "secondary", "accent"] as const).map((key) => (
                      <label key={key} className="color-field">
                        <div className="color-preview" style={{ background: brandForm[key] }} />
                        <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                        <input
                          value={brandForm[key]}
                          onChange={(e) => setBrandForm((s) => ({ ...s, [key]: e.target.value }))}
                          placeholder="#000000"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-footer" style={{ marginTop: "32px" }}>
                  <button className="button button-primary" style={{ width: "100%" }} disabled={isPending} type="submit">
                    {pendingAction === "create-brand" ? "Saving…" : "Save brand"}
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
