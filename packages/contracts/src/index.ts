import { z } from "zod";

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "editor", "viewer"]);
export const AssetKindSchema = z.enum(["reference", "logo", "product", "inspiration", "rera_qr"]);
export const ProjectStageSchema = z.enum(["pre_launch", "launch", "under_construction", "near_possession", "delivered"]);
export const ProjectStatusSchema = z.enum(["active", "archived"]);
export const FestivalCategorySchema = z.enum(["national", "religious", "cultural", "seasonal", "observance"]);
export const TemplateStatusSchema = z.enum(["draft", "approved", "archived"]);
export const TemplateAssetRoleSchema = z.enum(["primary_ref", "secondary_ref", "logo_ref", "overlay_ref"]);
export const CalendarItemStatusSchema = z.enum([
  "planned",
  "brief_ready",
  "generating",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived"
]);
export const ObjectiveCodeSchema = z.enum(["awareness", "engagement", "lead_gen", "trust", "footfall"]);
export const DeliverableStatusSchema = z.enum([
  "planned",
  "brief_ready",
  "generating",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
  "blocked"
]);
export const DeliverablePrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const PostVersionStatusSchema = z.enum(["draft", "in_review", "approved", "rejected", "archived"]);
export const ApprovalActionSchema = z.enum(["approve", "request_changes", "reject", "close"]);
export const PublicationStatusSchema = z.enum(["draft", "scheduled", "publishing", "published", "failed", "cancelled"]);
export const ChannelPlatformSchema = z.enum(["instagram", "facebook", "linkedin", "x", "whatsapp", "ads"]);
export const ContentFormatSchema = z.enum(["static", "carousel", "video", "story"]);
export const WeekdayCodeSchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export const PlacementCodeSchema = z.enum([
  "instagram-feed",
  "instagram-story",
  "linkedin-feed",
  "x-post",
  "tiktok-cover",
  "ad-creative"
]);
export const CampaignStatusSchema = z.enum(["draft", "active", "paused", "completed", "archived"]);
export const SeriesStatusSchema = z.enum(["draft", "active", "paused", "archived"]);
export const PlanningModeSchema = z.enum(["campaign", "series", "one_off", "always_on", "ad_hoc"]);
export const QueueStatusGroupSchema = z.enum(["todo", "in_progress", "ready_to_ship", "done", "blocked"]);
export const PostVersionAssetRoleSchema = z.enum(["primary", "supporting", "logo", "source"]);
export const CreativeChannelSchema = z.enum([
  "instagram-feed",
  "instagram-story",
  "linkedin-feed",
  "x-post",
  "tiktok-cover",
  "ad-creative"
]);
export const CreativeFormatSchema = z.enum(["square", "portrait", "landscape", "story", "cover"]);
export const TemplateTypeSchema = z.enum([
  "hero",
  "product-focus",
  "testimonial",
  "announcement",
  "quote",
  "offer"
]);
export const SeriesOutputKindSchema = z.enum(["single_image", "carousel"]);
export const JobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled"
]);
export const JobTypeSchema = z.enum(["style_seed", "final"]);
export const OutputVerdictSchema = z.enum(["approved", "close", "off-brand", "wrong-layout", "wrong-text"]);
export const OutputReviewStateSchema = z.enum(["pending_review", "approved", "needs_revision", "closed"]);
export const CreateModeSchema = z.enum(["post", "series_episode", "campaign_asset", "adaptation"]);
const JsonRecordSchema = z.record(z.string(), z.unknown());

const BrandIdentitySchema = z.object({
  positioning: z.string().default(""),
  promise: z.string().default(""),
  audienceSummary: z.string().default("")
});

const BrandVoiceSchema = z.object({
  summary: z.string().min(1),
  adjectives: z.array(z.string()).min(2),
  approvedVocabulary: z.array(z.string()).default([]),
  bannedPhrases: z.array(z.string()).default([])
});

const BrandVisualSystemSchema = z.object({
  typographyMood: z.string().default(""),
  compositionPrinciples: z.array(z.string()).default([]),
  imageTreatment: z.array(z.string()).default([]),
  textDensity: z.enum(["minimal", "balanced", "dense"]).default("balanced"),
  realismLevel: z.enum(["documentary", "elevated_real", "stylized"]).default("elevated_real")
});

const BrandComplianceSchema = z.object({
  bannedClaims: z.array(z.string()).default([]),
  reviewChecks: z.array(z.string()).default([])
});

const BrandReferenceCanonSchema = z.object({
  antiReferenceNotes: z.array(z.string()).default([]),
  usageNotes: z.array(z.string()).default([])
});

export const BrandProfileSchema = z.object({
  identity: BrandIdentitySchema.default({
    positioning: "",
    promise: "",
    audienceSummary: ""
  }),
  voice: BrandVoiceSchema,
  palette: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    accent: z.string().min(1),
    neutrals: z.array(z.string()).default([])
  }),
  styleDescriptors: z.array(z.string()).min(3),
  visualSystem: BrandVisualSystemSchema.default({
    typographyMood: "",
    compositionPrinciples: [],
    imageTreatment: [],
    textDensity: "balanced",
    realismLevel: "elevated_real"
  }),
  doRules: z.array(z.string()).default([]),
  dontRules: z.array(z.string()).default([]),
  bannedPatterns: z.array(z.string()).default([]),
  compliance: BrandComplianceSchema.default({
    bannedClaims: [],
    reviewChecks: []
  }),
  referenceAssetIds: z.array(z.string().uuid()).default([]),
  referenceCanon: BrandReferenceCanonSchema.default({
    antiReferenceNotes: [],
    usageNotes: []
  })
});

