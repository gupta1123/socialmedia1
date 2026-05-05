"use client";

import { useEditorContext } from "../../EditorContext";
import { centerSelectedLayer } from "../../lib/layer-utils";

interface PositionPaneProps {}

export function PositionPane({}: PositionPaneProps) {
  const { state, selectedLayer, updateLayer, reorderLayer, pushToHistory, beginTransaction, commitTransaction } = useEditorContext();

  function handleCenterLayer(axis: "horizontal" | "vertical" | "top" | "bottom" | "left" | "right") {
    if (!selectedLayer || !state.selectedLayerId) return;
    const patch = centerSelectedLayer(selectedLayer, axis);
    pushToHistory();
    updateLayer(state.selectedLayerId, patch);
  }

  function handleReorder(direction: "forward" | "backward" | "front" | "back") {
    if (!state.selectedLayerId) return;
    pushToHistory();
    reorderLayer(state.selectedLayerId, direction);
  }

  if (!selectedLayer) {
    return (
      <div className="ai-editor-pane">
        <div className="ai-editor-pane-header">
          <p className="panel-label">Arrange</p>
          <h2>Position</h2>
        </div>
        <p className="ai-editor-pane-copy">Select a layer to adjust its position.</p>
      </div>
    );
  }

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <p className="panel-label">Arrange</p>
        <h2>Position</h2>
      </div>

      <div className="ai-editor-position-section">
        <h3>Arrange</h3>
        <div className="ai-editor-position-grid">
          <button className="ai-editor-position-btn" onClick={() => handleReorder("forward")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 15-6-6-6 6" />
            </svg>{" "}
            Forward
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleReorder("backward")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>{" "}
            Backward
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleReorder("front")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 4v16m-4-4 4 4 4-4" />
            </svg>{" "}
            To front
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleReorder("back")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20V4m-4 4 4-4 4 4" />
            </svg>{" "}
            To back
          </button>
        </div>
      </div>

      <div className="ai-editor-position-section">
        <h3>Align to page</h3>
        <div className="ai-editor-position-grid">
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("top")}>
            Top
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("left")}>
            Left
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("vertical")}>
            Middle
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("horizontal")}>
            Center
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("bottom")}>
            Bottom
          </button>
          <button className="ai-editor-position-btn" onClick={() => handleCenterLayer("right")}>
            Right
          </button>
        </div>
      </div>

      <div className="ai-editor-position-section">
        <h3>Advanced</h3>
        <div className="ai-editor-control-grid">
          <label className="create-field-label">
            Width{" "}
            <input
              className="input"
              type="number"
              value={Math.round(selectedLayer.width * 100)}
              onBlur={commitTransaction}
              onChange={(e) => updateLayer(state.selectedLayerId!, { width: Number(e.target.value) / 100 })}
              onFocus={() => beginTransaction()}
            />
          </label>
          {"height" in selectedLayer ? (
            <label className="create-field-label">
              Height{" "}
              <input
                className="input"
                type="number"
                value={Math.round(selectedLayer.height * 100)}
                onBlur={commitTransaction}
                onChange={(e) => updateLayer(state.selectedLayerId!, { height: Number(e.target.value) / 100 })}
                onFocus={() => beginTransaction()}
              />
            </label>
          ) : (
            <label className="create-field-label" />
          )}
        </div>
        <div className="ai-editor-control-grid" style={{ marginTop: 8 }}>
          <label className="create-field-label">
            X{" "}
            <input
              className="input"
              type="number"
              value={Math.round(selectedLayer.x * 100)}
              onBlur={commitTransaction}
              onChange={(e) => updateLayer(state.selectedLayerId!, { x: Number(e.target.value) / 100 })}
              onFocus={() => beginTransaction()}
            />
          </label>
          <label className="create-field-label">
            Y{" "}
            <input
              className="input"
              type="number"
              value={Math.round(selectedLayer.y * 100)}
              onBlur={commitTransaction}
              onChange={(e) => updateLayer(state.selectedLayerId!, { y: Number(e.target.value) / 100 })}
              onFocus={() => beginTransaction()}
            />
          </label>
        </div>
        <div className="ai-editor-control-grid" style={{ marginTop: 8 }}>
          <label className="create-field-label">
            Rotate{" "}
            <input
              className="input"
              type="number"
              value={Math.round(selectedLayer.rotation || 0)}
              onBlur={commitTransaction}
              onChange={(e) => updateLayer(state.selectedLayerId!, { rotation: Number(e.target.value) })}
              onFocus={() => beginTransaction()}
            />
          </label>
          <label className="create-field-label">
            Opacity{" "}
            <input
              className="input"
              max={100}
              min={0}
              type="number"
              value={Math.round(selectedLayer.opacity * 100)}
              onBlur={commitTransaction}
              onChange={(e) => updateLayer(state.selectedLayerId!, { opacity: Number(e.target.value) / 100 })}
              onFocus={() => beginTransaction()}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
