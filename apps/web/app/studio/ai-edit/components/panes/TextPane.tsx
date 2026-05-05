"use client";

import { useEditorContext } from "../../EditorContext";
import { TEXT_FONT_OPTIONS, createLayerId } from "../../lib/editor-types";

interface TextPaneProps {
  onAddTextLayer: (preset: "heading" | "subheading" | "body") => void;
}

export function TextPane({ onAddTextLayer }: TextPaneProps) {
  const { state } = useEditorContext();

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <p className="panel-label">Typography</p>
        <h2>Text</h2>
      </div>

      <button
        className="button button-primary ai-editor-full-button"
        disabled={!state.currentImage}
        onClick={() => onAddTextLayer("heading")}
        type="button"
      >
        Add a text box
      </button>

      <h3 className="ai-editor-pane-subtitle">Default text styles</h3>

      <div className="ai-editor-text-preset-list">
        <button
          className="ai-editor-text-preset is-heading"
          disabled={!state.currentImage}
          onClick={() => onAddTextLayer("heading")}
          type="button"
        >
          Add a heading
        </button>
        <button
          className="ai-editor-text-preset is-subheading"
          disabled={!state.currentImage}
          onClick={() => onAddTextLayer("subheading")}
          type="button"
        >
          Add a subheading
        </button>
        <button
          className="ai-editor-text-preset"
          disabled={!state.currentImage}
          onClick={() => onAddTextLayer("body")}
          type="button"
        >
          Add a little bit of body text
        </button>
      </div>
    </div>
  );
}
