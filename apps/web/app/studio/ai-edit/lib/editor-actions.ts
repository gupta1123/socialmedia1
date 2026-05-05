import type {
  CanvasLayer,
  CanvasTextLayer,
  CanvasImageLayer,
  CanvasShapeLayer,
  CanvasDrawLayer,
  EditableImage,
  ToolMode,
  EditorPane,
  DrawMode,
} from "./editor-types";
import { createLayerId, clamp } from "./editor-types";

export type EditorAction =
  | { type: "SET_ORIGINAL_IMAGE"; payload: EditableImage | null }
  | { type: "SET_CURRENT_IMAGE"; payload: EditableImage | null }
  | { type: "SET_CANVAS_LAYERS"; payload: CanvasLayer[] }
  | { type: "ADD_LAYER"; payload: CanvasLayer }
  | { type: "UPDATE_LAYER"; payload: { id: string; patch: Partial<CanvasLayer> } }
  | { type: "DELETE_LAYER"; payload: string }
  | { type: "REORDER_LAYER"; payload: { id: string; direction: "forward" | "backward" | "front" | "back" } }
  | { type: "DUPLICATE_LAYER"; payload: { id: string; newId: string } }
  | { type: "SET_SELECTED_LAYER_ID"; payload: string | null }
  | { type: "SET_TOOL_MODE"; payload: ToolMode }
  | { type: "SET_ACTIVE_EDITOR_PANE"; payload: EditorPane }
  | { type: "SET_DRAW_MODE"; payload: DrawMode }
  | { type: "SET_DRAW_COLOR"; payload: string }
  | { type: "SET_DRAW_SIZE"; payload: number }
  | { type: "SET_STAGE_ZOOM"; payload: number }
  | { type: "SET_CURRENT_SOURCE_OUTPUT_ID"; payload: string | null }
  | { type: "SET_CURRENT_SOURCE_BRAND_ID"; payload: string | null }
  | { type: "SET_CURRENT_SOURCE_PROJECT_ID"; payload: string | null }
  | { type: "SET_CURRENT_SOURCE_REVIEW_STATE"; payload: EditorState["currentSourceReviewState"] }
  | { type: "RESET_TO_ORIGINAL" }
  | { type: "LOAD_OUTPUT"; payload: {
      image: EditableImage;
      outputId: string;
      brandId: string;
      projectId: string | null;
      reviewState: "pending_review" | "approved" | "needs_revision" | "closed" | null;
    } }
  | { type: "APPLY_TEMPLATE"; payload: { image: EditableImage; layers: CanvasLayer[] } };

export interface EditorState {
  originalImage: EditableImage | null;
  currentImage: EditableImage | null;
  canvasLayers: CanvasLayer[];
  selectedLayerId: string | null;
  toolMode: ToolMode;
  activeEditorPane: EditorPane;
  drawMode: DrawMode;
  drawColor: string;
  drawSize: number;
  stageZoom: number;
  currentSourceOutputId: string | null;
  currentSourceBrandId: string | null;
  currentSourceProjectId: string | null;
  currentSourceReviewState: "pending_review" | "approved" | "needs_revision" | "closed" | null;
}

