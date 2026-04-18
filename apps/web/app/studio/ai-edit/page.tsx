"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import type { BootstrapResponse, ImageEditPlanResponse } from "@image-lab/contracts";
import { useSearchParams } from "next/navigation";
import { applyMaskedImageEdit, composeImageEditPrompt, generateAutoMask, getCreativeOutput, planImageEdit } from "../../../lib/api";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarControls, useRegisterTopbarMeta } from "../topbar-actions-context";

type ToolMode = "select" | "target" | "brush" | "eraser" | "draw";
type EditorPane = "uploads" | "ai-edit" | "assets" | "templates" | "elements" | "text" | "layers" | "draw";
type DrawMode = "select" | "pen" | "highlighter";
type PromptMode = "normal" | "list";

type EditableImage = {
  file: File;
  width: number;
  height: number;
};

type CanvasTextLayer = {
  id: string;
  type: "text";
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
  opacity: number;
};

type CanvasImageLayer = {
  id: string;
  type: "image";
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  filter: "none" | "grayscale" | "sepia";
  opacity: number;
};

type CanvasShapeLayer = {
  id: string;
  type: "shape";
  shape: "rect" | "circle" | "triangle" | "star" | "badge";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  opacity: number;
};

type CanvasDrawLayer = {
  id: string;
  type: "draw";
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
};

type CanvasLayer = CanvasTextLayer | CanvasImageLayer | CanvasShapeLayer | CanvasDrawLayer;

