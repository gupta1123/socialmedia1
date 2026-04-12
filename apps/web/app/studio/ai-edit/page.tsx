"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { applyMaskedImageEdit, generateAutoMask } from "../../../lib/api";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarMeta } from "../topbar-actions-context";

type ToolMode = "brush" | "eraser";

type EditableImage = {
  file: File;
  width: number;
  height: number;
};

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
  const { sessionToken, activeBrand, activeBrandId } = useStudio();
  const [toolMode, setToolMode] = useState<ToolMode>("brush");
  const [brushSize, setBrushSize] = useState(16);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [segmentedObjectLabel, setSegmentedObjectLabel] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<EditableImage | null>(null);
  const [currentImage, setCurrentImage] = useState<EditableImage | null>(null);
  const [hasMaskPreview, setHasMaskPreview] = useState(false);
  const [sidebarSections, setSidebarSections] = useState({
    source: true,
    mask: true,
    prompt: true,
    tips: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const currentImageUrl = useObjectUrl(currentImage?.file ?? null);
  const stageWidth = useMemo(() => {
    if (!currentImage) return null;

    const maxWidth = 980;
    const maxHeight = 680;
    const scale = Math.min(maxWidth / currentImage.width, maxHeight / currentImage.height, 1);
    return Math.max(240, Math.round(currentImage.width * scale));
  }, [currentImage]);
  const stageBusyMessage = isSegmenting ? "Generating mask..." : isApplying ? "Applying AI edit..." : null;
  const canReset = Boolean(originalImage && currentImage && originalImage.file !== currentImage.file);
  const dimensionsLabel = currentImage ? `${currentImage.width} x ${currentImage.height}` : "No image loaded";

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
              disabled={isSharing || isApplying || isSegmenting}
              onClick={() => void handleShareCurrentImage()}
              type="button"
            >
              {isSharing ? "Sharing..." : "Share"}
            </button>
            <button className="button button-primary" onClick={() => downloadFile(currentImage.file)} type="button">
              Download current
            </button>
          </>
        ) : (
          <Link className="button button-primary" href="/studio/create?mode=ad-hoc">
            Open create
          </Link>
        )}
      </>
    ),
    [currentImage, isApplying, isSegmenting, isSharing]
  );

  const topbarMeta = useMemo(
    () => ({
      badges: activeBrand ? <span className="pill pill-sm">{activeBrand.name}</span> : null
    }),
    [activeBrand]
  );

  useRegisterTopbarActions(topbarActions);
  useRegisterTopbarMeta(topbarMeta);

  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !currentImage) return;

    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    clearMaskCanvas(canvas);
    setHasMaskPreview(false);
  }, [currentImage]);

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
      setSegmentedObjectLabel(null);
      setToolMode("brush");
      setStatus("Source image loaded. Draw a mask or use a direct prompt like \"remove the person\".");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load image.");
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!currentImage || isApplying || isSegmenting) return;

    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    drawPoint(lastPointRef.current.x, lastPointRef.current.y);
    setHasMaskPreview(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !currentImage) return;

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

  function handleClearMask() {
    if (!maskCanvasRef.current) return;

    clearMaskCanvas(maskCanvasRef.current);
    setSegmentedObjectLabel(null);
    setHasMaskPreview(false);
    setStatus("Mask cleared.");
    setError(null);
  }

  function handleResetImage() {
    if (!originalImage) return;

    setCurrentImage(originalImage);
    setSegmentedObjectLabel(null);
    setStatus("Reset to original image.");
    setError(null);
  }

  async function runAutoSegmentation(objectName: string, sourceImage: EditableImage) {
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
        image: sourceImage.file,
        imageFileName: sourceImage.file.name
      });

      const canvas = maskCanvasRef.current;
      if (!canvas) throw new Error("Mask canvas is not available.");

      await applySegmentationMaskToCanvas(result.maskDataUrl ?? result.maskUrl, canvas);
      setSegmentedObjectLabel(normalizedObjectName);
      setToolMode("brush");
      setHasMaskPreview(true);
      setStatus(`Auto mask ready from ${result.model}. Refine the selection if needed, then apply the edit.`);

      return normalizedObjectName;
    } finally {
      setIsSegmenting(false);
    }
  }

  async function handleShareCurrentImage() {
    if (!currentImage) return;

    setIsSharing(true);
    setError(null);

    try {
      const sharePayload = {
        files: [currentImage.file],
        title: currentImage.file.name,
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
            [currentImage.file.type || "image/png"]: currentImage.file
          })
        ]);
        setStatus("Current image copied to clipboard.");
        return;
      }

      downloadFile(currentImage.file);
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

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Describe what should change inside the masked area.");
      return;
    }

    let canvas = maskCanvasRef.current;
    const hasExistingMask = Boolean(canvas && canvasHasMask(canvas));
    const inferredObjectLabel = inferSegmentObjectFromPrompt(trimmedPrompt);
    let objectLabelForEdit = hasExistingMask
      ? segmentedObjectLabel ?? inferredObjectLabel ?? undefined
      : inferredObjectLabel ?? segmentedObjectLabel ?? undefined;

    if (!canvas || !canvasHasMask(canvas)) {
      if (!objectLabelForEdit) {
        setError("Draw a mask, or use a prompt like \"remove the person\" or \"change the sofa color to beige\".");
        return;
      }

      try {
        objectLabelForEdit = await runAutoSegmentation(objectLabelForEdit, currentImage);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Auto segmentation failed.");
        setStatus(null);
        return;
      }

      canvas = maskCanvasRef.current;
      if (!canvas || !canvasHasMask(canvas)) {
        setError("Auto segmentation did not create a usable mask. Refine the object name or draw the mask manually.");
        return;
      }
    }

    setIsApplying(true);
    setError(null);
    setStatus("Applying the edit. This can take a few moments.");

    try {
      const maskFile = await exportMaskFile(canvas, buildMaskFileName(currentImage.file.name));
      const result = await applyMaskedImageEdit(sessionToken, {
        brandId: activeBrandId,
        prompt: trimmedPrompt,
        width: currentImage.width,
        height: currentImage.height,
        image: currentImage.file,
        imageFileName: currentImage.file.name,
        mask: maskFile,
        maskFileName: maskFile.name,
        ...(objectLabelForEdit ? { objectLabel: objectLabelForEdit } : {})
      });

      const nextFile = await sourceToFile(
        result.imageDataUrl ?? result.imageUrl,
        buildEditedFileName(currentImage.file.name),
        "image/png"
      );
      const nextImage = await createEditableImage(nextFile);

      setCurrentImage(nextImage);
      setSegmentedObjectLabel(null);
      setStatus(`Edit applied with ${result.model}. You can keep refining this result.`);
      if (maskCanvasRef.current) clearMaskCanvas(maskCanvasRef.current);
      setHasMaskPreview(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI edit failed.");
      setStatus(null);
    } finally {
      setIsApplying(false);
    }
  }

  function toggleSection(section: keyof typeof sidebarSections) {
    setSidebarSections((state) => ({ ...state, [section]: !state[section] }));
  }

  return (
    <div className="create-v2-shell ai-edit-page">
      <input accept="image/*" hidden onChange={handleFileChange} ref={fileInputRef} type="file" />

      <aside className="create-v2-sidebar ai-edit-sidebar-panel">
        <div className="create-section">
          <button className="create-section-toggle" onClick={() => toggleSection("source")} type="button">
            <span className="create-section-label">Source image</span>
            <span className={`create-section-chevron ${sidebarSections.source ? "is-open" : ""}`}>⌄</span>
          </button>
          {sidebarSections.source ? (
            <div className="create-section-body">
              <button className="ai-edit-upload-card" onClick={() => fileInputRef.current?.click()} type="button">
                <span className="ai-edit-upload-icon" aria-hidden="true">
                  ↑
                </span>
                <span>{currentImage ? "Replace image" : "Upload source"}</span>
                <small>{currentImage ? currentImage.file.name : "PNG, JPG, or WebP"}</small>
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
        </div>

        <div className="create-section">
          <button className="create-section-toggle" onClick={() => toggleSection("mask")} type="button">
            <span className="create-section-label">Mask tools</span>
            <span className={`create-section-chevron ${sidebarSections.mask ? "is-open" : ""}`}>⌄</span>
          </button>
          {sidebarSections.mask ? (
            <div className="create-section-body">
              <div className="create-mode-switch" role="tablist" aria-label="Tool mode">
                <button
                  className={`create-mode-option ${toolMode === "brush" ? "is-active" : ""}`}
                  onClick={() => setToolMode("brush")}
                  role="tab"
                  type="button"
                >
                  Brush
                </button>
                <button
                  className={`create-mode-option ${toolMode === "eraser" ? "is-active" : ""}`}
                  onClick={() => setToolMode("eraser")}
                  role="tab"
                  type="button"
                >
                  Eraser
                </button>
              </div>

              <label className="create-field-label">
                Brush size: {brushSize}px
                <input
                  className="ai-edit-range"
                  max={120}
                  min={2}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  type="range"
                  value={brushSize}
                />
              </label>

              <div className="create-picker-summary-actions">
                <button className="create-inline-action" onClick={handleClearMask} type="button">
                  Clear mask
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="create-section">
          <button className="create-section-toggle" onClick={() => toggleSection("prompt")} type="button">
            <span className="create-section-label">Edit prompt</span>
            <span className={`create-section-chevron ${sidebarSections.prompt ? "is-open" : ""}`}>⌄</span>
          </button>
          {sidebarSections.prompt ? (
            <div className="create-section-body">
              <label className="create-field-label create-field-label-prominent">
                Creative prompt
                <textarea
                  className="create-prompt-textarea"
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Example: remove the person, replace the masked area with landscaping, or change the sofa color to beige"
                  rows={5}
                  value={prompt}
                />
              </label>
              <p className="create-hint">
                If you do not draw a mask, the app will try to auto-mask the object from direct prompts like "remove the car".
              </p>
              <button
                className="button button-primary ai-edit-apply-button"
                disabled={isApplying || isSegmenting || !currentImage}
                onClick={() => void handleApplyEdit()}
                type="button"
              >
                {isApplying || isSegmenting ? "Applying..." : "Apply AI edit"}
              </button>
            </div>
          ) : null}
        </div>

        {status ? <div className="ai-edit-status-card">{status}</div> : null}
        {error ? <div className="ai-edit-status-card is-error">{error}</div> : null}

        <div className="create-section">
          <button className="create-section-toggle" onClick={() => toggleSection("tips")} type="button">
            <span className="create-section-label">What works best</span>
            <span className={`create-section-chevron ${sidebarSections.tips ? "is-open" : ""}`}>⌄</span>
          </button>
          {sidebarSections.tips ? (
            <div className="create-section-body">
              <ul className="ai-edit-tip-list">
                <li>Use short direct prompts: "remove the worker", "replace signboard with blank wall".</li>
                <li>For manual masks, cover the full object or region that should change.</li>
                <li>Apply one meaningful change at a time, then refine the edited result.</li>
              </ul>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="create-v2-main ai-edit-main">
        <section className="ai-edit-stage-panel">
          <div className="ai-edit-stage-header">
            <div>
              <p className="panel-label">Canvas</p>
              <h3>{currentImage ? currentImage.file.name : "Waiting for image"}</h3>
            </div>
            {currentImage ? <span className="pill pill-sm">{hasMaskPreview ? "Mask ready" : "No mask yet"}</span> : null}
          </div>

          <div className="ai-edit-stage-shell">
            {currentImage && currentImageUrl ? (
              <div
                className="ai-edit-stage-frame"
                style={{
                  aspectRatio: `${currentImage.width} / ${currentImage.height}`,
                  width: stageWidth ? `${stageWidth}px` : undefined
                }}
              >
                <img alt="Source" className="ai-edit-stage-image" draggable={false} src={currentImageUrl} />
                <canvas
                  className={toolMode === "eraser" ? "ai-edit-mask-canvas is-erasing" : "ai-edit-mask-canvas"}
                  onPointerCancel={handlePointerUp}
                  onPointerDown={handlePointerDown}
                  onPointerLeave={handlePointerUp}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  ref={maskCanvasRef}
                />
                {stageBusyMessage ? (
                  <div className="ai-edit-stage-overlay" role="status" aria-live="polite">
                    <div className="ai-edit-stage-spinner" />
                    <span>{stageBusyMessage}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="create-empty-state create-empty-state-compact">
                <div className="create-empty-icon" aria-hidden="true">
                  □
                </div>
                <h4>Empty canvas</h4>
                <p>Upload a source image to mask and edit specific regions.</p>
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

function buildMaskFileName(fileName: string) {
  return `${stripFileExtension(fileName)}-mask.png`;
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

function inferSegmentObjectFromPrompt(prompt: string) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return null;

  const colorWords = "red|blue|green|pink|purple|yellow|orange|black|white|gold|silver|brown|teal|cyan|magenta|violet|grey|gray|beige";
  const patterns = [
    new RegExp("\\b(?:remove|delete|erase)\\s+(?:the|a|an)?\\s*([a-z][a-z0-9\\s-]{0,80}?)(?=$|\\s+(?:from|in|on|with|and|while|without)\\b|[,.!?])", "i"),
    new RegExp("\\b(?:replace|swap)\\s+(?:the|a|an)?\\s*([a-z][a-z0-9\\s-]{0,80}?)(?=\\s+with\\b|$|[,.!?])", "i"),
    new RegExp("\\b(?:change|make|turn|recolou?r|re-color|recolour)\\s+(?:the\\s+)?(?:colou?r|color)\\s+of\\s+(?:the|a|an)?\\s*([a-z][a-z0-9\\s-]{0,80}?)(?=\\s+(?:to|into)\\b|$|[,.!?])", "i"),
    new RegExp(`\\b(?:change|make|turn|recolou?r|re-color|recolour)\\s+(?:the|a|an)?\\s*([a-z][a-z0-9\\s-]{0,80}?)(?=\\s+(?:to|into|${colorWords})\\b|$|[,.!?])`, "i")
  ];

  for (const pattern of patterns) {
    const match = normalizedPrompt.match(pattern);
    const candidate = normalizeObjectLabel(match?.[1]);
    if (candidate) return candidate;
  }

  return null;
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
