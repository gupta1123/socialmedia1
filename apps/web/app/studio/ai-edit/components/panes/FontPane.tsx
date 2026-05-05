"use client";

import { useState, useMemo, useEffect } from "react";
import { useEditorContext } from "../../EditorContext";
import { GOOGLE_FONTS, generateGoogleFontsUrl } from "../../lib/fonts-registry";

export function FontPane() {
  const { state, updateLayer, pushToHistory, setActiveEditorPane } = useEditorContext();
  const [searchQuery, setSearchQuery] = useState("");

  const selectedLayer = state.selectedLayerId 
    ? state.canvasLayers.find((l) => l.id === state.selectedLayerId)
    : null;

  const isTextLayerSelected = selectedLayer?.type === "text";

  useEffect(() => {
    const id = "ai-edit-google-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.href = generateGoogleFontsUrl();
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
  }, []);

  const filteredFonts = useMemo(() => {
    if (!searchQuery.trim()) return GOOGLE_FONTS;
    const lowerQuery = searchQuery.toLowerCase();
    return GOOGLE_FONTS.filter((font) => font.label.toLowerCase().includes(lowerQuery));
  }, [searchQuery]);

  function handleSelectFont(fontValue: string) {
    if (!isTextLayerSelected || !state.selectedLayerId) return;
    pushToHistory();
    updateLayer(state.selectedLayerId, { fontFamily: fontValue });
  }

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <button 
          className="create-inline-action" 
          onClick={() => setActiveEditorPane("text")}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginBottom: "8px", border: "none", background: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--ink-soft)" }}
          type="button"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back
        </button>
        <h2>Font</h2>
      </div>

      <div className="ai-editor-search-container">
        <input
          type="text"
          className="ai-editor-search-input"
          placeholder='Try "Roboto" or "Open Sans"'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="effects-scroll-container" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto", paddingRight: "4px" }}>
        {!isTextLayerSelected && (
          <p className="ai-edit-primary-hint">Select a text layer to change its font.</p>
        )}

        <div className="ai-editor-font-list" style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "12px" }}>
          {filteredFonts.map((font) => {
            const isActive = selectedLayer?.type === "text" && selectedLayer.fontFamily === font.value;
            return (
              <button
                key={font.label}
                onClick={() => handleSelectFont(font.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: isActive ? "var(--brand-soft)" : "transparent",
                  border: "none",
                  borderRadius: "8px",
                  cursor: isTextLayerSelected ? "pointer" : "not-allowed",
                  opacity: isTextLayerSelected ? 1 : 0.5,
                  textAlign: "left",
                  transition: "background 150ms ease",
                }}
                disabled={!isTextLayerSelected}
                onMouseEnter={(e) => {
                  if (isTextLayerSelected && !isActive) e.currentTarget.style.background = "var(--paper-strong)";
                }}
                onMouseLeave={(e) => {
                  if (isTextLayerSelected && !isActive) e.currentTarget.style.background = "transparent";
                }}
                type="button"
              >
                <span style={{ 
                  fontFamily: font.value, 
                  fontSize: "16px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--brand)" : "var(--ink)",
                }}>
                  {font.label}
                </span>
                {isActive && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
