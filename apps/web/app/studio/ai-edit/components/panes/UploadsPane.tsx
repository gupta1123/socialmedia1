"use client";

import type { CreativeOutputRecord } from "@image-lab/contracts";
import { useEditorContext } from "../../EditorContext";
import { createEditableImage, loadImageSourceDimensions, sourceToFile } from "../../lib/editor-files";
import { getCreativeOutput } from "../../lib/api";
import { createLayerId, type CanvasImageLayer } from "../../lib/editor-types";

interface UploadsPaneProps {
  sessionToken: string | null;
  activeBrandId: string | null;
  recentOutputs: CreativeOutputRecord[];
  isLoadingRecent?: boolean;
  onViewAllGenerated: () => void;
  onUploadClick: () => void;
  onAddImageLayerClick: () => void;
  onClearCanvas: () => void;
}

export function UploadsPane({ sessionToken, recentOutputs, isLoadingRecent, onViewAllGenerated, onUploadClick, onAddImageLayerClick, onClearCanvas }: UploadsPaneProps) {
  const {
    state,
    setOriginalImage,
    setCurrentImage,
    addLayer,
    setCanvasLayers,
    resetToOriginal,
    setCurrentSourceOutputId,
    setCurrentSourceBrandId,
    setCurrentSourceProjectId,
    setCurrentSourceReviewState,
    setActiveEditorPane,
    pushToHistory,
  } = useEditorContext();
  const recentGeneratedOutputAssets = recentOutputs.slice(0, 5);

  async function resolveGeneratedOutputSourceUrl(output: CreativeOutputRecord) {
    if (sessionToken) {
      const fullOutput = await getCreativeOutput(sessionToken, output.id).catch(() => null);
      if (fullOutput?.originalUrl) {
        return fullOutput.originalUrl;
      }
      if (fullOutput?.previewUrl) {
        return fullOutput.previewUrl;
      }
    }

    return output.originalUrl ?? output.previewUrl ?? null;
  }

  async function handleAddGeneratedOutputLayer(output: CreativeOutputRecord) {
    const sourceUrl = await resolveGeneratedOutputSourceUrl(output);
    if (!sourceUrl) {
      return;
    }

    if (!state.currentImage) {
      const file = await sourceToFile(sourceUrl, `generated-post-${output.outputIndex + 1}.png`, "image/png");
      const image = await createEditableImage(file);
      pushToHistory();
      setOriginalImage(image);
      setCurrentImage(image);
      setCurrentSourceOutputId(output.id);
      setCurrentSourceBrandId(output.brandId);
      setCurrentSourceProjectId(output.projectId);
      setCurrentSourceReviewState(output.reviewState);
      setCanvasLayers([]);
      setActiveEditorPane("uploads");
      return;
    }

    const dimensions = await loadImageSourceDimensions(sourceUrl);
    const width = 0.36;
    const height = Math.min(0.5, width * (dimensions.height / dimensions.width) * (state.currentImage.width / state.currentImage.height));
    const layer: CanvasImageLayer = {
      id: createLayerId("generated-post"),
      type: "image",
      name: `Generated post #${output.outputIndex + 1}`,
      src: sourceUrl,
      sourceStoragePath: output.storagePath,
      x: 0.06,
      y: 0.06,
      width,
      height: Math.max(0.08, height),
      rotation: 0,
      filter: "none",
      opacity: 1,
    };

    pushToHistory();
    addLayer(layer);
    setActiveEditorPane("layers");
  }

  function handleResetToOriginal() {
    pushToHistory();
    resetToOriginal();
  }

  return (
    <div className="ai-editor-pane">
      <button className="ai-edit-upload-card" onClick={onUploadClick} type="button">
        <svg className="ai-edit-upload-icon-svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 16 12 12 8 16" />
          <line x1="12" y1="12" x2="12" y2="21" />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
        </svg>
        <span>{state.currentImage ? "Replace base image" : "Upload image"}</span>
        <small>{state.currentImage ? state.currentImage.file.name : "PNG, JPG or WebP"}</small>
      </button>

      <button className="button button-ghost ai-editor-full-button" disabled={!state.currentImage} onClick={onAddImageLayerClick} type="button">
        Add image layer
      </button>

      <section className="ai-editor-generated-section">
        <div className="ai-editor-generated-header">
          <div>
            <h3 className="ai-editor-pane-subtitle">Recent designs</h3>
          </div>
          {recentOutputs.length > recentGeneratedOutputAssets.length ? (
            <button className="create-inline-action ai-editor-view-more" onClick={onViewAllGenerated} type="button">
              View all
            </button>
          ) : null}
        </div>
        <div className="ai-editor-recent-grid">
          {isLoadingRecent ? (
            [...Array(4)].map((_, i) => (
              <div className="ai-editor-recent-grid-item ai-editor-skeleton" key={`loading-${i}`} />
            ))
          ) : recentGeneratedOutputAssets.length > 0 ? (
            recentGeneratedOutputAssets.map((output) => (
              <button
                className="ai-editor-recent-grid-item"
                disabled={!(output.originalUrl ?? output.previewUrl)}
                key={output.id}
                onClick={() => void handleAddGeneratedOutputLayer(output)}
                title={`Generated post #${output.outputIndex + 1}`}
                type="button"
              >
                {output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl ? (
                  <img alt={`Generated post ${output.outputIndex + 1}`} src={output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl} />
                ) : (
                  <span>Post</span>
                )}
              </button>
            ))
          ) : (
            <div className="ai-editor-pane-empty-state">
              <div className="ai-editor-pane-empty-icon">⌘</div>
              <p>No generated posts available yet for this brand.</p>
            </div>
          )}
        </div>
      </section>

      <div className="create-picker-summary">
        <div>
          <p className="create-picker-summary-label">Current canvas</p>
          <strong>{state.currentImage ? `${state.currentImage.width} x ${state.currentImage.height}` : "No image loaded"}</strong>
        </div>
        {state.currentImage ? (
          <div className="create-picker-summary-actions">
            {state.originalImage && (state.originalImage.file !== state.currentImage.file || state.canvasLayers.length > 0) ? (
              <button className="create-inline-action" onClick={handleResetToOriginal} type="button">
                Reset
              </button>
            ) : null}
            <button className="create-inline-action is-danger" onClick={onClearCanvas} type="button">
              Start over
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
