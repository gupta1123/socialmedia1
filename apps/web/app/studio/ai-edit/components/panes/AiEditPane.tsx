"use client";

import React, { useState, useRef, useEffect } from "react";
import { useEditorContext } from "../../EditorContext";
import { useImageEditJob } from "../../hooks/useImageEditJob";
import {
  sourceToFile,
  buildEditedFileName,
  buildNormalizedSourceFileName,
  buildComposedFileName,
  createEditableImage,
  renderCompositionToFile
} from "../../lib/editor-files";
import type { ImageEditPreset } from "../../lib/api";
import { isLayerVisible, type CanvasLayer, type EditableImage } from "../../lib/editor-types";

interface AiEditPaneProps {
  sessionToken: string | null;
  activeBrandId: string | null;
  onError: (error: string | null) => void;
  onStatus: (status: string | null) => void;
  onBusyChange: (isBusy: boolean) => void;
  onEditApplied: (payload: {
    image: EditableImage;
    layers: CanvasLayer[];
    file: File;
    mergedLayerCount: number;
    preservedLayerCount: number;
  }) => Promise<void> | void;
}

const EDIT_ENGINE_OPTIONS: Array<{
  group: string;
  options: Array<{
    value: ImageEditPreset;
    label: string;
    speedLevel: number;
    speedTone: "green" | "amber" | "orange" | "red";
  }>;
}> = [
  {
    group: "V1",
    options: [
      { value: "v1_low", label: "Low", speedLevel: 4, speedTone: "green" },
      { value: "v1_high", label: "High", speedLevel: 3, speedTone: "amber" },
    ],
  },
  {
    group: "V2",
    options: [
      { value: "v2_low", label: "Low", speedLevel: 3, speedTone: "amber" },
      { value: "v2_medium", label: "Medium", speedLevel: 2, speedTone: "orange" },
      { value: "v2_high", label: "High", speedLevel: 1, speedTone: "red" },
    ],
  },
];

function shouldPreserveLayerAfterAiEdit(layer: CanvasLayer) {
  return layer.type === "image" && (layer.reraBlock || layer.preserveOnAiEdit);
}

function shouldKeepLayerEditableAfterAiEdit(layer: CanvasLayer) {
  return !isLayerVisible(layer) || shouldPreserveLayerAfterAiEdit(layer);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AutoExpandingTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  rows = 1,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to calculate scrollHeight correctly
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      className={className}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      ref={textareaRef}
      rows={rows}
      value={value}
    />
  );
}

