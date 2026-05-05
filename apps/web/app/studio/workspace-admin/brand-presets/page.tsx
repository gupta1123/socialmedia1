"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProjectRecord } from "@image-lab/contracts";
import {
  createCreativeV3BrandPreset,
  deleteCreativeV3BrandPreset,
  getCreativeV3BrandPresets,
  getProjects,
  updateCreativeV3BrandPreset,
  type CreativeV3BrandPreset
} from "../../../../lib/api";
import { useStudio } from "../../studio-context";
import { useRegisterTopbarActions } from "../../topbar-actions-context";

type PresetFormState = {
  id: string | null;
  name: string;
  description: string;
  projectId: string;
  logoRequired: boolean;
  logoPosition: string;
  reraRequired: boolean;
  reraPosition: string;
  contactItems: string[];
  contactPosition: string;
  typographyMood: string;
  paletteMode: string;
  active: boolean;
};

const emptyForm: PresetFormState = {
  id: null,
  name: "Launch default",
  description: "Reusable generation rules for logo, compliance, contact, typography, and palette.",
  projectId: "",
  logoRequired: true,
  logoPosition: "top_left",
  reraRequired: false,
  reraPosition: "top_right",
  contactItems: ["phone", "website"],
  contactPosition: "bottom_footer",
  typographyMood: "brand_profile",
  paletteMode: "brand_profile",
  active: true
};

const contactOptions = ["phone", "email", "website", "whatsapp"];

