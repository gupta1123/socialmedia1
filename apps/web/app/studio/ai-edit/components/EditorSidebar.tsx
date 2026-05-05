"use client";

import { useEditorContext } from "../EditorContext";
import { EDITOR_PANES, type EditorPane } from "../lib/editor-types";

interface EditorSidebarProps {
  children: React.ReactNode;
}

export function EditorSidebar({ children }: EditorSidebarProps) {
  const { state, setActiveEditorPane } = useEditorContext();

  const selectedLayer = state.selectedLayerId
    ? state.canvasLayers.find((l) => l.id === state.selectedLayerId)
    : null;
  const isTextSelected = selectedLayer?.type === "text";

  function handleEditorPaneChange(nextPane: EditorPane) {
    if (nextPane === "font" && !isTextSelected) return;
    setActiveEditorPane(nextPane);
  }

  const visiblePanes = EDITOR_PANES.filter((pane) => pane.id !== "font" || isTextSelected);

  return (
    <aside className="create-v2-sidebar ai-edit-sidebar-panel">
      <div className="ai-editor-sidebar-shell">
        <nav className="ai-editor-rail" aria-label="Editor tools">
          <div className="ai-editor-rail-list">
            {visiblePanes.map((pane) => (
              <button
                className={`ai-editor-rail-button ${state.activeEditorPane === pane.id ? "is-active" : ""}`}
                key={pane.id}
                onClick={() => handleEditorPaneChange(pane.id)}
                type="button"
              >
                <span className="ai-editor-rail-icon">{pane.icon}</span>
                <span>{pane.label}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="ai-editor-tray">{children}</div>
      </div>
    </aside>
  );
}