export const CreateBrandSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
  profile: BrandProfileSchema
});

export const UpdateBrandSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
  profile: BrandProfileSchema
});

const ProjectFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1)
});

export const ProjectProfileSchema = z.object({
  tagline: z.string().default(""),
  possessionStatus: z.string().default(""),
  reraNumber: z.string().default(""),
  positioning: z.string().default(""),
  audienceSegments: z.array(z.string()).default([]),
  lifestyleAngle: z.string().default(""),
  configurations: z.array(z.string()).default([]),
  sizeRanges: z.array(z.string()).default([]),
  towersCount: z.string().default(""),
  floorsCount: z.string().default(""),
  totalUnits: z.string().default(""),
  specialUnitTypes: z.array(z.string()).default([]),
  parkingFacts: z.string().default(""),
  pricingBand: z.string().default(""),
  startingPrice: z.string().default(""),
  priceRangeByConfig: z.array(z.string()).default([]),
  bookingAmount: z.string().default(""),
  paymentPlanSummary: z.string().default(""),
  currentOffers: z.array(z.string()).default([]),
  financingPartners: z.array(z.string()).default([]),
  offerValidity: z.string().default(""),
  amenities: z.array(z.string()).default([]),
  heroAmenities: z.array(z.string()).default([]),
  nearbyLandmarks: z.array(z.string()).default([]),
  connectivityPoints: z.array(z.string()).default([]),
  travelTimes: z.array(z.string()).default([]),
  locationAdvantages: z.array(z.string()).default([]),
  constructionStatus: z.string().default(""),
  milestoneHistory: z.array(z.string()).default([]),
  latestUpdate: z.string().default(""),
  completionWindow: z.string().default(""),
  approvedClaims: z.array(z.string()).default([]),
  bannedClaims: z.array(z.string()).default([]),
  legalNotes: z.array(z.string()).default([]),
  approvalsSummary: z.string().default(""),
  credibilityFacts: z.array(z.string()).default([]),
  investorAngle: z.string().default(""),
  endUserAngle: z.string().default(""),
  keyObjections: z.array(z.string()).default([]),
  faqs: z.array(ProjectFaqSchema).default([]),
  actualProjectImageIds: z.array(z.string().uuid()).default([]),
  sampleFlatImageIds: z.array(z.string().uuid()).default([])
});

export const CreateProjectSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  city: z.string().max(120).optional(),
  microLocation: z.string().max(120).optional(),
  projectType: z.string().max(120).optional(),
  stage: ProjectStageSchema.default("launch"),
  profile: ProjectProfileSchema
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  city: z.string().max(120).optional(),
  microLocation: z.string().max(120).optional(),
  projectType: z.string().max(120).optional(),
  stage: ProjectStageSchema,
  status: ProjectStatusSchema.default("active"),
  profile: ProjectProfileSchema
});

export const FestivalSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable().default(null),
  code: z.string(),
  name: z.string(),
  category: FestivalCategorySchema,
  community: z.string().nullable().default(null),
  regions: z.array(z.string()).default([]),
  meaning: z.string(),
  dateLabel: z.string().nullable().default(null),
  nextOccursOn: z.string().nullable().default(null),
  active: z.boolean(),
  sortOrder: z.number().int().default(0)
});

export const PostTypeConfigSchema = z.object({
  defaultChannels: z.array(CreativeChannelSchema).default([]),
  allowedFormats: z.array(CreativeFormatSchema).default([]),
  recommendedTemplateTypes: z.array(TemplateTypeSchema).default([]),
  requiredBriefFields: z.array(z.string()).default([]),
  safeZoneGuidance: z.array(z.string()).default([]),
  ctaStyle: z.string().optional(),
  copyDensity: z.enum(["minimal", "balanced", "dense"]).optional()
});

export const CreatePostTypeSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  config: PostTypeConfigSchema,
  active: z.boolean().default(true)
});

export const UpdatePostTypeSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  config: PostTypeConfigSchema,
  active: z.boolean().default(true)
});

export const CreativeTemplateConfigSchema = z.object({
  promptScaffold: z.string().default(""),
  safeZoneNotes: z.array(z.string()).default([]),
  approvedUseCases: z.array(z.string()).default([]),
  templateFamily: z.string().default(""),
  outputKinds: z.array(SeriesOutputKindSchema).default([]),
  defaultSlideCount: z.number().int().min(2).max(10).nullable().default(null),
  allowedSlideCounts: z.array(z.number().int().min(2).max(10)).default([]),
  seriesUseCases: z.array(z.string()).default([]),
  carouselRecipe: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  textZones: z.array(
    z.object({
      name: z.string(),
      guidance: z.string().optional()
    })
  ).default([])
});

export const CreateCreativeTemplateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  postTypeId: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  status: TemplateStatusSchema.default("draft"),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  basePrompt: z.string().default(""),
  previewStoragePath: z.string().optional(),
  config: CreativeTemplateConfigSchema,
  assetIds: z.array(z.string().uuid()).default([])
});

