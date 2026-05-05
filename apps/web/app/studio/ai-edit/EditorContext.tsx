"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useEditorState } from "./hooks/useEditorState";
import { useEditorHistory, createEditorSnapshot } from "./hooks/useEditorHistory";
import { cloneEditableImage, cloneCanvasLayers, type EditorSnapshot, type EditorSnapshotSourceMetadata } from "./lib/editor-types";
import type { UseEditorStateReturn } from "./hooks/useEditorState";

interface EditorContextValue extends UseEditorStateReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  createSnapshot: () => EditorSnapshot;
  pushToHistory: (snapshot?: EditorSnapshot) => void;
  pushSnapshotToHistory: (snapshot: EditorSnapshot) => void;
  beginTransaction: (snapshot?: EditorSnapshot) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  clearHistory: () => void;
  rebaseHistorySourceMetadata: (metadata: EditorSnapshotSourceMetadata) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const editorState = useEditorState();

  const createSnapshot = () => {
    const latestState = editorState.getState();
    return createEditorSnapshot(
      latestState.originalImage,
      latestState.currentImage,
      latestState.canvasLayers,
      latestState.selectedLayerId,
      latestState.toolMode,
      {
        currentSourceOutputId: latestState.currentSourceOutputId,
        currentSourceBrandId: latestState.currentSourceBrandId,
        currentSourceProjectId: latestState.currentSourceProjectId,
        currentSourceReviewState: latestState.currentSourceReviewState,
      }
    );
  };

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    editorState.setOriginalImage(cloneEditableImage(snapshot.originalImage));
    editorState.setCurrentImage(cloneEditableImage(snapshot.currentImage));
    editorState.setCanvasLayers(cloneCanvasLayers(snapshot.canvasLayers));
    editorState.setToolMode(snapshot.toolMode);
    editorState.setSelectedLayerId(snapshot.selectedLayerId);
    editorState.setCurrentSourceOutputId(snapshot.currentSourceOutputId);
    editorState.setCurrentSourceBrandId(snapshot.currentSourceBrandId);
    editorState.setCurrentSourceProjectId(snapshot.currentSourceProjectId);
    editorState.setCurrentSourceReviewState(snapshot.currentSourceReviewState);
  };

  const history = useEditorHistory(createSnapshot, restoreSnapshot);

  const value = useMemo<EditorContextValue>(() => ({
    ...editorState,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,
    createSnapshot,
    pushToHistory: history.pushToHistory,
    pushSnapshotToHistory: history.pushSnapshotToHistory,
    beginTransaction: history.beginTransaction,
    commitTransaction: history.commitTransaction,
    cancelTransaction: history.cancelTransaction,
    clearHistory: history.clearHistory,
    rebaseHistorySourceMetadata: history.rebaseHistorySourceMetadata,
  }), [editorState, history]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return context;
}

export function useEditorHistoryContext() {
  return useEditorContext();
}
