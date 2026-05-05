"use client";

import { useState } from "react";
import { useEditorContext } from "../EditorContext";
import { StudioColorPicker } from "../../components/StudioColorPicker";

interface TopFormattingBarProps {
  onOpenEffects: () => void;
  onOpenPosition: () => void;
  onOpenFont: () => void;
}

export function TopFormattingBar({ onOpenEffects, onOpenPosition, onOpenFont }: TopFormattingBarProps) {
  const { state, selectedLayer, updateLayer, duplicateLayer, deleteLayer, pushToHistory, beginTransaction, commitTransaction } = useEditorContext();
  const [showMore, setShowMore] = useState(false);

  if (!selectedLayer) return null;
  const hasPrimaryControls = selectedLayer.type === "text" || selectedLayer.type === "shape";

  function handleFontSizeChange(delta: number) {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    const newSize = Math.max(8, Math.min(260, selectedLayer.fontSize + delta));
    pushToHistory();
    updateLayer(state.selectedLayerId!, { fontSize: newSize });
  }

  function handleFontSizeInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    updateLayer(state.selectedLayerId!, { fontSize: Number(e.target.value) });
  }

  function handleTextColorChange(color: string) {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    updateLayer(state.selectedLayerId!, { color });
  }

  function handleBoldToggle() {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    pushToHistory();
    updateLayer(state.selectedLayerId!, { fontWeight: selectedLayer.fontWeight === "700" ? "400" : "700" });
  }

  function handleAlignToggle() {
    if (!selectedLayer || selectedLayer.type !== "text") return;
    pushToHistory();
    const nextAlign = selectedLayer.align === "left" ? "center" : selectedLayer.align === "center" ? "right" : "left";
    updateLayer(state.selectedLayerId!, { align: nextAlign });
  }

  function handleOpenPosition() {
    setShowMore(false);
    onOpenPosition();
  }

  function handleOpenEffects() {
    setShowMore(false);
    onOpenEffects();
  }

  function handleDuplicateLayer() {
    if (!state.selectedLayerId) return;
    pushToHistory();
    duplicateLayer(state.selectedLayerId);
    setShowMore(false);
  }

  function handleDeleteLayer() {
    if (!state.selectedLayerId) return;
    pushToHistory();
    deleteLayer(state.selectedLayerId);
    setShowMore(false);
  }

  function handleOpacityChange(e: React.ChangeEvent<HTMLInputElement>) {
    updateLayer(state.selectedLayerId!, { opacity: Number(e.target.value) });
  }

  function handleSpacingChange(key: "letterSpacing" | "lineHeight", val: number) {
    updateLayer(state.selectedLayerId!, { [key]: val });
  }

  return (
    <div className="ai-edit-top-formatting-bar">
      <div className="ai-edit-format-group">
        {selectedLayer.type === "text" && (
          <>
            <button className="ai-edit-format-font-trigger" onClick={onOpenFont} type="button">
              <span>{(selectedLayer.fontFamily.split(",")[0] ?? "Font").replace(/['"]/g, "")}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </button>

            <div className="ai-edit-format-divider" />

            <div className="ai-edit-format-stepper">
              <button onClick={() => handleFontSizeChange(-1)} title="Decrease size" type="button">-</button>
              <input
                max={260}
                min={8}
                onBlur={commitTransaction}
                onChange={handleFontSizeInput}
                onFocus={() => beginTransaction()}
                type="number"
                value={Math.round(selectedLayer.fontSize)}
              />
              <button onClick={() => handleFontSizeChange(1)} title="Increase size" type="button">+</button>
            </div>

            <div className="ai-edit-format-divider" />

            <StudioColorPicker
              onChange={handleTextColorChange}
              onChangeEnd={commitTransaction}
              onChangeStart={beginTransaction}
              title="Text Color"
              trigger="text"
              value={selectedLayer.color}
            />

            <button
              className={`ai-edit-format-btn ${selectedLayer.fontWeight === "700" ? "is-active" : ""}`}
              onClick={handleBoldToggle}
              title="Bold"
              type="button"
            >
              <span style={{ fontWeight: 700 }}>B</span>
            </button>

            <button className="ai-edit-format-btn" onClick={handleAlignToggle} title={`Align ${selectedLayer.align}`} type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {selectedLayer.align === "center" ? (
                  <path d="M18 10H6M21 6H3M21 14H3M18 18H6" />
                ) : selectedLayer.align === "right" ? (
                  <path d="M21 10H7M21 6H3M21 14H3M21 18H7" />
                ) : (
                  <path d="M17 10H3M21 6H3M21 14H3M17 18H3" />
                )}
              </svg>
            </button>
          </>
        )}

        {selectedLayer.type === "shape" && (
          <StudioColorPicker
            onChange={(color) => updateLayer(state.selectedLayerId!, { fill: color })}
            onChangeEnd={commitTransaction}
            onChangeStart={beginTransaction}
            title="Fill Color"
            value={(selectedLayer as any).fill || "#000000"}
          />
        )}

        {hasPrimaryControls ? <div className="ai-edit-format-divider" /> : null}

        <button className="ai-edit-format-btn" onClick={handleOpenPosition} title="Position" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 12h18M12 3v18" />
          </svg>
        </button>

        <button className="ai-edit-format-btn" onClick={handleDuplicateLayer} title="Duplicate" type="button">
          <svg fill="none" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect height="14" width="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16V4a2 2 0 0 1 2-2h12" />
          </svg>
        </button>

        <button className="ai-edit-format-btn is-danger" onClick={handleDeleteLayer} title="Delete" type="button">
          <svg fill="none" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>

        <div className="ai-edit-format-divider" />

        <div className="more-control-container" style={{ position: "relative" }}>
          <button 
            className={`ai-edit-format-btn ${showMore ? "is-active" : ""}`} 
            onClick={() => setShowMore(!showMore)}
            title="Advanced Settings"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
          {showMore && (
            <div className="more-popover">
              {selectedLayer.type === "text" ? (
                <button className="more-popover-item" onClick={handleOpenEffects} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  </svg>
                  Effects
                </button>
              ) : null}
              
              {selectedLayer.type === "text" && (
                <div className="spacing-control-group">
                  <div className="spacing-field">
                    <label>Letter Spacing</label>
                    <input 
                      type="range" 
                      min="-5" 
                      max="20" 
                      step="0.5"
                      value={selectedLayer.letterSpacing} 
                      onBlur={commitTransaction}
                      onChange={(e) => handleSpacingChange("letterSpacing", Number(e.target.value))} 
                      onFocus={() => beginTransaction()}
                      onPointerDown={() => beginTransaction()}
                      onPointerUp={commitTransaction}
                    />
                  </div>
                  <div className="spacing-field">
                    <label>Line Height</label>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="3" 
                      step="0.1"
                      value={selectedLayer.lineHeight} 
                      onBlur={commitTransaction}
                      onChange={(e) => handleSpacingChange("lineHeight", Number(e.target.value))} 
                      onFocus={() => beginTransaction()}
                      onPointerDown={() => beginTransaction()}
                      onPointerUp={commitTransaction}
                    />
                  </div>
                </div>
              )}

              <div className="opacity-control-container">
                <label className="opacity-label">Transparency</label>
                <input
                  className="ai-edit-range mini-range"
                  max={1}
                  min={0}
                  onBlur={commitTransaction}
                  onChange={handleOpacityChange}
                  onFocus={() => beginTransaction()}
                  step={0.01}
                  type="range"
                  value={selectedLayer.opacity}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
