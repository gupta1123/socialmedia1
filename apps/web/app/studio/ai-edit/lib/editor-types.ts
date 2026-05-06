export type ToolMode = "select" | "draw";
export type DrawMode = "select" | "pen" | "highlighter";
export type PromptMode = "normal" | "list";
export type EditorPane =
  | "uploads"
  | "ai-edit"
  | "assets"
  | "templates"
  | "elements"
  | "text"
  | "layers"
  | "draw"
  | "effects"
  | "position"
  | "font";
import { type TextEffectDefinition } from "./effects-registry";

export type TextEffect = string;

export type TextShape = "none" | "curve";

export type SaveMode = "new" | "version" | "replace";

export interface EditableImage {
  file: File;
  width: number;
  height: number;
}

export interface CanvasTextLayer {
  id: string;
  type: "text";
  visible?: boolean;
  text: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: "400" | "500" | "600" | "700";
  color: string;
  backgroundColor: string;
  align: "left" | "center" | "right";
  letterSpacing: number;
  lineHeight: number;
  shadow: boolean;
  effect: TextEffect;
  effectColor1: string;
  effectColor2: string;
  shape: TextShape;
  curveAmount?: number;
  opacity: number;
}


export interface CanvasImageLayer {
  id: string;
  type: "image";
  visible?: boolean;
  name: string;
  src: string;
  sourceStoragePath?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  filter: "none" | "grayscale" | "sepia";
  opacity: number;
  reraBlock?: ReraBlockData;
  preserveOnAiEdit?: boolean;
}

export interface ReraBlockData {
  authorityLabel: string;
  registrationNumber: string;
  websiteUrl: string;
  textColor: string;
  colorMode?: "text" | "all";
  qrSourceUrl?: string | null;
  qrDataUrl?: string | null;
}

export type ShapeType = "rect" | "circle" | "triangle" | "star" | "badge";

export interface CanvasShapeLayer {
  id: string;
  type: "shape";
  visible?: boolean;
  shape: ShapeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  opacity: number;
  svgElementId?: string;
}

export interface CanvasDrawLayer {
  id: string;
  type: "draw";
  visible?: boolean;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points: Array<{ x: number; y: number }>;
  color: string;
  size: number;
  opacity: number;
}

export type CanvasLayer = CanvasTextLayer | CanvasImageLayer | CanvasShapeLayer | CanvasDrawLayer;

export interface EditorSnapshot {
  originalImage: EditableImage | null;
  currentImage: EditableImage | null;
  canvasLayers: CanvasLayer[];
  selectedLayerId: string | null;
  toolMode: ToolMode;
  currentSourceOutputId: string | null;
  currentSourceBrandId: string | null;
  currentSourceProjectId: string | null;
  currentSourceReviewState: "pending_review" | "approved" | "needs_revision" | "closed" | null;
}

export type EditorSnapshotSourceMetadata = Pick<
  EditorSnapshot,
  "currentSourceOutputId" | "currentSourceBrandId" | "currentSourceProjectId" | "currentSourceReviewState"
>;

export type ResizeHandleType = "nw" | "ne" | "sw" | "se" | "w" | "e";

export interface LayerDragState {
  id: string;
  mode: "move" | "resize";
  handleType?: ResizeHandleType;
  pushedHistory: boolean;
  snapshot: EditorSnapshot;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export const TEXT_FONT_OPTIONS = [
  { label: "Editorial Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Modern Sans", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Premium Serif", value: "'Cormorant Garamond', Georgia, serif" },
  { label: "Display Serif", value: "'Playfair Display', Georgia, serif" },
  { label: "Clean Geometric", value: "Montserrat, 'Helvetica Neue', Arial, sans-serif" },
] as const;

export const EDITOR_PANES: Array<{ id: EditorPane; label: string; icon: string }> = [
  { id: "uploads", label: "Uploads", icon: "↑" },
  { id: "ai-edit", label: "AI Edit", icon: "⌘" },
  { id: "assets", label: "Assets", icon: "◫" },
  { id: "elements", label: "Elements", icon: "❖" },
  { id: "text", label: "Text", icon: "T" },
  { id: "layers", label: "Layers", icon: "☰" },
  { id: "font", label: "Font", icon: "Aa" },
];

export const TEMPLATE_PRESETS = [
  { id: "minimal" as const, label: "Minimal Bold", className: "is-minimal", text: "THE NEW\nSTANDARD" },
  { id: "quote" as const, label: "Editorial Quote", className: "is-quote", text: "\"Simplicity.\"" },
  { id: "sale" as const, label: "Flash Sale", className: "is-sale", text: "SALE" },
  { id: "dark" as const, label: "Dark Modern", className: "is-dark", text: "FUTURE\nTECH" },
];

export const DRAW_COLORS = ["#111111", "#7c3aed", "#ef4444", "#10b981", "#f59e0b", "#000000"];

export const TEXT_SHAPES: Array<{ id: TextShape; label: string }> = [
  { id: "none", label: "None" },
  { id: "curve", label: "Curve" },
];


export function createLayerId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getLayerLabel(layer: CanvasLayer): string {
  if (layer.type === "text") return layer.text || "Untitled text";
  if (layer.type === "image") return layer.name;
  if (layer.type === "draw") return layer.label;
  return layer.label;
}

export function isLayerVisible(layer: CanvasLayer): boolean {
  return layer.visible !== false;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function isTransparentColor(value: string): boolean {
  return value === "transparent" || value === "#00000000" || value.trim().length === 0;
}

export function cloneEditableImage(image: EditableImage | null): EditableImage | null {
  return image ? { ...image } : null;
}

export function cloneCanvasLayers(layers: CanvasLayer[]): CanvasLayer[] {
  return layers.map((layer) => ({
    ...layer,
    ...(layer.type === "draw" ? { points: layer.points.map((point) => ({ ...point })) } : {}),
  }));
}
