"use client";

import { useMemo, useState } from "react";
import { useEditorContext } from "../../EditorContext";
import { ELEMENT_CATEGORIES, type ElementDef } from "../../lib/elements-registry";
import { createLayerId } from "../../lib/editor-types";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface CanvasSvgLayer {
  id: string;
  type: "shape";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  opacity: number;
  svgBody?: string; // stored on the layer for rendering
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ElementsPane() {
  const { state, addLayer, pushToHistory, setToolMode } = useEditorContext();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Filter elements by search + active category
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ELEMENT_CATEGORIES.map((cat) => ({
      ...cat,
      elements: cat.elements.filter(
        (el) =>
          (activeCategory === "all" || activeCategory === cat.id) &&
          (q === "" || el.label.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.elements.length > 0);
  }, [query, activeCategory]);

  function handleAddElement(el: ElementDef) {
    if (!state.currentImage) return;
    pushToHistory();

    const layer = {
      id: createLayerId("svg"),
      type: "shape" as const,
      label: el.label,
      x: 0.3,
      y: 0.3,
      width: 0.2,
      height: 0.2,
      rotation: 0,
      fill: "#111111",
      opacity: 1,
      // We store the element id so the renderer can look up the SVG
      svgElementId: el.id,
    };

    // @ts-ignore — svgElementId is an extended field, handled in renderer
    addLayer(layer);
    setToolMode("select");
  }

  const disabled = !state.currentImage;

  return (
    <div className="ai-editor-pane elements-pane">
      {/* Header */}
      <div className="ai-editor-pane-header">
        <p className="panel-label">Library</p>
        <h2>Elements</h2>
      </div>

      {/* Search */}
      <div className="elements-search-wrap">
        <svg className="elements-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          className="elements-search-input"
          placeholder="Search elements…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="elements-search-clear" onClick={() => setQuery("")} type="button">
            ×
          </button>
        )}
      </div>

      {/* Category pills */}
      <div className="elements-category-pills">
        <button
          className={`elements-pill ${activeCategory === "all" ? "is-active" : ""}`}
          onClick={() => setActiveCategory("all")}
          type="button"
        >
          All
        </button>
        {ELEMENT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`elements-pill ${activeCategory === cat.id ? "is-active" : ""}`}
            onClick={() => setActiveCategory(cat.id)}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Element grid */}
      <div className="elements-scroll-area">
        {disabled && (
          <p className="elements-disabled-hint">Upload an image first to add elements.</p>
        )}

        {filteredCategories.length === 0 ? (
          <div className="elements-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <p>No elements found</p>
          </div>
        ) : (
          filteredCategories.map((cat) => (
            <div key={cat.id} className="elements-category-section">
              {/* Show category label only when browsing all or searching */}
              {(activeCategory === "all" || query) && (
                <p className="elements-category-label">{cat.label}</p>
              )}
              <div className="elements-grid">
                {cat.elements.map((el) => (
                  <button
                    key={el.id}
                    className="elements-item"
                    disabled={disabled}
                    onClick={() => handleAddElement(el)}
                    title={el.label}
                    type="button"
                  >
                    <span
                      className="elements-item-icon"
                      dangerouslySetInnerHTML={{ __html: el.svg }}
                    />
                    <span className="elements-item-label">{el.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