export const UpdateCreativeTemplateSchema = z.object({
  name: z.string().min(2).max(120),
  status: TemplateStatusSchema,
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  basePrompt: z.string().default(""),
  previewStoragePath: z.string().optional(),
  config: CreativeTemplateConfigSchema,
  assetIds: z.array(z.string().uuid()).default([])
});

export const CreateCalendarItemSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid(),
  postTypeId: z.string().uuid(),
  creativeTemplateId: z.string().uuid().optional(),
  title: z.string().min(2).max(160),
  objective: z.string().max(240).optional(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  scheduledFor: z.string(),
  status: CalendarItemStatusSchema.default("planned"),
  ownerUserId: z.string().uuid().optional(),
  notesJson: z.record(z.string(), z.unknown()).default({})
});

export const UpdateCalendarItemSchema = z.object({
  title: z.string().min(2).max(160),
  objective: z.string().max(240).optional(),
  creativeTemplateId: z.string().uuid().optional(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  scheduledFor: z.string(),
  status: CalendarItemStatusSchema,
  ownerUserId: z.string().uuid().optional(),
  approvedOutputId: z.string().uuid().optional(),
  notesJson: JsonRecordSchema.default({})
});

export const CreateBrandPersonaSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  attributesJson: JsonRecordSchema.default({}),
  active: z.boolean().default(true)
});

export const UpdateBrandPersonaSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  attributesJson: JsonRecordSchema.default({}),
  active: z.boolean().default(true)
});

export const CreateContentPillarSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  active: z.boolean().default(true)
});

export const UpdateContentPillarSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(240).optional(),
  active: z.boolean().default(true)
});

export const CreateChannelAccountSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  platform: ChannelPlatformSchema,
  handle: z.string().min(2).max(160),
  displayName: z.string().max(160).optional(),
  timezone: z.string().max(120).optional(),
  externalAccountId: z.string().max(160).optional(),
  configJson: JsonRecordSchema.default({}),
  active: z.boolean().default(true)
});

export const UpdateChannelAccountSchema = z.object({
  platform: ChannelPlatformSchema,
  handle: z.string().min(2).max(160),
  displayName: z.string().max(160).optional(),
  timezone: z.string().max(120).optional(),
  externalAccountId: z.string().max(160).optional(),
  configJson: JsonRecordSchema.default({}),
  active: z.boolean().default(true)
});

const LocalTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM or HH:MM:SS");

export const CreatePostingWindowSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  channel: CreativeChannelSchema,
  weekday: WeekdayCodeSchema,
  localTime: LocalTimeSchema,
  timezone: z.string().max(120).optional(),
  label: z.string().max(120).optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
});

export const UpdatePostingWindowSchema = z.object({
  channel: CreativeChannelSchema,
  weekday: WeekdayCodeSchema,
  localTime: LocalTimeSchema,
  timezone: z.string().max(120).optional(),
  label: z.string().max(120).optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
});

export const CreateCampaignSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  name: z.string().min(2).max(160),
  objectiveCode: ObjectiveCodeSchema.default("awareness"),
  targetPersonaId: z.string().uuid().optional(),
  primaryProjectId: z.string().uuid().optional(),
  projectIds: z.array(z.string().uuid()).default([]),
  keyMessage: z.string().default(""),
  ctaText: z.string().max(240).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  kpiGoalJson: JsonRecordSchema.default({}),
  status: CampaignStatusSchema.default("draft"),
  notesJson: JsonRecordSchema.default({})
});

export const UpdateCampaignSchema = z.object({
  name: z.string().min(2).max(160),
  objectiveCode: ObjectiveCodeSchema,
  targetPersonaId: z.string().uuid().optional(),
  primaryProjectId: z.string().uuid().optional(),
  projectIds: z.array(z.string().uuid()).default([]),
  keyMessage: z.string().default(""),
  ctaText: z.string().max(240).optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  kpiGoalJson: JsonRecordSchema.default({}),
  status: CampaignStatusSchema,
  notesJson: JsonRecordSchema.default({})
});

export const SeriesCadenceSchema = z.object({
  frequency: z.enum(["weekly"]).default("weekly"),
  interval: z.number().int().min(1).default(1),
  weekdays: z.array(WeekdayCodeSchema).default([]),
  occurrencesAhead: z.number().int().min(1).max(90).default(30)
});

export const CreateSeriesSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  contentPillarId: z.string().uuid().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(500).optional(),
  objectiveCode: ObjectiveCodeSchema.optional(),
  postTypeId: z.string().uuid().optional(),
  creativeTemplateId: z.string().uuid().optional(),
  channelAccountId: z.string().uuid().optional(),
  placementCode: PlacementCodeSchema.optional(),
  contentFormat: ContentFormatSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  cadence: SeriesCadenceSchema.default({}),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  status: SeriesStatusSchema.default("draft"),
  sourceBriefJson: JsonRecordSchema.default({})
});

export const UpdateSeriesSchema = z.object({
  projectId: z.string().uuid().optional(),
  contentPillarId: z.string().uuid().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(500).optional(),
  objectiveCode: ObjectiveCodeSchema.optional(),
  postTypeId: z.string().uuid().optional(),
  creativeTemplateId: z.string().uuid().optional(),
  channelAccountId: z.string().uuid().optional(),
  placementCode: PlacementCodeSchema.optional(),
  contentFormat: ContentFormatSchema.optional(),
  ownerUserId: z.string().uuid().optional(),
  cadence: SeriesCadenceSchema.default({}),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  status: SeriesStatusSchema,
  sourceBriefJson: JsonRecordSchema.default({})
});

