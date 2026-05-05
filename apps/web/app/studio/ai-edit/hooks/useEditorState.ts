import { useCallback, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { EditableImage, CanvasLayer } from "../lib/editor-types";
import { createLayerId } from "../lib/editor-types";
import { editorReducer, initialEditorState, type EditorAction, type EditorState } from "../lib/editor-actions";

export function useEditorState() {
  const [state, baseDispatch] = useReducer(editorReducer, initialEditorState);
  const stateRef = useRef(state);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const dispatch = useCallback((action: EditorAction) => {
    stateRef.current = editorReducer(stateRef.current, action);
    baseDispatch(action);
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  const setOriginalImage = useCallback((image: EditableImage | null) => {
    dispatch({ type: "SET_ORIGINAL_IMAGE", payload: image });
  }, []);

  const setCurrentImage = useCallback((image: EditableImage | null) => {
    dispatch({ type: "SET_CURRENT_IMAGE", payload: image });
  }, []);

  const setCanvasLayers = useCallback((layers: CanvasLayer[]) => {
    dispatch({ type: "SET_CANVAS_LAYERS", payload: layers });
  }, []);

  const addLayer = useCallback((layer: CanvasLayer) => {
    dispatch({ type: "ADD_LAYER", payload: layer });
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<CanvasLayer>) => {
    dispatch({ type: "UPDATE_LAYER", payload: { id, patch } });
  }, []);

  const deleteLayer = useCallback((id: string) => {
    dispatch({ type: "DELETE_LAYER", payload: id });
  }, []);

  const reorderLayer = useCallback((id: string, direction: "forward" | "backward" | "front" | "back") => {
    dispatch({ type: "REORDER_LAYER", payload: { id, direction } });
  }, []);

  const duplicateLayer = useCallback((id: string) => {
    const layer = stateRef.current.canvasLayers.find((item) => item.id === id);
    dispatch({ type: "DUPLICATE_LAYER", payload: { id, newId: createLayerId(layer?.type ?? "duplicate") } });
  }, []);

  const setSelectedLayerId = useCallback((id: string | null) => {
    dispatch({ type: "SET_SELECTED_LAYER_ID", payload: id });
  }, []);

  const setToolMode = useCallback((mode: EditorState["toolMode"]) => {
    dispatch({ type: "SET_TOOL_MODE", payload: mode });
  }, []);

  const setActiveEditorPane = useCallback((pane: EditorState["activeEditorPane"]) => {
    dispatch({ type: "SET_ACTIVE_EDITOR_PANE", payload: pane });
  }, []);

  const setDrawMode = useCallback((mode: EditorState["drawMode"]) => {
    dispatch({ type: "SET_DRAW_MODE", payload: mode });
  }, []);

  const setDrawColor = useCallback((color: string) => {
    dispatch({ type: "SET_DRAW_COLOR", payload: color });
  }, []);

  const setDrawSize = useCallback((size: number) => {
    dispatch({ type: "SET_DRAW_SIZE", payload: size });
  }, []);

  const setStageZoom = useCallback((zoom: number) => {
    dispatch({ type: "SET_STAGE_ZOOM", payload: zoom });
  }, []);

  const setCurrentSourceOutputId = useCallback((id: string | null) => {
    dispatch({ type: "SET_CURRENT_SOURCE_OUTPUT_ID", payload: id });
  }, []);

  const setCurrentSourceBrandId = useCallback((id: string | null) => {
    dispatch({ type: "SET_CURRENT_SOURCE_BRAND_ID", payload: id });
  }, []);

  const setCurrentSourceProjectId = useCallback((id: string | null) => {
    dispatch({ type: "SET_CURRENT_SOURCE_PROJECT_ID", payload: id });
  }, []);

  const setCurrentSourceReviewState = useCallback((reviewState: EditorState["currentSourceReviewState"]) => {
    dispatch({ type: "SET_CURRENT_SOURCE_REVIEW_STATE", payload: reviewState });
  }, []);

  const resetToOriginal = useCallback(() => {
    dispatch({ type: "RESET_TO_ORIGINAL" });
  }, []);

  const loadOutput = useCallback((data: {
    image: EditableImage;
    outputId: string;
    brandId: string;
    projectId: string | null;
    reviewState: "pending_review" | "approved" | "needs_revision" | "closed" | null;
  }) => {
    dispatch({ type: "LOAD_OUTPUT", payload: data });
  }, []);

  const applyTemplate = useCallback((data: { image: EditableImage; layers: CanvasLayer[] }) => {
    dispatch({ type: "APPLY_TEMPLATE", payload: data });
  }, []);

  const selectedLayer = useMemo(
    () => state.canvasLayers.find((layer) => layer.id === state.selectedLayerId) ?? null,
    [state.canvasLayers, state.selectedLayerId]
  );

  const canReset = useMemo(
    () => Boolean(state.originalImage && state.currentImage && (state.originalImage.file !== state.currentImage.file || state.canvasLayers.length > 0)),
    [state.originalImage, state.currentImage, state.canvasLayers]
  );

  return {
    state,
    getState,
    dispatch,
    setOriginalImage,
    setCurrentImage,
    setCanvasLayers,
    addLayer,
    updateLayer,
    deleteLayer,
    reorderLayer,
    duplicateLayer,
    setSelectedLayerId,
    setToolMode,
    setActiveEditorPane,
    setDrawMode,
    setDrawColor,
    setDrawSize,
    setStageZoom,
    setCurrentSourceOutputId,
    setCurrentSourceBrandId,
    setCurrentSourceProjectId,
    setCurrentSourceReviewState,
    resetToOriginal,
    loadOutput,
    applyTemplate,
    selectedLayer,
    canReset,
  };
}

export type UseEditorStateReturn = ReturnType<typeof useEditorState>;
