import { useEditorContext } from "../../EditorContext";

interface UploadsPaneProps {
  onUploadClick: () => void;
  onAddImageLayerClick: () => void;
  onClearCanvas: () => void;
}

export function UploadsPane({ onUploadClick, onAddImageLayerClick, onClearCanvas }: UploadsPaneProps) {
  const {
    state,
    resetToOriginal,
    pushToHistory,
  } = useEditorContext();

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
