import type { CreativeBrief, CreativeChannel, CreativeFormat, PostTypeRecord } from "@image-lab/contracts";
import { getDefaultFormat, getPlacementSpec } from "./placement-specs";

type PlacementState = {
  channel: CreativeChannel;
  format: CreativeFormat;
  templateType: CreativeBrief["templateType"];
};

export function resolvePlacementForPostTypeSelection(params: {
  current: PlacementState;
  postType: Pick<PostTypeRecord, "config"> | null | undefined;
}): PlacementState {
  const { current, postType } = params;
  const recommendedChannel = postType?.config.defaultChannels[0] ?? current.channel;
  const nextChannel = getPlacementSpec(current.channel, current.format)
    ? current.channel
    : recommendedChannel;

  const nextFormat = getPlacementSpec(nextChannel, current.format)
    ? current.format
    : (postType?.config.allowedFormats.find((format) => getPlacementSpec(nextChannel, format)) ??
      getDefaultFormat(nextChannel));

  return {
    channel: nextChannel,
    format: nextFormat,
    templateType: current.templateType ?? postType?.config.recommendedTemplateTypes[0] ?? "announcement"
  };
}
