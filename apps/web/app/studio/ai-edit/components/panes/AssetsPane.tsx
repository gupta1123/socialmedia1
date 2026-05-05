"use client";

import { useState, useMemo } from "react";
import type { BootstrapResponse } from "@image-lab/contracts";
import { useEditorContext } from "../../EditorContext";
import { StudioColorPicker } from "../../../components/StudioColorPicker";
import { buildImageLayer } from "../../lib/editor-actions";
import { getBrandAssetImageUrls } from "../../lib/api";
import { createReraComplianceBlockImage } from "../../lib/rera-block";
import { createLayerId, normalizeHexColor, type CanvasImageLayer } from "../../lib/editor-types";

interface AssetsPaneProps {
  sessionToken: string | null;
  activeBrandId: string | null;
  activeAssets: BootstrapResponse["brandAssets"];
  workspaceComplianceSettings: {
    workspaceId: string;
    reraAuthorityLabel: string;
    reraWebsiteUrl: string;
    reraTextColor: string;
    updatedAt: string | null;
  };
  projectReraRegistrations: BootstrapResponse["projectReraRegistrations"];
}

export function AssetsPane({
  sessionToken,
  activeBrandId,
  activeAssets,
  workspaceComplianceSettings,
  projectReraRegistrations,
}: AssetsPaneProps) {
  const { state, addLayer, setSelectedLayerId, setActiveEditorPane, pushToHistory } = useEditorContext();
  const [reraBlockTextColor, setReraBlockTextColor] = useState(() =>
    normalizeHexColor(workspaceComplianceSettings.reraTextColor, "#111111")
  );
  const [reraNumberText, setReraNumberText] = useState("");

  const logoAssets = useMemo(
    () => activeAssets.filter((asset) => asset.kind === "logo"),
    [activeAssets]
  );

  const reraQrAssetById = useMemo(
    () => new Map(activeAssets.filter((asset) => asset.kind === "rera_qr").map((asset) => [asset.id, asset])),
    [activeAssets]
  );

  const reraComplianceOptions = useMemo(() => {
    const scoped = state.currentSourceProjectId
      ? projectReraRegistrations.filter((registration) => registration.projectId === state.currentSourceProjectId)
      : projectReraRegistrations;
    const ordered = [...scoped].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
    return ordered
      .map((registration) => ({
        registration,
        qrAsset: registration.qrAssetId ? reraQrAssetById.get(registration.qrAssetId) ?? null : null,
      }))
      .filter((option) => option.registration.registrationNumber || option.qrAsset);
  }, [projectReraRegistrations, state.currentSourceProjectId, reraQrAssetById]);

  async function resolveAssetOriginalUrl(asset: BootstrapResponse["brandAssets"][number]) {
    if (sessionToken) {
      const urls = await getBrandAssetImageUrls(sessionToken, asset.brandId, asset.id).catch(() => null);
      if (urls?.originalUrl) {
        return urls.originalUrl;
      }
    }

    return asset.originalUrl ?? asset.previewUrl ?? null;
  }

  async function handleAddLogoAsset(asset: BootstrapResponse["brandAssets"][number]) {
    if (!state.currentImage) return;

    const sourceUrl = await resolveAssetOriginalUrl(asset);
    if (!sourceUrl) return;

    const dimensions = { width: 1, height: 1 };
    const isQr = asset.kind === "rera_qr";
    const width = isQr ? 0.16 : 0.22;
    const height = isQr ? 0.22 : 0.18;

    const layer = buildImageLayer(sourceUrl, asset.label, width, height, state.currentImage, {
      x: isQr ? 0.78 : 0.08,
      y: isQr ? 0.78 : 0.08,
      sourceStoragePath: asset.storagePath,
      preserveOnAiEdit: true,
    });

    pushToHistory();
    addLayer(layer);
    setSelectedLayerId(layer.id);
    setActiveEditorPane("layers");
  }

  async function handleAddReraComplianceBlock(option: (typeof reraComplianceOptions)[number]) {
    if (!state.currentImage) return;

    const number = option.registration.registrationNumber?.trim();
    const qrSourceUrl = option.qrAsset ? await resolveAssetOriginalUrl(option.qrAsset) : null;

    if (!number && !qrSourceUrl) return;

    const authorityLabel = workspaceComplianceSettings.reraAuthorityLabel.trim() || "MahaRERA";
    const websiteUrl = workspaceComplianceSettings.reraWebsiteUrl.trim() || "https://maharera.maharashtra.gov.in";
    const textColor = normalizeHexColor(reraBlockTextColor, "#111111");

    const blockImage = await createReraComplianceBlockImage({
      authorityLabel,
      registrationNumber: number || "RERA",
      websiteUrl,
      textColor,
      ...(qrSourceUrl ? { qrSourceUrl } : {}),
    });

    const layerWidth = 0.42;
    const layerHeight = Math.min(
      0.18,
      layerWidth * (blockImage.height / blockImage.width) * (state.currentImage.width / state.currentImage.height)
    );

    const layer: CanvasImageLayer = {
      id: createLayerId("rera-block"),
      type: "image",
      name: "RERA compliance block",
      src: blockImage.dataUrl,
      sourceStoragePath: null,
      x: 0.54,
      y: 0.04,
      width: layerWidth,
      height: Math.max(0.04, layerHeight),
      rotation: 0,
      filter: "none",
      opacity: 1,
      reraBlock: {
        authorityLabel,
        registrationNumber: number || "RERA",
        websiteUrl,
        textColor,
        qrSourceUrl: qrSourceUrl || null,
      },
      preserveOnAiEdit: true,
    };

    pushToHistory();
    addLayer(layer);
    setSelectedLayerId(layer.id);
    setActiveEditorPane("layers");
  }

  function handleAddReraNumberLayer() {
    if (!state.currentImage) return;

    const value = reraNumberText.trim();
    if (!value) return;

    const textValue = /^rera\b/i.test(value) ? value : `RERA: ${value}`;
    const fontSize = Math.max(16, Math.round(state.currentImage.width * 0.02));

    const layer = {
      id: `rera-text-${Date.now().toString(36)}`,
      type: "text" as const,
      text: textValue,
      x: 0.06,
      y: 0.9,
      width: 0.52,
      rotation: 0,
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      fontSize,
      fontWeight: "600" as const,
      color: "#ffffff",
      backgroundColor: "rgba(17,24,39,0.82)",
      align: "left" as const,
      letterSpacing: 0,
      lineHeight: 1.2,
      shadow: false,
      effect: "none",
      effectColor1: "#7c3aed",
      effectColor2: "#00fff9",
      shape: "none" as const,
      curveAmount: 0,
      opacity: 1,
    };

    pushToHistory();
    addLayer(layer);
    setSelectedLayerId(layer.id);
    setActiveEditorPane("layers");
  }

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <p className="panel-label">Brand assets</p>
        <h2>Assets</h2>
      </div>
      <p className="ai-editor-pane-copy">Place approved logos and compliant RERA blocks on the current canvas. These stay editable above future AI edits.</p>

      <div className="ai-editor-asset-list">
        {logoAssets.length > 0 ? (
          logoAssets.map((asset) => (
            <button
              className="ai-editor-asset-card"
              disabled={!state.currentImage || !(asset.originalUrl ?? asset.previewUrl)}
              key={asset.id}
              onClick={() => void handleAddLogoAsset(asset)}
              type="button"
            >
              <span className="ai-editor-asset-preview">
                {asset.thumbnailUrl ?? asset.previewUrl ? (
                  <img alt={asset.label} src={asset.thumbnailUrl ?? asset.previewUrl} />
                ) : (
                  <span>{asset.kind === "rera_qr" ? "QR" : "Logo"}</span>
                )}
              </span>
              <span className="ai-editor-asset-copy">
                <strong>{asset.label}</strong>
                <small>Logo</small>
              </span>
            </button>
          ))
        ) : (
          <div className="ai-editor-pane-empty-state">
            <div className="ai-editor-pane-empty-icon">◫</div>
            <p>No logo assets uploaded for this brand yet.</p>
          </div>
        )}
      </div>

      <section className="ai-editor-rera-section">
        <div>
          <h3 className="ai-editor-pane-subtitle">RERA compliance block</h3>
          <p className="ai-editor-pane-copy">
            Uses {workspaceComplianceSettings.reraAuthorityLabel} with the configured website and the project-specific number + QR.
          </p>
        </div>

        <label className="create-field-label">
          Text color
          <StudioColorPicker
            onChange={(color) => setReraBlockTextColor(normalizeHexColor(color, "#111111"))}
            value={normalizeHexColor(reraBlockTextColor, "#111111")}
            variant="field"
          />
        </label>

        <div className="ai-editor-rera-card-list">
          {reraComplianceOptions.length > 0 ? (
            reraComplianceOptions.map((option) => (
              <button
                className="ai-editor-rera-card"
                disabled={!state.currentImage}
                key={option.registration.id}
                onClick={() => void handleAddReraComplianceBlock(option)}
                type="button"
              >
                <span className="ai-editor-rera-preview">
                  <span style={{ color: normalizeHexColor(reraBlockTextColor, "#111111") }}>
                    {workspaceComplianceSettings.reraAuthorityLabel}
                  </span>
                  <strong style={{ color: normalizeHexColor(reraBlockTextColor, "#111111") }}>
                    {option.registration.registrationNumber ?? "QR only"}
                  </strong>
                  <small style={{ color: normalizeHexColor(reraBlockTextColor, "#111111") }}>
                    {workspaceComplianceSettings.reraWebsiteUrl}
                  </small>
                  {option.qrAsset?.thumbnailUrl ?? option.qrAsset?.previewUrl ? (
                    <img alt={option.qrAsset.label} src={option.qrAsset.thumbnailUrl ?? option.qrAsset.previewUrl} />
                  ) : (
                    <i aria-hidden="true" />
                  )}
                </span>
                <span className="ai-editor-asset-copy">
                  <strong>{option.registration.label}</strong>
                  <small>
                    {option.registration.projectId
                      ? option.registration.isDefault
                        ? "Project default"
                        : "Project RERA"
                      : "General RERA"}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <div className="ai-editor-pane-empty-state">
              <div className="ai-editor-pane-empty-icon">▦</div>
              <p>No project RERA registration found. Upload number + QR from Brand Kit media.</p>
            </div>
          )}
        </div>

        <details className="ai-editor-manual-rera">
          <summary>Manual RERA text fallback</summary>
          <label className="create-field-label">
            RERA number text
            <input
              className="input"
              onChange={(event) => setReraNumberText(event.target.value)}
              placeholder="Example: P52100012345"
              value={reraNumberText}
            />
          </label>
          <button
            className="button button-ghost ai-editor-full-button"
            disabled={!state.currentImage}
            onClick={handleAddReraNumberLayer}
            type="button"
          >
            Add RERA number text
          </button>
        </details>
      </section>

      {!state.currentImage ? <p className="create-hint">Upload an image or choose a template before placing assets.</p> : null}
    </div>
  );
}