export const CreateCampaignDeliverablePlanSchema = z.object({
  name: z.string().min(2).max(160),
  postTypeId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  channelAccountId: z.string().uuid().optional(),
  placementCode: PlacementCodeSchema,
  contentFormat: ContentFormatSchema.default("static"),
  objectiveOverride: ObjectiveCodeSchema.optional(),
  ctaOverride: z.string().max(240).optional(),
  briefOverride: z.string().max(1000).optional(),
  scheduledOffsetDays: z.number().int().optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true)
});

export const UpdateCampaignDeliverablePlanSchema = CreateCampaignDeliverablePlanSchema;

export const CreateDeliverableSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable().default(null),
  campaignId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  contentPillarId: z.string().uuid().optional(),
  postTypeId: z.string().uuid(),
  creativeTemplateId: z.string().uuid().optional(),
  channelAccountId: z.string().uuid().optional(),
  planningMode: PlanningModeSchema.default("one_off"),
  objectiveCode: ObjectiveCodeSchema.default("awareness"),
  placementCode: PlacementCodeSchema,
  contentFormat: ContentFormatSchema.default("static"),
  title: z.string().min(2).max(200),
  briefText: z.string().max(4000).optional(),
  ctaText: z.string().max(240).optional(),
  scheduledFor: z.string(),
  dueAt: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  priority: DeliverablePrioritySchema.default("normal"),
  status: DeliverableStatusSchema.default("planned"),
  seriesOccurrenceDate: z.string().optional(),
  sourceJson: JsonRecordSchema.default({})
});

export const UpdateDeliverableSchema = z.object({
  projectId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
  personaId: z.string().uuid().optional(),
  contentPillarId: z.string().uuid().optional(),
  postTypeId: z.string().uuid(),
  creativeTemplateId: z.string().uuid().optional(),
  channelAccountId: z.string().uuid().optional(),
  planningMode: PlanningModeSchema,
  objectiveCode: ObjectiveCodeSchema,
  placementCode: PlacementCodeSchema,
  contentFormat: ContentFormatSchema,
  title: z.string().min(2).max(200),
  briefText: z.string().max(4000).optional(),
  ctaText: z.string().max(240).optional(),
  scheduledFor: z.string(),
  dueAt: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  priority: DeliverablePrioritySchema,
  status: DeliverableStatusSchema,
  approvedPostVersionId: z.string().uuid().optional(),
  seriesOccurrenceDate: z.string().optional(),
  sourceJson: JsonRecordSchema.default({})
});

export const CreatePostVersionSchema = z.object({
  creativeOutputId: z.string().uuid().optional(),
  status: PostVersionStatusSchema.default("draft"),
  headline: z.string().max(240).optional(),
  caption: z.string().max(4000).optional(),
  bodyJson: JsonRecordSchema.default({}),
  ctaText: z.string().max(240).optional(),
  hashtags: z.array(z.string()).default([]),
  notesJson: JsonRecordSchema.default({}),
  createdFromTemplateId: z.string().uuid().optional()
});

export const ApprovalDecisionSchema = z.object({
  action: ApprovalActionSchema,
  comment: z.string().max(1000).optional(),
  metadataJson: JsonRecordSchema.default({})
});

export const CreatePublicationSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid(),
  postVersionId: z.string().uuid(),
  channelAccountId: z.string().uuid().optional(),
  scheduledFor: z.string().optional(),
  status: PublicationStatusSchema.default("draft"),
  provider: z.string().max(120).optional(),
  providerPublicationId: z.string().max(160).optional(),
  providerPayloadJson: JsonRecordSchema.default({})
});

export const UpdatePublicationSchema = z.object({
  channelAccountId: z.string().uuid().optional(),
  scheduledFor: z.string().optional(),
  publishedAt: z.string().optional(),
  status: PublicationStatusSchema,
  provider: z.string().max(120).optional(),
  providerPublicationId: z.string().max(160).optional(),
  providerPayloadJson: JsonRecordSchema.default({}),
  errorJson: JsonRecordSchema.optional()
});

export const CreativeBriefSchema = z.object({
  brandId: z.string().uuid(),
  createMode: CreateModeSchema.default("post"),
  deliverableId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  campaignPlanId: z.string().uuid().optional(),
  seriesId: z.string().uuid().optional(),
  festivalId: z.string().uuid().optional(),
  sourceOutputId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  postTypeId: z.string().uuid().optional(),
  creativeTemplateId: z.string().uuid().optional(),
  calendarItemId: z.string().uuid().optional(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  seriesOutputKind: SeriesOutputKindSchema.optional(),
  slideCount: z.number().int().min(2).max(10).optional(),
  goal: z.string().min(3),
  prompt: z.string().min(10),
  audience: z.string().optional(),
  offer: z.string().optional(),
  exactText: z.string().optional(),
  referenceAssetIds: z.array(z.string().uuid()).default([]),
  includeBrandLogo: z.boolean().default(false),
  includeReraQr: z.boolean().default(false),
  templateType: TemplateTypeSchema.optional()
});

export const PromptPackageSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid().nullable().default(null),
  creativeTemplateId: z.string().uuid().nullable().default(null),
  calendarItemId: z.string().uuid().nullable().default(null),
  creativeRequestId: z.string().uuid(),
  brandProfileVersionId: z.string().uuid(),
  promptSummary: z.string(),
  seedPrompt: z.string(),
  finalPrompt: z.string(),
  aspectRatio: z.string(),
  chosenModel: z.string(),
  templateType: TemplateTypeSchema.optional(),
  referenceStrategy: z.enum(["generated-template", "uploaded-references", "hybrid"]),
  referenceAssetIds: z.array(z.string().uuid()),
  resolvedConstraints: z.record(z.string(), z.unknown()),
  compilerTrace: z.record(z.string(), z.unknown()).default({})
});

