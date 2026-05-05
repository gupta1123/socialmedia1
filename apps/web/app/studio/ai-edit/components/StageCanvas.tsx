"use client";

import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEditorContext } from "../EditorContext";
import { isLayerVisible, isTransparentColor, type CanvasLayer } from "../lib/editor-types";
import { useObjectUrl } from "../lib/editor-files";

import { getEffectDefinition } from "../lib/effects-registry";
import { getElementById } from "../lib/elements-registry";

interface StageCanvasProps {
  stageBusyMessage: string | null;
  onLayerPointerDown: (event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize", handle?: any) => void;
  onStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLayerPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLayerPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFitToScreen: () => void;
  stageFrameRef: RefObject<HTMLDivElement | null>;
  isPanning?: boolean;
  isSpacePressed?: boolean;
}

export function StageCanvas({
  stageBusyMessage,
  onLayerPointerDown,
  onStagePointerDown,
  onLayerPointerMove,
  onLayerPointerUp,
  onFitToScreen,
  stageFrameRef,
  isPanning,
  isSpacePressed,
}: StageCanvasProps) {
  const { state } = useEditorContext();
  const { displayStageWidth, stageScale } = useStageDimensions();
  const currentImageUrl = useObjectUrl(state.currentImage?.file ?? null);

  if (!state.currentImage) {
    return (
      <div className="ai-edit-empty-canvas">
        <div className="create-empty-icon" aria-hidden="true">
          <svg fill="none" height="40" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <h2>Start your composition</h2>
        <p>Upload a high-quality image or select a base layer from your gallery to begin the AI editing process.</p>
      </div>
    );
  }

  return (
    <>
      {state.currentImage && (
        <div className="ai-edit-stage-scroll-content">
          <div
            className="ai-edit-stage-frame"
            onPointerCancel={(event) => {
              event.stopPropagation();
              onLayerPointerUp(event);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onStagePointerDown(event);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              onLayerPointerMove(event);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              onLayerPointerUp(event);
            }}
            ref={stageFrameRef}
            style={{
              aspectRatio: `${state.currentImage.width} / ${state.currentImage.height}`,
              width: displayStageWidth ? `${displayStageWidth}px` : undefined,
            }}
          >
            {currentImageUrl ? <img alt="Source" className="ai-edit-stage-image" draggable={false} src={currentImageUrl} /> : null}
            <div className="ai-editor-layer-surface" aria-label="Editable layers">
              {state.canvasLayers.filter(isLayerVisible).map((layer) => {
                const selected = layer.id === state.selectedLayerId;
                return renderLayer(layer, selected, stageScale, displayStageWidth, onLayerPointerDown);
              })}
            </div>
            {stageBusyMessage ? (
              <div className="ai-edit-stage-overlay" role="status" aria-live="polite">
                <div className="ai-edit-stage-spinner" />
                <span>{stageBusyMessage}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function useStageDimensions() {
  const { state } = useEditorContext();

  const stageWidth = state.currentImage
    ? (() => {
        const maxWidth = 980;
        const maxHeight = 680;
        const scale = Math.min(maxWidth / state.currentImage!.width, maxHeight / state.currentImage!.height, 1);
        return Math.max(240, Math.round(state.currentImage!.width * scale));
      })()
    : null;

  const displayStageWidth = stageWidth ? Math.round(stageWidth * state.stageZoom) : null;
  const stageScale = state.currentImage && displayStageWidth ? displayStageWidth / state.currentImage.width : 1;

  return { displayStageWidth, stageScale };
}

function RenderHandles({
  layerId,
  onLayerPointerDown,
  isText,
}: {
  layerId: string;
  onLayerPointerDown: (event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize", handle?: any) => void;
  isText: boolean;
}) {
  return (
    <>
      <div className="ai-editor-handle is-corner is-nw" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "nw")} />
      <div className="ai-editor-handle is-corner is-ne" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "ne")} />
      <div className="ai-editor-handle is-corner is-sw" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "sw")} />
      <div className="ai-editor-handle is-corner is-se" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "se")} />
      {isText && (
        <>
          <div className="ai-editor-handle is-side is-w" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "w")} />
          <div className="ai-editor-handle is-side is-e" onPointerDown={(e) => onLayerPointerDown(e, layerId, "resize", "e")} />
        </>
      )}
    </>
  );
}

