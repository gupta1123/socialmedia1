"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useMemo, useCallback, type ChangeEvent, type PointerEvent as ReactPointerEvent, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BootstrapResponse, CreativeOutputRecord } from "@image-lab/contracts";
import {
  getCreativeOutput,
  getCreativeOutputs,
  saveEditedCreativeOutput,
} from "./lib/api";
import { useStudio } from "../studio-context";
import { useRegisterTopbarActions, useRegisterTopbarControls, useRegisterTopbarMeta } from "../topbar-actions-context";

import { EditorProvider, useEditorContext } from "./EditorContext";
import { EditorSidebar } from "./components/EditorSidebar";
import { StageCanvas } from "./components/StageCanvas";
import { TopFormattingBar } from "./components/TopFormattingBar";
import { SaveDrawer } from "./components/SaveDrawer";
import { UploadsPane, AiEditPane, AssetsPane, TextPane, LayersPane, PositionPane, EffectsPane, FontPane, ElementsPane } from "./components/panes";

import {
  EDITOR_PANES,
  createLayerId,
  isLayerVisible,
  type CanvasLayer,
  type CanvasDrawLayer,
  type EditableImage,
  type CanvasImageLayer,
  type LayerDragState,
  type ResizeHandleType,
} from "./lib/editor-types";
import { buildTextLayer, buildShapeLayer } from "./lib/editor-actions";
import { buildComposedFileName, downloadFile, renderCompositionToFile, fileToDataUrl, loadImageDimensions, loadImageSourceDimensions, createEditableImage, sourceToFile } from "./lib/editor-files";
import { getStageNormalizedPoint, shouldPushHistory } from "./lib/layer-utils";



function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function getStageBaseSize(image: { width: number; height: number }) {
  const maxWidth = 980;
  const maxHeight = 680;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(240, Math.round(image.width * scale));
  return {
    width,
    height: width * (image.height / image.width)
  };
}

function buildEditorSaveSignature(image: EditableImage | null, layers: CanvasLayer[]) {
  if (!image) {
    return null;
  }

  return JSON.stringify({
    image: {
      name: image.file.name,
      size: image.file.size,
      lastModified: image.file.lastModified,
      width: image.width,
      height: image.height,
    },
    layers,
  });
}

type EditorDocumentBuildResult = {
  editorState: Record<string, unknown>;
  layerImages: Array<{ layerId: string; file: File; fileName: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stripSignedLayerSource(layer: CanvasLayer): Record<string, unknown> {
  if (layer.type !== "image") {
    return layer as unknown as Record<string, unknown>;
  }

  const { src: _src, ...rest } = layer;
  return rest as unknown as Record<string, unknown>;
}

async function buildEditorDocument(image: EditableImage, layers: CanvasLayer[]): Promise<EditorDocumentBuildResult> {
  const layerImages: Array<{ layerId: string; file: File; fileName: string }> = [];
  const serializedLayers: Array<Record<string, unknown>> = [];

  for (const layer of layers) {
    const serialized = stripSignedLayerSource(layer);

    if (layer.type === "image" && (!layer.sourceStoragePath || layer.src.startsWith("data:"))) {
      const file = await sourceToFile(layer.src, layer.name || `${layer.id}.png`, "image/png");
      layerImages.push({
        layerId: layer.id,
        file,
        fileName: file.name,
      });
    }

    serializedLayers.push(serialized);
  }

  return {
    editorState: {
      version: 1,
      source: {
        fileName: image.file.name,
        width: image.width,
        height: image.height,
      },
      layers: serializedLayers,
    },
    layerImages,
  };
}

function restoreLayerFromEditorDocument(value: unknown): CanvasLayer | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") {
    return null;
  }

  if (value.type === "image") {
    if (typeof value.src !== "string" || !value.src) {
      return null;
    }
    return value as unknown as CanvasLayer;
  }

  if (value.type === "draw" && Array.isArray(value.points)) {
    return {
      ...value,
      points: value.points.filter((point): point is { x: number; y: number } =>
        isRecord(point) && typeof point.x === "number" && typeof point.y === "number"
      ),
    } as unknown as CanvasLayer;
  }

  if (value.type === "text" || value.type === "shape") {
    return value as unknown as CanvasLayer;
  }

  return null;
}

async function loadEditorDocumentFromOutput(output: CreativeOutputRecord): Promise<{ image: EditableImage; layers: CanvasLayer[] } | null> {
  const metadata = output.metadataJson;
  const editorState = isRecord(metadata) && isRecord(metadata.editorState) ? metadata.editorState : null;
  const source = editorState && isRecord(editorState.source) ? editorState.source : null;
  const sourceUrl = source && typeof source.url === "string" ? source.url : null;

  if (!editorState || !source || !sourceUrl) {
    return null;
  }

  const fileName = typeof source.fileName === "string" && source.fileName.trim()
    ? source.fileName
    : `output-${output.outputIndex + 1}-source.png`;
  const file = await sourceToFile(sourceUrl, fileName, "image/png");
  const image = await createEditableImage(file);
  const layers = Array.isArray(editorState.layers)
    ? editorState.layers.map(restoreLayerFromEditorDocument).filter((layer): layer is CanvasLayer => Boolean(layer))
    : [];

  return { image, layers };
}

function getCreativeOutputRootKey(output: CreativeOutputRecord) {
  return output.rootOutputId ?? output.id;
}

function pickLatestCreativeOutput(left: CreativeOutputRecord, right: CreativeOutputRecord) {
  if (left.isLatestVersion !== right.isLatestVersion) {
    return right.isLatestVersion ? right : left;
  }

  if (left.versionNumber !== right.versionNumber) {
    return right.versionNumber > left.versionNumber ? right : left;
  }

  return left;
}

function latestCreativeOutputsByRoot(outputs: CreativeOutputRecord[]) {
  const latestByRoot = new Map<string, CreativeOutputRecord>();

  for (const output of outputs) {
    const rootKey = getCreativeOutputRootKey(output);
    const existing = latestByRoot.get(rootKey);
    latestByRoot.set(rootKey, existing ? pickLatestCreativeOutput(existing, output) : output);
  }

  return Array.from(latestByRoot.values());
}

interface StudioAiEditPageContentProps {
  sessionToken: string | null;
  activeBrand: BootstrapResponse["brands"][number] | null;
  activeBrandId: string | null;
  activeAssets: BootstrapResponse["brandAssets"];
  bootstrap: BootstrapResponse | null;
}

