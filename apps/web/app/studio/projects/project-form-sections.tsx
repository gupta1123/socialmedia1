"use client";

import type { SetStateAction } from "react";
import type { BrandAssetRecord } from "@image-lab/contracts";
import type { ProjectFormState } from "../../../lib/project-profile-form";
import { ImagePreviewTrigger } from "../image-preview";

export function ProjectProfileFormSections({
  form,
  setForm,
  assets,
  loadingAssets
}: {
  form: ProjectFormState;
  setForm: (value: SetStateAction<ProjectFormState>) => void;
  assets: BrandAssetRecord[];
  loadingAssets: boolean;
}) {
  return (
    <>
      <div className="planner-form-section">
        <p className="field-group-label">Project truth</p>
        <div className="planner-form-grid">
          <label className="field-label">
            Tagline
            <input value={form.tagline} onChange={(event) => updateForm(setForm, "tagline", event.target.value)} />
          </label>
          <label className="field-label">
            Possession status
            <input value={form.possessionStatus} onChange={(event) => updateForm(setForm, "possessionStatus", event.target.value)} />
          </label>
          <label className="field-label">
            RERA number
            <input value={form.reraNumber} onChange={(event) => updateForm(setForm, "reraNumber", event.target.value)} />
          </label>
          <label className="field-label">
            Pricing band
            <input value={form.pricingBand} onChange={(event) => updateForm(setForm, "pricingBand", event.target.value)} />
          </label>
          <label className="field-label planner-form-span-2">
            Positioning
            <textarea value={form.positioning} onChange={(event) => updateForm(setForm, "positioning", event.target.value)} />
          </label>
          <MultiLineField label="Audience segments" value={form.audienceSegments} onChange={(value) => updateForm(setForm, "audienceSegments", value)} hint="One segment per line" />
          <label className="field-label planner-form-span-2">
            Lifestyle angle
            <textarea value={form.lifestyleAngle} onChange={(event) => updateForm(setForm, "lifestyleAngle", event.target.value)} />
          </label>
        </div>
      </div>

      <div className="planner-form-section">
        <p className="field-group-label">Product and pricing</p>
        <div className="planner-form-grid">
          <MultiLineField label="Configurations" value={form.configurations} onChange={(value) => updateForm(setForm, "configurations", value)} hint="One configuration per line" />
          <MultiLineField label="Size ranges" value={form.sizeRanges} onChange={(value) => updateForm(setForm, "sizeRanges", value)} hint="One size fact per line" />
          <label className="field-label">
            Towers count
            <input value={form.towersCount} onChange={(event) => updateForm(setForm, "towersCount", event.target.value)} />
          </label>
          <label className="field-label">
            Floors count
            <input value={form.floorsCount} onChange={(event) => updateForm(setForm, "floorsCount", event.target.value)} />
          </label>
          <label className="field-label">
            Total units
            <input value={form.totalUnits} onChange={(event) => updateForm(setForm, "totalUnits", event.target.value)} />
          </label>
          <label className="field-label">
            Starting price
            <input value={form.startingPrice} onChange={(event) => updateForm(setForm, "startingPrice", event.target.value)} />
          </label>
          <MultiLineField label="Special unit types" value={form.specialUnitTypes} onChange={(value) => updateForm(setForm, "specialUnitTypes", value)} hint="One unit type per line" />
          <label className="field-label planner-form-span-2">
            Parking facts
            <textarea value={form.parkingFacts} onChange={(event) => updateForm(setForm, "parkingFacts", event.target.value)} />
          </label>
          <MultiLineField label="Price range by configuration" value={form.priceRangeByConfig} onChange={(value) => updateForm(setForm, "priceRangeByConfig", value)} hint="One price fact per line" />
          <label className="field-label">
            Booking amount
            <input value={form.bookingAmount} onChange={(event) => updateForm(setForm, "bookingAmount", event.target.value)} />
          </label>
          <label className="field-label planner-form-span-2">
            Payment plan summary
            <textarea value={form.paymentPlanSummary} onChange={(event) => updateForm(setForm, "paymentPlanSummary", event.target.value)} />
          </label>
          <MultiLineField label="Current offers" value={form.currentOffers} onChange={(value) => updateForm(setForm, "currentOffers", value)} hint="One offer per line" />
          <MultiLineField label="Financing partners" value={form.financingPartners} onChange={(value) => updateForm(setForm, "financingPartners", value)} hint="One financing partner per line" />
          <label className="field-label">
            Offer validity
            <input value={form.offerValidity} onChange={(event) => updateForm(setForm, "offerValidity", event.target.value)} />
          </label>
        </div>
      </div>

      <div className="planner-form-section">
        <p className="field-group-label">Amenities and location</p>
        <div className="planner-form-grid">
          <MultiLineField label="Amenities" value={form.amenities} onChange={(value) => updateForm(setForm, "amenities", value)} hint="One amenity per line" />
          <MultiLineField label="Hero amenities" value={form.heroAmenities} onChange={(value) => updateForm(setForm, "heroAmenities", value)} hint="One hero amenity per line" />
          <MultiLineField label="Nearby landmarks" value={form.nearbyLandmarks} onChange={(value) => updateForm(setForm, "nearbyLandmarks", value)} hint="One landmark per line" />
          <MultiLineField label="Connectivity points" value={form.connectivityPoints} onChange={(value) => updateForm(setForm, "connectivityPoints", value)} hint="One connectivity point per line" />
          <MultiLineField label="Travel times" value={form.travelTimes} onChange={(value) => updateForm(setForm, "travelTimes", value)} hint="One travel-time fact per line" />
          <MultiLineField label="Location advantages" value={form.locationAdvantages} onChange={(value) => updateForm(setForm, "locationAdvantages", value)} hint="One location advantage per line" />
        </div>
      </div>

      <div className="planner-form-section">
        <p className="field-group-label">Progress, trust, and FAQs</p>
        <div className="planner-form-grid">
          <label className="field-label planner-form-span-2">
            Construction status
            <textarea value={form.constructionStatus} onChange={(event) => updateForm(setForm, "constructionStatus", event.target.value)} />
          </label>
          <MultiLineField label="Milestone history" value={form.milestoneHistory} onChange={(value) => updateForm(setForm, "milestoneHistory", value)} hint="One milestone per line" />
          <label className="field-label">
            Latest update
            <input value={form.latestUpdate} onChange={(event) => updateForm(setForm, "latestUpdate", event.target.value)} />
          </label>
          <label className="field-label">
            Completion window
            <input value={form.completionWindow} onChange={(event) => updateForm(setForm, "completionWindow", event.target.value)} />
          </label>
          <MultiLineField label="Approved claims" value={form.approvedClaims} onChange={(value) => updateForm(setForm, "approvedClaims", value)} hint="One approved claim per line" />
          <MultiLineField label="Banned claims" value={form.bannedClaims} onChange={(value) => updateForm(setForm, "bannedClaims", value)} hint="One banned claim per line" />
          <MultiLineField label="Legal notes" value={form.legalNotes} onChange={(value) => updateForm(setForm, "legalNotes", value)} hint="One legal note per line" />
          <label className="field-label planner-form-span-2">
            Approvals summary
            <textarea value={form.approvalsSummary} onChange={(event) => updateForm(setForm, "approvalsSummary", event.target.value)} />
          </label>
          <MultiLineField label="Credibility facts" value={form.credibilityFacts} onChange={(value) => updateForm(setForm, "credibilityFacts", value)} hint="One credibility fact per line" />
          <label className="field-label planner-form-span-2">
            Investor angle
            <textarea value={form.investorAngle} onChange={(event) => updateForm(setForm, "investorAngle", event.target.value)} />
          </label>
          <label className="field-label planner-form-span-2">
            End-user angle
            <textarea value={form.endUserAngle} onChange={(event) => updateForm(setForm, "endUserAngle", event.target.value)} />
          </label>
          <MultiLineField label="Key objections" value={form.keyObjections} onChange={(value) => updateForm(setForm, "keyObjections", value)} hint="One objection per line" />
          <label className="field-label planner-form-span-2">
            FAQs
            <textarea value={form.faqs} onChange={(event) => updateForm(setForm, "faqs", event.target.value)} placeholder="Question | Answer" />
            <span className="field-hint">Use one line per FAQ in the format `Question | Answer`.</span>
          </label>
        </div>
      </div>

      <div className="planner-form-section">
        <p className="field-group-label">Project imagery</p>
        <div className="planner-form-grid">
          <AssetSelectionGroup
            assets={assets}
            emptyLabel={loadingAssets ? "Loading references…" : "No brand references available yet."}
            label="Actual project images"
            onToggle={(assetId) => toggleArraySelection(setForm, "actualProjectImageIds", assetId)}
            selectedIds={form.actualProjectImageIds}
          />
          <AssetSelectionGroup
            assets={assets}
            emptyLabel={loadingAssets ? "Loading references…" : "No brand references available yet."}
            label="Sample flat images"
            onToggle={(assetId) => toggleArraySelection(setForm, "sampleFlatImageIds", assetId)}
            selectedIds={form.sampleFlatImageIds}
          />
        </div>
      </div>
    </>
  );
}