function renderLayer(
  layer: CanvasLayer,
  selected: boolean,
  stageScale: number,
  displayStageWidth: number | null,
  onLayerPointerDown: (event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize", handle?: any) => void
) {
  if (layer.type === "text") {
    const effectDef = getEffectDefinition(layer.effect || 'none');
    const effectStyles = effectDef.generateStyle(layer.effectColor1 || '#7c3aed', layer.effectColor2 || '#00fff9');

    return (
      <div
        className={`ai-editor-layer ai-editor-text-layer ${selected ? "is-selected" : ""} is-shape-${layer.shape}`}
        key={layer.id}
        onPointerDown={(event) => onLayerPointerDown(event, layer.id, "move")}
        style={{
          left: `${layer.x * 100}%`,
          top: `${layer.y * 100}%`,
          width: `${layer.width * 100}%`,
          transform: `rotate(${layer.rotation}deg)`,
          backgroundColor: isTransparentColor(layer.backgroundColor) ? "transparent" : layer.backgroundColor,
          color: layer.color,
          fontFamily: layer.fontFamily,
          fontSize: `${Math.max(8, layer.fontSize * stageScale)}px`,
          fontWeight: layer.fontWeight,
          opacity: layer.opacity,
          textAlign: layer.align,
          letterSpacing: `${layer.letterSpacing * stageScale}px`,
          lineHeight: layer.lineHeight,
          textShadow: layer.effect === "none" && layer.shadow ? "0 8px 24px rgba(0, 0, 0, 0.28)" : undefined,
          ...effectStyles,
        }}
        title="Drag to move"
      >
        {layer.text || "Text"}
        {selected && <RenderHandles isText={true} layerId={layer.id} onLayerPointerDown={onLayerPointerDown} />}
      </div>
    );
  }

  if (layer.type === "shape") {
    const svgEl = layer.svgElementId ? getElementById(layer.svgElementId) : null;

    return (
      <div
        className={`ai-editor-layer ai-editor-shape-layer ${layer.svgElementId ? "is-svg" : `is-${layer.shape}`} ${selected ? "is-selected" : ""}`}
        key={layer.id}
        onPointerDown={(event) => onLayerPointerDown(event, layer.id, "move")}
        style={{
          left: `${layer.x * 100}%`,
          top: `${layer.y * 100}%`,
          width: `${layer.width * 100}%`,
          height: `${layer.height * 100}%`,
          opacity: layer.opacity,
          transform: `rotate(${layer.rotation}deg)`,
          color: layer.fill,
          backgroundColor: (!layer.svgElementId && (layer.shape === "rect" || layer.shape === "circle" || layer.shape === "badge")) ? layer.fill : "transparent",
        }}
        title="Drag to move"
      >
        {svgEl ? (
          <span 
            className="ai-editor-svg-shape" 
            dangerouslySetInnerHTML={{ __html: svgEl.svg }} 
          />
        ) : (
          <>
            {layer.shape === "triangle" ? <span className="ai-editor-triangle-shape" /> : null}
            {layer.shape === "star" ? <span className="ai-editor-star-shape">★</span> : null}
            {layer.shape === "badge" ? <span className="ai-editor-badge-label">NEW</span> : null}
          </>
        )}

        {selected && <RenderHandles isText={false} layerId={layer.id} onLayerPointerDown={onLayerPointerDown} />}
      </div>
    );
  }

  if (layer.type === "draw") {
    const points = layer.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
    return (
      <svg
        className="ai-editor-layer ai-editor-draw-layer"
        key={layer.id}
        preserveAspectRatio="none"
        style={{ inset: 0, opacity: layer.opacity }}
        viewBox="0 0 100 100"
      >
        <polyline
          fill="none"
          points={points}
          stroke={layer.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={Math.max(0.12, (layer.size * stageScale * 100) / Math.max(1, displayStageWidth ?? 1))}
        />
      </svg>
    );
  }

  // image layer
  return (
    <div
      className={`ai-editor-layer ai-editor-image-layer ${selected ? "is-selected" : ""}`}
      key={layer.id}
      onPointerDown={(event) => onLayerPointerDown(event, layer.id, "move")}
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.width * 100}%`,
        height: `${layer.height * 100}%`,
        opacity: layer.opacity,
        transform: `rotate(${layer.rotation}deg)`,
        filter: layer.filter === "grayscale" ? "grayscale(1)" : layer.filter === "sepia" ? "sepia(0.85)" : "none",
      }}
      title="Drag to move"
    >
      <img alt={layer.name} draggable={false} src={layer.src} />
      {selected && <RenderHandles isText={false} layerId={layer.id} onLayerPointerDown={onLayerPointerDown} />}
    </div>
  );
}
