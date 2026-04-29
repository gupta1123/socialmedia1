"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  style?: React.CSSProperties;
}

export function Skeleton({ className = "", width, height, circle = false, style: styleProp }: SkeletonProps) {
  const style: React.CSSProperties = {
    ...styleProp,
    width: width,
    height: height,
    borderRadius: circle ? "9999px" : undefined,
  };

  return (
    <div 
      className={`studio-shell-skeleton ${className}`} 
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow({ className = "", style }: { className?: string, style?: React.CSSProperties }) {
  return (
    <div className={`work-list-row ${className}`} style={{ ...style, pointerEvents: "none" }}>
      <div style={{ flex: 1 }}>
        <Skeleton width="60%" height="1rem" style={{ marginBottom: "0.5rem" }} />
        <Skeleton width="40%" height="0.75rem" />
      </div>
      <Skeleton width="64px" height="1.5rem" className="pill" />
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="page-stack" aria-label="Loading page">
      <article className="panel" aria-hidden="true">
        <Skeleton width="120px" height="0.8rem" style={{ marginBottom: "12px" }} />
        <Skeleton width="46%" height="1.35rem" style={{ marginBottom: "10px" }} />
        <Skeleton width="72%" height="0.85rem" />
      </article>
      <article className="panel" aria-hidden="true">
        <Skeleton width="100%" height="180px" style={{ borderRadius: "8px" }} />
      </article>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="calendar-shell">
      <div className="calendar-toolbar-skeleton">
        <div className="calendar-toolbar-skeleton-nav">
          <Skeleton width="32px" height="32px" />
          <Skeleton width="64px" height="32px" />
          <Skeleton width="32px" height="32px" />
        </div>
        <div className="calendar-toolbar-skeleton-title">
          <Skeleton width="180px" height="24px" />
          <Skeleton width="240px" height="16px" />
        </div>
        <div className="calendar-toolbar-skeleton-filters">
          <Skeleton width="120px" height="32px" />
          <Skeleton width="120px" height="32px" />
          <Skeleton width="120px" height="32px" />
        </div>
      </div>
      <div className="calendar-week-grid" style={{ pointerEvents: "none" }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div 
            className="calendar-week-column" 
            key={i}
            style={{ height: "500px", opacity: 1 - (i * 0.03) }}
          >
            <div className="calendar-week-column-header">
              <div className="calendar-week-heading-copy">
                <Skeleton width="24px" height="10px" />
                <Skeleton width="28px" height="1.4rem" />
              </div>
            </div>
            <div className="calendar-week-column-body" style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {i % 2 === 0 && (
                <div className="calendar-event-card-skeleton">
                  <Skeleton height="60px" style={{ borderRadius: "6px" }} />
                </div>
              )}
              {i % 3 === 0 && (
                <div className="calendar-event-card-skeleton">
                  <Skeleton height="48px" style={{ borderRadius: "6px" }} />
                </div>
              )}
              {i % 4 === 0 && (
                <div className="calendar-event-card-skeleton">
                  <Skeleton height="36px" style={{ borderRadius: "6px" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OutputDetailSkeleton() {
  return (
    <div className="output-detail-page">
      <section className="output-detail-main" aria-label="Loading output preview">
        <div className="output-detail-stage">
          <button aria-label="Previous image" className="output-detail-nav output-detail-nav-left" disabled type="button">
            ‹
          </button>
          <div className="output-detail-poster-skeleton">
            <div className="output-detail-poster-inner">
              <Skeleton className="output-skeleton-line center" width="34%" height="18px" />
              <Skeleton className="output-skeleton-line center wide" width="70%" height="34px" />
              <Skeleton className="output-skeleton-line center" width="48%" height="16px" />
              <Skeleton className="output-skeleton-line center medium" width="56%" height="28px" />
              <div className="output-skeleton-skyline">
                <div className="output-skeleton-building tall" />
                <div className="output-skeleton-building" />
                <div className="output-skeleton-tree right" />
                <div className="output-skeleton-tree left" />
              </div>
              <div className="output-skeleton-footer">
                <Skeleton width="32px" height="32px" style={{ borderRadius: "6px" }} />
                <Skeleton width="30%" height="14px" />
                <Skeleton width="40%" height="12px" />
              </div>
            </div>
          </div>
          <button aria-label="Next image" className="output-detail-nav output-detail-nav-right" disabled type="button">
            ›
          </button>
        </div>
        <div className="output-detail-strip" aria-label="Loading thumbnails">
          {Array.from({ length: 7 }).map((_, i) => (
            <div className="output-detail-thumb output-detail-thumb-skeleton" key={i} style={{ opacity: 1 - i * 0.08 }}>
              <div className="output-thumb-poster-skeleton">
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="output-detail-rail" aria-label="Loading output details">
        <div className="output-detail-rail-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Skeleton width="80px" height="22px" style={{ borderRadius: "999px" }} />
            <Skeleton width="60px" height="14px" />
          </div>
          <Skeleton width="24px" height="24px" />
        </div>

        <div className="output-detail-panel">
          <div className="output-detail-icon-actions">
            <Skeleton width="80px" height="32px" />
            <Skeleton width="80px" height="32px" />
          </div>

          <div className="output-detail-section">
            <Skeleton width="100px" height="14px" style={{ marginBottom: "12px" }} />
            <Skeleton width="100%" height="60px" />
          </div>

          <div className="output-detail-section">
            <Skeleton width="80px" height="14px" style={{ marginBottom: "12px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Skeleton width="100%" height="14px" />
              <Skeleton width="70%" height="14px" />
              <Skeleton width="85%" height="14px" />
            </div>
          </div>

          <div className="output-detail-section">
            <Skeleton width="90px" height="14px" style={{ marginBottom: "12px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Skeleton width="45%" height="12px" />
              <Skeleton width="60%" height="12px" />
              <Skeleton width="50%" height="12px" />
            </div>
          </div>
        </div>

        <div className="output-detail-actions">
          <Skeleton width="100%" height="38px" />
          <Skeleton width="100%" height="32px" />
          <Skeleton width="100%" height="32px" />
          <Skeleton width="100%" height="32px" />
        </div>
      </aside>
    </div>
  );
}