export const StyleSeedRequestSchema = z.object({
  promptPackageId: z.string().uuid(),
  count: z.number().int().min(1).max(4)
});

export const FinalGenerationRequestSchema = z.object({
  promptPackageId: z.string().uuid(),
  selectedTemplateId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(4)
});

export const FeedbackRequestSchema = z.object({
  verdict: OutputVerdictSchema,
  reason: z.string().min(3),
  notes: z.string().max(500).optional()
});

export const FeedbackResultSchema = z.object({
  ok: z.literal(true),
  reviewState: OutputReviewStateSchema,
  deliverableId: z.string().uuid(),
  postVersionId: z.string().uuid()
});

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: WorkspaceRoleSchema
});

export const BrandSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  currentProfileVersionId: z.string().uuid().nullable()
});

export const BrandProfileVersionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  versionNumber: z.number().int(),
  profile: BrandProfileSchema
});

export const BrandDetailSchema = z.object({
  brand: BrandSchema,
  activeProfile: BrandProfileVersionSchema.nullable(),
  assetCounts: z.object({
    total: z.number().int(),
    reference: z.number().int(),
    logo: z.number().int(),
    reraQr: z.number().int(),
    product: z.number().int(),
    inspiration: z.number().int()
  })
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  city: z.string().nullable(),
  microLocation: z.string().nullable(),
  projectType: z.string().nullable(),
  stage: ProjectStageSchema,
  status: ProjectStatusSchema,
  description: z.string().nullable(),
  currentProfileVersionId: z.string().uuid().nullable()
});

export const ProjectProfileVersionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  versionNumber: z.number().int(),
  profile: ProjectProfileSchema
});

export const ProjectDetailSchema = z.object({
  project: ProjectSchema,
  activeProfile: ProjectProfileVersionSchema.nullable()
});

export const BrandPersonaSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  attributesJson: JsonRecordSchema.default({}),
  active: z.boolean()
});

export const ContentPillarSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean()
});

export const ChannelAccountSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  platform: ChannelPlatformSchema,
  handle: z.string(),
  displayName: z.string().nullable(),
  timezone: z.string().nullable(),
  externalAccountId: z.string().nullable(),
  configJson: JsonRecordSchema.default({}),
  active: z.boolean()
});

export const PostingWindowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  channel: CreativeChannelSchema,
  weekday: WeekdayCodeSchema,
  localTime: z.string(),
  timezone: z.string().nullable(),
  label: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int()
});

export const PostTypeSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  config: PostTypeConfigSchema,
  isSystem: z.boolean(),
  active: z.boolean()
});

export const BrandAssetSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable().default(null),
  kind: AssetKindSchema,
  label: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  storagePath: z.string(),
  previewUrl: z.string().url().optional()
});

export const StyleTemplateSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid().nullable().default(null),
  creativeTemplateId: z.string().uuid().nullable().default(null),
  calendarItemId: z.string().uuid().nullable().default(null),
  source: z.enum(["generated", "uploaded"]),
  label: z.string(),
  storagePath: z.string(),
  creativeOutputId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable().default(null),
  previewUrl: z.string().url().optional()
});

export const CreativeTemplateSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  postTypeId: z.string().uuid().nullable(),
  name: z.string(),
  status: TemplateStatusSchema,
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  basePrompt: z.string(),
  previewStoragePath: z.string().nullable(),
  previewUrl: z.string().url().optional(),
  createdFromOutputId: z.string().uuid().nullable(),
  config: CreativeTemplateConfigSchema
});

export const CreativeTemplateAssetSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  assetId: z.string().uuid(),
  role: TemplateAssetRoleSchema,
  sortOrder: z.number().int()
});

export const CreativeTemplateDetailSchema = z.object({
  template: CreativeTemplateSchema,
  assets: z.array(CreativeTemplateAssetSchema)
});

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string(),
  objectiveCode: ObjectiveCodeSchema,
  targetPersonaId: z.string().uuid().nullable(),
  primaryProjectId: z.string().uuid().nullable(),
  projectIds: z.array(z.string().uuid()).default([]),
  keyMessage: z.string(),
  ctaText: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  kpiGoalJson: JsonRecordSchema.default({}),
  status: CampaignStatusSchema,
  notesJson: JsonRecordSchema.default({})
});

export const SeriesSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  contentPillarId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  objectiveCode: ObjectiveCodeSchema.nullable(),
  postTypeId: z.string().uuid().nullable(),
  creativeTemplateId: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
  placementCode: PlacementCodeSchema.nullable(),
  contentFormat: ContentFormatSchema.nullable(),
  ownerUserId: z.string().uuid().nullable(),
  cadence: SeriesCadenceSchema,
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  status: SeriesStatusSchema,
  sourceBriefJson: JsonRecordSchema.default({})
});

export const CampaignDeliverablePlanSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string(),
  postTypeId: z.string().uuid(),
  templateId: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
  placementCode: PlacementCodeSchema,
  contentFormat: ContentFormatSchema,
  objectiveOverride: ObjectiveCodeSchema.nullable(),
  ctaOverride: z.string().nullable(),
  briefOverride: z.string().nullable(),
  scheduledOffsetDays: z.number().int().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean()
});

export const DeliverableSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  campaignId: z.string().uuid().nullable(),
  seriesId: z.string().uuid().nullable(),
  personaId: z.string().uuid().nullable(),
  contentPillarId: z.string().uuid().nullable(),
  postTypeId: z.string().uuid(),
  creativeTemplateId: z.string().uuid().nullable(),
  channelAccountId: z.string().uuid().nullable(),
  planningMode: PlanningModeSchema,
  objectiveCode: ObjectiveCodeSchema,
  placementCode: PlacementCodeSchema,
  contentFormat: ContentFormatSchema,
  title: z.string(),
  briefText: z.string().nullable(),
  ctaText: z.string().nullable(),
  scheduledFor: z.string(),
  dueAt: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  priority: DeliverablePrioritySchema,
  status: DeliverableStatusSchema,
  approvedPostVersionId: z.string().uuid().nullable(),
  latestPostVersionId: z.string().uuid().nullable(),
  seriesOccurrenceDate: z.string().nullable(),
  sourceJson: JsonRecordSchema.default({}),
  previewUrl: z.string().url().optional()
});

export const PostVersionSchema = z.object({
  id: z.string().uuid(),
  deliverableId: z.string().uuid(),
  versionNumber: z.number().int(),
  status: PostVersionStatusSchema,
  headline: z.string().nullable(),
  caption: z.string().nullable(),
  bodyJson: JsonRecordSchema.default({}),
  ctaText: z.string().nullable(),
  hashtags: z.array(z.string()).default([]),
  notesJson: JsonRecordSchema.default({}),
  createdFromPromptPackageId: z.string().uuid().nullable(),
  createdFromTemplateId: z.string().uuid().nullable(),
  createdFromOutputId: z.string().uuid().nullable(),
  previewUrl: z.string().url().optional()
});

export const PostVersionAssetSchema = z.object({
  id: z.string().uuid(),
  postVersionId: z.string().uuid(),
  creativeOutputId: z.string().uuid().nullable(),
  brandAssetId: z.string().uuid().nullable(),
  assetRole: PostVersionAssetRoleSchema,
  sortOrder: z.number().int()
});

export const ApprovalEventSchema = z.object({
  id: z.string().uuid(),
  deliverableId: z.string().uuid(),
  postVersionId: z.string().uuid().nullable(),
  reviewerUserId: z.string().uuid().nullable(),
  action: ApprovalActionSchema,
  comment: z.string().nullable(),
  metadataJson: JsonRecordSchema.default({}),
  createdAt: z.string()
});

export const PublicationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid(),
  postVersionId: z.string().uuid(),
  channelAccountId: z.string().uuid().nullable(),
  scheduledFor: z.string().nullable(),
  publishedAt: z.string().nullable(),
  status: PublicationStatusSchema,
  provider: z.string().nullable(),
  providerPublicationId: z.string().nullable(),
  providerPayloadJson: JsonRecordSchema.default({}),
  errorJson: JsonRecordSchema.nullable().default(null)
});

export const DeliverableDetailSchema = z.object({
  deliverable: DeliverableSchema,
  series: SeriesSchema.nullable().default(null),
  postVersions: z.array(PostVersionSchema),
  publications: z.array(PublicationSchema)
});

export const CreativeOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid().nullable().default(null),
  creativeTemplateId: z.string().uuid().nullable().default(null),
  calendarItemId: z.string().uuid().nullable().default(null),
  jobId: z.string().uuid(),
  postVersionId: z.string().uuid().nullable().default(null),
  kind: JobTypeSchema,
  storagePath: z.string(),
  providerUrl: z.string().url().nullable(),
  outputIndex: z.number().int(),
  reviewState: OutputReviewStateSchema,
  latestVerdict: OutputVerdictSchema.nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  previewUrl: z.string().url().optional()
});

export const CreativeJobSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid().nullable().default(null),
  creativeTemplateId: z.string().uuid().nullable().default(null),
  calendarItemId: z.string().uuid().nullable().default(null),
  promptPackageId: z.string().uuid(),
  selectedTemplateId: z.string().uuid().nullable(),
  jobType: JobTypeSchema,
  status: JobStatusSchema,
  provider: z.string(),
  providerModel: z.string(),
  providerRequestId: z.string().nullable(),
  requestedCount: z.number().int(),
  briefContext: z
    .object({
      channel: CreativeChannelSchema,
      format: CreativeFormatSchema,
      aspectRatio: z.string(),
      templateType: TemplateTypeSchema.optional()
    })
    .nullable()
    .default(null),
  outputs: z.array(CreativeOutputSchema).default([]),
  error: z.record(z.string(), z.unknown()).nullable().default(null)
});