export const initialEditorState: EditorState = {
  originalImage: null,
  currentImage: null,
  canvasLayers: [],
  selectedLayerId: null,
  toolMode: "select",
  activeEditorPane: "uploads",
  drawMode: "select",
  drawColor: "#111111",
  drawSize: 5,
  stageZoom: 1,
  currentSourceOutputId: null,
  currentSourceBrandId: null,
  currentSourceProjectId: null,
  currentSourceReviewState: null,
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_ORIGINAL_IMAGE":
      return { ...state, originalImage: action.payload };

    case "SET_CURRENT_IMAGE":
      return { ...state, currentImage: action.payload };

    case "SET_CANVAS_LAYERS":
      return { ...state, canvasLayers: action.payload };

    case "ADD_LAYER":
      return {
        ...state,
        canvasLayers: [...state.canvasLayers, action.payload],
        selectedLayerId: action.payload.id,
      };

    case "UPDATE_LAYER":
      return {
        ...state,
        canvasLayers: state.canvasLayers.map((layer) =>
          layer.id === action.payload.id ? ({ ...layer, ...action.payload.patch } as CanvasLayer) : layer
        ),
      };

    case "DELETE_LAYER":
      return {
        ...state,
        canvasLayers: state.canvasLayers.filter((layer) => layer.id !== action.payload),
        selectedLayerId: state.selectedLayerId === action.payload ? null : state.selectedLayerId,
      };

    case "REORDER_LAYER": {
      const { id, direction } = action.payload;
      const index = state.canvasLayers.findIndex((layer) => layer.id === id);
      if (index < 0) return state;

      const nextLayers = [...state.canvasLayers];
      const [layer] = nextLayers.splice(index, 1);
      if (!layer) return state;

      if (direction === "forward") {
        nextLayers.splice(Math.min(nextLayers.length, index + 1), 0, layer);
      } else if (direction === "backward") {
        nextLayers.splice(Math.max(0, index - 1), 0, layer);
      } else if (direction === "front") {
        nextLayers.push(layer);
      } else if (direction === "back") {
        nextLayers.unshift(layer);
      }
      return { ...state, canvasLayers: nextLayers };
    }

    case "DUPLICATE_LAYER": {
      const original = state.canvasLayers.find((l) => l.id === action.payload.id);
      if (!original) return state;

      const nextLayer = {
        ...original,
        id: action.payload.newId,
        x: clamp(original.x + 0.04, 0, 0.96),
        y: clamp(original.y + 0.04, 0, 0.96),
      } as CanvasLayer;

      return {
        ...state,
        canvasLayers: [...state.canvasLayers, nextLayer],
        selectedLayerId: nextLayer.id,
      };
    }

    case "SET_SELECTED_LAYER_ID":
      return { ...state, selectedLayerId: action.payload, toolMode: "select" };

    case "SET_TOOL_MODE":
      return { ...state, toolMode: action.payload };

    case "SET_ACTIVE_EDITOR_PANE":
      return { ...state, activeEditorPane: action.payload };

    case "SET_DRAW_MODE":
      return { ...state, drawMode: action.payload };

    case "SET_DRAW_COLOR":
      return { ...state, drawColor: action.payload };

    case "SET_DRAW_SIZE":
      return { ...state, drawSize: action.payload };

    case "SET_STAGE_ZOOM":
      return { ...state, stageZoom: clamp(action.payload, 0.1, 5) };

    case "SET_CURRENT_SOURCE_OUTPUT_ID":
      return { ...state, currentSourceOutputId: action.payload };

    case "SET_CURRENT_SOURCE_BRAND_ID":
      return { ...state, currentSourceBrandId: action.payload };

    case "SET_CURRENT_SOURCE_PROJECT_ID":
      return { ...state, currentSourceProjectId: action.payload };

    case "SET_CURRENT_SOURCE_REVIEW_STATE":
      return { ...state, currentSourceReviewState: action.payload };

    case "RESET_TO_ORIGINAL":
      return {
        ...state,
        currentImage: state.originalImage,
        canvasLayers: [],
        selectedLayerId: null,
        toolMode: "select",
      };

    case "LOAD_OUTPUT":
      return {
        ...state,
        originalImage: action.payload.image,
        currentImage: action.payload.image,
        currentSourceOutputId: action.payload.outputId,
        currentSourceBrandId: action.payload.brandId,
        currentSourceProjectId: action.payload.projectId,
        currentSourceReviewState: action.payload.reviewState,
        canvasLayers: [],
        selectedLayerId: null,
        toolMode: "select",
        activeEditorPane: "ai-edit",
      };

    case "APPLY_TEMPLATE":
      return {
        ...state,
        originalImage: action.payload.image,
        currentImage: action.payload.image,
        currentSourceProjectId: null,
        currentSourceOutputId: null,
        currentSourceReviewState: null,
        canvasLayers: action.payload.layers,
        selectedLayerId: action.payload.layers[0]?.id ?? null,
        toolMode: "select",
        activeEditorPane: "layers",
      };

    default:
      return state;
  }
}

