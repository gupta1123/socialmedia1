"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ImagePreviewPayload = {
  src: string;
  alt: string;
  id?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  meta?: string | undefined;
  badges?: string[] | undefined;
  details?: Array<{ label: string; value: string }> | undefined;
  sections?: Array<{ title: string; items: Array<{ label: string; value: string }> }> | undefined;
  actions?: Array<{
    label: string;
    href: string;
    external?: boolean | undefined;
    tone?: "primary" | "ghost" | undefined;
  }> | undefined;
};

type ImagePreviewCollectionItem = ImagePreviewPayload & {
  id: string;
  thumbnailSrc?: string | undefined;
};

type ImagePreviewContextValue = {
  openPreview: (payload: ImagePreviewPayload, collection?: ImagePreviewCollectionItem[]) => void;
  closePreview: () => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ImagePreviewPayload | null>(null);
  const [collection, setCollection] = useState<ImagePreviewCollectionItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const activeCollectionIndex = preview
    ? collection.findIndex((item) => item.id === preview.id || item.src === preview.src)
    : -1;
  const hasCollectionNavigation = collection.length > 1 && activeCollectionIndex >= 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
        setCollection([]);
        return;
      }

      if (event.key === "ArrowLeft") {
        showAdjacentPreview(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        showAdjacentPreview(1);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [preview, collection, activeCollectionIndex]);

  const value = useMemo<ImagePreviewContextValue>(
    () => ({
      openPreview: (payload, nextCollection) => {
        setPreview(payload);
        setCollection(nextCollection?.length ? nextCollection : []);
      },
      closePreview: () => {
        setPreview(null);
        setCollection([]);
      }
    }),
    []
  );

  function closePreview() {
    setPreview(null);
    setCollection([]);
  }

  function showAdjacentPreview(direction: -1 | 1) {
    if (!hasCollectionNavigation) {
      return;
    }

    const nextIndex = (activeCollectionIndex + direction + collection.length) % collection.length;
    const nextPreview = collection[nextIndex];
    if (nextPreview) {
      setPreview(nextPreview);
    }
  }

  async function handleDownloadAsset() {
    if (!preview?.src || downloading) {
      return;
    }

    setDownloading(true);
    try {
      const response = await fetch(preview.src);
      if (!response.ok) {
        throw new Error(`Download failed with ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = inferDownloadFilename(preview);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <ImagePreviewContext.Provider value={value}>
      {children}
      {mounted && preview
        ? createPortal(
            <div
              className="image-preview-overlay"
              onClick={closePreview}
              role="presentation"
            >
              <div
                className={`image-preview-dialog ${hasInspectorContent(preview) ? "has-inspector" : ""}`}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={preview.title ?? preview.alt}
              >
                {(() => {
                  const summary = getPreviewSummary(preview);
                  const caption = getPreviewCaption(preview, summary);
                  const details = getPreviewDetails(preview, summary, caption);
                  const sections = getPreviewSections(preview, summary, caption);
                  const primaryActions = preview.actions?.filter((action) => action.tone === "primary") ?? [];
                  const secondaryActions = preview.actions?.filter((action) => action.tone !== "primary") ?? [];

                  return (
                <div className="image-preview-shell">
                  <button
                    aria-label="Close image preview"
                    className="image-preview-close"
                    onClick={closePreview}
                    type="button"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>

                  <div className="image-preview-frame">
                    {hasCollectionNavigation ? (
                      <>
                        <button
                          aria-label="Show previous image"
                          className="image-preview-nav-button is-prev"
                          onClick={() => showAdjacentPreview(-1)}
                          type="button"
                        >
                          ←
                        </button>
                        <button
                          aria-label="Show next image"
                          className="image-preview-nav-button is-next"
                          onClick={() => showAdjacentPreview(1)}
                          type="button"
                        >
                          →
                        </button>
                      </>
                    ) : null}
                    <div className="image-preview-media">
                      <img alt={preview.alt} src={preview.src} />
                    </div>
                    {hasCollectionNavigation ? (
                      <div className="image-preview-strip" aria-label="Preview images">
                        {collection.map((item, index) => (
                          <button
                            aria-label={`Show image ${index + 1}`}
                            aria-current={index === activeCollectionIndex ? "true" : undefined}
                            className={`image-preview-strip-item ${index === activeCollectionIndex ? "is-active" : ""}`}
                            key={item.id}
                            onClick={() => setPreview(item)}
                            type="button"
                          >
                            <img alt={item.alt} src={item.thumbnailSrc ?? item.src} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {hasInspectorContent(preview) ? (
                    <aside className="image-preview-inspector">
                      <div className="image-preview-header">
                        {preview.badges && preview.badges.length > 0 ? (
                          <div className="image-preview-badges">
                            {preview.badges.map((badge) => (
                              <span className="image-preview-badge" key={badge}>
                                {badge}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {caption ? <span className="image-preview-kicker">{caption}</span> : null}
                        {preview.title ? <strong>{preview.title}</strong> : null}
                        {summary ? <p>{summary}</p> : null}
                      </div>

                      {details.length > 0 ? (
                        <div className="image-preview-details">
                          {details.map((detail) => (
                            <div
                              className={`image-preview-detail-row ${isLongPreviewDetail(detail.value) ? "is-long" : ""}`}
                              key={`${detail.label}-${detail.value}`}
                            >
                              <span>{detail.label}</span>
                              <strong>{detail.value}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {sections.map((section) => (
                        <section className="image-preview-section" key={section.title}>
                          <div className="image-preview-section-title">{section.title}</div>
                          <div className="image-preview-section-body">
                            {section.items.map((item) => (
                              <div
                                className={`image-preview-detail-row ${isLongPreviewDetail(item.value) ? "is-long" : ""}`}
                                key={`${section.title}-${item.label}-${item.value}`}
                              >
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}

                      <div className="image-preview-actions">
                        {primaryActions.map((action) => (
                          <a
                            className={`button ${action.tone === "primary" ? "button-primary" : "button-ghost"}`}
                            href={action.href}
                            key={`${action.label}-${action.href}`}
                            rel={action.external ? "noreferrer" : undefined}
                            target={action.external ? "_blank" : undefined}
                          >
                            {action.label}
                          </a>
                        ))}
                        <button className="button button-ghost" onClick={() => void handleDownloadAsset()} type="button">
                          {downloading ? "Downloading..." : "Download asset"}
                        </button>
                        {secondaryActions.map((action) => (
                          <a
                            className="button button-ghost"
                            href={action.href}
                            key={`${action.label}-${action.href}`}
                            rel={action.external ? "noreferrer" : undefined}
                            target={action.external ? "_blank" : undefined}
                          >
                            {action.label}
                          </a>
                        ))}
                        <a className="image-preview-link" href={preview.src} rel="noreferrer" target="_blank">
                          Open original
                        </a>
                      </div>
                    </aside>
                  ) : preview.title || summary || caption ? (
                    <div className="image-preview-caption">
                      {caption ? <span className="image-preview-kicker">{caption}</span> : null}
                      {preview.title ? <strong>{preview.title}</strong> : null}
                      {summary ? <p>{summary}</p> : null}
                    </div>
                  ) : null}
                </div>
                  );
                })()}
              </div>
            </div>,
            document.body
          )
        : null}
    </ImagePreviewContext.Provider>
  );
}

function inferDownloadFilename(preview: ImagePreviewPayload) {
  const titleSlug = (preview.title ?? preview.alt ?? "asset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const pathname = tryGetPathname(preview.src);
  const extensionMatch = pathname.match(/\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i);
  const extension = extensionMatch?.[1] ? extensionMatch[1].toLowerCase() : "png";
  return `${titleSlug || "asset"}.${extension}`;
}

function tryGetPathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

type ImagePreviewTriggerProps = {
  src?: string | null | undefined;
  alt: string;
  title?: string | undefined;
  subtitle?: string | undefined;
  meta?: string | undefined;
  badges?: string[] | undefined;
  details?: Array<{ label: string; value: string }> | undefined;
  sections?: Array<{ title: string; items: Array<{ label: string; value: string }> }> | undefined;
  actions?: Array<{
    label: string;
    href: string;
    external?: boolean | undefined;
    tone?: "primary" | "ghost" | undefined;
  }> | undefined;
  children: ReactNode;
  className?: string | undefined;
  mode?: "button" | "inline";
  resolveSrc?: (() => Promise<string | null | undefined>) | undefined;
};

export function ImagePreviewTrigger({
  src,
  alt,
  title,
  subtitle,
  meta,
  badges,
  details,
  sections,
  actions,
  children,
  className,
  mode = "button",
  resolveSrc
}: ImagePreviewTriggerProps) {
  const context = useContext(ImagePreviewContext);

  if (typeof src !== "string" || src.length === 0 || !context) {
    return <>{children}</>;
  }

  const previewSrc = src;
  const previewContext = context;

  async function handleActivate(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const resolvedSrc = resolveSrc ? await resolveSrc().catch(() => null) : null;
    previewContext.openPreview({ src: resolvedSrc || previewSrc, alt, title, subtitle, meta, badges, details, sections, actions });
  }

  if (mode === "inline") {
    return (
      <span className={["image-preview-trigger-inline", className].filter(Boolean).join(" ")} onClick={handleActivate}>
        {children}
      </span>
    );
  }

  return (
    <button
      className={["image-preview-trigger", className].filter(Boolean).join(" ")}
      onClick={handleActivate}
      type="button"
    >
      {children}
    </button>
  );
}

export function useImagePreview() {
  const context = useContext(ImagePreviewContext);

  if (!context) {
    throw new Error("useImagePreview must be used within an ImagePreviewProvider");
  }

  return context;
}

function hasInspectorContent(preview: ImagePreviewPayload) {
  const summary = getPreviewSummary(preview);
  const caption = getPreviewCaption(preview, summary);
  const details = getPreviewDetails(preview, summary, caption);
  const sections = getPreviewSections(preview, summary, caption);

  return Boolean(
    summary ||
      caption ||
      (preview.badges && preview.badges.length > 0) ||
      details.length > 0 ||
      sections.length > 0 ||
      (preview.actions && preview.actions.length > 0)
  );
}

function normalizeText(value?: string | null) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isLongPreviewDetail(value: string) {
  return value.length > 90;
}

function isPromptDisclosureLabel(value: string) {
  return ["prompt", "final prompt", "seed prompt", "image prompt", "generation prompt"].includes(normalizeText(value));
}

function getPreviewSummary(preview: ImagePreviewPayload) {
  return preview.subtitle?.trim() || preview.meta?.trim() || null;
}

function getPreviewCaption(preview: ImagePreviewPayload, summary: string | null) {
  const meta = preview.meta?.trim() ?? "";
  if (!meta) {
    return null;
  }

  return normalizeText(meta) === normalizeText(summary) ? null : meta;
}

function getPreviewDetails(preview: ImagePreviewPayload, summary: string | null, caption: string | null) {
  const duplicateValues = new Set(
    [preview.title, summary, caption]
      .map((value) => normalizeText(value))
      .filter((value) => value.length > 0)
  );

  return (preview.details ?? []).filter((detail) => {
    if (isPromptDisclosureLabel(detail.label)) {
      return false;
    }

    const normalizedValue = normalizeText(detail.value);
    if (!normalizedValue) {
      return false;
    }

    if ((detail.label === "Prompt" || detail.label === "Run") && duplicateValues.has(normalizedValue)) {
      return false;
    }

    return true;
  });
}

function getPreviewSections(preview: ImagePreviewPayload, summary: string | null, caption: string | null) {
  const duplicateValues = new Set(
    [preview.title, summary, caption]
      .map((value) => normalizeText(value))
      .filter((value) => value.length > 0)
  );

  return (preview.sections ?? [])
    .filter((section) => !isPromptDisclosureLabel(section.title))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (isPromptDisclosureLabel(item.label)) {
          return false;
        }

        const normalizedValue = normalizeText(item.value);
        if (!normalizedValue) {
          return false;
        }

        if (
          (section.title === "Prompt" || item.label === "Prompt" || item.label === "Run") &&
          duplicateValues.has(normalizedValue)
        ) {
          return false;
        }

        return true;
      })
    }))
    .filter((section) => section.items.length > 0);
}
