import type {
  CanvasLayer,
  CanvasTextLayer,
  CanvasImageLayer,
  CanvasShapeLayer,
  CanvasDrawLayer,
  EditableImage,
} from "./editor-types";
import { TEXT_FONT_OPTIONS, createLayerId } from "./editor-types";

export function centerSelectedLayer(
  layer: CanvasLayer,
  axis: "horizontal" | "vertical" | "top" | "bottom" | "left" | "right"
): Partial<CanvasLayer> {
  if (axis === "horizontal") {
    return { x: 0.5 - layer.width / 2 };
  } else if (axis === "vertical") {
    const layerHeight = "height" in layer ? layer.height : 0.08;
    return { y: 0.5 - layerHeight / 2 };
  } else if (axis === "left") {
    return { x: 0 };
  } else if (axis === "right") {
    return { x: 1 - layer.width };
  } else if (axis === "top") {
    return { y: 0 };
  } else if (axis === "bottom") {
    const layerHeight = "height" in layer ? layer.height : 0.08;
    return { y: 1 - layerHeight };
  }
  return {};
}

export function buildReraTextLayer(
  reraNumberText: string,
  currentImage: EditableImage | null
): CanvasTextLayer {
  const value = reraNumberText.trim();
  const textValue = /^rera\b/i.test(value) ? value : `RERA: ${value}`;

  return {
    id: createLayerId("rera-text"),
    type: "text",
    text: textValue,
    x: 0.06,
    y: 0.9,
    width: 0.52,
    rotation: 0,
    fontFamily: TEXT_FONT_OPTIONS[1]?.value ?? "'Helvetica Neue', Arial, sans-serif",
    fontSize: Math.max(16, Math.round((currentImage?.width ?? 1080) * 0.02)),
    fontWeight: "600",
    color: "#ffffff",
    backgroundColor: "rgba(17,24,39,0.82)",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    shadow: false,
    effect: "none",
    effectColor1: "#7c3aed",
    effectColor2: "#00fff9",
    shape: "none",
    curveAmount: 0,
    opacity: 1,
  };
}

export function getStageNormalizedPoint(
  event: { clientX: number; clientY: number },
  rect: DOMRect
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

export function getLayerPositionDelta(
  event: { clientX: number; clientY: number },
  startEvent: { clientX: number; clientY: number },
  rect: DOMRect
): { deltaX: number; deltaY: number } {
  const deltaX = (event.clientX - startEvent.clientX) / rect.width;
  const deltaY = (event.clientY - startEvent.clientY) / rect.height;
  return { deltaX, deltaY };
}

export function shouldPushHistory(deltaX: number, deltaY: number, threshold = 0.0001): boolean {
  return Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
}