function MultiLineField({
  label,
  value,
  onChange,
  hint
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="field-label planner-form-span-2">
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

function AssetSelectionGroup({
  label,
  assets,
  selectedIds,
  onToggle,
  emptyLabel
}: {
  label: string;
  assets: BrandAssetRecord[];
  selectedIds: string[];
  onToggle: (assetId: string) => void;
  emptyLabel: string;
}) {
  return (
    <div className="field-label planner-form-span-2">
      <span>{label}</span>
      {assets.length === 0 ? (
        <div className="field-hint">{emptyLabel}</div>
      ) : (
        <div className="asset-selection-grid">
          {assets.map((asset) => {
            const selected = selectedIds.includes(asset.id);
            return (
              <button
                className={`asset-selection-card${selected ? " is-selected" : ""}`}
                key={asset.id}
                onClick={() => onToggle(asset.id)}
                type="button"
              >
                {asset.previewUrl ? (
                  <ImagePreviewTrigger alt={asset.label} mode="inline" src={asset.previewUrl} title={asset.label}>
                    <img alt={asset.label} src={asset.previewUrl} />
                  </ImagePreviewTrigger>
                ) : (
                  <div className="asset-selection-placeholder">{asset.label}</div>
                )}
                <strong>{asset.label}</strong>
                <span>{selected ? "Selected" : "Choose"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function updateForm<K extends keyof ProjectFormState>(
  setForm: (value: SetStateAction<ProjectFormState>) => void,
  key: K,
  value: ProjectFormState[K]
) {
  setForm((state) => ({ ...state, [key]: value }));
}

function toggleArraySelection(
  setForm: (value: SetStateAction<ProjectFormState>) => void,
  key: "actualProjectImageIds" | "sampleFlatImageIds",
  assetId: string
) {
  setForm((state) => {
    const current = state[key];
    const next = current.includes(assetId)
      ? current.filter((item) => item !== assetId)
      : [...current, assetId];
    return { ...state, [key]: next };
  });
}
