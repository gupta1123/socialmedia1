import { useState, useCallback, useMemo, useRef } from "react";
import type { EditorSnapshot, EditableImage, CanvasLayer, ToolMode, EditorSnapshotSourceMetadata } from "../lib/editor-types";
import { cloneEditableImage, cloneCanvasLayers } from "../lib/editor-types";

export function useEditorHistory(
  createSnapshot: () => EditorSnapshot,
  restoreSnapshot: (snapshot: EditorSnapshot) => void
) {
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const transactionSnapshotRef = useRef<EditorSnapshot | null>(null);

  const pushSnapshotToHistory = useCallback((snapshot: EditorSnapshot) => {
    setHistory((prev) => {
      const previousSnapshot = prev[prev.length - 1];
      if (previousSnapshot && areEditorSnapshotsEqual(previousSnapshot, snapshot)) {
        return prev;
      }
      return [...prev.slice(-99), snapshot];
    });
    setFuture([]);
  }, []);

  const pushToHistory = useCallback((snapshot?: EditorSnapshot) => {
    pushSnapshotToHistory(snapshot ?? createSnapshot());
  }, [createSnapshot, pushSnapshotToHistory]);

  const beginTransaction = useCallback((snapshot?: EditorSnapshot) => {
    if (transactionSnapshotRef.current) {
      return;
    }

    transactionSnapshotRef.current = snapshot ?? createSnapshot();
  }, [createSnapshot]);

  const commitTransaction = useCallback(() => {
    const snapshot = transactionSnapshotRef.current;
    if (!snapshot) {
      return;
    }

    transactionSnapshotRef.current = null;

    if (areEditorSnapshotsEqual(snapshot, createSnapshot())) {
      return;
    }

    pushSnapshotToHistory(snapshot);
  }, [createSnapshot, pushSnapshotToHistory]);

  const cancelTransaction = useCallback(() => {
    transactionSnapshotRef.current = null;
  }, []);

  const clearHistory = useCallback(() => {
    transactionSnapshotRef.current = null;
    setHistory([]);
    setFuture([]);
  }, []);

  const rebaseHistorySourceMetadata = useCallback((metadata: EditorSnapshotSourceMetadata) => {
    const applyMetadata = (snapshot: EditorSnapshot): EditorSnapshot => ({
      ...snapshot,
      ...metadata,
    });

    transactionSnapshotRef.current = transactionSnapshotRef.current
      ? applyMetadata(transactionSnapshotRef.current)
      : null;
    setHistory((prev) => prev.map(applyMetadata));
    setFuture((prev) => prev.map(applyMetadata));
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    if (!previous) return;

    setFuture((prev) => [createSnapshot(), ...prev]);
    setHistory((prev) => prev.slice(0, -1));
    restoreSnapshot(previous);
  }, [history, createSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    if (!next) return;

    setHistory((prev) => [...prev, createSnapshot()]);
    setFuture((prev) => prev.slice(1));
    restoreSnapshot(next);
  }, [future, createSnapshot, restoreSnapshot]);

  const canUndo = useMemo(() => history.length > 0, [history]);
  const canRedo = useMemo(() => future.length > 0, [future]);

  return {
    history,
    future,
    pushToHistory,
    pushSnapshotToHistory,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    clearHistory,
    rebaseHistorySourceMetadata,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}

function areEditorSnapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return (
    areEditableImagesEqual(left.originalImage, right.originalImage) &&
    areEditableImagesEqual(left.currentImage, right.currentImage) &&
    areCanvasLayersEqual(left.canvasLayers, right.canvasLayers) &&
    left.selectedLayerId === right.selectedLayerId &&
    left.toolMode === right.toolMode &&
    left.currentSourceOutputId === right.currentSourceOutputId &&
    left.currentSourceBrandId === right.currentSourceBrandId &&
    left.currentSourceProjectId === right.currentSourceProjectId &&
    left.currentSourceReviewState === right.currentSourceReviewState
  );
}

function areEditableImagesEqual(left: EditableImage | null, right: EditableImage | null): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.file.name === right.file.name &&
    left.file.size === right.file.size &&
    left.file.lastModified === right.file.lastModified &&
    left.file.type === right.file.type
  );
}

function areCanvasLayersEqual(left: CanvasLayer[], right: CanvasLayer[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createEditorSnapshot(
  originalImage: EditableImage | null,
  currentImage: EditableImage | null,
  canvasLayers: CanvasLayer[],
  selectedLayerId: string | null,
  toolMode: ToolMode,
  sourceMetadata: EditorSnapshotSourceMetadata
): EditorSnapshot {
  return {
    originalImage: cloneEditableImage(originalImage),
    currentImage: cloneEditableImage(currentImage),
    canvasLayers: cloneCanvasLayers(canvasLayers),
    selectedLayerId,
    toolMode,
    ...sourceMetadata,
  };
}