export default function BrandPresetsSettingsPage() {
  const { sessionToken, activeBrandId, setMessage } = useStudio();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [presets, setPresets] = useState<CreativeV3BrandPreset[]>([]);
  const [form, setForm] = useState<PresetFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function reload() {
    if (!sessionToken || !activeBrandId) {
      setProjects([]);
      setPresets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [projectRecords, presetRecords] = await Promise.all([
        getProjects(sessionToken, { brandId: activeBrandId }),
        getCreativeV3BrandPresets(sessionToken, { brandId: activeBrandId, includeInactive: true })
      ]);
      setProjects(projectRecords);
      setPresets(presetRecords);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load brand presets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [activeBrandId, sessionToken]);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.db_id === form.id) ?? null,
    [form.id, presets]
  );

  function startCreate() {
    setForm(emptyForm);
  }

  function startEdit(preset: CreativeV3BrandPreset) {
    const json = preset.preset_json as Record<string, any>;
    setForm({
      id: preset.db_id,
      name: preset.name,
      description: preset.description ?? "",
      projectId: preset.project_id ?? "",
      logoRequired: Boolean(json.logo?.required || json.logo_layer?.required),
      logoPosition: String(json.logo?.position ?? json.logo_layer?.position ?? "top_left"),
      reraRequired: Boolean(json.rera_qr?.required || json.rera_qr_layer?.required),
      reraPosition: String(json.rera_qr?.position ?? json.rera_qr_layer?.position ?? "top_right"),
      contactItems: Array.isArray(json.contact?.items) ? json.contact.items.map(String) : [],
      contactPosition: String(json.contact?.position ?? "bottom_footer"),
      typographyMood: String(json.typography?.source ?? json.typography?.fallback_mood ?? "brand_profile"),
      paletteMode: String(json.palette?.source ?? "brand_profile"),
      active: preset.active !== false
    });
  }

  function toggleContact(item: string) {
    setForm((current) => ({
      ...current,
      contactItems: current.contactItems.includes(item)
        ? current.contactItems.filter((value) => value !== item)
        : [...current.contactItems, item]
    }));
  }

  function buildPresetJson() {
    const existing = selectedPreset?.preset_json && typeof selectedPreset.preset_json === "object"
      ? selectedPreset.preset_json as Record<string, any>
      : {};
    const existingLogo = existing.logo && typeof existing.logo === "object" && !Array.isArray(existing.logo) ? existing.logo : {};
    const existingRera = existing.rera_qr && typeof existing.rera_qr === "object" && !Array.isArray(existing.rera_qr) ? existing.rera_qr : {};
    const existingContact = existing.contact && typeof existing.contact === "object" && !Array.isArray(existing.contact) ? existing.contact : {};
    const existingTypography = existing.typography && typeof existing.typography === "object" && !Array.isArray(existing.typography) ? existing.typography : {};
    const existingPalette = existing.palette && typeof existing.palette === "object" && !Array.isArray(existing.palette) ? existing.palette : {};
    return {
      ...existing,
      logo: {
        ...existingLogo,
        required: form.logoRequired,
        position: form.logoPosition,
        max_instances: 1,
        source: "exact_asset_only"
      },
      rera_qr: {
        ...existingRera,
        required: form.reraRequired,
        position: form.reraPosition,
        max_instances: 1,
        source: "exact_asset_only",
        render_mode: "composite_rera_block",
        size: "compact_badge",
        height_match: "logo_height",
        avoid_full_width_banner: true,
        never_generate_qr: true
      },
      contact: {
        ...existingContact,
        required: form.contactItems.length > 0,
        include_if_grounded: true,
        position: form.contactPosition,
        items: form.contactItems
      },
      typography: {
        ...existingTypography,
        source: form.typographyMood === "brand_profile" ? "brand_profile" : "preset",
        fallback_mood: form.typographyMood
      },
      palette: {
        ...existingPalette,
        source: form.paletteMode
      }
    };
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!sessionToken || !activeBrandId) return;
    const name = form.name.trim();
    if (!name) {
      setMessage("Preset name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        brandId: activeBrandId,
        projectId: form.projectId || null,
        name,
        description: form.description.trim() || null,
        presetJson: buildPresetJson(),
        active: form.active
      };
      if (form.id) {
        await updateCreativeV3BrandPreset(sessionToken, form.id, payload);
        setMessage("Brand preset updated.");
      } else {
        await createCreativeV3BrandPreset(sessionToken, payload);
        setMessage("Brand preset created.");
      }
      setForm(emptyForm);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save brand preset.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(preset: CreativeV3BrandPreset) {
    if (!sessionToken || !activeBrandId) return;
    setSaving(true);
    try {
      await deleteCreativeV3BrandPreset(sessionToken, activeBrandId, preset.db_id);
      if (form.id === preset.db_id) {
        setForm(emptyForm);
      }
      await reload();
      setMessage("Brand preset archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to archive brand preset.");
    } finally {
      setSaving(false);
    }
  }

  const topbarActions = useMemo(() => (
    <button className="button button-primary" onClick={startCreate} type="button">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
        <path d="M5 12h14M12 5v14" />
      </svg>
      New Preset
    </button>
  ), []);

  useRegisterTopbarActions(topbarActions);

  return (
    <div className="preset-admin">
      <div className="preset-admin-grid">
        <aside className="preset-admin-list">
          {loading ? (
            <div className="preset-loading-stack">
              {[...Array(4)].map((_, i) => <div key={i} className="preset-skeleton-card" />)}
            </div>
          ) : presets.length === 0 ? (
            <div className="empty-state compact">
              <strong>No presets yet</strong>
              <p>Defaults for the Create workflow appear here.</p>
            </div>
          ) : (
            <div className="preset-card-stack">
              {presets.map((preset) => (
                <article 
                  className={`preset-item-card ${selectedPreset?.db_id === preset.db_id ? "is-selected" : ""} ${preset.active === false ? "is-archived" : ""}`} 
                  key={preset.db_id}
                  onClick={() => startEdit(preset)}
                >
                  <div className="preset-item-info">
                    <div className="preset-title-row">
                      <strong>{preset.name}</strong>
                      <span className="preset-status-dot" />
                    </div>
                    <p>{preset.description || "No description provided."}</p>
                    <div className="preset-meta-tags">
                      <span className="meta-tag">
                        {preset.project_id ? projects.find((p) => p.id === preset.project_id)?.name ?? "Project scoped" : "Brand scoped"}
                      </span>
                    </div>
                  </div>
                  <button 
                    className="preset-archive-btn" 
                    onClick={(e) => { e.stopPropagation(); void handleDelete(preset); }} 
                    disabled={saving}
                    title="Archive preset"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                    </svg>
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>

        <main className="preset-admin-editor">
          <form className="preset-editor-form" onSubmit={handleSave}>
            <div className="editor-section">
              <h3 className="section-title">General Details</h3>
              <div className="editor-fields">
                <label className="field-label">
                  Preset Name
                  <input value={form.name} onChange={(e) => setForm(c => ({ ...c, name: e.target.value }))} placeholder="e.g. Launch Default" />
                </label>
                <label className="field-label">
                  Description
                  <textarea value={form.description} onChange={(e) => setForm(c => ({ ...c, description: e.target.value }))} placeholder="Describe when to use this preset..." />
                </label>
                <label className="field-label">
                  Default Scope
                  <select value={form.projectId} onChange={(e) => setForm(c => ({ ...c, projectId: e.target.value }))}>
                    <option value="">Brand default (Global)</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="editor-section">
              <h3 className="section-title">Visual Anchors</h3>
              <div className="editor-row">
                <label className="field-label">
                  Logo Position
                  <select value={form.logoRequired ? form.logoPosition : "off"} onChange={(e) => {
                    const value = e.target.value;
                    setForm(c => ({ ...c, logoRequired: value !== "off", logoPosition: value === "off" ? c.logoPosition : value }));
                  }}>
                    <option value="off">Disabled</option>
                    <option value="top_left">Top Left</option>
                    <option value="top_right">Top Right</option>
                    <option value="bottom_signature">Bottom Signature</option>
                  </select>
                </label>
                <label className="field-label">
                  RERA Compliance
                  <select value={form.reraRequired ? form.reraPosition : "off"} onChange={(e) => {
                    const value = e.target.value;
                    setForm(c => ({ ...c, reraRequired: value !== "off", reraPosition: value === "off" ? c.reraPosition : value }));
                  }}>
                    <option value="off">Disabled</option>
                    <option value="top_right">Top Right Block</option>
                    <option value="bottom_footer">Full Width Footer</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="editor-section">
              <h3 className="section-title">Contact & Creative</h3>
              <div className="field-label">Contact Channels</div>
              <div className="preset-chip-group">
                {contactOptions.map((item) => (
                  <button 
                    key={item} 
                    className={`preset-chip-item ${form.contactItems.includes(item) ? "is-active" : ""}`} 
                    onClick={() => toggleContact(item)} 
                    type="button"
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
              
              <div className="editor-row" style={{ marginTop: '20px' }}>
                <label className="field-label">
                  Typography Mood
                  <select value={form.typographyMood} onChange={(e) => setForm(c => ({ ...c, typographyMood: e.target.value }))}>
                    <option value="brand_profile">Use Brand Profile</option>
                    <option value="Elegant premium editorial">Elegant Premium Editorial</option>
                    <option value="Modern clean sans">Modern Clean Sans</option>
                    <option value="Minimal luxury">Minimal Luxury</option>
                  </select>
                </label>
                <label className="field-label">
                  Color Palette
                  <select value={form.paletteMode} onChange={(e) => setForm(c => ({ ...c, paletteMode: e.target.value }))}>
                    <option value="brand_profile">Brand Profile Colors</option>
                    <option value="preset">Preset Derived Palette</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="editor-footer">
              <label className="preset-active-toggle">
                <input checked={form.active} onChange={(e) => setForm(c => ({ ...c, active: e.target.checked }))} type="checkbox" />
                <span>Preset is active and available in Create</span>
              </label>
              <button className="button button-primary" disabled={saving} type="submit">
                {saving ? "Saving…" : form.id ? "Update Preset" : "Create Preset"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
