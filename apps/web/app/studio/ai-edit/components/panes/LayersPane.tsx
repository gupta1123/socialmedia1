"use client";

import { useState } from "react";
import { useEditorContext } from "../../EditorContext";
import { StudioColorPicker } from "../../../components/StudioColorPicker";
import { getLayerLabel, isLayerVisible, normalizeHexColor, type CanvasLayer } from "../../lib/editor-types";
import { createReraComplianceBlockImage } from "../../lib/rera-block";

export function LayersPane() {
  const { state, selectedLayer, setSelectedLayerId, updateLayer, deleteLayer, reorderLayer, setToolMode, pushToHistory, beginTransaction, commitTransaction } = useEditorContext();
  const [isUpdatingReraColor, setIsUpdatingReraColor] = useState(false);
  const layerRows = state.canvasLayers.map((layer, index) => ({ layer, index })).reverse();

  const selectedReraBlockLayer =
    selectedLayer?.type === "image" && selectedLayer.reraBlock
      ? selectedLayer
      : null;

  function handleDeleteLayer(id: string) {
    pushToHistory();
    deleteLayer(id);
  }

  function handleReorderLayer(id: string, direction: "forward" | "backward") {
    pushToHistory();
    reorderLayer(id, direction);
  }

  function handleToggleLayerVisibility(layer: CanvasLayer) {
    pushToHistory();
    updateLayer(layer.id, { visible: !isLayerVisible(layer) });
  }

  function handleSelectLayer(id: string) {
    setSelectedLayerId(id);
    setToolMode("select");
  }

  function handleTextChange(text: string) {
    if (!state.selectedLayerId) return;
    updateLayer(state.selectedLayerId, { text });
  }

  async function handleReraBlockColorChange(color: string) {
    if (!selectedReraBlockLayer?.reraBlock) return;

    const nextColor = normalizeHexColor(color, selectedReraBlockLayer.reraBlock.textColor);
    updateLayer(selectedReraBlockLayer.id, {
      reraBlock: {
        ...selectedReraBlockLayer.reraBlock,
        textColor: nextColor,
      },
    });

    if (nextColor !== color) {
      return;
    }

    setIsUpdatingReraColor(true);
    try {
      const blockImage = await createReraComplianceBlockImage({
        ...selectedReraBlockLayer.reraBlock,
        textColor: nextColor,
      });
      updateLayer(selectedReraBlockLayer.id, {
        src: blockImage.dataUrl,
        reraBlock: {
          ...selectedReraBlockLayer.reraBlock,
          textColor: nextColor,
        },
      });
    } finally {
      setIsUpdatingReraColor(false);
    }
  }

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <p className="panel-label">Stack</p>
        <h2>Layers Management</h2>
      </div>
      <p className="ai-editor-pane-copy">Click a layer to select it. Use controls below to edit or reorder.</p>

      <div className="ai-editor-layer-list">
        {state.canvasLayers.length > 0 ? (
          layerRows.map(({ layer, index }) => {
            const isSelected = state.selectedLayerId === layer.id;
            const isVisible = isLayerVisible(layer);
            return (
              <div className={`ai-editor-layer-row ${isSelected ? "is-active" : ""} ${isVisible ? "" : "is-hidden"}`} key={layer.id}>
                <button
                  className="ai-editor-layer-select-btn"
                  onClick={() => handleSelectLayer(layer.id)}
                  type="button"
                >
                  <span className="ai-editor-layer-meta">
                    <span className="ai-editor-layer-kind">{layer.type}</span>
                    {!isVisible ? <span className="ai-editor-layer-hidden-pill">Hidden</span> : null}
                  </span>
                  <strong>{getLayerLabel(layer)}</strong>
                </button>
                <div className="ai-editor-layer-row-actions" aria-label={`${getLayerLabel(layer)} actions`}>
                  <button
                    aria-label="Move layer up"
                    className="ai-editor-layer-mini-btn"
                    disabled={index === state.canvasLayers.length - 1}
                    onClick={() => handleReorderLayer(layer.id, "forward")}
                    title="Move up"
                    type="button"
                  >
                    <svg fill="none" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" width="14">
                      <path d="m6 15 6-6 6 6" />
                    </svg>
                  </button>
                  <button
                    aria-label="Move layer down"
                    className="ai-editor-layer-mini-btn"
                    disabled={index === 0}
                    onClick={() => handleReorderLayer(layer.id, "backward")}
                    title="Move down"
                    type="button"
                  >
                    <svg fill="none" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" width="14">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    aria-label={isVisible ? "Hide layer" : "Show layer"}
                    className={`ai-editor-layer-mini-btn ${isVisible ? "" : "is-active"}`}
                    onClick={() => handleToggleLayerVisibility(layer)}
                    title={isVisible ? "Hide" : "Show"}
                    type="button"
                  >
                    {isVisible ? (
                      <svg fill="none" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" width="14">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg fill="none" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" width="14">
                        <path d="m3 3 18 18" />
                        <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.8" />
                        <path d="M9.9 5.2A9.2 9.2 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.1 3.1" />
                        <path d="M6.6 6.7C3.6 8.7 2 12 2 12s3.5 7 10 7a9.5 9.5 0 0 0 4.2-1" />
                      </svg>
                    )}
                  </button>
                  <button
                    aria-label="Delete layer"
                    className="ai-editor-layer-mini-btn is-danger"
                    onClick={() => handleDeleteLayer(layer.id)}
                    title="Delete"
                    type="button"
                  >
                    <svg fill="none" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" width="14">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="ai-editor-pane-empty-state">
            <div className="ai-editor-pane-empty-icon">☰</div>
            <p>No editable layers yet. Add text or images to get started.</p>
          </div>
        )}
      </div>

      {selectedLayer ? (
        <div className="ai-editor-layer-controls">
          {selectedLayer.type === "text" ? (
            <label className="create-field-label">
              Text Content
              <textarea
                className="create-prompt-textarea ai-editor-textarea"
                onBlur={commitTransaction}
                onChange={(event) => handleTextChange(event.target.value)}
                onFocus={() => beginTransaction()}
                rows={3}
                value={selectedLayer.text}
              />
            </label>
          ) : null}

          {selectedLayer.type === "image" && selectedLayer.reraBlock ? (
            <label className="create-field-label">
              RERA text color
              <StudioColorPicker
                disabled={isUpdatingReraColor}
                onChange={(color) => handleReraBlockColorChange(color)}
                onChangeEnd={commitTransaction}
                onChangeStart={beginTransaction}
                value={normalizeHexColor(selectedLayer.reraBlock.textColor, "#111111")}
                variant="field"
              />
              {isUpdatingReraColor ? <small className="ai-editor-field-hint">Updating RERA block...</small> : null}
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