export function buildTextLayer(
  currentImage: EditableImage | null,
  preset: "heading" | "subheading" | "body" = "heading"
): CanvasTextLayer {
  const presets = {
    heading: { text: "Add heading", fontSize: 44, fontWeight: "700" as const, width: 0.58 },
    subheading: { text: "Add subheading", fontSize: 28, fontWeight: "600" as const, width: 0.5 },
    body: { text: "Add body text", fontSize: 18, fontWeight: "400" as const, width: 0.44 },
  };

  const config = presets[preset];
  const fontSize = currentImage ? Math.max(44, Math.round(currentImage.width * 0.075)) : config.fontSize;

  return {
    id: createLayerId("text"),
    type: "text",
    text: config.text,
    x: 0.1,
    y: 0.12,
    width: config.width,
    rotation: 0,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: preset === "heading" ? fontSize : preset === "subheading" ? Math.max(28, Math.round((currentImage?.width ?? 1080) * 0.043)) : Math.max(18, Math.round((currentImage?.width ?? 1080) * 0.026)),
    fontWeight: config.fontWeight,
    color: "#ffffff",
    backgroundColor: "#00000000",
    align: "left",
    letterSpacing: -1,
    lineHeight: 1.12,
    shadow: true,
    effect: "none",
    effectColor1: "#7c3aed",
    effectColor2: "#00fff9",
    shape: "none",
    curveAmount: 0,
    opacity: 1,
  };
}

export function buildShapeLayer(shape: CanvasShapeLayer["shape"], currentImage: EditableImage | null): CanvasShapeLayer {
  const labels: Record<CanvasShapeLayer["shape"], string> = {
    rect: "Rectangle",
    circle: "Circle",
    triangle: "Triangle",
    star: "Star badge",
    badge: "New badge",
  };

  return {
    id: createLayerId(shape),
    type: "shape",
    shape,
    label: labels[shape],
    x: 0.1,
    y: 0.1,
    width: shape === "badge" ? 0.18 : 0.2,
    height: shape === "badge" ? 0.08 : 0.2,
    rotation: 0,
    fill: shape === "star" ? "#f59e0b" : shape === "badge" ? "#10b981" : "#111827",
    opacity: 0.9,
  };
}

export function buildDrawLayer(points: Array<{ x: number; y: number }>, color: string, size: number, mode: DrawMode, opacity: number): CanvasDrawLayer {
  return {
    id: createLayerId("draw"),
    type: "draw",
    label: mode === "highlighter" ? "Highlighter stroke" : "Pen stroke",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    points,
    color,
    size: mode === "highlighter" ? size * 3 : size,
    opacity,
  };
}

export function buildImageLayer(
  src: string,
  name: string,
  width: number,
  height: number,
  currentImage: EditableImage | null,
  options?: { x?: number; y?: number; reraBlock?: CanvasImageLayer["reraBlock"]; preserveOnAiEdit?: boolean; sourceStoragePath?: string | null }
): CanvasImageLayer {
  const layerWidth = width;
  const layerHeight = Math.min(
    0.35,
    width * (height / width) * ((currentImage?.width ?? 1080) / (currentImage?.height ?? 1080))
  );

  const layer: CanvasImageLayer = {
    id: createLayerId("image"),
    type: "image",
    name,
    src,
    sourceStoragePath: options?.sourceStoragePath ?? null,
    x: options?.x ?? 0.08,
    y: options?.y ?? 0.08,
    width: layerWidth,
    height: Math.max(0.04, layerHeight),
    rotation: 0,
    filter: "none",
    opacity: 1,
  };

  if (options?.reraBlock) {
    layer.reraBlock = options.reraBlock;
  }
  if (options?.preserveOnAiEdit) {
    layer.preserveOnAiEdit = true;
  }

  return layer;
}
