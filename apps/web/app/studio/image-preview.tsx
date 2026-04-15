"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ImagePreviewPayload = {
  src: string;
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
};

type ImagePreviewContextValue = {
  openPreview: (payload: ImagePreviewPayload) => void;
  closePreview: () => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ImagePreviewPayload | null>(null);
  const [mounted, setMounted] = useState(false);

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
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [preview]);

  const value = useMemo<ImagePreviewContextValue>(
    () => ({
      openPreview: (payload) => setPreview(payload),
      closePreview: () => setPreview(null)
    }),
    []
  );

  return (
    <ImagePreviewContext.Provider value={value}>
      {children}
      {mounted && preview
        ? createPortal(
            <div
              className="image-preview-overlay"
              onClick={() => setPreview(null)}
              role="presentation"
            >
              <div
                className={`image-preview-dialog ${hasInspectorContent(preview) ? "has-inspector" : ""}`}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={preview.title ?? preview.alt}
              >
                <div className="image-preview-shell">
                  <button
                    aria-label="Close image preview"
                    className="image-preview-close"
                    onClick={() => setPreview(null)}
                    type="button"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>

                  <div className="image-preview-frame">
                    <div className="image-preview-media">
                      <img alt={preview.alt} src={preview.src} />
                    </div>
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
                        {preview.title ? <strong>{preview.title}</strong> : null}
                        {preview.subtitle || preview.meta ? (
                          <p>{preview.subtitle ?? preview.meta}</p>
                        ) : null}
                      </div>

                      {preview.details && preview.details.length > 0 ? (
                        <div className="image-preview-details">
                          {preview.details.map((detail) => (
                            <div className="image-preview-detail-row" key={`${detail.label}-${detail.value}`}>
                              <span>{detail.label}</span>
                              <strong>{detail.value}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {preview.sections?.map((section) => (
                        <section className="image-preview-section" key={section.title}>
                          <div className="image-preview-section-title">{section.title}</div>
                          <div className="image-preview-section-body">
                            {section.items.map((item) => (
                              <div className="image-preview-detail-row" key={`${section.title}-${item.label}-${item.value}`}>
                                <span>{item.label}</span>
                                <strong>{item.value}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}

                      <div className="image-preview-actions">
                        <a className="button button-ghost" href={preview.src} rel="noreferrer" target="_blank">
                          Open original
                        </a>
                        <a className="button button-ghost" download href={preview.src}>
                          Download
                        </a>
                        {preview.actions?.map((action) => (
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
                      </div>
                    </aside>
                  ) : preview.title || preview.meta ? (
                    <div className="image-preview-caption">
                      {preview.title ? <strong>{preview.title}</strong> : null}
                      {preview.meta ? <p>{preview.meta}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </ImagePreviewContext.Provider>
  );
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
  mode = "button"
}: ImagePreviewTriggerProps) {
  const context = useContext(ImagePreviewContext);

  if (typeof src !== "string" || src.length === 0 || !context) {
    return <>{children}</>;
  }

  const previewSrc = src;
  const previewContext = context;

  function handleActivate(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    previewContext.openPreview({ src: previewSrc, alt, title, subtitle, meta, badges, details, sections, actions });
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
  return Boolean(
    preview.subtitle ||
      (preview.badges && preview.badges.length > 0) ||
      (preview.details && preview.details.length > 0) ||
      (preview.sections && preview.sections.length > 0) ||
      (preview.actions && preview.actions.length > 0)
  );
}