export const CreativeRunSummarySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid().nullable().default(null),
  creativeTemplateId: z.string().uuid().nullable().default(null),
  calendarItemId: z.string().uuid().nullable().default(null),
  brandName: z.string(),
  creativeRequestId: z.string().uuid(),
  promptSummary: z.string(),
  chosenModel: z.string(),
  referenceStrategy: z.enum(["generated-template", "uploaded-references", "hybrid"]),
  templateType: TemplateTypeSchema.optional(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  aspectRatio: z.string(),
  goal: z.string(),
  createdAt: z.string(),
  status: JobStatusSchema,
  latestJobId: z.string().uuid().nullable(),
  seedJobCount: z.number().int(),
  finalJobCount: z.number().int(),
  seedTemplateCount: z.number().int(),
  finalOutputCount: z.number().int()
});

export const CalendarItemSchema = z.object({
  id: z.string().uuid(),
  deliverableId: z.string().uuid().nullable().default(null),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable().default(null),
  postTypeId: z.string().uuid(),
  creativeTemplateId: z.string().uuid().nullable(),
  approvedOutputId: z.string().uuid().nullable(),
  title: z.string(),
  objective: z.string().nullable(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  scheduledFor: z.string(),
  status: CalendarItemStatusSchema,
  ownerUserId: z.string().uuid().nullable(),
  notesJson: JsonRecordSchema.default({})
});

export const ReviewQueueEntrySchema = z.object({
  deliverable: DeliverableSchema,
  postVersion: PostVersionSchema,
  previewOutput: CreativeOutputSchema.nullable()
});

export const WorkspaceMemberSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: WorkspaceRoleSchema
});

export const QueueEntrySchema = z.object({
  deliverable: DeliverableSchema,
  assignee: WorkspaceMemberSchema.nullable(),
  campaign: CampaignSchema.nullable().default(null),
  series: SeriesSchema.nullable().default(null),
  projectName: z.string().nullable(),
  nextActionLabel: z.string(),
  statusGroup: QueueStatusGroupSchema
});

const HomeOverviewSectionSchema = z.object({
  count: z.number().int(),
  items: z.array(DeliverableSchema)
});

export const HomeOverviewSchema = z.object({
  dueToday: HomeOverviewSectionSchema,
  needsReview: HomeOverviewSectionSchema,
  approvedNotScheduled: HomeOverviewSectionSchema,
  thisWeek: HomeOverviewSectionSchema,
  blocked: HomeOverviewSectionSchema
});

export const PlanOverviewSchema = z.object({
  activeCampaigns: z.array(CampaignSchema),
  activeSeries: z.array(SeriesSchema),
  unscheduledPostTasks: z.array(DeliverableSchema),
  upcomingPostTasks: z.array(DeliverableSchema)
});

export const CreativeRunDetailSchema = z.object({
  run: CreativeRunSummarySchema,
  brief: CreativeBriefSchema,
  promptPackage: PromptPackageSchema,
  jobs: z.array(CreativeJobSchema),
  seedTemplates: z.array(StyleTemplateSchema),
  finalOutputs: z.array(CreativeOutputSchema)
});