function StudioAiEditPageContent({
  sessionToken,
  activeBrand,
  activeBrandId,
  activeAssets,
  bootstrap,
}: StudioAiEditPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const outputId = searchParams.get("outputId");

  const editor = useEditorContext();
  const {
    state,
    canUndo,
    canRedo,
    undo,
    redo,
    createSnapshot,
    pushToHistory,
    beginTransaction,
    commitTransaction,
    clearHistory,
    rebaseHistorySourceMetadata,
    addLayer,
    updateLayer,
    deleteLayer,
    setSelectedLayerId,
    reorderLayer,
    duplicateLayer,
  } = editor;

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isSaveDrawerOpen, setIsSaveDrawerOpen] = useState(false);
  const [isSavingOutput, setIsSavingOutput] = useState(false);
  const [isAiEditBusy, setIsAiEditBusy] = useState(false);
  const [isGeneratedPostsModalOpen, setIsGeneratedPostsModalOpen] = useState(false);
  const [lastSavedOutput, setLastSavedOutput] = useState<CreativeOutputRecord | null>(null);
  const [lastSavedEditorSignature, setLastSavedEditorSignature] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<CreativeOutputRecord[]>([]);
  const [isLoadingVersionHistory, setIsLoadingVersionHistory] = useState(false);
  const [loadingOutputId, setLoadingOutputId] = useState<string | null>(null);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [compareBeforeId, setCompareBeforeId] = useState<string | null>(null);
  const [compareAfterId, setCompareAfterId] = useState<string | null>(null);
  const [compareSliderValue, setCompareSliderValue] = useState(50);
  const [compareOutputCache, setCompareOutputCache] = useState<Record<string, CreativeOutputRecord>>({});
  const [loadingCompareOutputIds, setLoadingCompareOutputIds] = useState<Record<string, boolean>>({});

  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [editorRecentOutputs, setEditorRecentOutputs] = useState<CreativeOutputRecord[]>([]);
  const [isLoadingRecentOutputs, setIsLoadingRecentOutputs] = useState(true);
  const [layerDrag, setLayerDrag] = useState<LayerDragState | null>(null);
  const [drawPath, setDrawPath] = useState<CanvasDrawLayer | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerImageInputRef = useRef<HTMLInputElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const loadedOutputIdRef = useRef<string | null>(null);
  const lastStagePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const layerDragRef = useRef<LayerDragState | null>(null);
  const drawPathRef = useRef<CanvasDrawLayer | null>(null);

  const workspaceComplianceSettings = bootstrap?.workspaceComplianceSettings ?? {
    workspaceId: bootstrap?.workspace?.id ?? "",
    reraAuthorityLabel: "MahaRERA",
    reraWebsiteUrl: "https://maharera.maharashtra.gov.in",
    reraTextColor: "#111111",
    updatedAt: null,
  };

  const stageBusyMessage = editor.state.currentImage ? null : null;
  const dimensionsLabel = state.currentImage ? `${state.currentImage.width} x ${state.currentImage.height}` : "No image loaded";
  const currentEditorSignature = useMemo(
    () => buildEditorSaveSignature(state.currentImage, state.canvasLayers),
    [state.currentImage, state.canvasLayers]
  );
  const hasUnsavedChanges = Boolean(state.currentImage && currentEditorSignature !== lastSavedEditorSignature);
  const savedVersions = useMemo(() => {
    const outputs = versionHistory.length ? versionHistory : lastSavedOutput ? [lastSavedOutput] : [];
    return [...outputs].sort((left, right) => right.versionNumber - left.versionNumber);
  }, [lastSavedOutput, versionHistory]);
  const compareBeforeOutput = compareBeforeId
    ? compareOutputCache[compareBeforeId] ?? savedVersions.find((output) => output.id === compareBeforeId) ?? null
    : null;
  const compareAfterOutput = compareAfterId
    ? compareOutputCache[compareAfterId] ?? savedVersions.find((output) => output.id === compareAfterId) ?? null
    : null;
  const isCompareLoading = Boolean(
    (compareBeforeId && loadingCompareOutputIds[compareBeforeId]) ||
    (compareAfterId && loadingCompareOutputIds[compareAfterId])
  );
  const isHistoryLocked = isSavingOutput || isAiEditBusy || Boolean(loadingOutputId);

  const topbarActions = useMemo(() => (
    <>
      {state.currentImage ? (
        <>
          <Link className="button button-ghost" href="/studio/gallery">
            View Gallery
          </Link>
          <button className="button button-ghost" onClick={() => fileInputRef.current?.click()} type="button">
            Upload image
          </button>
          <button className="button button-ghost" disabled={!canUndo || isHistoryLocked} onClick={undo} type="button">
            Undo
          </button>
          <button className="button button-ghost" disabled={!canRedo || isHistoryLocked} onClick={redo} type="button">
            Redo
          </button>
          <button className="button button-ghost" disabled={isSavingOutput || !hasUnsavedChanges} onClick={() => setIsSaveDrawerOpen(true)} type="button">
            {isSavingOutput
              ? "Saving..."
              : !hasUnsavedChanges && lastSavedOutput
                ? `Saved v${lastSavedOutput.versionNumber}`
                : "Save changes"}
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
  ), [state.currentImage, state.canvasLayers, isSavingOutput, hasUnsavedChanges, lastSavedOutput, canUndo, canRedo, isHistoryLocked, undo, redo]);

  const topbarMeta = useMemo(() => ({
    title: state.currentImage ? state.currentImage.file.name : "Editor",
    ...(state.currentImage ? { backLabel: "Editor", backHref: "/studio/ai-edit" } : {}),
    badges: activeBrand ? <span className="pill pill-sm">{activeBrand.name}</span> : null,
  }), [activeBrand, state.currentImage]);

  const topbarControls = useMemo(() => (
    <>
      {state.currentImage ? (
        <EditorTopbarSaveState
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSavingOutput}
          lastSavedOutput={lastSavedOutput}
          onSaveChanges={() => setIsSaveDrawerOpen(true)}
        />
      ) : null}
      {state.currentImage ? (
        <button
          aria-label="Compare saved versions"
          className={`topbar-icon-btn ai-edit-compare-button ${isCompareOpen ? "is-active" : ""}`}
          disabled={savedVersions.length < 2}
          onClick={handleOpenCompare}
          title={savedVersions.length < 2 ? "Save another version to compare" : "Compare versions"}
          type="button"
        >
          <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M12 5v14" />
            <path d="M7 9h2" />
            <path d="M15 15h2" />
          </svg>
        </button>
      ) : null}
      <button aria-label="Undo" className="topbar-icon-btn" disabled={!canUndo || isHistoryLocked} onClick={undo} title="Undo" type="button">
        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>
      <button aria-label="Redo" className="topbar-icon-btn" disabled={!canRedo || isHistoryLocked} onClick={redo} title="Redo" type="button">
        <svg fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
        </svg>
      </button>
    </>
  ), [canUndo, canRedo, hasUnsavedChanges, isCompareOpen, isSavingOutput, isHistoryLocked, lastSavedOutput, redo, savedVersions.length, state.currentImage, undo]);

  useRegisterTopbarActions(topbarActions);
  useRegisterTopbarControls(topbarControls);
  useRegisterTopbarMeta(topbarMeta);

  // Load recent outputs
  useEffect(() => {
    if (!sessionToken || !activeBrandId) {
      setEditorRecentOutputs([]);
      setIsLoadingRecentOutputs(false);
      return;
    }

    let cancelled = false;
    setIsLoadingRecentOutputs(true);
    getCreativeOutputs(sessionToken, { brandId: activeBrandId, imageMode: "thumbnail", limit: 120 })
      .then((outputs) => {
        if (!cancelled) {
          setEditorRecentOutputs(latestCreativeOutputsByRoot(outputs));
          setIsLoadingRecentOutputs(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEditorRecentOutputs([]);
          setIsLoadingRecentOutputs(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeBrandId, sessionToken]);

  useEffect(() => {
    if (!lastSavedOutput || lastSavedOutput.brandId !== activeBrandId) {
      return;
    }

    setEditorRecentOutputs((previous) => latestCreativeOutputsByRoot([lastSavedOutput, ...previous]));
  }, [activeBrandId, lastSavedOutput]);

  useEffect(() => {
    if (!state.currentSourceOutputId) {
      setLastSavedOutput(null);
      setLastSavedEditorSignature(null);
      setVersionHistory([]);
      return;
    }

    if (!sessionToken) return;
    if (lastSavedOutput?.id === state.currentSourceOutputId) return;

    let cancelled = false;
    getCreativeOutput(sessionToken, state.currentSourceOutputId)
      .then((output) => {
        if (cancelled) return;
        setLastSavedOutput(output);
        setLastSavedEditorSignature(currentEditorSignature);
      })
      .catch(() => {
        if (!cancelled) {
          setLastSavedOutput(null);
        }
      });

    return () => { cancelled = true; };
  }, [currentEditorSignature, lastSavedOutput?.id, sessionToken, state.currentSourceOutputId]);

  useEffect(() => {
    if (!sessionToken || !lastSavedOutput) {
      setVersionHistory([]);
      setIsLoadingVersionHistory(false);
      return;
    }

    const rootOutputId = lastSavedOutput.rootOutputId ?? lastSavedOutput.id;
    let cancelled = false;
    setIsLoadingVersionHistory(true);
    getCreativeOutputs(sessionToken, {
      brandId: lastSavedOutput.brandId,
      rootOutputId,
      imageMode: "thumbnail",
      limit: 50,
    })
      .then((outputs) => {
        if (cancelled) return;
        setVersionHistory([...outputs].sort((left, right) => right.versionNumber - left.versionNumber));
      })
      .catch(() => {
        if (!cancelled) {
          setVersionHistory(lastSavedOutput ? [lastSavedOutput] : []);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingVersionHistory(false);
        }
      });

    return () => { cancelled = true; };
  }, [lastSavedOutput, sessionToken]);

  useEffect(() => {
    if (!lastSavedOutput) return;

    setCompareOutputCache((previous) => ({
      ...previous,
      [lastSavedOutput.id]: {
        ...(previous[lastSavedOutput.id] ?? {}),
        ...lastSavedOutput,
      },
    }));
  }, [lastSavedOutput]);

  const ensureCompareOutput = useCallback(async (compareOutputId: string) => {
    if (!sessionToken) return;
    if (compareOutputCache[compareOutputId]?.originalUrl || loadingCompareOutputIds[compareOutputId]) {
      return;
    }

    setLoadingCompareOutputIds((previous) => ({ ...previous, [compareOutputId]: true }));
    try {
      const output = await getCreativeOutput(sessionToken, compareOutputId);
      setCompareOutputCache((previous) => ({
        ...previous,
        [compareOutputId]: output,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this version for comparison.");
    } finally {
      setLoadingCompareOutputIds((previous) => {
        const next = { ...previous };
        delete next[compareOutputId];
        return next;
      });
    }
  }, [compareOutputCache, loadingCompareOutputIds, sessionToken]);

  useEffect(() => {
    if (!isCompareOpen) return;

    if (compareBeforeId) {
      void ensureCompareOutput(compareBeforeId);
    }
    if (compareAfterId) {
      void ensureCompareOutput(compareAfterId);
    }
  }, [compareAfterId, compareBeforeId, ensureCompareOutput, isCompareOpen]);

  // Load output from URL
  useEffect(() => {
    if (!sessionToken || !outputId) return;
    if (loadedOutputIdRef.current === outputId) return;

    let cancelled = false;
    const token = sessionToken;
    const nextOutputId = outputId;

    async function loadOutputIntoEditor() {
      setError(null);
      setLoadingOutputId(nextOutputId);
      setStatus("Loading generated image into the editor...");
      try {
        const output = await getCreativeOutput(token, nextOutputId);
        const editableDocument = await loadEditorDocumentFromOutput(output);
        let image: EditableImage;
        let layers: CanvasLayer[];

        if (editableDocument) {
          image = editableDocument.image;
          layers = editableDocument.layers;
        } else {
          const sourceUrl = output.originalUrl ?? output.previewUrl;
          if (!sourceUrl) throw new Error("This output does not have an editable preview image.");

          const file = await sourceToFile(sourceUrl, `output-${output.outputIndex + 1}.png`, "image/png");
          image = await createEditableImage(file);
          layers = [];
        }

        if (cancelled) return;

        loadedOutputIdRef.current = nextOutputId;
        editor.setOriginalImage(image);
        editor.setCurrentImage(image);
        editor.setCurrentSourceOutputId(output.id);
        editor.setCurrentSourceBrandId(output.brandId);
        editor.setCurrentSourceProjectId(output.projectId);
        editor.setCurrentSourceReviewState(output.reviewState);
        editor.setCanvasLayers(layers);
        editor.setSelectedLayerId(null);
        editor.setToolMode("select");
        editor.setActiveEditorPane(layers.length > 0 ? "layers" : "ai-edit");
        clearHistory();
        setLastSavedOutput(output);
        setLastSavedEditorSignature(buildEditorSaveSignature(image, layers));
        setStatus(editableDocument ? "Editable design restored. Layers are available." : "Generated image loaded. You can now edit it.");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load this generated image.");
          setStatus(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingOutputId((value) => value === nextOutputId ? null : value);
        }
      }
    }

    void loadOutputIntoEditor();
    return () => { cancelled = true; };
  }, [clearHistory, outputId, sessionToken]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      if (modifier && key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (event.repeat) return;
        if (canUndo && !isHistoryLocked) undo();
        return;
      }
      if (modifier && ((key === "z" && event.shiftKey) || key === "y")) {
        event.preventDefault();
        if (event.repeat) return;
        if (canRedo && !isHistoryLocked) redo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedLayerId && !isHistoryLocked) {
          event.preventDefault();
          pushToHistory();
          deleteLayer(state.selectedLayerId);
          setStatus("Layer removed.");
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, isHistoryLocked, state.selectedLayerId, undo, redo, pushToHistory, deleteLayer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    const clearPanState = () => {
      setIsSpacePressed(false);
      setIsPanning(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPanState);
    document.addEventListener("visibilitychange", clearPanState);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPanState);
      document.removeEventListener("visibilitychange", clearPanState);
    };
  }, []);

  useEffect(() => {
    if (!state.currentImage) return;
    fitStageToView(false);
  }, [state.currentImage?.file]);

  // Zoom via wheel — zoom toward cursor position
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const shell = stageShellRef.current;
      if (!shell || !shell.contains(event.target as Node)) return;

      rememberStagePointer(event.clientX, event.clientY);
      const delta = event.deltaY > 0 ? -0.05 : 0.05;
      setStageZoomAroundPoint(Number((state.stageZoom + delta).toFixed(2)), {
        clientX: event.clientX,
        clientY: event.clientY
      });
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [state.stageZoom]);

  useEffect(() => {
    if (!status && !error) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (error) {
        setError(null);
        return;
      }

      setStatus(null);
    }, error ? 6000 : 2600);

    return () => window.clearTimeout(timeout);
  }, [status, error]);

  useEffect(() => {
    if (!hasUnsavedChanges || isSavingOutput) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, isSavingOutput]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !file.type.startsWith("image/")) {
      setError("Upload a valid image file.");
      return;
    }
    try {
      const image = await createEditableImage(file);
      pushToHistory();
      editor.setOriginalImage(image);
      editor.setCurrentImage(image);
      editor.setCurrentSourceOutputId(null);
      editor.setCurrentSourceBrandId(activeBrandId ?? null);
      editor.setCurrentSourceProjectId(null);
      editor.setCurrentSourceReviewState(null);
      editor.setCanvasLayers([]);
      editor.setSelectedLayerId(null);
      setLastSavedOutput(null);
      setLastSavedEditorSignature(null);
      setVersionHistory([]);
      setStatus("Source image loaded. Describe the edit and apply it directly.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load image.");
    }
  }

  async function handleLayerImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || !state.currentImage) {
      setError("Upload a valid image element.");
      return;
    }
    try {
      const [src, dimensions] = await Promise.all([fileToDataUrl(file), loadImageDimensions(file)]);
      const width = 0.22;
      const height = Math.min(0.35, width * (dimensions.height / dimensions.width) * (state.currentImage.width / state.currentImage.height));
      const layer: CanvasImageLayer = {
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
        opacity: 1,
      };
      pushToHistory();
      addLayer(layer);
      setStatus("Image layer added.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add image layer.");
    }
  }

  function handleAddTextLayer(preset: "heading" | "subheading" | "body" = "heading") {
    if (!state.currentImage) {
      setError("Upload a source image before adding text.");
      return;
    }
    const layer = buildTextLayer(state.currentImage, preset);
    pushToHistory();
    addLayer(layer);
    editor.setToolMode("select");
    setStatus("Text layer added.");
    setError(null);
  }

  function handleAddShapeLayer(shape: "rect" | "circle" | "triangle" | "star" | "badge") {
    if (!state.currentImage) {
      setError("Upload a source image before adding elements.");
      return;
    }
    const layer = buildShapeLayer(shape, state.currentImage);
    pushToHistory();
    addLayer(layer);
    editor.setToolMode("select");
    setStatus(`${layer.label} added.`);
    setError(null);
  }

  function handleEditorPaneChange(pane: typeof EDITOR_PANES[number]["id"]) {
    editor.setActiveEditorPane(pane);
    if (pane === "draw") {
      editor.setToolMode("draw");
      editor.setSelectedLayerId(null);
    } else if (pane === "ai-edit") {
      editor.setToolMode("select");
    }
  }

  function centerStageOnNextFrame() {
    requestAnimationFrame(() => {
      const shell = stageShellRef.current;
      if (!shell) return;

      shell.scrollLeft = Math.max(0, (shell.scrollWidth - shell.clientWidth) / 2);
      shell.scrollTop = Math.max(0, (shell.scrollHeight - shell.clientHeight) / 2);
    });
  }

  function setStageZoomAroundPoint(nextZoom: number, focusPoint?: { clientX: number; clientY: number }) {
    const shell = stageShellRef.current;
    const frame = stageFrameRef.current;
    const clampedZoom = clampNumber(Number(nextZoom.toFixed(2)), 0.1, 5);

    if (!shell || !frame || clampedZoom === state.stageZoom) {
      editor.setStageZoom(clampedZoom);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const focusClientX = focusPoint?.clientX ?? shellRect.left + shell.clientWidth / 2;
    const focusClientY = focusPoint?.clientY ?? shellRect.top + shell.clientHeight / 2;
    const focusRatioX = clampNumber((focusClientX - frameRect.left) / frameRect.width, 0, 1);
    const focusRatioY = clampNumber((focusClientY - frameRect.top) / frameRect.height, 0, 1);

    editor.setStageZoom(clampedZoom);

    requestAnimationFrame(() => {
      const nextFrame = stageFrameRef.current;
      const nextShell = stageShellRef.current;
      if (!nextFrame || !nextShell) return;

      const nextFrameRect = nextFrame.getBoundingClientRect();
      const nextFocusClientX = nextFrameRect.left + nextFrameRect.width * focusRatioX;
      const nextFocusClientY = nextFrameRect.top + nextFrameRect.height * focusRatioY;
      nextShell.scrollLeft += nextFocusClientX - focusClientX;
      nextShell.scrollTop += nextFocusClientY - focusClientY;
    });
  }

  function fitStageToView(announce = true) {
    if (!state.currentImage || !stageShellRef.current) return;

    const shell = stageShellRef.current;
    const baseSize = getStageBaseSize(state.currentImage);
    const availableWidth = Math.max(120, shell.clientWidth - 160);
    const availableHeight = Math.max(120, shell.clientHeight - 240);
    const fitZoom = clampNumber(Math.min(availableWidth / baseSize.width, availableHeight / baseSize.height), 0.1, 5);

    editor.setStageZoom(Number(fitZoom.toFixed(2)));
    centerStageOnNextFrame();
    if (announce) {
      setStatus("Fitted to screen.");
    }
  }

  function resetStageZoom() {
    setStageZoomAroundPoint(1, getLastStageFocusPoint());
  }

  function rememberStagePointer(clientX: number, clientY: number) {
    const shell = stageShellRef.current;
    if (!shell) return;

    const rect = shell.getBoundingClientRect();
    const isInside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    lastStagePointerRef.current = isInside ? { clientX, clientY } : null;
  }

  function getLastStageFocusPoint() {
    const point = lastStagePointerRef.current;
    if (!point) return undefined;

    const shell = stageShellRef.current;
    if (!shell) return undefined;

    const rect = shell.getBoundingClientRect();
    return point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom
      ? point
      : undefined;
  }

  function shouldStartPan(event: ReactPointerEvent<HTMLElement>) {
    return event.button === 1 || (event.button === 0 && isSpacePressed);
  }

  function beginPan(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsPanning(true);
    setPanStart({
      x: event.clientX,
      y: event.clientY,
      scrollLeft: stageShellRef.current?.scrollLeft || 0,
      scrollTop: stageShellRef.current?.scrollTop || 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updatePan(event: ReactPointerEvent<HTMLElement>) {
    if (!isPanning || !stageShellRef.current) return;

    const dx = event.clientX - panStart.x;
    const dy = event.clientY - panStart.y;
    stageShellRef.current.scrollLeft = panStart.scrollLeft - dx;
    stageShellRef.current.scrollTop = panStart.scrollTop - dy;
  }

  function endPan(event: ReactPointerEvent<HTMLElement>) {
    if (!isPanning) return;

    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleShellPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    rememberStagePointer(event.clientX, event.clientY);
    if (shouldStartPan(event)) {
      beginPan(event);
    }
  }

  function handleShellPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    rememberStagePointer(event.clientX, event.clientY);
    updatePan(event);
  }

  function handleShellPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    endPan(event);
  }

  function handleShellPointerMoveCapture(event: ReactPointerEvent<HTMLDivElement>) {
    rememberStagePointer(event.clientX, event.clientY);
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (shouldStartPan(event)) {
      beginPan(event);
      return;
    }

    if (state.toolMode === "draw" && state.drawMode !== "select" && state.currentImage) {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = getStageNormalizedPoint(event, rect);
      const layer: CanvasDrawLayer = {
        id: createLayerId("draw"),
        type: "draw",
        label: state.drawMode === "highlighter" ? "Highlighter stroke" : "Pen stroke",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        points: [point],
        color: state.drawColor,
        size: state.drawMode === "highlighter" ? editor.state.drawSize * 3 : editor.state.drawSize,
        opacity: state.drawMode === "highlighter" ? 0.42 : 1,
      };
      beginTransaction();
      drawPathRef.current = layer;
      setDrawPath(layer);
      addLayer(layer);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (state.toolMode === "select") {
      setSelectedLayerId(null);
    }
  }

  function handleLayerPointerDown(event: ReactPointerEvent<HTMLElement>, layerId: string, mode: "move" | "resize" = "move", handleType?: ResizeHandleType) {
    if (!state.currentImage) return;
    if (shouldStartPan(event)) {
      beginPan(event);
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedLayerId(layerId);
    editor.setToolMode("select");

    const layer = state.canvasLayers.find((l) => l.id === layerId);
    if (!layer) return;

    const rect = stageFrameRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const nextDrag: LayerDragState = {
      id: layerId,
      mode,
      ...(handleType ? { handleType } : {}),
      pushedHistory: false,
      snapshot: {
        ...createSnapshot(),
        selectedLayerId: layerId,
        toolMode: "select",
      },
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layer.x,
      startY: layer.y,
      startWidth: layer.width,
      startHeight: "height" in layer ? layer.height : 0.08,
    };
    layerDragRef.current = nextDrag;
    setLayerDrag(nextDrag);
  }

  function handleLayerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (isPanning) {
      updatePan(event);
      return;
    }

    const activeDrawPath = drawPathRef.current;
    if (activeDrawPath && state.toolMode === "draw") {
      const rect = stageFrameRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
      const point = getStageNormalizedPoint(event, rect);
      const lastPoint = activeDrawPath.points[activeDrawPath.points.length - 1];
      if (!lastPoint || Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 0.002) {
        const nextLayer = { ...activeDrawPath, points: [...activeDrawPath.points, point] };
        drawPathRef.current = nextLayer;
        setDrawPath(nextLayer);
        updateLayer(activeDrawPath.id, { points: nextLayer.points });
      }
      return;
    }

    const drag = layerDragRef.current;
    if (!drag) return;

    const rect = stageFrameRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const deltaX = (event.clientX - drag.startClientX) / rect.width;
    const deltaY = (event.clientY - drag.startClientY) / rect.height;

    if (shouldPushHistory(deltaX, deltaY) && !drag.pushedHistory) {
      beginTransaction(drag.snapshot);
      const activeDrag = { ...drag, pushedHistory: true };
      layerDragRef.current = activeDrag;
      setLayerDrag(activeDrag);
      applyLayerDrag(activeDrag, deltaX, deltaY);
      return;
    }

    if (!drag.pushedHistory) return;

    applyLayerDrag(drag, deltaX, deltaY);
  }

  function handleLayerPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (isPanning) {
      endPan(event);
      return;
    }

    if (drawPathRef.current) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      drawPathRef.current = null;
      setDrawPath(null);
      commitTransaction();
      setStatus("Drawing added.");
      return;
    }

    const activeDrag = layerDragRef.current;
    if (activeDrag) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (activeDrag.pushedHistory) {
        commitTransaction();
      }
      layerDragRef.current = null;
      setLayerDrag(null);
    }
  }

  function applyLayerDrag(drag: LayerDragState, deltaX: number, deltaY: number) {
    if (drag.mode === "resize") {
      const type = drag.handleType || "se";
      const updates: any = {};

      if (type.includes("e")) {
        updates.width = clampNumber(drag.startWidth + deltaX, 0.02, 1 - drag.startX);
      }
      if (type.includes("w")) {
        updates.x = clampNumber(drag.startX + deltaX, 0, drag.startX + drag.startWidth - 0.02);
        updates.width = clampNumber(drag.startWidth - deltaX, 0.02, drag.startX + drag.startWidth);
      }
      if (type.includes("s")) {
        updates.height = clampNumber(drag.startHeight + deltaY, 0.02, 1 - drag.startY);
      }
      if (type.includes("n")) {
        updates.y = clampNumber(drag.startY + deltaY, 0, drag.startY + drag.startHeight - 0.02);
        updates.height = clampNumber(drag.startHeight - deltaY, 0.02, drag.startY + drag.startHeight);
      }

      updateLayer(drag.id, updates);
      return;
    }

    updateLayer(drag.id, {
      x: clampNumber(drag.startX + deltaX, 0, 0.98),
      y: clampNumber(drag.startY + deltaY, 0, 0.98),
    });
  }

  function handleFitToScreen() {
    fitStageToView(true);
  }

  async function handleDownloadComposition() {
    if (!state.currentImage) return;
    try {
      const visibleLayerCount = state.canvasLayers.filter(isLayerVisible).length;
      const file = await renderCompositionToFile(state.currentImage, state.canvasLayers, buildComposedFileName(state.currentImage.file.name));
      downloadFile(file);
      setStatus(visibleLayerCount > 0 ? "Composed image downloaded." : "Current image downloaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to export the composition.");
    }
  }

  async function handleSaveOutput(saveMode: "new" | "version" | "replace") {
    if (!sessionToken) {
      setError("Your session is missing. Refresh the page and try again.");
      return;
    }
    if (!activeBrandId) {
      setError("Select an active brand before saving.");
      return;
    }
    if (!state.currentImage) {
      setError("Upload a source image first.");
      return;
    }

    setIsSavingOutput(true);
    setError(null);
    const savedSignature = currentEditorSignature;

    try {
      const [file, editorDocument] = await Promise.all([
        renderCompositionToFile(state.currentImage, state.canvasLayers, buildComposedFileName(state.currentImage.file.name)),
        buildEditorDocument(state.currentImage, state.canvasLayers),
      ]);
      const saveBrandId = state.currentSourceBrandId ?? activeBrandId;
      const response = await saveEditedCreativeOutput(sessionToken, {
        brandId: saveBrandId,
        saveMode,
        sourceOutputId: state.currentSourceOutputId,
        image: file,
        imageFileName: file.name,
        sourceImage: state.currentImage.file,
        sourceImageFileName: state.currentImage.file.name,
        layerImages: editorDocument.layerImages,
        editorState: editorDocument.editorState,
      });

      const sourceMetadata = {
        currentSourceOutputId: response.output.id,
        currentSourceBrandId: response.output.brandId,
        currentSourceProjectId: response.output.projectId,
        currentSourceReviewState: response.output.reviewState,
      };

      editor.setCurrentSourceOutputId(sourceMetadata.currentSourceOutputId);
      editor.setCurrentSourceBrandId(sourceMetadata.currentSourceBrandId);
      editor.setCurrentSourceProjectId(sourceMetadata.currentSourceProjectId);
      editor.setCurrentSourceReviewState(sourceMetadata.currentSourceReviewState);
      rebaseHistorySourceMetadata(sourceMetadata);
      loadedOutputIdRef.current = response.output.id;
      setLastSavedOutput(response.output);
      setLastSavedEditorSignature(savedSignature);
      setIsSaveDrawerOpen(false);
      setStatus(
        response.resolvedMode === "replace"
          ? "Current draft replaced and saved."
          : response.resolvedMode === "version"
            ? `New version saved to Gallery (v${response.output.versionNumber}).`
            : "Output saved to Gallery."
      );
      router.replace(`/studio/ai-edit?outputId=${response.output.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the current output.");
    } finally {
      setIsSavingOutput(false);
    }
  }

  async function handleEditApplied(payload: {
    image: EditableImage;
    layers: CanvasLayer[];
    file: File;
    mergedLayerCount: number;
    preservedLayerCount: number;
    aiEditMetadata: Record<string, unknown>;
  }) {
    if (!sessionToken) {
      setError("Edit applied, but auto-save could not run because your session is missing.");
      return;
    }

    const saveBrandId = state.currentSourceBrandId ?? activeBrandId;
    if (!saveBrandId) {
      setError("Edit applied, but auto-save needs an active brand.");
      return;
    }

    const sourceOutputId = state.currentSourceOutputId;
    const saveMode = sourceOutputId ? "version" : "new";
    const savedSignature = buildEditorSaveSignature(payload.image, payload.layers);

    setIsSavingOutput(true);
    setError(null);
    setStatus(sourceOutputId ? "Saving this AI edit as a new version..." : "Saving this AI edit to Gallery...");

    try {
      const editorDocument = await buildEditorDocument(payload.image, payload.layers);
      const response = await saveEditedCreativeOutput(sessionToken, {
        brandId: saveBrandId,
        saveMode,
        sourceOutputId,
        image: payload.file,
        imageFileName: payload.file.name,
        sourceImage: payload.image.file,
        sourceImageFileName: payload.image.file.name,
        layerImages: editorDocument.layerImages,
        editorState: editorDocument.editorState,
        aiEditMetadata: payload.aiEditMetadata,
      });

      const sourceMetadata = {
        currentSourceOutputId: response.output.id,
        currentSourceBrandId: response.output.brandId,
        currentSourceProjectId: response.output.projectId,
        currentSourceReviewState: response.output.reviewState,
      };

      editor.setCurrentSourceOutputId(sourceMetadata.currentSourceOutputId);
      editor.setCurrentSourceBrandId(sourceMetadata.currentSourceBrandId);
      editor.setCurrentSourceProjectId(sourceMetadata.currentSourceProjectId);
      editor.setCurrentSourceReviewState(sourceMetadata.currentSourceReviewState);
      rebaseHistorySourceMetadata(sourceMetadata);
      loadedOutputIdRef.current = response.output.id;
      setLastSavedOutput(response.output);
      setLastSavedEditorSignature(savedSignature);
      setStatus(
        response.resolvedMode === "version"
          ? `AI edit auto-saved as version ${response.output.versionNumber}.`
          : "AI edit auto-saved to Gallery."
      );
      router.replace(`/studio/ai-edit?outputId=${response.output.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? `Edit applied, but auto-save failed: ${cause.message}` : "Edit applied, but auto-save failed.");
    } finally {
      setIsSavingOutput(false);
    }
  }

  async function handleAddGeneratedOutputFromModal(output: CreativeOutputRecord) {
    const fullOutput = sessionToken ? await getCreativeOutput(sessionToken, output.id).catch(() => null) : null;
    const sourceUrl = fullOutput?.originalUrl ?? fullOutput?.previewUrl ?? output.originalUrl ?? output.previewUrl;
    if (!sourceUrl) return;

    try {
      if (!state.currentImage) {
        const file = await sourceToFile(sourceUrl, `generated-post-${output.outputIndex + 1}.png`, "image/png");
        const image = await createEditableImage(file);
        pushToHistory();
        editor.setOriginalImage(image);
        editor.setCurrentImage(image);
        editor.setCurrentSourceOutputId(output.id);
        editor.setCurrentSourceBrandId(output.brandId);
        editor.setCurrentSourceProjectId(output.projectId);
        editor.setCurrentSourceReviewState(output.reviewState);
        editor.setCanvasLayers([]);
        editor.setSelectedLayerId(null);
        editor.setActiveEditorPane("uploads");
        setLastSavedOutput(output);
        setLastSavedEditorSignature(buildEditorSaveSignature(image, []));
        setIsGeneratedPostsModalOpen(false);
        setStatus("Generated post loaded as the base image.");
        return;
      }

      const dimensions = await loadImageSourceDimensions(sourceUrl);
      const width = 0.36;
      const height = Math.min(0.5, width * (dimensions.height / dimensions.width) * (state.currentImage.width / state.currentImage.height));
      const layer: CanvasImageLayer = {
        id: createLayerId("generated-post"),
        type: "image",
        name: `Generated post #${output.outputIndex + 1}`,
        src: sourceUrl,
        sourceStoragePath: output.storagePath,
        x: 0.06,
        y: 0.06,
        width,
        height: Math.max(0.08, height),
        rotation: 0,
        filter: "none",
        opacity: 1,
      };
      pushToHistory();
      addLayer(layer);
      editor.setActiveEditorPane("layers");
      setIsGeneratedPostsModalOpen(false);
      setStatus("Generated post added as an image layer.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add generated post.");
    }
  }

  function handleOpenVersion(output: CreativeOutputRecord) {
    if (isHistoryLocked) {
      return;
    }

    if (output.id === state.currentSourceOutputId) {
      return;
    }

    if (hasUnsavedChanges && !window.confirm("Open this version and discard unsaved canvas changes?")) {
      return;
    }

    setLoadingOutputId(output.id);
    setStatus(`Opening version ${output.versionNumber}...`);
    router.replace(`/studio/ai-edit?outputId=${output.id}`);
  }

  function handleOpenCompare() {
    if (savedVersions.length < 2) {
      return;
    }

    const afterOutput = savedVersions.find((output) => output.id === state.currentSourceOutputId) ?? savedVersions[0];
    const beforeOutput =
      savedVersions.find((output) => output.id !== afterOutput?.id && output.versionNumber < (afterOutput?.versionNumber ?? Number.POSITIVE_INFINITY)) ??
      savedVersions.find((output) => output.id !== afterOutput?.id) ??
      null;

    if (!afterOutput || !beforeOutput) {
      return;
    }

    setCompareAfterId(afterOutput.id);
    setCompareBeforeId(beforeOutput.id);
    setCompareSliderValue(50);
    setIsCompareOpen(true);
    void ensureCompareOutput(beforeOutput.id);
    void ensureCompareOutput(afterOutput.id);
  }

  function handleClearCanvas() {
    if (!state.currentImage) {
      return;
    }

    if (!window.confirm("Remove the current image and all editable layers? This cannot be undone.")) {
      return;
    }

    clearHistory();
    loadedOutputIdRef.current = null;
    editor.setOriginalImage(null);
    editor.setCurrentImage(null);
    editor.setCanvasLayers([]);
    editor.setSelectedLayerId(null);
    editor.setToolMode("select");
    editor.setActiveEditorPane("uploads");
    editor.setStageZoom(1);
    editor.setCurrentSourceOutputId(null);
    editor.setCurrentSourceBrandId(activeBrandId ?? null);
    editor.setCurrentSourceProjectId(null);
    editor.setCurrentSourceReviewState(null);
    setLastSavedOutput(null);
    setLastSavedEditorSignature(null);
    setVersionHistory([]);
    setCompareOutputCache({});
    setCompareBeforeId(null);
    setCompareAfterId(null);
    setIsCompareOpen(false);
    setLoadingOutputId(null);
    setStatus("Canvas cleared. Upload a new image to start.");
    setError(null);
    router.replace("/studio/ai-edit");
  }

  function renderPane() {
    switch (state.activeEditorPane) {
      case "uploads":
        return (
          <UploadsPane
            sessionToken={sessionToken}
            activeBrandId={activeBrandId}
            recentOutputs={editorRecentOutputs}
            isLoadingRecent={isLoadingRecentOutputs}
            onViewAllGenerated={() => setIsGeneratedPostsModalOpen(true)}
            onUploadClick={() => fileInputRef.current?.click()}
            onAddImageLayerClick={() => layerImageInputRef.current?.click()}
            onClearCanvas={handleClearCanvas}
          />
        );
      case "ai-edit":
        return (
          <AiEditPane
            sessionToken={sessionToken}
            activeBrandId={activeBrandId}
            onError={setError}
            onStatus={setStatus}
            onBusyChange={setIsAiEditBusy}
            onEditApplied={handleEditApplied}
          />
        );
      case "assets":
        return (
          <AssetsPane
            sessionToken={sessionToken}
            activeBrandId={activeBrandId}
            activeAssets={activeAssets}
            workspaceComplianceSettings={workspaceComplianceSettings}
            projectReraRegistrations={bootstrap?.projectReraRegistrations ?? []}
          />
        );
      case "text":
        return <TextPane onAddTextLayer={handleAddTextLayer} />;
      case "elements":
        return <ElementsPane />;
      case "layers":
        return <LayersPane />;
      case "effects":
        return <EffectsPane />;
      case "position":
        return <PositionPane />;
      case "font":
        return <FontPane />;
      default:
        return (
          <UploadsPane
            sessionToken={sessionToken}
            activeBrandId={activeBrandId}
            recentOutputs={editorRecentOutputs}
            isLoadingRecent={isLoadingRecentOutputs}
            onViewAllGenerated={() => setIsGeneratedPostsModalOpen(true)}
            onUploadClick={() => fileInputRef.current?.click()}
            onAddImageLayerClick={() => layerImageInputRef.current?.click()}
            onClearCanvas={handleClearCanvas}
          />
        );
    }
  }

  return (
    <div className="create-v2-shell ai-edit-page">
      <input accept="image/*" hidden onChange={handleFileChange} ref={fileInputRef} type="file" />
      <input accept="image/*" hidden onChange={handleLayerImageChange} ref={layerImageInputRef} type="file" />

      <EditorSidebar>{renderPane()}</EditorSidebar>

      <main className="create-v2-main ai-edit-main">
        <section className="ai-edit-stage-panel">
          <TopFormattingBar onOpenEffects={() => editor.setActiveEditorPane("effects")} onOpenPosition={() => editor.setActiveEditorPane("position")} onOpenFont={() => editor.setActiveEditorPane("font")} />

          <div
            className={`ai-edit-stage-shell ${isPanning ? "is-panning" : ""} ${isSpacePressed ? "has-hand-tool" : ""}`}
            onPointerCancel={handleShellPointerUp}
            onPointerDown={handleShellPointerDown}
            onPointerLeave={() => { lastStagePointerRef.current = null; }}
            onPointerMove={handleShellPointerMove}
            onPointerMoveCapture={handleShellPointerMoveCapture}
            onPointerUp={handleShellPointerUp}
            ref={stageShellRef}
          >
            <StageCanvas
              stageBusyMessage={stageBusyMessage}
              onLayerPointerDown={handleLayerPointerDown}
              onStagePointerDown={handleStagePointerDown}
              onLayerPointerMove={handleLayerPointerMove}
              onLayerPointerUp={handleLayerPointerUp}
              onFitToScreen={handleFitToScreen}
              stageFrameRef={stageFrameRef}
              isPanning={isPanning}
              isSpacePressed={isSpacePressed}
            />
          </div>

          {isCompareOpen && state.currentImage && savedVersions.length >= 2 ? (
            <EditorCompareOverlay
              afterId={compareAfterId}
              afterOutput={compareAfterOutput}
              beforeId={compareBeforeId}
              beforeOutput={compareBeforeOutput}
              image={state.currentImage}
              isLoading={isCompareLoading}
              onAfterChange={(value) => setCompareAfterId(value)}
              onBeforeChange={(value) => setCompareBeforeId(value)}
              onClose={() => setIsCompareOpen(false)}
              onSliderChange={setCompareSliderValue}
              sliderValue={compareSliderValue}
              versions={savedVersions}
            />
          ) : null}

          {state.currentImage && lastSavedOutput && savedVersions.length > 1 ? (
            <EditorVersionRail
              currentOutputId={state.currentSourceOutputId}
              isDisabled={isHistoryLocked}
              isLoading={isLoadingVersionHistory}
              lastSavedOutput={lastSavedOutput}
              loadingOutputId={loadingOutputId}
              onOpenVersion={handleOpenVersion}
              versionHistory={versionHistory}
            />
          ) : null}

          {state.currentImage ? (
            <div className="ai-edit-stage-utility-stack">
              <div className="ai-edit-stage-zoom-controls is-floating" aria-label="Canvas zoom controls">
                <button aria-label="Zoom out" onClick={() => setStageZoomAroundPoint(state.stageZoom - 0.1, getLastStageFocusPoint())} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <button className="ai-edit-zoom-value" aria-label="Reset canvas zoom" onClick={resetStageZoom} title="Reset to 100%" type="button">
                  {Math.round(state.stageZoom * 100)}%
                </button>
                <button aria-label="Zoom in" onClick={() => setStageZoomAroundPoint(state.stageZoom + 0.1, getLastStageFocusPoint())} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <div className="ai-edit-zoom-divider" />
                <button aria-label="Fit to screen" className="ai-edit-zoom-fit-btn" onClick={handleFitToScreen} title="Fit to screen" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6" />
                    <path d="M9 21H3v-6" />
                    <path d="M21 3l-7 7" />
                    <path d="M3 21l7-7" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {error || status ? (
        <div className={`ai-edit-toast ${error ? "is-error" : ""}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
          {error ?? status}
        </div>
      ) : null}

      <SaveDrawer isOpen={isSaveDrawerOpen} onClose={() => setIsSaveDrawerOpen(false)} onSave={handleSaveOutput} isSaving={isSavingOutput} hasUnsavedChanges={hasUnsavedChanges} />

      {isGeneratedPostsModalOpen ? (
        <div className="drawer-overlay ai-editor-generated-modal-overlay" onClick={() => setIsGeneratedPostsModalOpen(false)}>
          <div className="ai-editor-generated-modal" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header ai-editor-generated-modal-header">
              <div>
                <p className="panel-label">Gallery import</p>
                <h2>Generated posts</h2>
              </div>
              <button className="drawer-close" onClick={() => setIsGeneratedPostsModalOpen(false)} type="button">
                ×
              </button>
            </div>
            <div className="ai-editor-generated-modal-body">
              {isLoadingRecentOutputs ? (
                <div className="ai-editor-generated-modal-grid">
                  {[...Array(6)].map((_, i) => (
                    <div className="ai-editor-upload-source-card ai-editor-generated-modal-card ai-editor-skeleton" key={i} style={{ height: 180 }} />
                  ))}
                </div>
              ) : editorRecentOutputs.length ? (
                <div className="ai-editor-generated-modal-grid">
                  {editorRecentOutputs.map((output) => (
                    <button
                      className="ai-editor-upload-source-card ai-editor-generated-modal-card"
                      disabled={!(output.originalUrl ?? output.previewUrl)}
                      key={output.id}
                      onClick={() => void handleAddGeneratedOutputFromModal(output)}
                      type="button"
                    >
                      <span className="ai-editor-upload-source-preview">
                        {output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl ? (
                          <img alt={`Generated post ${output.outputIndex + 1}`} src={output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl} />
                        ) : (
                          <span>Post</span>
                        )}
                      </span>
                      <span className="ai-editor-upload-source-copy">
                        <strong>{`Generated post #${output.outputIndex + 1}`}</strong>
                        <small>{output.versionNumber ? `Version ${output.versionNumber}` : "Gallery output"}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="create-empty-state">
                  <strong>No generated posts yet</strong>
                  <p>Create or approve posts first, then use them as editor sources here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditorTopbarSaveState({
  hasUnsavedChanges,
  isSaving,
  lastSavedOutput,
  onSaveChanges,
}: {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  lastSavedOutput: CreativeOutputRecord | null;
  onSaveChanges: () => void;
}) {
  const statusLabel = isSaving
    ? "Saving..."
    : hasUnsavedChanges
      ? "Unsaved changes"
      : lastSavedOutput
        ? `Saved v${lastSavedOutput.versionNumber}`
        : "Not saved yet";

  return (
    <div className={`ai-edit-topbar-save-state ${hasUnsavedChanges ? "is-dirty" : "is-saved"}`} role="status" aria-live="polite">
      <span className="ai-edit-save-dot" />
      <strong>{statusLabel}</strong>
      {hasUnsavedChanges ? (
        <button disabled={isSaving} onClick={onSaveChanges} type="button">
          Save
        </button>
      ) : null}
    </div>
  );
}

function getCreativeOutputOriginalUrl(output: CreativeOutputRecord | null) {
  return output?.originalUrl ?? null;
}

function EditorCompareOverlay({
  afterId,
  afterOutput,
  beforeId,
  beforeOutput,
  image,
  isLoading,
  onAfterChange,
  onBeforeChange,
  onClose,
  onSliderChange,
  sliderValue,
  versions,
}: {
  afterId: string | null;
  afterOutput: CreativeOutputRecord | null;
  beforeId: string | null;
  beforeOutput: CreativeOutputRecord | null;
  image: EditableImage;
  isLoading: boolean;
  onAfterChange: (value: string) => void;
  onBeforeChange: (value: string) => void;
  onClose: () => void;
  onSliderChange: (value: number) => void;
  sliderValue: number;
  versions: CreativeOutputRecord[];
}) {
  const beforeUrl = getCreativeOutputOriginalUrl(beforeOutput);
  const afterUrl = getCreativeOutputOriginalUrl(afterOutput);
  const beforeLabel = beforeOutput ? `v${beforeOutput.versionNumber}` : "Before";
  const afterLabel = afterOutput ? `v${afterOutput.versionNumber}` : "After";
  const showLoading = isLoading || !beforeUrl || !afterUrl;

  return (
    <div className="ai-edit-compare-overlay" role="dialog" aria-label="Compare versions">
      <div className="ai-edit-compare-toolbar">
        <div className="ai-edit-compare-title">
          <strong>Compare</strong>
          <span>{beforeLabel} / {afterLabel}</span>
        </div>
        <label>
          <span>Before</span>
          <select value={beforeId ?? ""} onChange={(event) => onBeforeChange(event.target.value)}>
            {versions.map((output) => (
              <option disabled={output.id === afterId} key={output.id} value={output.id}>
                v{output.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>After</span>
          <select value={afterId ?? ""} onChange={(event) => onAfterChange(event.target.value)}>
            {versions.map((output) => (
              <option disabled={output.id === beforeId} key={output.id} value={output.id}>
                v{output.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <button aria-label="Close compare" className="ai-edit-compare-close" onClick={onClose} type="button">
          ×
        </button>
      </div>

      <div
        className={`ai-edit-compare-frame ${showLoading ? "is-loading" : ""}`}
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      >
        {beforeUrl ? <img alt={`${beforeLabel} before`} className="ai-edit-compare-image" decoding="async" src={beforeUrl} /> : null}
        {afterUrl ? (
          <div className="ai-edit-compare-after" style={{ clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }}>
            <img alt={`${afterLabel} after`} className="ai-edit-compare-image" decoding="async" src={afterUrl} />
          </div>
        ) : null}
        <span className="ai-edit-compare-chip is-before">{beforeLabel}</span>
        <span className="ai-edit-compare-chip is-after">{afterLabel}</span>
        <span className="ai-edit-compare-divider" style={{ left: `${sliderValue}%` }}>
          <span />
        </span>
        <input
          aria-label="Compare before and after"
          className="ai-edit-compare-range"
          max={100}
          min={0}
          onChange={(event) => onSliderChange(Number(event.target.value))}
          type="range"
          value={sliderValue}
        />
        {showLoading ? (
          <div className="ai-edit-compare-loading">
            <span />
            <strong>Loading full-resolution comparison...</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditorVersionRail({
  currentOutputId,
  isDisabled,
  isLoading,
  lastSavedOutput,
  loadingOutputId,
  onOpenVersion,
  versionHistory,
}: {
  currentOutputId: string | null;
  isDisabled: boolean;
  isLoading: boolean;
  lastSavedOutput: CreativeOutputRecord;
  loadingOutputId: string | null;
  onOpenVersion: (output: CreativeOutputRecord) => void;
  versionHistory: CreativeOutputRecord[];
}) {
  const versions = versionHistory.length ? versionHistory : [lastSavedOutput];

  return (
    <aside className="ai-edit-version-rail" aria-label="Version history">
      <div className="ai-edit-version-rail-header">
        <strong>Versions</strong>
        <span>{isLoading ? "Loading..." : `${versions.length}`}</span>
      </div>
      <div className="ai-edit-version-thumb-list">
        {versions.map((output) => {
          const imageUrl = output.thumbnailUrl ?? output.previewUrl ?? output.originalUrl;
          const isLoadingSelected = output.id === loadingOutputId;
          const isSelected = output.id === currentOutputId || isLoadingSelected;
          return (
            <button
              aria-busy={isLoadingSelected}
              className={`ai-edit-version-thumb ${isSelected ? "is-active" : ""} ${isLoadingSelected ? "is-loading" : ""}`}
              disabled={isDisabled || isLoadingSelected}
              key={output.id}
              onClick={() => onOpenVersion(output)}
              type="button"
            >
              <span className="ai-edit-version-thumb-media">
                {imageUrl ? (
                  <img alt={`Version ${output.versionNumber}`} src={imageUrl} />
                ) : (
                  <span>v{output.versionNumber}</span>
                )}
                {isLoadingSelected ? <span className="ai-edit-version-thumb-loading" aria-hidden="true" /> : null}
              </span>
              <span className="ai-edit-version-thumb-label">{isLoadingSelected ? "Loading" : `v${output.versionNumber}`}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function StudioAiEditPage() {
  const { sessionToken, activeBrand, activeBrandId, activeAssets, bootstrap } = useStudio();

  return (
    <EditorProvider>
      <StudioAiEditPageContent
        sessionToken={sessionToken}
        activeBrand={activeBrand}
        activeBrandId={activeBrandId}
        activeAssets={activeAssets}
        bootstrap={bootstrap}
      />
    </EditorProvider>
  );
}

export default StudioAiEditPage;
