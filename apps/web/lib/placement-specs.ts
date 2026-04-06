import type { CreativeChannel, CreativeFormat, CreativeJobRecord } from "@image-lab/contracts";

type PlacementSpec = {
  channel: CreativeChannel;
  format: CreativeFormat;
  channelLabel: string;
  formatLabel: string;
  purpose: string;
  recommendedSize: string;
  aspectRatio: string;
  safeZone: string;
  previewMaxWidth: number;
};

type ChannelSpec = {
  label: string;
  purpose: string;
  formats: Record<string, Omit<PlacementSpec, "channel" | "channelLabel">>;
};

const CHANNEL_SPECS: Record<CreativeChannel, ChannelSpec> = {
  "instagram-feed": {
    label: "Instagram feed",
    purpose: "Designed for in-feed posts that need to hold attention in the grid and main feed.",
    formats: {
      square: {
        format: "square",
        formatLabel: "Square",
        purpose: "Balanced feed post for grid consistency",
        recommendedSize: "1080 × 1080 px",
        aspectRatio: "1:1",
        safeZone: "Keep text inside the central 80% so grid crops still read cleanly.",
        previewMaxWidth: 520
      },
      portrait: {
        format: "portrait",
        formatLabel: "Portrait",
        purpose: "Maximum feed presence for launches and project highlights",
        recommendedSize: "1080 × 1350 px",
        aspectRatio: "4:5",
        safeZone: "Avoid the outer gutters and keep key text above the lower CTA area.",
        previewMaxWidth: 460
      },
      landscape: {
        format: "landscape",
        formatLabel: "Landscape",
        purpose: "Wide composition for architecture and lifestyle scenes",
        recommendedSize: "1080 × 566 px",
        aspectRatio: "16:9",
        safeZone: "Keep headlines away from the left and right edge trims.",
        previewMaxWidth: 760
      }
    }
  },
  "instagram-story": {
    label: "Instagram story",
    purpose: "Full-screen vertical creative for story sequences and quick-response CTAs.",
    formats: {
      story: {
        format: "story",
        formatLabel: "Story",
        purpose: "Immersive story panel",
        recommendedSize: "1080 × 1920 px",
        aspectRatio: "9:16",
        safeZone: "Keep text out of the top and bottom interface zones.",
        previewMaxWidth: 390
      }
    }
  },
  "linkedin-feed": {
    label: "LinkedIn feed",
    purpose: "Professional feed creative where messaging clarity usually matters more than decoration.",
    formats: {
      square: {
        format: "square",
        formatLabel: "Square",
        purpose: "Clean stat, quote, and announcement card",
        recommendedSize: "1200 × 1200 px",
        aspectRatio: "1:1",
        safeZone: "Center messaging for consistent previews across desktop and mobile.",
        previewMaxWidth: 520
      },
      portrait: {
        format: "portrait",
        formatLabel: "Portrait",
        purpose: "High-visibility feed card for launches and reports",
        recommendedSize: "1080 × 1350 px",
        aspectRatio: "4:5",
        safeZone: "Keep long copy in the top-middle band to avoid compression feeling.",
        previewMaxWidth: 460
      },
      landscape: {
        format: "landscape",
        formatLabel: "Landscape",
        purpose: "Default wide update visual for company posts",
        recommendedSize: "1200 × 627 px",
        aspectRatio: "16:9",
        safeZone: "Keep logos and headlines off the extreme edges for mobile previews.",
        previewMaxWidth: 760
      }
    }
  },
  "x-post": {
    label: "X post",
    purpose: "Fast-scanning post imagery where the first frame needs to read immediately.",
    formats: {
      square: {
        format: "square",
        formatLabel: "Square",
        purpose: "Compact quote card or stat graphic",
        recommendedSize: "1080 × 1080 px",
        aspectRatio: "1:1",
        safeZone: "Keep the main line centered and readable at thumbnail scale.",
        previewMaxWidth: 520
      },
      landscape: {
        format: "landscape",
        formatLabel: "Landscape",
        purpose: "Wide post visual optimized for X timelines",
        recommendedSize: "1600 × 900 px",
        aspectRatio: "16:9",
        safeZone: "Protect the center band for the message and brand mark.",
        previewMaxWidth: 760
      }
    }
  },
  "tiktok-cover": {
    label: "TikTok cover",
    purpose: "Vertical cover treatment that has to survive title overlays and profile crops.",
    formats: {
      cover: {
        format: "cover",
        formatLabel: "Cover",
        purpose: "Vertical cover frame for video-first content",
        recommendedSize: "1080 × 1920 px",
        aspectRatio: "9:16",
        safeZone: "Leave the lower third clean so overlays do not collide with the headline.",
        previewMaxWidth: 390
      }
    }
  },
  "ad-creative": {
    label: "Ad creative",
    purpose: "Paid media variants that need controlled framing and clean text hierarchy.",
    formats: {
      square: {
        format: "square",
        formatLabel: "Square",
        purpose: "Cross-platform paid social unit",
        recommendedSize: "1080 × 1080 px",
        aspectRatio: "1:1",
        safeZone: "Keep the CTA and headline in the central zone for flexible placements.",
        previewMaxWidth: 520
      },
      portrait: {
        format: "portrait",
        formatLabel: "Portrait",
        purpose: "Mobile-first ad creative with stronger vertical presence",
        recommendedSize: "1080 × 1350 px",
        aspectRatio: "4:5",
        safeZone: "Keep key information away from the outer 10% on all sides.",
        previewMaxWidth: 460
      },
      landscape: {
        format: "landscape",
        formatLabel: "Landscape",
        purpose: "Wider campaign unit for placements that favor 1.91:1",
        recommendedSize: "1200 × 628 px",
        aspectRatio: "16:9",
        safeZone: "Place headlines inside the central content band for cropping resilience.",
        previewMaxWidth: 760
      }
    }
  }
};

export function getAllowedFormats(channel: CreativeChannel) {
  return Object.values(CHANNEL_SPECS[channel].formats) as PlacementSpec[];
}

export function getPlacementSpec(channel: CreativeChannel, format: CreativeFormat) {
  const channelSpec = CHANNEL_SPECS[channel];
  return (channelSpec.formats[format] as PlacementSpec | undefined)
    ? {
        channel,
        channelLabel: channelSpec.label,
        ...(channelSpec.formats[format] as Omit<PlacementSpec, "channel" | "channelLabel">)
      }
    : null;
}

export function getDefaultFormat(channel: CreativeChannel) {
  return getAllowedFormats(channel)[0]?.format ?? "square";
}

export function getPlacementSpecFromJob(job: CreativeJobRecord | null | undefined) {
  if (!job?.briefContext) {
    return null;
  }

  return getPlacementSpec(job.briefContext.channel, job.briefContext.format);
}

export function getFormatPreviewWidth(format: CreativeFormat) {
  switch (format) {
    case "portrait":
      return 460;
    case "story":
    case "cover":
      return 390;
    case "landscape":
      return 760;
    case "square":
    default:
      return 520;
  }
}