function SpeedDots({ level, tone }: { level: number; tone: "green" | "amber" | "orange" | "red" }) {
  return (
    <span className={`model-speed-dots is-${tone}`} aria-label={`Speed ${level} of 4`}>
      {Array.from({ length: 4 }, (_, index) => (
        <span className={index < level ? "is-active" : ""} key={index} />
      ))}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiEditPane({ sessionToken, activeBrandId, onError, onStatus, onBusyChange, onEditApplied }: AiEditPaneProps) {
  const { state, setCurrentImage, setCanvasLayers, setSelectedLayerId, setToolMode, pushToHistory } = useEditorContext();
  const [prompt, setPrompt] = useState("");
  const [listPromptItems, setListPromptItems] = useState<string[]>([""]);
  const [promptMode, setPromptMode] = useState<"normal" | "list">("normal");
  const [editPreset, setEditPreset] = useState<ImageEditPreset>("v2_high");
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isEngineMenuOpen, setIsEngineMenuOpen] = useState(false);
  const engineMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (engineMenuRef.current && !engineMenuRef.current.contains(event.target as Node)) {
        setIsEngineMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { isApplying, isComposingPrompt, applyEdit } = useImageEditJob({
    sessionToken: sessionToken ?? "",
    brandId: activeBrandId ?? "",
    onError,
  });

  const promptTrimmed = prompt.trim();
  const normalizedListPromptItems = listPromptItems.map((item) => item.trim()).filter((item) => item.length > 0);
  const hasPromptInput = promptMode === "normal" ? promptTrimmed.length > 0 : normalizedListPromptItems.length > 0;
  const canApplyDirectEdit = Boolean(state.currentImage && hasPromptInput) && !isApplying && !isComposingPrompt && !isAutoSaving;
  const primaryActionLabel = isComposingPrompt ? "Preparing edit..." : isApplying ? "Applying..." : isAutoSaving ? "Saving..." : "Apply AI edit";
  const layersToPreserveCount = state.canvasLayers.filter((layer) => isLayerVisible(layer) && shouldPreserveLayerAfterAiEdit(layer)).length;
  const hiddenLayerCount = state.canvasLayers.filter((layer) => !isLayerVisible(layer)).length;
  const layersToMergeCount = state.canvasLayers.filter((layer) => isLayerVisible(layer) && !shouldPreserveLayerAfterAiEdit(layer)).length;

  useEffect(() => {
    onBusyChange(isApplying || isComposingPrompt || isAutoSaving);
  }, [isApplying, isAutoSaving, isComposingPrompt, onBusyChange]);

  useEffect(() => {
    return () => onBusyChange(false);
  }, [onBusyChange]);

  async function handlePrimaryAction() {
    if (!state.currentImage) return;

    try {
      const layersToPreserve = state.canvasLayers.filter(shouldKeepLayerEditableAfterAiEdit);
      const layersToMerge = state.canvasLayers.filter((layer) => isLayerVisible(layer) && !shouldPreserveLayerAfterAiEdit(layer));
      const sourceFileForEdit = layersToMerge.length > 0
        ? await renderCompositionToFile(
            state.currentImage,
            layersToMerge,
            buildComposedFileName(state.currentImage.file.name)
          )
        : state.currentImage.file;

      onStatus(
        layersToMerge.length > 0
          ? "Merging visible layers into the AI edit. Brand/RERA assets will stay editable."
          : "Applying the edit. This can take a few moments."
      );

      const result = await applyEdit(
        prompt,
        sourceFileForEdit,
        state.currentImage.width,
        state.currentImage.height,
        buildNormalizedSourceFileName(sourceFileForEdit.name),
        editPreset,
        listPromptItems,
        promptMode
      );

      if (result) {
        const nextFile = await sourceToFile(
          result.imageDataUrl ?? result.imageUrl,
          buildEditedFileName(state.currentImage.file.name),
          "image/png"
        );
        const nextImage = await createEditableImage(nextFile);
        const fileToSave = layersToPreserve.length > 0
          ? await renderCompositionToFile(nextImage, layersToPreserve, buildComposedFileName(nextFile.name))
          : nextFile;

        pushToHistory();
        setCurrentImage(nextImage);
        setCanvasLayers(layersToPreserve);
        setSelectedLayerId(null);
        setToolMode("select");
        onStatus(
          layersToPreserve.length > 0
            ? "Edit applied. Brand/RERA assets stayed on the canvas. Auto-saving this version."
            : "Edit applied. Auto-saving this edit."
        );
        setIsAutoSaving(true);
        try {
          await onEditApplied({
            image: nextImage,
            layers: layersToPreserve,
            file: fileToSave,
            mergedLayerCount: layersToMerge.length,
            preservedLayerCount: layersToPreserve.length,
          });
        } finally {
          setIsAutoSaving(false);
        }
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to apply this edit.");
    }
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

  const currentEngineGroup = EDIT_ENGINE_OPTIONS.find((group) => group.options.some((option) => option.value === editPreset));
  const currentEngineOption = currentEngineGroup?.options.find((option) => option.value === editPreset);
  const currentEngineName = currentEngineGroup && currentEngineOption ? `${currentEngineGroup.group} ${currentEngineOption.label}` : "V2 High";

  return (
    <div className="ai-editor-pane">
      <div className="ai-editor-pane-header">
        <div className="ai-editor-model-selector-container" ref={engineMenuRef}>
          <button
            className="ai-editor-model-dropdown-trigger"
            onClick={() => setIsEngineMenuOpen(!isEngineMenuOpen)}
            type="button"
          >
            <span className="model-name">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: 6}}>
                <path d="M12 2L2 7l10 5 10-5-10-5Z"/>
                <path d="m2 17 10 5 10-5"/>
                <path d="m2 12 10 5 10-5"/>
              </svg>
              {currentEngineName}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`dropdown-chevron ${isEngineMenuOpen ? "is-open" : ""}`}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          
          {isEngineMenuOpen && (
            <div className="ai-editor-model-dropdown-menu">
              <div className="ai-editor-model-dropdown-header">
                <span>Model / Quality</span>
                <span>Speed</span>
              </div>
              <div className="ai-editor-model-list">
                {EDIT_ENGINE_OPTIONS.map((group) => (
                  <div className="ai-editor-model-group" key={group.group}>
                    <div className="ai-editor-model-group-label">{group.group}</div>
                    {group.options.map((option) => (
                      <button
                        className={`ai-editor-model-option ${editPreset === option.value ? "is-selected" : ""}`}
                        key={option.value}
                        onClick={() => {
                          setEditPreset(option.value);
                          setIsEngineMenuOpen(false);
                        }}
                        type="button"
                      >
                        <span className="model-option-label">
                          {editPreset === option.value ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="model-check-icon">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className="model-check-placeholder" aria-hidden="true" />
                          )}
                          <strong>{option.label}</strong>
                        </span>
                        <SpeedDots level={option.speedLevel} tone={option.speedTone} />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ai-editor-header-actions">
          <div className="chatgpt-mode-toggle" role="tablist" aria-label="Prompt mode">
            <button
              className={`chatgpt-mode-btn ${promptMode === "normal" ? "is-active" : ""}`}
              onClick={() => setPromptMode("normal")}
              role="tab"
              title="Single prompt"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              className={`chatgpt-mode-btn ${promptMode === "list" ? "is-active" : ""}`}
              onClick={() => setPromptMode("list")}
              role="tab"
              title="List prompt"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>



      {promptMode === "normal" ? (
        <div className="ai-editor-section">
          <AutoExpandingTextarea
            className="create-prompt-textarea"
            onChange={(val) => setPrompt(val)}
            placeholder="Describe your change... (e.g., 'replace the worker with a dog')"
            rows={4}
            value={prompt}
          />
        </div>
      ) : (
        <div className="ai-editor-section">
          <p className="ai-editor-pane-copy" style={{ marginBottom: '12px' }}>Add each requested change separately.</p>
          <div className="ai-editor-list-container">
            {listPromptItems.map((item, index) => (
              <div className="ai-editor-list-item" key={`change-item-${index + 1}`}>
                <AutoExpandingTextarea
                  className="create-prompt-textarea"
                  onChange={(val) => handleListPromptItemChange(index, val)}
                  placeholder={`Change ${index + 1}`}
                  rows={1}
                  value={item}
                />
                <button
                  className="ai-editor-list-remove-btn"
                  disabled={listPromptItems.length <= 1}
                  onClick={() => handleRemoveListPromptItem(index)}
                  title="Remove change"
                  type="button"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button className="ai-editor-list-add-btn" onClick={handleAddListPromptItem} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add another change</span>
          </button>
        </div>
      )}

      {state.canvasLayers.length > 0 ? (
        <div className="ai-editor-layer-merge-note">
          {layersToMergeCount > 0 ? (
            <span>{layersToMergeCount} visible layer{layersToMergeCount === 1 ? "" : "s"} will be included in the AI edit.</span>
          ) : null}
          {layersToPreserveCount > 0 ? (
            <span>{layersToPreserveCount} brand/RERA layer{layersToPreserveCount === 1 ? "" : "s"} will stay editable on top.</span>
          ) : null}
          {hiddenLayerCount > 0 ? (
            <span>{hiddenLayerCount} hidden layer{hiddenLayerCount === 1 ? "" : "s"} will stay hidden and editable.</span>
          ) : null}
        </div>
      ) : null}

      <button
        className="ai-edit-apply-button"
        disabled={!canApplyDirectEdit}
        onClick={() => void handlePrimaryAction()}
        type="button"
      >
        {primaryActionLabel}
      </button>
    </div>
  );
}
