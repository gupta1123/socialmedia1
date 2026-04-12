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

export function PanelSkeleton() {
  return (
    <div className="page-stack" style={{ opacity: 0.8 }}>
      <article className="panel">
        <div className="panel-header">
          <div>
            <Skeleton width="120px" height="1.5rem" style={{ marginBottom: "8px" }} />
            <Skeleton width="240px" height="1rem" />
          </div>
        </div>
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
            <Skeleton width="100px" height="32px" />
            <Skeleton width="100px" height="32px" />
            <Skeleton width="100px" height="32px" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} style={{ marginBottom: "12px" }} />
          ))}
        </div>
      </article>
    </div>
  );
}

