"use client";

import type { CreativeChannel, CreativeFormat } from "@image-lab/contracts";
import { getPlacementSpec } from "../../lib/placement-specs";
import { FloatingTooltip } from "./floating-tooltip";

type PlacementIconsProps = {
  channel: CreativeChannel;
  format: CreativeFormat;
  interactive?: boolean;
  compact?: boolean;
};

export function PlacementIcons({ channel, format, interactive = true, compact = false }: PlacementIconsProps) {
  const placement = getPlacementSpec(channel, format);
  const channelLabel = placement?.channelLabel ?? channel;
  const formatLabel = placement?.formatLabel ?? format;
  const Trigger = interactive ? "button" : "span";

  return (
    <div
      className={`placement-icons${compact ? " placement-icons-compact" : ""}`}
      role="group"
      aria-label={`${channelLabel} ${formatLabel}`}
    >
      <FloatingTooltip
        className="placement-tooltip"
        content={
          <>
            <strong>{channelLabel}</strong>
            {placement?.purpose ? <span>{placement.purpose}</span> : null}
          </>
        }
      >
        <Trigger
          aria-label={channelLabel}
          className="placement-icon placement-icon-button placement-icon-platform"
          {...(interactive
            ? {
                onClick: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => event.stopPropagation(),
                onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                type: "button" as const
              }
            : {})}
        >
          <PlatformGlyph channel={channel} />
        </Trigger>
      </FloatingTooltip>

      <FloatingTooltip
        className="placement-tooltip"
        content={
          <>
            <strong>{formatLabel}</strong>
            {placement?.aspectRatio ? <span>{placement.aspectRatio}</span> : null}
            {placement?.recommendedSize ? <span>{placement.recommendedSize}</span> : null}
          </>
        }
      >
        <Trigger
          aria-label={formatLabel}
          className="placement-icon placement-icon-button placement-icon-format"
          {...(interactive
            ? {
                onClick: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => event.stopPropagation(),
                onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
                type: "button" as const
              }
            : {})}
        >
          <FormatGlyph format={format} />
        </Trigger>
      </FloatingTooltip>
    </div>
  );
}

export function PlatformGlyph({ channel }: { channel: CreativeChannel }) {
  switch (channel) {
    case "instagram-feed":
    case "instagram-story":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "linkedin-feed":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="3.5" />
          <circle cx="8" cy="9" r="1.1" fill="currentColor" stroke="none" />
          <path d="M8 11.3v5.2" />
          <path d="M11.2 11.3v5.2" />
          <path d="M11.2 13.6c0-1.5 0.9-2.3 2.2-2.3 1.3 0 2.1 0.8 2.1 2.3v2.9" />
        </svg>
      );
    case "x-post":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5.5 18 18.5" />
          <path d="M18 5.5 6 18.5" />
        </svg>
      );
    case "tiktok-cover":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.5 5v8.8a3.1 3.1 0 1 1-2.6-3.1" />
          <path d="M13.5 5c0.7 1.8 2.1 3 4 3.4" />
        </svg>
      );
    case "ad-creative":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 13.2V10.8" />
          <path d="M7.2 9.3 16 6.2v11.6l-8.8-3.1z" />
          <path d="M16 9.2h1.3a2.7 2.7 0 0 1 0 5.4H16" />
          <path d="M8.1 15.7 9.6 19" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
        </svg>
      );
  }
}

function FormatGlyph({ format }: { format: CreativeFormat }) {
  switch (format) {
    case "square":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" />
        </svg>
      );
    case "portrait":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="4.8" width="8" height="14.4" rx="1.8" />
        </svg>
      );
    case "landscape":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.8" y="8" width="14.4" height="8" rx="1.8" />
        </svg>
      );
    case "story":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7.2" y="3.8" width="9.6" height="16.4" rx="2.4" />
          <path d="M9.4 7h5.2" />
          <path d="M10.4 16.9h3.2" />
        </svg>
      );
    case "cover":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7.2" y="3.8" width="9.6" height="16.4" rx="2.4" />
          <path d="m11 9.2 4 2.8-4 2.8z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
        </svg>
      );
  }
}
