import { useEditorContext } from "../../EditorContext";
import { StudioColorPicker } from "../../../components/StudioColorPicker";
import { type TextEffect, type TextShape, TEXT_SHAPES } from "../../lib/editor-types";
import { TEXT_EFFECTS_REGISTRY, EFFECT_CATEGORIES, getEffectDefinition } from "../../lib/effects-registry";

export function EffectsPane() {
  const { state, selectedLayer, updateLayer, pushToHistory, beginTransaction, commitTransaction } = useEditorContext();

  if (!selectedLayer || selectedLayer.type !== "text") {
    return (
      <div className="ai-editor-pane">
        <div className="ai-editor-pane-header">
          <p className="panel-label">Styles</p>
          <h2>Effects</h2>
        </div>
        <p className="ai-editor-pane-copy">Select a text layer to apply effects.</p>
      </div>
    );
  }

  function handleEffectClick(effect: TextEffect) {
    if (!state.selectedLayerId) return;
    pushToHistory();
    updateLayer(state.selectedLayerId, { effect });
  }

  function handleShapeClick(shape: TextShape) {
    if (!state.selectedLayerId) return;
    pushToHistory();
    updateLayer(state.selectedLayerId, { shape });
  }

  function handleColorChange(colorField: "effectColor1" | "effectColor2", color: string) {
    if (!state.selectedLayerId) return;
    updateLayer(state.selectedLayerId, { [colorField]: color });
  }

  const selectedEffectDef = getEffectDefinition(selectedLayer.effect || "none");

  return (
    <div className="ai-editor-pane effects-scroll-container">
      <div className="ai-editor-pane-header">
        <p className="panel-label">Styles</p>
        <h2>Effects</h2>
      </div>

      {selectedEffectDef.colors > 0 && (
        <div className="ai-editor-effects-section">
          <p className="ai-editor-section-label">Effect Colors</p>
          <div className="ai-editor-effects-colors">
            {selectedEffectDef.colors >= 1 && (
              <div className="ai-editor-effect-color-control">
                <span>Primary</span>
                <StudioColorPicker
                  onChange={(color) => handleColorChange("effectColor1", color)}
                  onChangeEnd={commitTransaction}
                  onChangeStart={beginTransaction}
                  title="Primary Effect Color"
                  value={selectedLayer.effectColor1 || "#7c3aed"}
                />
              </div>
            )}
            {selectedEffectDef.colors >= 2 && (
              <div className="ai-editor-effect-color-control">
                <span>Secondary</span>
                <StudioColorPicker
                  onChange={(color) => handleColorChange("effectColor2", color)}
                  onChangeEnd={commitTransaction}
                  onChangeStart={beginTransaction}
                  title="Secondary Effect Color"
                  value={selectedLayer.effectColor2 || "#00fff9"}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {EFFECT_CATEGORIES.map((category) => {
        const effectsInCategory = TEXT_EFFECTS_REGISTRY.filter((e) => e.category === category);
        if (effectsInCategory.length === 0) return null;

        return (
          <div className="ai-editor-effects-section" key={category}>
            <p className="ai-editor-section-label">{category}</p>
            <div className="ai-editor-effects-grid">
              {effectsInCategory.map((eff) => {
                const previewStyle = eff.generateStyle(selectedLayer.effectColor1 || "#7c3aed", selectedLayer.effectColor2 || "#00fff9");
                return (
                  <button
                    className={`ai-editor-effect-card ${selectedLayer.effect === eff.id ? "is-active" : ""}`}
                    key={eff.id}
                    onClick={() => handleEffectClick(eff.id)}
                    type="button"
                  >
                    <div className="ai-editor-effect-preview">
                      <span style={{ ...previewStyle, fontSize: "1.2rem", backgroundColor: "transparent", padding: 0 }}>Ag</span>
                    </div>
                    <span>{eff.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="ai-editor-effects-section">
        <p className="ai-editor-section-label">Shape</p>
        <div className="ai-editor-effects-grid">
          {TEXT_SHAPES.map((sh) => (
            <button
              className={`ai-editor-effect-card ${selectedLayer.shape === sh.id ? "is-active" : ""}`}
              key={sh.id}
              onClick={() => handleShapeClick(sh.id)}
              type="button"
            >
              <div className={`ai-editor-effect-preview is-shape-${sh.id}`}>
                {sh.id === "curve" ? <span className="curve-preview">ABCD</span> : "Ag"}
              </div>
              <span>{sh.label}</span>
            </button>
          ))}
        </div>
        {selectedLayer.shape === "curve" && (
          <div className="ai-editor-effect-control">
            <input
              max={100}
              min={-100}
              onBlur={commitTransaction}
              onChange={(e) => {
                updateLayer(state.selectedLayerId!, { curveAmount: Number(e.target.value) });
              }}
              onFocus={() => beginTransaction()}
              onPointerDown={() => beginTransaction()}
              onPointerUp={commitTransaction}
              type="range"
              value={selectedLayer.curveAmount ?? 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}
