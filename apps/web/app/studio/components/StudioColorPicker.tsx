"use client";

import { useEffect, useId, useRef, useState } from "react";

const RECENT_COLORS_KEY = "brand-aware-editor-recent-colors";

const DEFAULT_COLORS = [
  "#111111",
  "#ffffff",
  "#0f2447",
  "#d6a95e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#facc15",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#64748b",
  "#9ca3af",
  "#e5e7eb",
];

type StudioColorPickerVariant = "compact" | "field" | "inline";
type StudioColorPickerTrigger = "text" | "swatch";

interface StudioColorPickerProps {
  value: string;
  onChange: (value: string) => void | Promise<void>;
  label?: string;
  title?: string;
  disabled?: boolean;
  variant?: StudioColorPickerVariant;
  trigger?: StudioColorPickerTrigger;
  align?: "left" | "right";
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
}

export function StudioColorPicker({
  value,
  onChange,
  label,
  title,
  disabled = false,
  variant = "compact",
  trigger = "swatch",
  align = "left",
  onChangeStart,
  onChangeEnd,
}: StudioColorPickerProps) {
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isEditingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const safeColor = normalizeHexColor(value, "#111111");
  const [hexValue, setHexValue] = useState(safeColor);
  const [recentColors, setRecentColors] = useState<string[]>([]);

  useEffect(() => {
    if (!isEditing) {
      setHexValue(safeColor);
    }
  }, [isEditing, safeColor]);

  useEffect(() => {
    setRecentColors(readRecentColors());
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
      endChange();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function beginChange() {
    if (isEditingRef.current) return;
    isEditingRef.current = true;
    setIsEditing(true);
    onChangeStart?.();
  }

  function endChange() {
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    setIsEditing(false);
    onChangeEnd?.();
  }

  function applyColor(nextValue: string, options?: { close?: boolean; transactional?: boolean }) {
    const nextColor = normalizeHexColor(nextValue, safeColor);
    if (options?.transactional) {
      beginChange();
    }

    void onChange(nextColor);
    storeRecentColor(nextColor);
    setRecentColors(readRecentColors());
    setHexValue(nextColor);

    if (options?.transactional) {
      endChange();
    }
    if (options?.close) {
      setOpen(false);
    }
  }

  function handleHexInput(nextValue: string) {
    const prefixedValue = nextValue.startsWith("#") ? nextValue : `#${nextValue}`;
    setHexValue(prefixedValue);
    if (isValidHexColor(prefixedValue)) {
      applyColor(prefixedValue);
    }
  }

  function handleHexBlur() {
    if (isValidHexColor(hexValue)) {
      applyColor(hexValue);
    } else {
      setHexValue(safeColor);
    }
    endChange();
  }

  const content = (
    <>
      {label ? <div className="studio-color-picker-label">{label}</div> : null}
      {recentColors.length > 0 ? (
        <div className="studio-color-section">
          <span>Recent</span>
          <ColorGrid colors={recentColors} selectedColor={safeColor} onSelect={(color) => applyColor(color, { close: variant !== "inline", transactional: true })} />
        </div>
      ) : null}
      <div className="studio-color-section">
        <span>Palette</span>
        <ColorGrid colors={DEFAULT_COLORS} selectedColor={safeColor} onSelect={(color) => applyColor(color, { close: variant !== "inline", transactional: true })} />
      </div>
      <div className="studio-color-custom-row">
        <label className="studio-color-native-button" title="Custom color">
          <span style={{ backgroundColor: safeColor }} />
          <input
            aria-label={title ?? label ?? "Custom color"}
            disabled={disabled}
            onBlur={endChange}
            onChange={(event) => applyColor(event.target.value)}
            onFocus={beginChange}
            onPointerDown={beginChange}
            onPointerUp={endChange}
            type="color"
            value={safeColor}
          />
        </label>
        <label className="studio-color-hex-field" htmlFor={`${pickerId}-hex`}>
          <span>#</span>
          <input
            disabled={disabled}
            id={`${pickerId}-hex`}
            onBlur={handleHexBlur}
            onChange={(event) => handleHexInput(event.target.value)}
            onFocus={beginChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                setOpen(false);
              }
            }}
            value={hexValue.replace(/^#/, "").toUpperCase()}
          />
        </label>
      </div>
    </>
  );

  if (variant === "inline") {
    return (
      <div className="studio-color-picker is-inline" ref={rootRef}>
        <div className="studio-color-panel">{content}</div>
      </div>
    );
  }

  if (variant === "field") {
    return (
      <div className={`studio-color-picker is-field align-${align}`} ref={rootRef}>
        <button
          aria-expanded={open}
          className="studio-color-field-trigger"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          title={title ?? label ?? "Color"}
          type="button"
        >
          <span className="studio-color-field-swatch" style={{ backgroundColor: safeColor }} />
          <span className="studio-color-field-value">{safeColor}</span>
          <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" width="16">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {open ? <div className="studio-color-popover">{content}</div> : null}
      </div>
    );
  }

  return (
    <div className={`studio-color-picker is-compact align-${align}`} ref={rootRef}>
      <button
        aria-expanded={open}
        className="studio-color-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={title ?? label ?? "Color"}
        type="button"
      >
        {trigger === "text" ? (
          <span className="studio-color-trigger-text">
            <span>A</span>
            <i style={{ backgroundColor: safeColor }} />
          </span>
        ) : (
          <span className="studio-color-trigger-swatch" style={{ backgroundColor: safeColor }} />
        )}
      </button>
      {open ? <div className="studio-color-popover">{content}</div> : null}
    </div>
  );
}

function ColorGrid({
  colors,
  selectedColor,
  onSelect,
}: {
  colors: string[];
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="studio-color-grid">
      {colors.map((color) => {
        const normalizedColor = normalizeHexColor(color, color);
        return (
          <button
            aria-label={`Use ${normalizedColor}`}
            className={`studio-color-swatch ${normalizedColor.toLowerCase() === selectedColor.toLowerCase() ? "is-selected" : ""}`}
            key={normalizedColor}
            onClick={() => onSelect(normalizedColor)}
            style={{ backgroundColor: normalizedColor }}
            type="button"
          />
        );
      })}
    </div>
  );
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  const candidate = trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`;
  return isValidHexColor(candidate) ? candidate.toUpperCase() : fallback.toUpperCase();
}

function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

function readRecentColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_COLORS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string" && isValidHexColor(value)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function storeRecentColor(color: string) {
  if (typeof window === "undefined") return;
  const nextColors = [color, ...readRecentColors().filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 8);
  window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(nextColors));
}