export const BootstrapResponseSchema = z.object({
  viewer: z.object({
    id: z.string().uuid(),
    email: z.string().email().optional()
  }),
  workspace: WorkspaceSchema.nullable(),
  brands: z.array(BrandSchema),
  brandAssets: z.array(BrandAssetSchema),
  styleTemplates: z.array(StyleTemplateSchema),
  recentJobs: z.array(CreativeJobSchema),
  recentOutputs: z.array(CreativeOutputSchema)
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type AssetKind = z.infer<typeof AssetKindSchema>;
export type ProjectStage = z.infer<typeof ProjectStageSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type FestivalCategory = z.infer<typeof FestivalCategorySchema>;
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;
export type TemplateAssetRole = z.infer<typeof TemplateAssetRoleSchema>;
export type CalendarItemStatus = z.infer<typeof CalendarItemStatusSchema>;
export type ObjectiveCode = z.infer<typeof ObjectiveCodeSchema>;
export type DeliverableStatus = z.infer<typeof DeliverableStatusSchema>;
export type DeliverablePriority = z.infer<typeof DeliverablePrioritySchema>;
export type PostVersionStatus = z.infer<typeof PostVersionStatusSchema>;
export type ApprovalAction = z.infer<typeof ApprovalActionSchema>;
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
export type ChannelPlatform = z.infer<typeof ChannelPlatformSchema>;
export type ContentFormat = z.infer<typeof ContentFormatSchema>;
export type WeekdayCode = z.infer<typeof WeekdayCodeSchema>;
export type PlacementCode = z.infer<typeof PlacementCodeSchema>;
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type SeriesStatus = z.infer<typeof SeriesStatusSchema>;
export type PlanningMode = z.infer<typeof PlanningModeSchema>;
export type QueueStatusGroup = z.infer<typeof QueueStatusGroupSchema>;
export type PostVersionAssetRole = z.infer<typeof PostVersionAssetRoleSchema>;
export type CreativeChannel = z.infer<typeof CreativeChannelSchema>;
export type CreativeFormat = z.infer<typeof CreativeFormatSchema>;
export type OutputVerdict = z.infer<typeof OutputVerdictSchema>;
export type OutputReviewState = z.infer<typeof OutputReviewStateSchema>;
export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type CreateBrandInput = z.infer<typeof CreateBrandSchema>;
export type UpdateBrandInput = z.infer<typeof UpdateBrandSchema>;
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type PostTypeConfig = z.infer<typeof PostTypeConfigSchema>;
export type CreatePostTypeInput = z.infer<typeof CreatePostTypeSchema>;
export type UpdatePostTypeInput = z.infer<typeof UpdatePostTypeSchema>;
export type CreateCreativeTemplateInput = z.infer<typeof CreateCreativeTemplateSchema>;
export type UpdateCreativeTemplateInput = z.infer<typeof UpdateCreativeTemplateSchema>;
export type CreateCalendarItemInput = z.infer<typeof CreateCalendarItemSchema>;
export type UpdateCalendarItemInput = z.infer<typeof UpdateCalendarItemSchema>;
export type CreateBrandPersonaInput = z.infer<typeof CreateBrandPersonaSchema>;
export type UpdateBrandPersonaInput = z.infer<typeof UpdateBrandPersonaSchema>;
export type CreateContentPillarInput = z.infer<typeof CreateContentPillarSchema>;
export type UpdateContentPillarInput = z.infer<typeof UpdateContentPillarSchema>;
export type CreateChannelAccountInput = z.infer<typeof CreateChannelAccountSchema>;
export type UpdateChannelAccountInput = z.infer<typeof UpdateChannelAccountSchema>;
export type CreatePostingWindowInput = z.infer<typeof CreatePostingWindowSchema>;
export type UpdatePostingWindowInput = z.infer<typeof UpdatePostingWindowSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type SeriesCadence = z.infer<typeof SeriesCadenceSchema>;
export type CreateSeriesInput = z.infer<typeof CreateSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof UpdateSeriesSchema>;
export type CreateCampaignDeliverablePlanInput = z.infer<typeof CreateCampaignDeliverablePlanSchema>;
export type UpdateCampaignDeliverablePlanInput = z.infer<typeof UpdateCampaignDeliverablePlanSchema>;
export type CreateDeliverableInput = z.infer<typeof CreateDeliverableSchema>;
export type UpdateDeliverableInput = z.infer<typeof UpdateDeliverableSchema>;
export type CreatePostVersionInput = z.infer<typeof CreatePostVersionSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionSchema>;
export type CreatePublicationInput = z.infer<typeof CreatePublicationSchema>;
export type UpdatePublicationInput = z.infer<typeof UpdatePublicationSchema>;
export type CreateMode = z.infer<typeof CreateModeSchema>;
export type SeriesOutputKind = z.infer<typeof SeriesOutputKindSchema>;
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;
export type PromptPackage = z.infer<typeof PromptPackageSchema>;
export type StyleSeedRequest = z.infer<typeof StyleSeedRequestSchema>;
export type FinalGenerationRequest = z.infer<typeof FinalGenerationRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;
export type WorkspaceSummary = z.infer<typeof WorkspaceSchema>;
export type BrandRecord = z.infer<typeof BrandSchema>;
export type BrandProfileVersionRecord = z.infer<typeof BrandProfileVersionSchema>;
export type BrandDetail = z.infer<typeof BrandDetailSchema>;
export type ProjectRecord = z.infer<typeof ProjectSchema>;
export type ProjectProfileVersionRecord = z.infer<typeof ProjectProfileVersionSchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type FestivalRecord = z.infer<typeof FestivalSchema>;
export type BrandPersonaRecord = z.infer<typeof BrandPersonaSchema>;
export type ContentPillarRecord = z.infer<typeof ContentPillarSchema>;
export type ChannelAccountRecord = z.infer<typeof ChannelAccountSchema>;
export type PostingWindowRecord = z.infer<typeof PostingWindowSchema>;
export type PostTypeRecord = z.infer<typeof PostTypeSchema>;
export type BrandAssetRecord = z.infer<typeof BrandAssetSchema>;
export type StyleTemplateRecord = z.infer<typeof StyleTemplateSchema>;
export type CreativeTemplateRecord = z.infer<typeof CreativeTemplateSchema>;
export type CreativeTemplateAssetRecord = z.infer<typeof CreativeTemplateAssetSchema>;
export type CreativeTemplateDetail = z.infer<typeof CreativeTemplateDetailSchema>;
export type CampaignRecord = z.infer<typeof CampaignSchema>;
export type SeriesRecord = z.infer<typeof SeriesSchema>;
export type CampaignDeliverablePlanRecord = z.infer<typeof CampaignDeliverablePlanSchema>;
export type DeliverableRecord = z.infer<typeof DeliverableSchema>;
export type PostVersionRecord = z.infer<typeof PostVersionSchema>;
export type PostVersionAssetRecord = z.infer<typeof PostVersionAssetSchema>;
export type ApprovalEventRecord = z.infer<typeof ApprovalEventSchema>;
export type PublicationRecord = z.infer<typeof PublicationSchema>;
export type DeliverableDetail = z.infer<typeof DeliverableDetailSchema>;
export type CreativeOutputRecord = z.infer<typeof CreativeOutputSchema>;
export type CreativeJobRecord = z.infer<typeof CreativeJobSchema>;
export type CalendarItemRecord = z.infer<typeof CalendarItemSchema>;
export type CreativeRunSummary = z.infer<typeof CreativeRunSummarySchema>;
export type CreativeRunDetail = z.infer<typeof CreativeRunDetailSchema>;
export type ReviewQueueEntry = z.infer<typeof ReviewQueueEntrySchema>;
export type WorkspaceMemberRecord = z.infer<typeof WorkspaceMemberSchema>;
export type QueueEntry = z.infer<typeof QueueEntrySchema>;
export type HomeOverview = z.infer<typeof HomeOverviewSchema>;
export type PlanOverview = z.infer<typeof PlanOverviewSchema>;
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