type LayerDragState = {
  id: string;
  mode: "move" | "resize";
  pushedHistory: boolean;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

const TEXT_FONT_OPTIONS = [
  { label: "Editorial Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Modern Sans", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Premium Serif", value: "'Cormorant Garamond', Georgia, serif" },
  { label: "Display Serif", value: "'Playfair Display', Georgia, serif" },
  { label: "Clean Geometric", value: "Montserrat, 'Helvetica Neue', Arial, sans-serif" }
];

const EDITOR_PANES: Array<{ id: EditorPane; label: string; icon: string }> = [
  { id: "uploads", label: "Uploads", icon: "↑" },
  { id: "ai-edit", label: "AI Edit", icon: "⌘" },
  { id: "assets", label: "Assets", icon: "◫" },
  { id: "templates", label: "Templates", icon: "▦" },
  { id: "elements", label: "Elements", icon: "⊕" },
  { id: "text", label: "Text", icon: "T" },
  { id: "layers", label: "Layers", icon: "☰" },
  { id: "draw", label: "Draw", icon: "◇" }
];

const TEMPLATE_PRESETS: Array<{
  id: "minimal" | "quote" | "sale" | "dark";
  label: string;
  className: string;
  text: string;
}> = [
  { id: "minimal", label: "Minimal Bold", className: "is-minimal", text: "THE NEW\nSTANDARD" },
  { id: "quote", label: "Editorial Quote", className: "is-quote", text: "\"Simplicity.\"" },
  { id: "sale", label: "Flash Sale", className: "is-sale", text: "SALE" },
  { id: "dark", label: "Dark Modern", className: "is-dark", text: "FUTURE\nTECH" }
];

const DRAW_COLORS = ["#111111", "#7c3aed", "#ef4444", "#10b981", "#f59e0b", "#000000"];

const VISUAL_MASK_COLOR = {
  red: 80,
  green: 156,
  blue: 255,
  alpha: 118
};

const VISUAL_MASK_FILL = `rgba(${VISUAL_MASK_COLOR.red}, ${VISUAL_MASK_COLOR.green}, ${VISUAL_MASK_COLOR.blue}, ${Number(
  (VISUAL_MASK_COLOR.alpha / 255).toFixed(2)
)})`;

export default function StudioAiEditPage() {
  const { sessionToken, activeBrand, activeBrandId, activeAssets, bootstrap, recentOutputs } = useStudio();
  const searchParams = useSearchParams();
  const aiEditFlow = bootstrap?.aiEdit?.flow ?? "mask";
  const isMaskFlow = aiEditFlow === "mask";
  const outputId = searchParams.get("outputId");
  const [toolMode, setToolMode] = useState<ToolMode>("target");
  const [brushSize, setBrushSize] = useState(16);
  const [promptMode, setPromptMode] = useState<PromptMode>("normal");
  const [prompt, setPrompt] = useState("");
  const [listPromptItems, setListPromptItems] = useState<string[]>([""]);
  const [isComposingPrompt, setIsComposingPrompt] = useState(false);
  const [composedPrompt, setComposedPrompt] = useState<string>("");
  const [composedPromptKey, setComposedPromptKey] = useState<string>("");
  const [reraNumberText, setReraNumberText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [editPlan, setEditPlan] = useState<ImageEditPlanResponse | null>(null);
  const [plannedPrompt, setPlannedPrompt] = useState("");
  const [targetPoint, setTargetPoint] = useState<{ x: number; y: number } | null>(null);
  const [originalImage, setOriginalImage] = useState<EditableImage | null>(null);
  const [currentImage, setCurrentImage] = useState<EditableImage | null>(null);
  const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layersHistory, setLayersHistory] = useState<CanvasLayer[][]>([]);
  const [layersFuture, setLayersFuture] = useState<CanvasLayer[][]>([]);
  const [hasMaskPreview, setHasMaskPreview] = useState(false);
  const [activeEditorPane, setActiveEditorPane] = useState<EditorPane>("uploads");
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0] ?? "#111111");
  const [drawSize, setDrawSize] = useState(5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerImageInputRef = useRef<HTMLInputElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const layerDragRef = useRef<LayerDragState | null>(null);
  const drawPathRef = useRef<CanvasDrawLayer | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const loadedOutputIdRef = useRef<string | null>(null);

  const currentImageUrl = useObjectUrl(currentImage?.file ?? null);
  const stageWidth = useMemo(() => {
    if (!currentImage) return null;

    const maxWidth = 980;
    const maxHeight = 680;
    const scale = Math.min(maxWidth / currentImage.width, maxHeight / currentImage.height, 1);
    return Math.max(240, Math.round(currentImage.width * scale));
  }, [currentImage]);
  const stageBusyMessage = isMaskFlow
    ? isPlanning
      ? "Analyzing edit..."
      : isSegmenting
        ? "Generating mask..."
        : isApplying
          ? "Applying AI edit..."
          : null
    : isApplying
      ? "Applying AI edit..."
      : null;
  const canReset = Boolean(originalImage && currentImage && (originalImage.file !== currentImage.file || canvasLayers.length > 0));
  const dimensionsLabel = currentImage ? `${currentImage.width} x ${currentImage.height}` : "No image loaded";
  const selectedLayer = canvasLayers.find((layer) => layer.id === selectedLayerId) ?? null;
  const brandPlacementAssets = useMemo(
    () => activeAssets.filter((asset) => asset.kind === "logo" || asset.kind === "rera_qr"),
    [activeAssets]
  );
  const generatedOutputAssets = useMemo(
    () => recentOutputs.filter((output) => output.previewUrl && output.id !== outputId).slice(0, 18),
    [recentOutputs, outputId]
  );
  const hasCanvasLayers = canvasLayers.length > 0;
  const canUndo = useMemo(() => layersHistory.length > 0, [layersHistory]);
  const canRedo = useMemo(() => layersFuture.length > 0, [layersFuture]);
  const stageScale = currentImage && stageWidth ? stageWidth / currentImage.width : 1;
  const promptTrimmed = prompt.trim();
  const normalizedListPromptItems = useMemo(
    () => listPromptItems.map((item) => item.trim()).filter((item) => item.length > 0),
    [listPromptItems]
  );
  const listPromptKey = useMemo(() => normalizedListPromptItems.join("\n"), [normalizedListPromptItems]);
  const currentPromptSignature = promptMode === "normal" ? `normal:${promptTrimmed}` : `list:${listPromptKey}`;
  const hasPromptInput = promptMode === "normal" ? promptTrimmed.length > 0 : normalizedListPromptItems.length > 0;
  const hasFreshComposedPrompt = promptMode === "list" && composedPromptKey === listPromptKey && composedPrompt.trim().length > 0;
  const analysisIsStale = Boolean(editPlan) && plannedPrompt !== currentPromptSignature;
  const canAnalyze = Boolean(currentImage && hasPromptInput) && !isPlanning && !isApplying && !isSegmenting && !isComposingPrompt;
  const canGenerateMask = Boolean(editPlan && !analysisIsStale && currentImage) && !isPlanning && !isApplying && !isSegmenting;
  const canApplyMaskedEdit =
    Boolean(editPlan && !analysisIsStale && currentImage && hasMaskPreview) && !isPlanning && !isApplying && !isSegmenting;
  const canApplyDirectEdit = Boolean(currentImage && hasPromptInput) && !isPlanning && !isApplying && !isSegmenting && !isComposingPrompt;
  const primaryActionLabel = isMaskFlow
    ? isPlanning
      ? "Analyzing..."
      : isSegmenting
        ? "Generating mask..."
        : isApplying
          ? "Applying..."
          : !editPlan || analysisIsStale
            ? editPlan
              ? "Re-analyze edit"
              : "Analyze edit"
            : !hasMaskPreview
              ? "Generate target mask"
              : "Apply AI edit"
    : isComposingPrompt
      ? "Composing prompt..."
      : isApplying
      ? "Applying..."
      : "Apply AI edit";
  const canRunPrimaryAction = isMaskFlow
    ? !editPlan || analysisIsStale
      ? canAnalyze
      : !hasMaskPreview
        ? canGenerateMask
        : canApplyMaskedEdit
    : canApplyDirectEdit;

  const topbarActions = useMemo(
    () => (
      <>
        <button className="button button-ghost" onClick={() => fileInputRef.current?.click()} type="button">
          Upload image
        </button>
        {currentImage ? (
          <>
            <button
              className="button button-ghost"
              disabled={!canUndo}
              onClick={handleUndo}
              type="button"
            >
              Undo
            </button>
            <button
              className="button button-ghost"
              disabled={!canRedo}
              onClick={handleRedo}
              type="button"
            >
              Redo
            </button>
            <button
              className="button button-ghost"
              disabled={isSharing || isApplying || isSegmenting}
              onClick={() => void handleShareCurrentImage()}
              type="button"
            >
              {isSharing ? "Sharing..." : "Share"}
            </button>
            <button className="button button-primary" onClick={() => void handleDownloadComposition()} type="button">
              Download current
            </button>
          </>
        ) : (
          <button className="button button-primary" onClick={() => fileInputRef.current?.click()} type="button">
            Upload image
          </button>
        )}
      </>
    ),
    [canvasLayers, currentImage, isApplying, isSegmenting, isSharing, canUndo, canRedo]
  );

  const topbarMeta = useMemo(
    () => ({
      badges: activeBrand ? <span className="pill pill-sm">{activeBrand.name}</span> : null
    }),
    [activeBrand]
  );

  const topbarControls = useMemo(
    () => (
      <>
        <button
          aria-label="Undo"
          className="topbar-icon-btn"
          disabled={!canUndo}
          onClick={handleUndo}
          title="Undo"
          type="button"
        >
          <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
        <button
          aria-label="Redo"
          className="topbar-icon-btn"
          disabled={!canRedo}
          onClick={handleRedo}
          title="Redo"
          type="button"
        >
          <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>
      </>
    ),
    [canUndo, canRedo]
  );

  useRegisterTopbarActions(topbarActions);
  useRegisterTopbarControls(topbarControls);
  useRegisterTopbarMeta(topbarMeta);

  useEffect(() => {
    if (!sessionToken || !outputId) {
      return;
    }

    if (!outputId) {
      return;
    }
    const token: string = sessionToken;
    const nextOutputId: string = outputId;

    if (loadedOutputIdRef.current === nextOutputId) {
      return;
    }

    let cancelled = false;

    async function loadOutputIntoEditor() {
      setError(null);
      setStatus("Loading generated image into the editor...");

      try {
        const output = await getCreativeOutput(token, nextOutputId);
        if (!output.previewUrl) {
          throw new Error("This output does not have an editable preview image.");
        }

        const file = await sourceToFile(
          output.previewUrl,
          `output-${output.outputIndex + 1}.png`,
          "image/png"
        );
        const image = await createEditableImage(file);

        if (cancelled) {
          return;
        }

        loadedOutputIdRef.current = nextOutputId;
        setOriginalImage(image);
        setCurrentImage(image);
        setCanvasLayers([]);
        setSelectedLayerId(null);
        setLayersHistory([]);
        setLayersFuture([]);
        setEditPlan(null);
        setPlannedPrompt("");
        setTargetPoint(null);
        setToolMode("select");
        setActiveEditorPane("ai-edit");
        if (maskCanvasRef.current) clearMaskCanvas(maskCanvasRef.current);
        setHasMaskPreview(false);
        setStatus("Generated image loaded. You can now edit it.");
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "Unable to load this generated image.");
        setStatus(null);
      }
    }

    void loadOutputIntoEditor();

    return () => {
      cancelled = true;
    };
  }, [outputId, sessionToken]);

  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !currentImage) return;

    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    clearMaskCanvas(canvas);
    setHasMaskPreview(false);
  }, [currentImage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      if (modifier && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) handleUndo();
        return;
      }

      if (modifier && event.key === "z" && event.shiftKey) {
        event.preventDefault();
        if (canRedo) handleRedo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedLayerId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          event.preventDefault();
          handleDeleteSelectedLayer();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, selectedLayerId]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Upload a valid image file.");
      return;
    }

    try {
      const image = await createEditableImage(file);
      setOriginalImage(image);
      setCurrentImage(image);
      setEditPlan(null);
      setPlannedPrompt("");
      setTargetPoint(null);
      setToolMode("select");
      setCanvasLayers([]);
      setSelectedLayerId(null);
      setLayersHistory([]);
      setLayersFuture([]);
      setStatus(
        isMaskFlow
          ? "Source image loaded. Describe the change, then analyze the edit."
          : "Source image loaded. Describe the edit and apply it directly."
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load image.");
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isMaskFlow || !currentImage || isApplying || isSegmenting) return;

    if (toolMode === "target") {
      if (!editPlan || analysisIsStale) {
        return;
      }

      const normalizedPoint = getCanvasNormalizedPoint(event);
      void runAutoSegmentation(editPlan.targetObject, currentImage, normalizedPoint).catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Auto segmentation failed.");
        setStatus(null);
      });
      return;
    }

    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawPoint(lastPointRef.current.x, lastPointRef.current.y);
    setHasMaskPreview(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isMaskFlow || toolMode === "target" || !drawingRef.current || !currentImage) return;

    const nextPoint = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;

    if (!lastPoint) {
      lastPointRef.current = nextPoint;
      drawPoint(nextPoint.x, nextPoint.y);
      return;
    }

    drawSegment(lastPoint.x, lastPoint.y, nextPoint.x, nextPoint.y);
    lastPointRef.current = nextPoint;
    setHasMaskPreview(true);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isMaskFlow || toolMode === "target") {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function drawPoint(x: number, y: number) {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    stampBrush(canvas, ctx, x, y, brushSize, toolMode);
  }

  function drawSegment(fromX: number, fromY: number, toX: number, toY: number) {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const radii = getActualBrushRadii(canvas, brushSize);
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const distance = Math.hypot(deltaX, deltaY);
    const stepSize = Math.max(1, Math.min(radii.x, radii.y) * 0.55);
    const steps = Math.max(1, Math.ceil(distance / stepSize));

    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      stampBrushAt(ctx, fromX + deltaX * progress, fromY + deltaY * progress, radii, toolMode);
    }
  }

  function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function getCanvasNormalizedPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event);
    const canvas = event.currentTarget;

    return {
      x: Math.min(1, Math.max(0, point.x / canvas.width)),
      y: Math.min(1, Math.max(0, point.y / canvas.height))
    };
  }

  function handleClearMask() {
    if (!maskCanvasRef.current) return;

    clearMaskCanvas(maskCanvasRef.current);
    setTargetPoint(null);
    if (editPlan && !analysisIsStale) {
      setToolMode("target");
    }
    setHasMaskPreview(false);
    setStatus("Mask cleared.");
    setError(null);
  }

  function handleResetImage() {
    if (!originalImage) return;

    pushToLayersHistory(canvasLayers);
    setCurrentImage(originalImage);
    setEditPlan(null);
    setPlannedPrompt("");
    setTargetPoint(null);
    setToolMode("select");
    setCanvasLayers([]);
    setSelectedLayerId(null);
    setStatus(
      isMaskFlow
        ? "Reset to original image. Analyze the next edit before applying it."
        : "Reset to original image. Describe the next edit and apply it directly."
    );
    setError(null);
  }

  function handleListPromptItemChange(index: number, value: string) {
    setListPromptItems((previous) => previous.map((entry, itemIndex) => (itemIndex === index ? value : entry)));
  }

  function handleAddListPromptItem() {
    setListPromptItems((previous) => [...previous, ""]);
  }

  function handleRemoveListPromptItem(index: number) {
    setListPromptItems((previous) => {
      if (previous.length <= 1) {
        return [""];
      }

      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function resolveActivePrompt() {
    if (promptMode === "normal") {
      if (!promptTrimmed) {
        setError("Describe the edit before applying AI changes.");
        return null;
      }

      return promptTrimmed;
    }

    if (normalizedListPromptItems.length === 0) {
      setError("Add at least one edit item in list mode.");
      return null;
    }

    if (!sessionToken) {
      setError("Your session is missing. Refresh the page and try again.");
      return null;
    }

    if (!activeBrandId) {
      setError("Select an active brand before composing list-mode edits.");
      return null;
    }

    if (hasFreshComposedPrompt) {
      return composedPrompt.trim();
    }

    setIsComposingPrompt(true);
    setError(null);
    setStatus("Composing list changes into a single AI edit prompt...");

    try {
      const composed = await composeImageEditPrompt(sessionToken, {
        brandId: activeBrandId,
        changes: normalizedListPromptItems
      });
      const nextPrompt = composed.prompt.trim();

      setComposedPrompt(nextPrompt);
      setComposedPromptKey(listPromptKey);
      setStatus(
        composed.strategy === "gemini"
          ? `Prompt composed with ${composed.model ?? "Gemini"}.`
          : "Prompt composed using fallback strategy."
      );
      return nextPrompt;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to compose list-mode prompt.");
      setStatus(null);
      return null;
    } finally {
      setIsComposingPrompt(false);
    }
  }

  async function handleComposePromptFromList() {
    if (promptMode !== "list") {
      return;
    }

    await resolveActivePrompt();
  }

  async function handleAnalyzeEdit() {
    if (!sessionToken) {
      setError("Your session is missing. Refresh the page and try again.");
      return;
    }

    if (!activeBrandId) {
      setError("Select an active brand before analyzing an edit.");
      return;
    }

    if (!currentImage) {
      setError("Upload a source image first.");
      return;
    }

    if (!hasPromptInput) {
      setError(promptMode === "normal" ? "Describe the edit before analyzing it." : "Add at least one list item before analyzing.");
      return;
    }

    setIsPlanning(true);
    setError(null);
    setStatus("Analyzing the edit request...");

    try {
      const resolvedPrompt = await resolveActivePrompt();
      if (!resolvedPrompt) {
        return;
      }

      const result = await planImageEdit(sessionToken, {
        brandId: activeBrandId,
        prompt: resolvedPrompt,
        width: currentImage.width,
        height: currentImage.height,
        image: currentImage.file,
        imageFileName: currentImage.file.name
      });

      setEditPlan(result);
      setPlannedPrompt(currentPromptSignature);
      setTargetPoint(null);
      setToolMode("target");
      if (maskCanvasRef.current) clearMaskCanvas(maskCanvasRef.current);
      setHasMaskPreview(false);
      setStatus(`Edit analyzed. Target "${result.targetObject}" is ready for segmentation.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to analyze the edit.");
      setStatus(null);
    } finally {
      setIsPlanning(false);
    }
  }

  async function runAutoSegmentation(
    objectName: string,
    sourceImage: EditableImage,
    nextTargetPoint?: { x: number; y: number } | null
  ) {
    if (!sessionToken) throw new Error("Your session is missing. Refresh the page and try again.");
    if (!activeBrandId) throw new Error("Select an active brand before generating an auto mask.");

    const normalizedObjectName = normalizeObjectLabel(objectName);
    if (!normalizedObjectName) throw new Error("Enter the object you want to auto-mask.");

    setIsSegmenting(true);
    setError(null);
    setStatus(`Auto-masking "${normalizedObjectName}"...`);

    try {
      const result = await generateAutoMask(sessionToken, {
        brandId: activeBrandId,
        object: normalizedObjectName,
        ...(nextTargetPoint ? { targetX: nextTargetPoint.x, targetY: nextTargetPoint.y } : {}),
        image: sourceImage.file,
        imageFileName: sourceImage.file.name
      });

      const canvas = maskCanvasRef.current;
      if (!canvas) throw new Error("Mask canvas is not available.");

      await applySegmentationMaskToCanvas(result.maskDataUrl ?? result.maskUrl, canvas);
      setToolMode("brush");
      setTargetPoint(nextTargetPoint ?? null);
      setHasMaskPreview(true);
      setStatus(`Auto mask ready from ${result.model}. Refine the selection if needed, then apply the edit.`);

      return normalizedObjectName;
    } finally {
      setIsSegmenting(false);
    }
  }

  function handleAddTextLayer(preset: "heading" | "subheading" | "body" = "heading") {
    if (!currentImage) {
      setError("Upload a source image before adding text.");
      return;
    }

    const presetConfig = {
      heading: {
        text: "Add heading",
        fontSize: Math.max(44, Math.round(currentImage.width * 0.075)),
        fontWeight: "700" as const,
        width: 0.58
      },
      subheading: {
        text: "Add subheading",
        fontSize: Math.max(28, Math.round(currentImage.width * 0.043)),
        fontWeight: "600" as const,
        width: 0.5
      },
      body: {
        text: "Add body text",
        fontSize: Math.max(18, Math.round(currentImage.width * 0.026)),
        fontWeight: "400" as const,
        width: 0.44
      }
    }[preset];

    const nextLayer: CanvasTextLayer = {
      id: createLayerId("text"),
      type: "text",
      text: presetConfig.text,
      x: 0.1,
      y: 0.12,
      width: presetConfig.width,
      rotation: 0,
      fontFamily: TEXT_FONT_OPTIONS[0]?.value ?? "Georgia, serif",
      fontSize: presetConfig.fontSize,
      fontWeight: presetConfig.fontWeight,
      color: "#ffffff",
      backgroundColor: "#00000000",
      align: "left",
      letterSpacing: -1,
      lineHeight: 1.12,
      shadow: true,
      opacity: 1
    };

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => [...layers, nextLayer]);
    setSelectedLayerId(nextLayer.id);
    setToolMode("select");
    setStatus("Text layer added.");
    setError(null);
  }

  function handleAddShapeLayer(shape: CanvasShapeLayer["shape"]) {
    if (!currentImage) {
      setError("Upload a source image before adding elements.");
      return;
    }

    const labels: Record<CanvasShapeLayer["shape"], string> = {
      rect: "Rectangle",
      circle: "Circle",
      triangle: "Triangle",
      star: "Star badge",
      badge: "New badge"
    };
    const nextLayer: CanvasShapeLayer = {
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
      opacity: 0.9
    };

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => [...layers, nextLayer]);
    setSelectedLayerId(nextLayer.id);
    setToolMode("select");
    setStatus(`${labels[shape]} added.`);
    setError(null);
  }

  async function handleLayerImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;
    if (!currentImage) {
      setError("Upload a source image before adding an element.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Upload a valid image element.");
      return;
    }

    try {
      const [src, dimensions] = await Promise.all([fileToDataUrl(file), loadImageDimensions(file)]);
      const width = 0.22;
      const height = Math.min(0.35, width * (dimensions.height / dimensions.width) * (currentImage.width / currentImage.height));
      const nextLayer: CanvasImageLayer = {
        id: createLayerId("image"),
        type: "image",
        name: file.name,
        src,
        x: 0.08,
        y: 0.08,
        width,
        height: Math.max(0.04, height),
        rotation: 0,
        filter: "none",
        opacity: 1
      };

      pushToLayersHistory(canvasLayers);
      setCanvasLayers((layers) => [...layers, nextLayer]);
      setSelectedLayerId(nextLayer.id);
      setToolMode("select");
      setStatus("Image layer added.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add image layer.");
    }
  }

  async function handleAddBrandAssetLayer(asset: BootstrapResponse["brandAssets"][number]) {
    if (!currentImage) {
      setError("Upload a source image or choose a template before adding brand assets.");
      return;
    }

    if (!asset.previewUrl) {
      setError(`${asset.label} does not have a preview URL yet.`);
      return;
    }

    try {
      const dimensions = await loadImageSourceDimensions(asset.previewUrl);
      const isQr = asset.kind === "rera_qr";
      const width = isQr ? 0.16 : 0.22;
      const height = Math.min(
        isQr ? 0.22 : 0.18,
        width * (dimensions.height / dimensions.width) * (currentImage.width / currentImage.height)
      );
      const nextLayer: CanvasImageLayer = {
        id: createLayerId(asset.kind),
        type: "image",
        name: asset.label,
        src: asset.previewUrl,
        x: isQr ? 0.78 : 0.08,
        y: isQr ? 0.78 : 0.08,
        width,
        height: Math.max(0.04, height),
        rotation: 0,
        filter: "none",
        opacity: 1
      };

      pushToLayersHistory(canvasLayers);
      setCanvasLayers((layers) => [...layers, nextLayer]);
      setSelectedLayerId(nextLayer.id);
      setToolMode("select");
      setActiveEditorPane("layers");
      setStatus(`${asset.kind === "rera_qr" ? "RERA QR" : "Logo"} asset added.`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add brand asset.");
    }
  }

  async function handleAddGeneratedOutputLayer(output: BootstrapResponse["recentOutputs"][number]) {
    if (!currentImage) {
      setError("Upload a source image or choose a template before adding generated posts.");
      return;
    }

    if (!output.previewUrl) {
      setError("This generated post is missing a preview URL.");
      return;
    }

    try {
      const dimensions = await loadImageSourceDimensions(output.previewUrl);
      const width = 0.36;
      const height = Math.min(0.5, width * (dimensions.height / dimensions.width) * (currentImage.width / currentImage.height));
      const nextLayer: CanvasImageLayer = {
        id: createLayerId("generated-post"),
        type: "image",
        name: `Generated post #${output.outputIndex + 1}`,
        src: output.previewUrl,
        x: 0.06,
        y: 0.06,
        width,
        height: Math.max(0.08, height),
        rotation: 0,
        filter: "none",
        opacity: 1
      };

      pushToLayersHistory(canvasLayers);
      setCanvasLayers((layers) => [...layers, nextLayer]);
      setSelectedLayerId(nextLayer.id);
      setToolMode("select");
      setActiveEditorPane("layers");
      setStatus("Generated post added as an image layer.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add generated post.");
    }
  }

  function handleAddReraNumberLayer() {
    if (!currentImage) {
      setError("Upload a source image before adding RERA text.");
      return;
    }

    const value = reraNumberText.trim();
    if (!value) {
      setError("Enter a RERA number first.");
      return;
    }

    const textValue = /^rera\b/i.test(value) ? value : `RERA: ${value}`;
    const nextLayer: CanvasTextLayer = {
      id: createLayerId("rera-text"),
      type: "text",
      text: textValue,
      x: 0.06,
      y: 0.9,
      width: 0.52,
      rotation: 0,
      fontFamily: TEXT_FONT_OPTIONS[1]?.value ?? "'Helvetica Neue', Arial, sans-serif",
      fontSize: Math.max(16, Math.round(currentImage.width * 0.02)),
      fontWeight: "600",
      color: "#ffffff",
      backgroundColor: "rgba(17,24,39,0.82)",
      align: "left",
      letterSpacing: 0,
      lineHeight: 1.2,
      shadow: false,
      opacity: 1
    };

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => [...layers, nextLayer]);
    setSelectedLayerId(nextLayer.id);
    setToolMode("select");
    setActiveEditorPane("layers");
    setStatus("RERA number text added.");
    setError(null);
  }

  async function handleApplyTemplate(templateId: (typeof TEMPLATE_PRESETS)[number]["id"]) {
    try {
      const templateImage = await createTemplateBaseImage(templateId);
      const templateLayers = buildTemplateLayers(templateId, templateImage.width, templateImage.height);

      pushToLayersHistory(canvasLayers);
      setOriginalImage(templateImage);
      setCurrentImage(templateImage);
      setCanvasLayers(templateLayers);
      setSelectedLayerId(templateLayers[0]?.id ?? null);
      setEditPlan(null);
      setPlannedPrompt("");
      setTargetPoint(null);
      setToolMode("select");
      setActiveEditorPane("layers");
      setStatus("Template applied. Edit the layers or add your own image.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to apply template.");
    }
  }

  function handleEditorPaneChange(nextPane: EditorPane) {
    setActiveEditorPane(nextPane);

    if (nextPane === "draw") {
      setToolMode("draw");
      setSelectedLayerId(null);
      return;
    }

    if (nextPane === "ai-edit") {
      setToolMode(isMaskFlow && editPlan && !analysisIsStale ? "target" : "select");
      return;
    }

    setToolMode("select");
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (toolMode === "draw" && drawMode !== "select" && currentImage && !isApplying && !isSegmenting) {
      const point = getStageNormalizedPoint(event);
      const nextLayer: CanvasDrawLayer = {
        id: createLayerId("draw"),
        type: "draw",
        label: drawMode === "highlighter" ? "Highlighter stroke" : "Pen stroke",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        points: [point],
        color: drawColor,
        size: drawMode === "highlighter" ? drawSize * 3 : drawSize,
        opacity: drawMode === "highlighter" ? 0.42 : 1
      };

      pushToLayersHistory(canvasLayers);
      drawPathRef.current = nextLayer;
      setCanvasLayers((layers) => [...layers, nextLayer]);
      setSelectedLayerId(nextLayer.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (toolMode === "select") {
      setSelectedLayerId(null);
    }
  }

  function getStageNormalizedPoint(event: ReactPointerEvent<HTMLElement>) {
    const frame = stageFrameRef.current;
    const rect = frame?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();

    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
    };
  }

  function updateSelectedLayer(
    patch: Partial<CanvasTextLayer> | Partial<CanvasImageLayer> | Partial<CanvasShapeLayer> | Partial<CanvasDrawLayer>
  ) {
    if (!selectedLayerId) return;

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) =>
      layers.map((layer) => (layer.id === selectedLayerId ? ({ ...layer, ...patch } as CanvasLayer) : layer))
    );
  }

  function duplicateSelectedLayer() {
    if (!selectedLayer) return;

    const nextLayer = {
      ...selectedLayer,
      id: createLayerId(selectedLayer.type),
      x: clamp(selectedLayer.x + 0.04, 0, 0.96),
      y: clamp(selectedLayer.y + 0.04, 0, 0.96)
    } as CanvasLayer;

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => [...layers, nextLayer]);
    setSelectedLayerId(nextLayer.id);
    setStatus("Layer duplicated.");
  }

  function moveSelectedLayer(direction: "forward" | "backward") {
    if (!selectedLayerId) return;

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => {
      const index = layers.findIndex((layer) => layer.id === selectedLayerId);
      if (index < 0) return layers;
      const targetIndex = direction === "forward" ? Math.min(layers.length - 1, index + 1) : Math.max(0, index - 1);
      if (targetIndex === index) return layers;

      const nextLayers = [...layers];
      const [layer] = nextLayers.splice(index, 1);
      if (!layer) return layers;
      nextLayers.splice(targetIndex, 0, layer);
      return nextLayers;
    });
  }

  function centerSelectedLayer(axis: "horizontal" | "vertical") {
    if (!selectedLayerId) return;
    if (axis === "horizontal") {
      updateSelectedLayer({ x: 0.5 - (selectedLayer?.width ?? 0) / 2 });
      return;
    }

    const layerHeight = selectedLayer && "height" in selectedLayer ? selectedLayer.height : 0.1;
    updateSelectedLayer({ y: 0.5 - layerHeight / 2 });
  }

  function handleDeleteSelectedLayer() {
    if (!selectedLayerId) return;

    pushToLayersHistory(canvasLayers);
    setCanvasLayers((layers) => layers.filter((layer) => layer.id !== selectedLayerId));
    setSelectedLayerId(null);
    setStatus("Layer removed.");
  }

  function pushToLayersHistory(layers: CanvasLayer[]) {
    const snapshot = cloneCanvasLayers(layers);
    setLayersHistory((prev) => {
      const previousSnapshot = prev[prev.length - 1];
      if (previousSnapshot && areCanvasLayersEqual(previousSnapshot, snapshot)) {
        return prev;
      }

      return [...prev.slice(-19), snapshot];
    });
    setLayersFuture([]);
  }

  function handleUndo() {
    if (layersHistory.length === 0) return;

    const previous = layersHistory[layersHistory.length - 1];
    if (!previous) return;
    setLayersFuture((prev) => [cloneCanvasLayers(canvasLayers), ...prev]);
    setLayersHistory((prev) => prev.slice(0, -1));
    setCanvasLayers(cloneCanvasLayers(previous));
    setSelectedLayerId(null);
    setStatus("Undone.");
  }

  function handleRedo() {
    if (layersFuture.length === 0) return;

    const next = layersFuture[0];
    if (!next) return;
    setLayersHistory((prev) => [...prev, cloneCanvasLayers(canvasLayers)]);
    setLayersFuture((prev) => prev.slice(1));
    setCanvasLayers(cloneCanvasLayers(next));
    setSelectedLayerId(null);
    setStatus("Redone.");
  }

  function handleLayerPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    layer: CanvasLayer,
    mode: "move" | "resize" = "move"
  ) {
    if (!currentImage || isApplying || isSegmenting) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedLayerId(layer.id);
    setToolMode("select");
    layerDragRef.current = {
      id: layer.id,
      mode,
      pushedHistory: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layer.x,
      startY: layer.y,
      startWidth: layer.width,
      startHeight: "height" in layer ? layer.height : 0.08
    };
  }

  function handleLayerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (drawPathRef.current && toolMode === "draw") {
      const point = getStageNormalizedPoint(event);
      const currentDrawLayer = drawPathRef.current;
      const lastPoint = currentDrawLayer.points[currentDrawLayer.points.length - 1];

      if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 0.002) {
        const nextLayer = {
          ...currentDrawLayer,
          points: [...currentDrawLayer.points, point]
        };
        drawPathRef.current = nextLayer;
        setCanvasLayers((layers) => layers.map((layer) => (layer.id === nextLayer.id ? nextLayer : layer)));
      }
      return;
    }

    const drag = layerDragRef.current;
    const frame = stageFrameRef.current;
    if (!drag || !frame) return;

    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaX = (event.clientX - drag.startClientX) / rect.width;
    const deltaY = (event.clientY - drag.startClientY) / rect.height;
    const movedEnough = Math.abs(deltaX) > 0.0001 || Math.abs(deltaY) > 0.0001;
    if (movedEnough && !drag.pushedHistory) {
      pushToLayersHistory(canvasLayers);
      drag.pushedHistory = true;
    }

    if (!drag.pushedHistory) {
      return;
    }

    setCanvasLayers((layers) =>
      layers.map((layer) => {
        if (layer.id !== drag.id) return layer;

        if (drag.mode === "resize") {
          if (layer.type === "image" || layer.type === "shape") {
            return {
              ...layer,
              width: clamp(drag.startWidth + deltaX, 0.04, 0.95 - layer.x),
              height: clamp(drag.startHeight + deltaY, 0.04, 0.95 - layer.y)
            };
          }

          return {
            ...layer,
            width: clamp(drag.startWidth + deltaX, 0.12, 0.95 - layer.x)
          };
        }

        return {
          ...layer,
          x: clamp(drag.startX + deltaX, 0, 0.98),
          y: clamp(drag.startY + deltaY, 0, 0.98)
        };
      })
    );
  }

  function handleLayerPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (drawPathRef.current) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      drawPathRef.current = null;
      setStatus("Drawing added.");
      return;
    }

    if (!layerDragRef.current) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    layerDragRef.current = null;
  }

  async function getComposedImageFile(fileName = currentImage ? buildComposedFileName(currentImage.file.name) : "composition.png") {
    if (!currentImage) {
      throw new Error("Upload a source image first.");
    }

    if (canvasLayers.length === 0) {
      return normalizeImageFile(currentImage.file, currentImage.width, currentImage.height, fileName);
    }

    return renderCompositionToFile(currentImage, canvasLayers, fileName);
  }

  async function handleDownloadComposition() {
    if (!currentImage) return;

    try {
      const file = await getComposedImageFile();
      downloadFile(file);
      setStatus(hasCanvasLayers ? "Composed image downloaded." : "Current image downloaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to export the composition.");
    }
  }

  async function handleShareCurrentImage() {
    if (!currentImage) return;

    setIsSharing(true);
    setError(null);

    try {
      const composedFile = await getComposedImageFile();
      const sharePayload = {
        files: [composedFile],
        title: composedFile.name,
        text: "Shared from Briefly Social"
      };

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        const canShareFiles = typeof navigator.canShare !== "function" || navigator.canShare(sharePayload);
        if (canShareFiles) {
          await navigator.share(sharePayload);
          setStatus("Share sheet opened.");
          return;
        }
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === "function" &&
        typeof ClipboardItem !== "undefined"
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [composedFile.type || "image/png"]: composedFile
          })
        ]);
        setStatus("Current image copied to clipboard.");
        return;
      }

      downloadFile(composedFile);
      setStatus("Share is not available here, so the current image was downloaded instead.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to share the current image.");
    } finally {
      setIsSharing(false);
    }
  }

  async function handleApplyEdit() {
    if (!sessionToken) {
      setError("Your session is missing. Refresh the page and try again.");
      return;
    }

    if (!activeBrandId) {
      setError("Select an active brand before applying an edit.");
      return;
    }

    if (!currentImage) {
      setError("Upload a source image first.");
      return;
    }

    setIsApplying(true);
    setError(null);
    setStatus("Applying the edit. This can take a few moments.");

    try {
      let result;
      if (isMaskFlow) {
        if (!editPlan) {
          setError("Analyze the edit before applying it.");
          return;
        }

        if (analysisIsStale) {
          setError("The prompt changed after analysis. Analyze the edit again before applying it.");
          return;
        }

        const canvas = maskCanvasRef.current;
        if (!canvas || !canvasHasMask(canvas)) {
          setError("Generate and confirm the target mask before applying the edit.");
          return;
        }

        const maskFile = await exportMaskFile(canvas, buildMaskFileName(currentImage.file.name));
        const sourceFile = await getComposedImageFile(buildNormalizedSourceFileName(currentImage.file.name));
        const [sourceDimensions, maskDimensions] = await Promise.all([
          loadImageDimensions(sourceFile),
          loadImageDimensions(maskFile)
        ]);

        if (
          sourceDimensions.width !== maskDimensions.width ||
          sourceDimensions.height !== maskDimensions.height
        ) {
          throw new Error(
            `Source and mask dimensions do not match (${sourceDimensions.width}x${sourceDimensions.height} vs ${maskDimensions.width}x${maskDimensions.height}).`
          );
        }

        result = await applyMaskedImageEdit(sessionToken, {
          brandId: activeBrandId,
          prompt: editPlan.rewrittenPrompt,
          width: canvas.width,
          height: canvas.height,
          image: sourceFile,
          imageFileName: sourceFile.name,
          mask: maskFile,
          maskFileName: maskFile.name,
          ...(editPlan.targetObject ? { objectLabel: editPlan.targetObject } : {})
        });
      } else {
        const resolvedPrompt = await resolveActivePrompt();
        if (!resolvedPrompt) {
          return;
        }

        const sourceFile = await getComposedImageFile(buildNormalizedSourceFileName(currentImage.file.name));

        result = await applyMaskedImageEdit(sessionToken, {
          brandId: activeBrandId,
          prompt: resolvedPrompt,
          width: currentImage.width,
          height: currentImage.height,
          image: sourceFile,
          imageFileName: sourceFile.name
        });
      }

      const nextFile = await sourceToFile(
        result.imageDataUrl ?? result.imageUrl,
        buildEditedFileName(currentImage.file.name),
        "image/png"
      );
      const nextImage = await createEditableImage(nextFile);

      setCurrentImage(nextImage);
      setCanvasLayers([]);
      setSelectedLayerId(null);
      setEditPlan(null);
      setPlannedPrompt("");
      setTargetPoint(null);
      setToolMode("target");
      setStatus(
        isMaskFlow
          ? `Edit applied with ${result.model}. Analyze the next change or refine the result with a new plan.`
          : `Edit applied with ${result.model}. Describe the next change to continue editing.`
      );
      if (maskCanvasRef.current) clearMaskCanvas(maskCanvasRef.current);
      setHasMaskPreview(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI edit failed.");
      setStatus(null);
    } finally {
      setIsApplying(false);
    }
  }

  async function handlePrimaryAction() {
    if (!isMaskFlow) {
      await handleApplyEdit();
      return;
    }

    if (!editPlan || analysisIsStale) {
      await handleAnalyzeEdit();
      return;
    }

    if (!hasMaskPreview) {
      if (!currentImage) {
        setError("Upload a source image first.");
        return;
      }

      try {
        await runAutoSegmentation(editPlan.targetObject, currentImage, targetPoint);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to generate the target mask.");
        setStatus(null);
      }
      return;
    }

    await handleApplyEdit();
  }

  return (
    <div className="create-v2-shell ai-edit-page">
      <input accept="image/*" hidden onChange={handleFileChange} ref={fileInputRef} type="file" />
      <input accept="image/*" hidden onChange={handleLayerImageChange} ref={layerImageInputRef} type="file" />

      <aside className="create-v2-sidebar ai-edit-sidebar-panel">
        <div className="ai-editor-sidebar-shell">
          <nav className="ai-editor-rail" aria-label="Editor tools">
            <div className="ai-editor-rail-list">
              {EDITOR_PANES.map((pane) => (
                <button
                  className={`ai-editor-rail-button ${activeEditorPane === pane.id ? "is-active" : ""}`}
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
          <div className="ai-editor-tray">
            {activeEditorPane === "templates" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Starter layouts</p>
                  <h2>Templates</h2>
                </div>
                <input className="ai-editor-search-input" placeholder="Search templates..." type="search" />
                <div className="ai-editor-template-list">
                  {TEMPLATE_PRESETS.map((template) => (
                    <button className="ai-editor-template-card" key={template.id} onClick={() => void handleApplyTemplate(template.id)} type="button">
                      <span className={`ai-editor-template-preview ${template.className}`}>
                        {template.text.split("\n").map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                      <strong>{template.label}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeEditorPane === "assets" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Brand assets</p>
                  <h2>Assets</h2>
                </div>
                <p className="ai-editor-pane-copy">Add approved logo, RERA QR, RERA text, or generated posts to the current canvas.</p>
                <div className="ai-editor-asset-list">
                  {brandPlacementAssets.length ? (
                    brandPlacementAssets.map((asset) => (
                      <button
                        className="ai-editor-asset-card"
                        disabled={!currentImage || !asset.previewUrl}
                        key={asset.id}
                        onClick={() => void handleAddBrandAssetLayer(asset)}
                        type="button"
                      >
                        <span className="ai-editor-asset-preview">
                          {asset.previewUrl ? <img alt={asset.label} src={asset.previewUrl} /> : <span>{asset.kind === "rera_qr" ? "QR" : "Logo"}</span>}
                        </span>
                        <span className="ai-editor-asset-copy">
                          <strong>{asset.label}</strong>
                          <small>{asset.kind === "rera_qr" ? "RERA QR" : "Logo"}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="create-empty-state create-empty-state-compact">
                      <p>No logo or QR assets uploaded for this brand yet.</p>
                    </div>
                  )}
                </div>
                <label className="create-field-label">
                  RERA number text
                  <input
                    className="input"
                    onChange={(event) => setReraNumberText(event.target.value)}
                    placeholder="Example: P52100012345"
                    value={reraNumberText}
                  />
                </label>
                <button className="button button-ghost ai-editor-full-button" disabled={!currentImage} onClick={handleAddReraNumberLayer} type="button">
                  Add RERA number text
                </button>
                <h3 className="ai-editor-pane-subtitle">Generated posts</h3>
                <div className="ai-editor-asset-list">
                  {generatedOutputAssets.length ? (
                    generatedOutputAssets.map((output) => (
                      <button
                        className="ai-editor-asset-card"
                        disabled={!currentImage || !output.previewUrl}
                        key={output.id}
                        onClick={() => void handleAddGeneratedOutputLayer(output)}
                        type="button"
                      >
                        <span className="ai-editor-asset-preview">
                          {output.previewUrl ? <img alt={`Generated post ${output.outputIndex + 1}`} src={output.previewUrl} /> : <span>Post</span>}
                        </span>
                        <span className="ai-editor-asset-copy">
                          <strong>{`Generated post #${output.outputIndex + 1}`}</strong>
                          <small>{output.createdBy ? `Creator ID: ${output.createdBy}` : "Generated output"}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="create-empty-state create-empty-state-compact">
                      <p>No generated posts available yet for this brand.</p>
                    </div>
                  )}
                </div>
                {!currentImage ? <p className="create-hint">Upload an image or choose a template before placing assets.</p> : null}
              </div>
            ) : null}

            {activeEditorPane === "elements" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Visual elements</p>
                  <h2>Shapes</h2>
                </div>
                <input className="ai-editor-search-input" placeholder="Search elements..." type="search" />
                <div className="ai-editor-large-shape-grid">
                  <button className="ai-editor-large-shape-button" disabled={!currentImage} onClick={() => handleAddShapeLayer("rect")} type="button">
                    <span className="ai-editor-shape-icon is-rect" />
                  </button>
                  <button className="ai-editor-large-shape-button" disabled={!currentImage} onClick={() => handleAddShapeLayer("circle")} type="button">
                    <span className="ai-editor-shape-icon is-circle" />
                  </button>
                  <button className="ai-editor-large-shape-button" disabled={!currentImage} onClick={() => handleAddShapeLayer("triangle")} type="button">
                    <span className="ai-editor-shape-icon is-triangle" />
                  </button>
                </div>
                <h3 className="ai-editor-pane-subtitle">Stickers & badges</h3>
                <div className="ai-editor-large-shape-grid">
                  <button className="ai-editor-large-shape-button is-star" disabled={!currentImage} onClick={() => handleAddShapeLayer("star")} type="button">
                    ★
                  </button>
                  <button className="ai-editor-large-shape-button is-badge" disabled={!currentImage} onClick={() => handleAddShapeLayer("badge")} type="button">
                    NEW
                  </button>
                </div>
                {!currentImage ? <p className="create-hint">Upload an image or choose a template before adding elements.</p> : null}
              </div>
            ) : null}

            {activeEditorPane === "text" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Typography</p>
                  <h2>Text</h2>
                </div>
                <button className="button button-primary ai-editor-full-button" disabled={!currentImage} onClick={() => handleAddTextLayer()} type="button">
                  Add a text box
                </button>
                <h3 className="ai-editor-pane-subtitle">Default text styles</h3>
                <div className="ai-editor-text-preset-list">
                  <button className="ai-editor-text-preset is-heading" disabled={!currentImage} onClick={() => handleAddTextLayer("heading")} type="button">
                    Add a heading
                  </button>
                  <button className="ai-editor-text-preset is-subheading" disabled={!currentImage} onClick={() => handleAddTextLayer("subheading")} type="button">
                    Add a subheading
                  </button>
                  <button className="ai-editor-text-preset" disabled={!currentImage} onClick={() => handleAddTextLayer("body")} type="button">
                    Add a little bit of body text
                  </button>
                </div>
              </div>
            ) : null}

            {activeEditorPane === "uploads" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Files</p>
                  <h2>Uploads</h2>
                </div>
                <button className="ai-edit-upload-card" onClick={() => fileInputRef.current?.click()} type="button">
                  <span className="ai-edit-upload-icon" aria-hidden="true">↑</span>
                  <span>{currentImage ? "Replace base image" : "Upload source image"}</span>
                  <small>{currentImage ? currentImage.file.name : "PNG, JPG, or WebP"}</small>
                </button>
                <button className="button button-ghost ai-editor-full-button" disabled={!currentImage} onClick={() => layerImageInputRef.current?.click()} type="button">
                  Add image layer
                </button>
                <div className="create-picker-summary">
                  <div>
                    <p className="create-picker-summary-label">Current canvas</p>
                    <strong>{dimensionsLabel}</strong>
                  </div>
                  {canReset ? (
                    <div className="create-picker-summary-actions">
                      <button className="create-inline-action" onClick={handleResetImage} type="button">
                        Reset
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeEditorPane === "layers" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Stack</p>
                  <h2>Layers Management</h2>
                </div>
                <p className="ai-editor-pane-copy">Click a layer to select it. Use controls below to edit or reorder.</p>
                <div className="ai-editor-layer-list">
                  {canvasLayers.length ? (
                    canvasLayers.slice().reverse().map((layer) => (
                      <button
                        className={`ai-editor-layer-row ${selectedLayerId === layer.id ? "is-active" : ""}`}
                        key={layer.id}
                        onClick={() => {
                          setSelectedLayerId(layer.id);
                          setToolMode("select");
                        }}
                        type="button"
                      >
                        <span>{layer.type}</span>
                        <strong>{getLayerLabel(layer)}</strong>
                      </button>
                    ))
                  ) : (
                    <div className="create-empty-state create-empty-state-compact">
                      <p>No editable layers yet.</p>
                    </div>
                  )}
                </div>
                {selectedLayer ? (
                  <div className="ai-editor-layer-controls">
                    {selectedLayer.type === "text" ? (
                      <>
                        <label className="create-field-label">
                          Text
                          <textarea className="create-prompt-textarea ai-editor-textarea" onChange={(event) => updateSelectedLayer({ text: event.target.value })} rows={3} value={selectedLayer.text} />
                        </label>
                        <label className="create-field-label">
                          Typeface
                          <select className="select-input" onChange={(event) => updateSelectedLayer({ fontFamily: event.target.value })} value={selectedLayer.fontFamily}>
                            {TEXT_FONT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className="ai-editor-control-grid">
                          <label className="create-field-label">
                            Size
                            <input className="input" min={8} max={260} onChange={(event) => updateSelectedLayer({ fontSize: Number(event.target.value) })} type="number" value={selectedLayer.fontSize} />
                          </label>
                          <label className="create-field-label">
                            Color
                            <input className="ai-editor-color-input" onChange={(event) => updateSelectedLayer({ color: event.target.value })} type="color" value={selectedLayer.color} />
                          </label>
                        </div>
                      </>
                    ) : null}
                    {selectedLayer.type === "shape" ? (
                      <label className="create-field-label">
                        Fill
                        <input className="ai-editor-color-input" onChange={(event) => updateSelectedLayer({ fill: event.target.value })} type="color" value={selectedLayer.fill} />
                      </label>
                    ) : null}
                    {selectedLayer.type === "image" ? (
                      <label className="create-field-label">
                        Filter
                        <select className="select-input" onChange={(event) => updateSelectedLayer({ filter: event.target.value as CanvasImageLayer["filter"] })} value={selectedLayer.filter}>
                          <option value="none">None</option>
                          <option value="grayscale">Grayscale</option>
                          <option value="sepia">Sepia</option>
                        </select>
                      </label>
                    ) : null}
                    <div className="ai-editor-control-grid">
                      <label className="create-field-label">
                        Rotate
                        <input className="input" min={-180} max={180} onChange={(event) => updateSelectedLayer({ rotation: Number(event.target.value) })} type="number" value={selectedLayer.rotation} />
                      </label>
                      <label className="create-field-label">
                        Opacity: {Math.round(selectedLayer.opacity * 100)}%
                        <input className="ai-edit-range" min={0.1} max={1} step={0.05} onChange={(event) => updateSelectedLayer({ opacity: Number(event.target.value) })} type="range" value={selectedLayer.opacity} />
                      </label>
                    </div>
                    <div className="ai-editor-layer-actions">
                      <button
                        aria-label="Duplicate layer"
                        className="ai-editor-layer-action-btn"
                        onClick={duplicateSelectedLayer}
                        title="Duplicate"
                        type="button"
                      >
                        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect height="14" width="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16V4a2 2 0 0 1 2-2h12" />
                        </svg>
                      </button>
                      <button
                        aria-label="Move layer up"
                        className="ai-editor-layer-action-btn"
                        onClick={() => moveSelectedLayer("forward")}
                        title="Layer up"
                        type="button"
                      >
                        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m18 15-6-6-6 6" />
                        </svg>
                      </button>
                      <button
                        aria-label="Move layer down"
                        className="ai-editor-layer-action-btn"
                        onClick={() => moveSelectedLayer("backward")}
                        title="Layer down"
                        type="button"
                      >
                        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      <button
                        aria-label="Center horizontally"
                        className="ai-editor-layer-action-btn"
                        onClick={() => centerSelectedLayer("horizontal")}
                        title="Center H"
                        type="button"
                      >
                        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v18" />
                          <path d="M8 8H3" />
                          <path d="M8 16H3" />
                          <path d="M16 8h5" />
                          <path d="M16 16h5" />
                        </svg>
                      </button>
                      <button
                        aria-label="Delete layer"
                        className="ai-editor-layer-action-btn is-danger"
                        onClick={handleDeleteSelectedLayer}
                        title="Delete"
                        type="button"
                      >
                        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeEditorPane === "draw" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Freehand</p>
                  <h2>Draw</h2>
                </div>
                <p className="ai-editor-pane-copy">Freely draw on your canvas using brush tools.</p>
                <div className="ai-editor-draw-tool-list">
                  <button className={`ai-editor-draw-tool ${drawMode === "pen" ? "is-active" : ""}`} disabled={!currentImage} onClick={() => setDrawMode("pen")} type="button">Pen</button>
                  <button className={`ai-editor-draw-tool ${drawMode === "highlighter" ? "is-active" : ""}`} disabled={!currentImage} onClick={() => setDrawMode("highlighter")} type="button">Highlighter</button>
                  <button className={`ai-editor-draw-tool ${drawMode === "select" ? "is-active" : ""}`} onClick={() => setDrawMode("select")} type="button">Select (Stop)</button>
                </div>
                <label className="create-field-label">
                  Color
                  <div className="ai-editor-swatch-row">
                    {DRAW_COLORS.map((color) => (
                      <button aria-label={`Use ${color}`} className={`ai-editor-swatch ${drawColor === color ? "is-active" : ""}`} key={color} onClick={() => setDrawColor(color)} style={{ backgroundColor: color }} type="button" />
                    ))}
                  </div>
                </label>
                <label className="create-field-label">
                  Size ({drawSize}px)
                  <input className="ai-edit-range" max={50} min={1} onChange={(event) => setDrawSize(Number(event.target.value))} type="range" value={drawSize} />
                </label>
              </div>
            ) : null}

            {activeEditorPane === "ai-edit" ? (
              <div className="ai-editor-pane">
                <div className="ai-editor-pane-header">
                  <p className="panel-label">Generative edit</p>
                  <h2>AI Edit</h2>
                </div>
                <div className="create-mode-switch" role="tablist" aria-label="Prompt mode">
                  <button className={`create-mode-option ${promptMode === "normal" ? "is-active" : ""}`} onClick={() => setPromptMode("normal")} role="tab" type="button">
                    Normal prompt
                  </button>
                  <button className={`create-mode-option ${promptMode === "list" ? "is-active" : ""}`} onClick={() => setPromptMode("list")} role="tab" type="button">
                    List mode
                  </button>
                </div>
                {promptMode === "normal" ? (
                  <label className="create-field-label create-field-label-prominent">
                    Edit prompt
                    <textarea
                      className="create-prompt-textarea"
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Example: remove the worker, replace the signboard with blank stone, or change the sofa color to beige"
                      rows={5}
                      value={prompt}
                    />
                  </label>
                ) : (
                  <>
                    <p className="ai-editor-pane-copy">Add each requested change as a separate item. We’ll combine them into one AI prompt.</p>
                    {listPromptItems.map((item, index) => (
                      <div className="create-picker-summary-actions" key={`change-item-${index + 1}`}>
                        <input
                          className="input"
                          onChange={(event) => handleListPromptItemChange(index, event.target.value)}
                          placeholder={`Change ${index + 1}`}
                          value={item}
                        />
                        <button
                          className="create-inline-action"
                          disabled={listPromptItems.length <= 1}
                          onClick={() => handleRemoveListPromptItem(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="create-picker-summary-actions">
                      <button className="create-inline-action" onClick={handleAddListPromptItem} type="button">
                        Add change
                      </button>
                      <button
                        className="create-inline-action"
                        disabled={normalizedListPromptItems.length === 0 || isComposingPrompt}
                        onClick={() => void handleComposePromptFromList()}
                        type="button"
                      >
                        {isComposingPrompt ? "Composing..." : "Compose prompt"}
                      </button>
                    </div>
                    {hasFreshComposedPrompt ? (
                      <div className="create-picker-summary">
                        <div>
                          <p className="create-picker-summary-label">Composed prompt</p>
                          <p className="ai-edit-plan-copy">{composedPrompt}</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                {isMaskFlow ? (
                  <>
                    <div className="create-mode-switch" role="tablist" aria-label="Tool mode">
                      <button className={`create-mode-option ${toolMode === "select" ? "is-active" : ""}`} onClick={() => setToolMode("select")} role="tab" type="button">Select</button>
                      <button className={`create-mode-option ${toolMode === "target" ? "is-active" : ""}`} disabled={!editPlan || analysisIsStale} onClick={() => setToolMode("target")} role="tab" type="button">Target</button>
                      <button className={`create-mode-option ${toolMode === "brush" ? "is-active" : ""}`} disabled={!hasMaskPreview} onClick={() => setToolMode("brush")} role="tab" type="button">Brush</button>
                      <button className={`create-mode-option ${toolMode === "eraser" ? "is-active" : ""}`} disabled={!hasMaskPreview} onClick={() => setToolMode("eraser")} role="tab" type="button">Eraser</button>
                    </div>
                    <button className="button button-ghost ai-editor-full-button" disabled={!canAnalyze} onClick={() => void handleAnalyzeEdit()} type="button">
                      {isPlanning ? "Analyzing..." : editPlan ? "Re-analyze edit" : "Analyze edit"}
                    </button>
                    <div className="create-picker-summary-actions">
                      <button className="create-inline-action" disabled={!canGenerateMask} onClick={() => currentImage && editPlan ? void runAutoSegmentation(editPlan.targetObject, currentImage, targetPoint) : undefined} type="button">
                        {hasMaskPreview ? "Re-run target mask" : "Generate target mask"}
                      </button>
                      <button className="create-inline-action" onClick={handleClearMask} type="button">Clear mask</button>
                    </div>
                    <label className="create-field-label">
                      Brush size: {brushSize}px
                      <input className="ai-edit-range" max={120} min={2} onChange={(event) => setBrushSize(Number(event.target.value))} type="range" value={brushSize} />
                    </label>
                    {editPlan ? (
                      <div className="ai-edit-plan-card is-detailed">
                        <div>
                          <p className="create-picker-summary-label">Planner target</p>
                          <strong>{editPlan.targetObject}</strong>
                        </div>
                        <div>
                          <p className="create-picker-summary-label">Edit intent</p>
                          <strong>{editPlan.editIntent}</strong>
                        </div>
                        <div>
                          <p className="create-picker-summary-label">Masked edit prompt</p>
                          <p className="ai-edit-plan-copy">{editPlan.rewrittenPrompt}</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <button className="button button-primary ai-edit-apply-button" disabled={!canRunPrimaryAction} onClick={() => void handlePrimaryAction()} type="button">
                  {primaryActionLabel}
                </button>
              </div>
            ) : null}

            {status ? <div className="ai-edit-status-card">{status}</div> : null}
            {error ? <div className="ai-edit-status-card is-error">{error}</div> : null}
          </div>
        </div>
      </aside>

      <main className="create-v2-main ai-edit-main">
        <section className="ai-edit-stage-panel">
          <div className="ai-edit-stage-header">
            <div>
              <p className="panel-label">Canvas</p>
              <h3>{currentImage ? currentImage.file.name : "Waiting for image"}</h3>
            </div>
            {currentImage ? (
              <span className="pill pill-sm">
                {isMaskFlow
                  ? toolMode === "target"
                    ? "Click target"
                    : hasMaskPreview
                      ? "Mask ready"
                      : editPlan
                        ? "Plan ready"
                        : "Awaiting analysis"
                  : "Direct edit"}
              </span>
            ) : null}
          </div>

          <div className="ai-edit-stage-shell">
            {currentImage && currentImageUrl ? (
              <div
                className="ai-edit-stage-frame"
                onPointerCancel={handleLayerPointerUp}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleLayerPointerMove}
                onPointerUp={handleLayerPointerUp}
                ref={stageFrameRef}
                style={{
                  aspectRatio: `${currentImage.width} / ${currentImage.height}`,
                  width: stageWidth ? `${stageWidth}px` : undefined
                }}
              >
                <img alt="Source" className="ai-edit-stage-image" draggable={false} src={currentImageUrl} />
                <div className="ai-editor-layer-surface" aria-label="Editable layers">
                  {canvasLayers.map((layer) => {
                    const selected = layer.id === selectedLayerId;
                    if (layer.type === "text") {
                      return (
                        <div
                          className={`ai-editor-layer ai-editor-text-layer ${selected ? "is-selected" : ""}`}
                          key={layer.id}
                          onPointerDown={(event) => handleLayerPointerDown(event, layer)}
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
                            textShadow: layer.shadow ? "0 8px 24px rgba(0, 0, 0, 0.28)" : "none"
                          }}
                        >
                          {layer.text || "Text"}
                          {selected ? <span className="ai-editor-resize-handle" onPointerDown={(event) => handleLayerPointerDown(event, layer, "resize")} /> : null}
                        </div>
                      );
                    }

                    if (layer.type === "shape") {
                      return (
                        <div
                          className={`ai-editor-layer ai-editor-shape-layer is-${layer.shape} ${selected ? "is-selected" : ""}`}
                          key={layer.id}
                          onPointerDown={(event) => handleLayerPointerDown(event, layer)}
                          style={{
                            left: `${layer.x * 100}%`,
                            top: `${layer.y * 100}%`,
                            width: `${layer.width * 100}%`,
                            height: `${layer.height * 100}%`,
                            opacity: layer.opacity,
                            transform: `rotate(${layer.rotation}deg)`,
                            color: layer.fill,
                            backgroundColor: layer.shape === "rect" || layer.shape === "circle" || layer.shape === "badge" ? layer.fill : "transparent"
                          }}
                        >
                          {layer.shape === "triangle" ? <span className="ai-editor-triangle-shape" /> : null}
                          {layer.shape === "star" ? <span className="ai-editor-star-shape">★</span> : null}
                          {layer.shape === "badge" ? <span className="ai-editor-badge-label">NEW</span> : null}
                          {selected ? <span className="ai-editor-resize-handle" onPointerDown={(event) => handleLayerPointerDown(event, layer, "resize")} /> : null}
                        </div>
                      );
                    }

                    if (layer.type === "draw") {
                      const points = layer.points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
                      return (
                        <svg className="ai-editor-layer ai-editor-draw-layer" key={layer.id} preserveAspectRatio="none" style={{ inset: 0, opacity: layer.opacity }} viewBox="0 0 100 100">
                          <polyline fill="none" points={points} stroke={layer.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={Math.max(0.12, (layer.size * stageScale * 100) / Math.max(1, stageWidth ?? 1))} />
                        </svg>
                      );
                    }

                    return (
                      <div
                        className={`ai-editor-layer ai-editor-image-layer ${selected ? "is-selected" : ""}`}
                        key={layer.id}
                        onPointerDown={(event) => handleLayerPointerDown(event, layer)}
                        style={{
                          left: `${layer.x * 100}%`,
                          top: `${layer.y * 100}%`,
                          width: `${layer.width * 100}%`,
                          height: `${layer.height * 100}%`,
                          opacity: layer.opacity,
                          transform: `rotate(${layer.rotation}deg)`,
                          filter: layer.filter === "grayscale" ? "grayscale(1)" : layer.filter === "sepia" ? "sepia(0.85)" : "none"
                        }}
                      >
                        <img alt={layer.name} draggable={false} src={layer.src} />
                        {selected ? <span className="ai-editor-resize-handle" onPointerDown={(event) => handleLayerPointerDown(event, layer, "resize")} /> : null}
                      </div>
                    );
                  })}
                </div>
                {isMaskFlow ? (
                  <canvas
                    className={toolMode === "eraser" ? "ai-edit-mask-canvas is-erasing" : "ai-edit-mask-canvas"}
                    onPointerCancel={handlePointerUp}
                    onPointerDown={handlePointerDown}
                    onPointerLeave={handlePointerUp}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    ref={maskCanvasRef}
                    style={{ pointerEvents: toolMode === "target" || toolMode === "brush" || toolMode === "eraser" ? "auto" : "none" }}
                  />
                ) : null}
                {stageBusyMessage ? (
                  <div className="ai-edit-stage-overlay" role="status" aria-live="polite">
                    <div className="ai-edit-stage-spinner" />
                    <span>{stageBusyMessage}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="create-empty-state create-empty-state-compact">
                <div className="create-empty-icon" aria-hidden="true">□</div>
                <h4>Empty canvas</h4>
                <p>Upload a source image or choose a template to start editing.</p>
                <button className="button button-primary" onClick={() => fileInputRef.current?.click()} type="button">
                  Upload image
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function useObjectUrl(file: File | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  return objectUrl;
}

async function createEditableImage(file: File): Promise<EditableImage> {
  const dimensions = await loadImageDimensions(file);
  return { file, width: dimensions.width, height: dimensions.height };
}

async function createTemplateBaseImage(templateId: (typeof TEMPLATE_PRESETS)[number]["id"]): Promise<EditableImage> {
  const backgrounds: Record<(typeof TEMPLATE_PRESETS)[number]["id"], string> = {
    minimal: "#f4f5f7",
    quote: "#fff8e7",
    sale: "#f43f46",
    dark: "#0c0d10"
  };
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create a template canvas.");
  }

  ctx.fillStyle = backgrounds[templateId];
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Unable to render the selected template."));
        return;
      }

      resolve(value);
    }, "image/png");
  });

  return createEditableImage(new File([blob], `${templateId}-template.png`, { type: "image/png" }));
}

function buildTemplateLayers(
  templateId: (typeof TEMPLATE_PRESETS)[number]["id"],
  width: number,
  _height: number
): CanvasLayer[] {
  const baseText = (patch: Partial<CanvasTextLayer>): CanvasTextLayer => ({
    id: createLayerId("text"),
    type: "text",
    text: "Template text",
    x: 0.16,
    y: 0.35,
    width: 0.68,
    rotation: 0,
    fontFamily: TEXT_FONT_OPTIONS[1]?.value ?? "'Helvetica Neue', Arial, sans-serif",
    fontSize: Math.round(width * 0.085),
    fontWeight: "700",
    color: "#151821",
    backgroundColor: "#00000000",
    align: "center",
    letterSpacing: 0,
    lineHeight: 0.95,
    shadow: false,
    opacity: 1,
    ...patch
  });

  if (templateId === "quote") {
    return [
      baseText({
        text: "\"Simplicity.\"",
        x: 0.14,
        y: 0.45,
        width: 0.72,
        fontFamily: TEXT_FONT_OPTIONS[3]?.value ?? "Georgia, serif",
        fontSize: Math.round(width * 0.05),
        fontWeight: "400",
        color: "#111111",
        lineHeight: 1.1
      })
    ];
  }

  if (templateId === "sale") {
    return [
      baseText({
        text: "SALE",
        x: 0.1,
        y: 0.41,
        width: 0.8,
        fontSize: Math.round(width * 0.13),
        fontWeight: "700",
        color: "#ffffff",
        letterSpacing: 3
      })
    ];
  }

  if (templateId === "dark") {
    return [
      baseText({
        text: "FUTURE\nTECH",
        x: 0.22,
        y: 0.36,
        width: 0.56,
        fontSize: Math.round(width * 0.084),
        fontWeight: "700",
        color: "#f7f7f8",
        letterSpacing: 4
      })
    ];
  }

  return [
    baseText({
      text: "THE NEW\nSTANDARD",
      x: 0.2,
      y: 0.38,
      width: 0.6,
      fontSize: Math.round(width * 0.07),
      fontWeight: "700",
      letterSpacing: -1
    })
  ];
}

async function loadImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Unable to read image dimensions."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImageSourceDimensions(source: string) {
  const image = await loadImage(source);
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

function clearMaskCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function canvasHasMask(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if ((pixels[index] ?? 0) > 0) return true;
  }

  return false;
}

async function applySegmentationMaskToCanvas(source: string, canvas: HTMLCanvasElement) {
  const maskFile = await sourceToFile(source, "auto-segment-mask.png", "image/png");
  const maskUrl = URL.createObjectURL(maskFile);

  try {
    const image = await loadImage(maskUrl);
    const stagingCanvas = document.createElement("canvas");
    stagingCanvas.width = canvas.width;
    stagingCanvas.height = canvas.height;
    const stagingContext = stagingCanvas.getContext("2d");
    const targetContext = canvas.getContext("2d");

    if (!stagingContext || !targetContext) {
      throw new Error("Unable to prepare the segmentation mask.");
    }

    stagingContext.clearRect(0, 0, stagingCanvas.width, stagingCanvas.height);
    stagingContext.drawImage(image, 0, 0, stagingCanvas.width, stagingCanvas.height);

    const sourceImage = stagingContext.getImageData(0, 0, stagingCanvas.width, stagingCanvas.height);
    const outputImage = targetContext.createImageData(stagingCanvas.width, stagingCanvas.height);
    let whitePixels = 0;

    for (let index = 0; index < sourceImage.data.length; index += 4) {
      const red = sourceImage.data[index] ?? 0;
      const green = sourceImage.data[index + 1] ?? 0;
      const blue = sourceImage.data[index + 2] ?? 0;
      const alpha = sourceImage.data[index + 3] ?? 0;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (alpha > 20 && luminance > 127) {
        outputImage.data[index] = VISUAL_MASK_COLOR.red;
        outputImage.data[index + 1] = VISUAL_MASK_COLOR.green;
        outputImage.data[index + 2] = VISUAL_MASK_COLOR.blue;
        outputImage.data[index + 3] = VISUAL_MASK_COLOR.alpha;
        whitePixels += 1;
      }
    }

    if (whitePixels === 0) {
      throw new Error("The segmentation mask did not contain any editable region.");
    }

    targetContext.clearRect(0, 0, canvas.width, canvas.height);
    targetContext.putImageData(outputImage, 0, 0);
  } finally {
    URL.revokeObjectURL(maskUrl);
  }
}

async function exportMaskFile(canvas: HTMLCanvasElement, fileName: string) {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportContext = exportCanvas.getContext("2d");
  const sourceContext = canvas.getContext("2d");

  if (!exportContext || !sourceContext) {
    throw new Error("Unable to prepare the mask export.");
  }

  const sourceImage = sourceContext.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
  const outputImage = exportContext.createImageData(exportCanvas.width, exportCanvas.height);

  for (let index = 0; index < sourceImage.data.length; index += 4) {
    const alpha = sourceImage.data[index + 3] ?? 0;
    const value = alpha > 20 ? 255 : 0;
    outputImage.data[index] = value;
    outputImage.data[index + 1] = value;
    outputImage.data[index + 2] = value;
    outputImage.data[index + 3] = 255;
  }

  exportContext.putImageData(outputImage, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    exportCanvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Unable to export the mask."));
        return;
      }

      resolve(value);
    }, "image/png");
  });

  return new File([blob], fileName, { type: "image/png" });
}

async function sourceToFile(source: string, fileName: string, fallbackType: string) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Unable to load the edited image (${response.status}).`);
  }

  const blob = await response.blob();
  const contentType = blob.type || fallbackType;
  return new File([blob], ensureExtension(fileName, contentType), { type: contentType });
}

async function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = source;
  });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function buildEditedFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-edit.png`;
}

function buildComposedFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-composition.png`;
}

function buildMaskFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-mask.png`;
}

function buildNormalizedSourceFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-source.png`;
}

async function normalizeImageFile(file: File, width: number, height: number, fileName: string) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to normalize the source image.");
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Unable to export the normalized source image."));
          return;
        }

        resolve(value);
      }, "image/png");
    });

    return new File([blob], fileName, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderCompositionToFile(sourceImage: EditableImage, layers: CanvasLayer[], fileName: string) {
  const sourceUrl = URL.createObjectURL(sourceImage.file);

  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to export the composition.");
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const layer of layers) {
      ctx.save();
      ctx.globalAlpha = layer.opacity;

      if (layer.type === "image") {
        const layerImage = await loadImage(layer.src);
        applyCanvasFilter(ctx, layer.filter);
        drawRotated(ctx, layer.x * canvas.width, layer.y * canvas.height, layer.width * canvas.width, layer.height * canvas.height, layer.rotation, () => {
          ctx.drawImage(layerImage, 0, 0, layer.width * canvas.width, layer.height * canvas.height);
        });
      } else if (layer.type === "shape") {
        drawShapeLayer(ctx, layer, canvas.width, canvas.height);
      } else if (layer.type === "draw") {
        drawFreehandLayer(ctx, layer, canvas.width, canvas.height);
      } else {
        drawWrappedText(ctx, layer, canvas.width, canvas.height);
      }

      ctx.restore();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Unable to export the composition."));
          return;
        }

        resolve(value);
      }, "image/png");
    });

    return new File([blob], fileName, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function drawShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasShapeLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = layer.x * canvasWidth;
  const y = layer.y * canvasHeight;
  const width = layer.width * canvasWidth;
  const height = layer.height * canvasHeight;

  ctx.fillStyle = layer.fill;
  drawRotated(ctx, x, y, width, height, layer.rotation, () => {
    if (layer.shape === "circle") {
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (layer.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (layer.shape === "star") {
      drawStarPath(ctx, width / 2, height / 2, Math.min(width, height) / 2, Math.min(width, height) / 4);
      ctx.fill();
      return;
    }

    roundedRect(ctx, 0, 0, width, height, layer.shape === "badge" ? height / 2 : Math.min(width, height) * 0.08);
    ctx.fill();

    if (layer.shape === "badge") {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.max(12, height * 0.34)}px 'Helvetica Neue', Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NEW", width / 2, height / 2, width * 0.78);
    }
  });
}

function drawFreehandLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasDrawLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  if (layer.points.length < 1) return;

  ctx.save();
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = layer.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  layer.points.forEach((point, index) => {
    const x = point.x * canvasWidth;
    const y = point.y * canvasHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawRotated(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  draw: () => void
) {
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  draw();
  ctx.restore();
}

function applyCanvasFilter(ctx: CanvasRenderingContext2D, filter: CanvasImageLayer["filter"]) {
  ctx.filter = filter === "grayscale" ? "grayscale(1)" : filter === "sepia" ? "sepia(0.85)" : "none";
}

function drawStarPath(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number
) {
  ctx.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  layer: CanvasTextLayer,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = layer.x * canvasWidth;
  const y = layer.y * canvasHeight;
  const maxWidth = layer.width * canvasWidth;
  const fontSize = layer.fontSize;
  const lineHeight = fontSize * layer.lineHeight;
  const paragraphs = layer.text.split(/\n/g);
  const lines: string[] = [];

  ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "top";
  ctx.shadowColor = layer.shadow ? "rgba(0, 0, 0, 0.3)" : "transparent";
  ctx.shadowBlur = layer.shadow ? Math.max(6, fontSize * 0.12) : 0;
  ctx.shadowOffsetY = layer.shadow ? Math.max(2, fontSize * 0.06) : 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().length > 0 ? paragraph.split(/\s+/g) : [""];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (measureTextWithLetterSpacing(ctx, testLine, layer.letterSpacing) <= maxWidth || !currentLine) {
        currentLine = testLine;
        continue;
      }

      lines.push(currentLine);
      currentLine = word;
    }

    lines.push(currentLine);
  }

  const alignedX = layer.align === "center" ? maxWidth / 2 : layer.align === "right" ? maxWidth : 0;
  const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

  drawRotated(ctx, x, y, maxWidth, blockHeight, layer.rotation, () => {
    if (!isTransparentColor(layer.backgroundColor)) {
      ctx.save();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = layer.backgroundColor;
      roundedRect(ctx, -fontSize * 0.22, -fontSize * 0.18, maxWidth + fontSize * 0.44, blockHeight + fontSize * 0.28, fontSize * 0.16);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
    ctx.fillStyle = layer.color;
    ctx.textAlign = layer.align;
    ctx.textBaseline = "top";
    ctx.shadowColor = layer.shadow ? "rgba(0, 0, 0, 0.3)" : "transparent";
    ctx.shadowBlur = layer.shadow ? Math.max(6, fontSize * 0.12) : 0;
    ctx.shadowOffsetY = layer.shadow ? Math.max(2, fontSize * 0.06) : 0;

    lines.forEach((line, index) => {
      const nextY = index * lineHeight;
      if (y + nextY <= canvasHeight) {
        fillTextWithLetterSpacing(ctx, line, alignedX, nextY, layer.letterSpacing);
      }
    });
  });
}

function measureTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  if (text.length <= 1) return ctx.measureText(text).width;
  return ctx.measureText(text).width + (text.length - 1) * letterSpacing;
}

function fillTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
) {
  if (letterSpacing === 0 || text.length <= 1) {
    ctx.fillText(text, x, y);
    return;
  }

  const totalWidth = measureTextWithLetterSpacing(ctx, text, letterSpacing);
  let cursorX = ctx.textAlign === "center" ? x - totalWidth / 2 : ctx.textAlign === "right" ? x - totalWidth : x;

  for (const char of text) {
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + letterSpacing;
  }
}

function createLayerId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCanvasLayers(layers: CanvasLayer[]) {
  return layers.map((layer) => ({ ...layer, ...(layer.type === "draw" ? { points: layer.points.map((point) => ({ ...point })) } : {}) }));
}

function areCanvasLayersEqual(left: CanvasLayer[], right: CanvasLayer[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getLayerLabel(layer: CanvasLayer) {
  if (layer.type === "text") return layer.text || "Untitled text";
  if (layer.type === "image") return layer.name;
  if (layer.type === "draw") return layer.label;
  return layer.label;
}

function normalizeHexColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function isTransparentColor(value: string) {
  return value === "transparent" || value === "#00000000" || value.trim().length === 0;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image layer."));
    };
    reader.onerror = () => reject(new Error("Unable to read image layer."));
    reader.readAsDataURL(file);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

function ensureExtension(fileName: string, contentType: string) {
  if (/\.[a-z0-9]+$/i.test(fileName)) return fileName;
  if (contentType === "image/webp") return `${fileName}.webp`;
  if (contentType === "image/jpeg") return `${fileName}.jpg`;
  return `${fileName}.png`;
}

function normalizeObjectLabel(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .replace(/\s+/g, " ")
    .replace(/^[Tt]he\s+/, "")
    .replace(/^[Aa]n?\s+/, "")
    .replace(/[.,!?]+$/g, "")
    .trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

function getCanvasScaleFactors(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 1, y: 1 };
  }

  return {
    x: canvas.width / rect.width,
    y: canvas.height / rect.height
  };
}

function getActualBrushRadii(canvas: HTMLCanvasElement, brushSize: number) {
  const scale = getCanvasScaleFactors(canvas);

  return {
    x: Math.max(1, (brushSize * scale.x) / 2),
    y: Math.max(1, (brushSize * scale.y) / 2)
  };
}

function stampBrush(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  brushSize: number,
  toolMode: ToolMode
) {
  stampBrushAt(ctx, x, y, getActualBrushRadii(canvas, brushSize), toolMode);
}

function stampBrushAt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radii: { x: number; y: number },
  toolMode: ToolMode
) {
  if (toolMode === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = VISUAL_MASK_FILL;
  }

  ctx.beginPath();
  ctx.ellipse(x, y, radii.x, radii.y, 0, 0, Math.PI * 2);
  ctx.fill();
}
