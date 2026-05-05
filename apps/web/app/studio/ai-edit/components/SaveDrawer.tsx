"use client";

import { useEffect, useState } from "react";
import { useEditorContext } from "../EditorContext";

interface SaveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (saveMode: "new" | "version" | "replace") => Promise<void>;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
}

export function SaveDrawer({ isOpen, onClose, onSave, isSaving, hasUnsavedChanges }: SaveDrawerProps) {
  const { state } = useEditorContext();
  const [saveMode, setSaveMode] = useState<"new" | "version" | "replace">(
    state.currentSourceOutputId ? "version" : "new"
  );

  const canReplace = state.currentSourceReviewState === "pending_review" || state.currentSourceReviewState === "needs_revision";

  useEffect(() => {
    setSaveMode(state.currentSourceOutputId ? "version" : "new");
  }, [state.currentSourceOutputId]);

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="panel-label">Editor save</p>
            <h2>Save changes</h2>
          </div>
          <button className="drawer-close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-form">
            <p className="ai-editor-pane-copy">
              {state.currentSourceOutputId
                ? "AI edits are saved automatically. Use this only for manual canvas changes like text, logos, assets, and layer positioning."
                : "Save the current editor composition as a new output in Gallery."}
            </p>

            {state.currentSourceOutputId ? (
              <div className="ai-editor-save-mode-list">
                <label className={`ai-editor-save-mode-card ${saveMode === "version" ? "is-active" : ""}`}>
                  <input
                    checked={saveMode === "version"}
                    name="editor-save-mode"
                    onChange={() => setSaveMode("version")}
                    type="radio"
                  />
                  <div>
                    <strong>Create new version</strong>
                    <p>Keeps the current design and saves this edit as the next version in Gallery.</p>
                  </div>
                </label>
                <label
                  className={`ai-editor-save-mode-card ${saveMode === "replace" ? "is-active" : ""} ${!canReplace ? "is-disabled" : ""}`}
                >
                  <input
                    checked={saveMode === "replace"}
                    disabled={!canReplace}
                    name="editor-save-mode"
                    onChange={() => setSaveMode("replace")}
                    type="radio"
                  />
                  <div>
                    <strong>Replace current draft</strong>
                    <p>
                      {canReplace
                        ? "Updates the current draft in place instead of creating a new output."
                        : "Only draft-like outputs can be replaced. Approved or closed outputs must be saved as a new version."}
                    </p>
                  </div>
                </label>
              </div>
            ) : (
              <div className="create-picker-summary">
                <div>
                  <p className="create-picker-summary-label">Save target</p>
                  <strong>New Gallery output</strong>
                </div>
              </div>
            )}

            <div className="drawer-footer">
              <button className="button button-ghost" onClick={onClose} type="button">
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={isSaving || !hasUnsavedChanges}
                onClick={() => void onSave(saveMode)}
                type="button"
              >
                {isSaving
                  ? "Saving..."
                  : !hasUnsavedChanges
                    ? "No changes to save"
                  : state.currentSourceOutputId
                    ? saveMode === "replace"
                      ? "Replace draft"
                      : "Save as version"
                    : "Save to Gallery"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
