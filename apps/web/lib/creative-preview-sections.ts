import type { CreativeBrief, CreativeChannel, CreativeFormat } from "@image-lab/contracts";
import { getPlacementSpec } from "./placement-specs";

export type CreativePreviewSection = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

export type CreativePreviewInput = {
  brief?: Partial<CreativeBrief> | null | undefined;
  projectName?: string | null | undefined;
  postTypeName?: string | null | undefined;
  channel?: CreativeChannel | null | undefined;
  format?: CreativeFormat | null | undefined;
  aspectRatio?: string | null | undefined;
  templateType?: CreativeBrief["templateType"] | null;
};

const CREATIVE_DIRECTION_LABELS: Partial<Record<NonNullable<CreativeBrief["templateType"]>, string>> = {
  hero: "Hero",
  "product-focus": "Product focus",
  testimonial: "Testimonial",
  announcement: "Announcement",
  quote: "Quote",
  offer: "Offer"
};

export function buildCreativePreviewSections(input: CreativePreviewInput): CreativePreviewSection[] {
  const brief = input.brief ?? null;
  const channel = input.channel ?? brief?.channel ?? null;
  const format = input.format ?? brief?.format ?? null;
  const placement = channel && format ? getPlacementSpec(channel, format) : null;
  const templateType = input.templateType ?? brief?.templateType ?? null;

  const briefItems = compactPreviewDetails([
    { label: "Brief", value: brief?.prompt },
    { label: "Audience", value: brief?.audience },
    { label: "Text mode", value: brief?.copyMode === "auto" ? "AI decides text" : brief?.copyMode === "manual" ? "Manual text" : null },
    { label: "Exact text", value: brief?.exactText }
  ]);

  const setupItems = compactPreviewDetails([
    { label: "Project", value: input.projectName },
    { label: "Post type", value: input.postTypeName },
    { label: "Channel", value: placement?.channelLabel ?? (channel ? startCase(channel) : null) },
    { label: "Format", value: placement?.formatLabel ?? (format ? startCase(format) : null) },
    { label: "Aspect ratio", value: input.aspectRatio ?? placement?.aspectRatio },
    { label: "Creative direction", value: getCreativeDirectionLabel(templateType) }
  ]);

  return [
    { title: "Brief used", items: briefItems },
    { title: "Setup", items: setupItems }
  ].filter((section) => section.items.length > 0);
}

function compactPreviewDetails(items: Array<{ label: string; value: string | null | undefined }>) {
  return items
    .map((item) => ({
      label: item.label,
      value: typeof item.value === "string" ? item.value.trim() : ""
    }))
    .filter((item) => item.value.length > 0);
}

function getCreativeDirectionLabel(templateType: CreativeBrief["templateType"] | null | undefined) {
  if (!templateType) {
    return "Auto";
  }

  return CREATIVE_DIRECTION_LABELS[templateType] ?? startCase(templateType);
}

function startCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
