import { z } from "zod";

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "editor", "viewer"]);
export const WorkspaceMemberUiRoleSchema = z.enum(["admin", "team"]);
export const AssetKindSchema = z.enum(["reference", "logo", "product", "inspiration", "rera_qr"]);
export const AssetSubjectTypeSchema = z.enum([
  "project_exterior",
  "construction_progress",
  "amenity",
  "interior",
  "sample_flat",
  "lifestyle",
  "logo",
  "rera_qr",
  "generic_reference"
]);
export const AssetViewTypeSchema = z.enum(["aerial", "wide", "facade", "close_up", "street", "site", "interior"]);
export const AssetUsageIntentSchema = z.enum(["truth_anchor", "supporting_ref", "inspiration_only", "exact_asset"]);
export const AssetQualityTierSchema = z.enum(["hero", "usable", "weak"]);
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
export const CreditLedgerDirectionSchema = z.enum(["credit", "debit"]);
export const CreditLedgerEntryKindSchema = z.enum(["grant", "adjustment", "usage_reserve", "usage_release"]);
export const CreditReservationStatusSchema = z.enum(["reserved", "settled", "released"]);
export const CreateModeSchema = z.enum(["post", "series_episode", "campaign_asset", "adaptation"]);
const JsonRecordSchema = z.record(z.string(), z.unknown());

export const NormalizedAssetMetadataSchema = z.object({
  subjectType: AssetSubjectTypeSchema.optional(),
  viewType: AssetViewTypeSchema.optional(),
  amenityName: z.string().optional(),
  projectStageHint: ProjectStageSchema.optional(),
  usageIntent: AssetUsageIntentSchema.optional(),
  preserveIdentity: z.boolean().optional(),
  textSafeHints: z.array(z.string()).default([]),
  qualityTier: AssetQualityTierSchema.optional(),
  tags: z.array(z.string()).default([])
});

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
  headlineFontFamily: z.string().default(""),
  bodyFontFamily: z.string().default(""),
  typographyNotes: z.array(z.string()).default([]),
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
    headlineFontFamily: "",
    bodyFontFamily: "",
    typographyNotes: [],
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
  reviewerUserId: z.string().uuid().nullable().optional(),
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
  reviewerUserId: z.string().uuid().nullable().optional(),
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

export const ExternalPostReviewModeSchema = z.enum(["review", "approved", "scheduled"]);

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
  copyMode: z.enum(["manual", "auto"]).default("manual"),
  offer: z.string().optional(),
  exactText: z.string().optional(),
  referenceAssetIds: z.array(z.string().uuid()).default([]),
  includeBrandLogo: z.boolean().default(false),
  includeReraQr: z.boolean().default(false),
  logoAssetId: z.string().uuid().nullable().default(null),
  templateType: TemplateTypeSchema.optional()
});

export const PromptVariationSchema = z.object({
  id: z.string(),
  title: z.string(),
  strategy: z.string(),
  finalPrompt: z.string(),
  resolvedConstraints: z.record(z.string(), z.unknown()).default({}),
  compilerTrace: z.record(z.string(), z.unknown()).default({})
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
  finalPrompt: z.string(),
  aspectRatio: z.string(),
  chosenModel: z.string(),
  templateType: TemplateTypeSchema.optional(),
  referenceStrategy: z.enum(["generated-template", "uploaded-references", "hybrid"]),
  referenceAssetIds: z.array(z.string().uuid()),
  variations: z.array(PromptVariationSchema).default([]),
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

export const ImageEditIntentSchema = z.enum([
  "remove",
  "replace",
  "recolor",
  "cleanup",
  "insert",
  "background-change",
  "other"
]);

export const ImageEditSegmentationHintsSchema = z.object({
  requiresPointSelection: z.boolean().default(false),
  suggestedTargetPointLabel: z.string().nullable().default(null),
  notes: z.array(z.string()).default([])
});

export const ImageEditPlanResponseSchema = z.object({
  targetObject: z.string(),
  editIntent: ImageEditIntentSchema,
  rewrittenPrompt: z.string(),
  segmentationHints: ImageEditSegmentationHintsSchema,
  ambiguityNotes: z.array(z.string()).default([]),
  plannerTrace: z.record(z.unknown()).default({})
});

export const AiSegmentationResponseSchema = z.object({
  maskUrl: z.string(),
  maskDataUrl: z.string().optional(),
  model: z.string(),
  path: z.string().optional(),
  bbox: z
    .object({
      xMin: z.number(),
      yMin: z.number(),
      xMax: z.number(),
      yMax: z.number()
    })
    .optional()
});

export const AiImageEditResponseSchema = z.object({
  imageUrl: z.string(),
  imageDataUrl: z.string().optional(),
  model: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

export const ImageEditPromptComposerRequestSchema = z.object({
  brandId: z.string().uuid(),
  changes: z.array(z.string().trim().min(2).max(500)).min(1).max(20)
});

export const ImageEditPromptComposerResponseSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  strategy: z.enum(["gemini", "fallback"]),
  model: z.string().nullable().default(null)
});

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: WorkspaceRoleSchema
});

export const WorkspaceComplianceSettingsSchema = z.object({
  workspaceId: z.string().uuid(),
  reraAuthorityLabel: z.string().default("MahaRERA"),
  reraWebsiteUrl: z.string().url().default("https://maharera.maharashtra.gov.in"),
  reraTextColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#111111"),
  updatedAt: z.string().nullable().default(null)
});

export const UpdateWorkspaceComplianceSettingsSchema = z.object({
  reraAuthorityLabel: z.string().trim().min(2).max(40).default("MahaRERA"),
  reraWebsiteUrl: z.string().trim().url().max(240).default("https://maharera.maharashtra.gov.in"),
  reraTextColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).default("#111111")
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

export const ProjectReraRegistrationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable().default(null),
  registrationNumber: z.string().nullable().default(null),
  label: z.string(),
  qrAssetId: z.string().uuid().nullable().default(null),
  isDefault: z.boolean().default(false),
  metadataJson: JsonRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const UpdateProjectReraRegistrationSchema = z.object({
  registrationNumber: z.string().trim().max(120).nullable().default(null),
  label: z.string().trim().min(1).max(160),
  qrAssetId: z.string().uuid().nullable().default(null)
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
  thumbnailStoragePath: z.string().nullable().default(null),
  metadataJson: JsonRecordSchema.default({}),
  previewUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  originalUrl: z.string().url().optional()
});

export const CandidateAssetEligibilitySchema = z.object({
  isProjectScoped: z.boolean().default(false),
  isTemplateLinked: z.boolean().default(false),
  isSelectedReference: z.boolean().default(false),
  isBrandDefaultReference: z.boolean().default(false),
  isExactLogo: z.boolean().default(false),
  isExactReraQr: z.boolean().default(false),
  isProjectTruthAnchor: z.boolean().default(false)
});

export const CandidateAssetSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  projectId: z.string().uuid().nullable().default(null),
  kind: AssetKindSchema,
  label: z.string(),
  fileName: z.string(),
  storagePath: z.string(),
  metadataJson: JsonRecordSchema.default({}),
  normalizedMetadata: NormalizedAssetMetadataSchema.default({
    textSafeHints: [],
    tags: []
  }),
  templateRoles: z.array(TemplateAssetRoleSchema).default([]),
  eligibility: CandidateAssetEligibilitySchema.default({
    isProjectScoped: false,
    isTemplateLinked: false,
    isSelectedReference: false,
    isBrandDefaultReference: false,
    isExactLogo: false,
    isExactReraQr: false,
    isProjectTruthAnchor: false
  })
});

export const CreativeRequestContextSchema = z.object({
  createMode: CreateModeSchema,
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  goal: z.string(),
  prompt: z.string(),
  audience: z.string().optional(),
  copyMode: z.enum(["manual", "auto"]).default("manual"),
  offer: z.string().optional(),
  exactText: z.string().optional(),
  templateType: TemplateTypeSchema.optional(),
  variationCount: z.number().int().min(1).max(6),
  includeBrandLogo: z.boolean(),
  includeReraQr: z.boolean()
});

export const BrandTruthSchema = z.object({
  name: z.string(),
  identity: BrandIdentitySchema.default({
    positioning: "",
    promise: "",
    audienceSummary: ""
  }),
  palette: BrandProfileSchema.shape.palette,
  styleDescriptors: z.array(z.string()).default([]),
  visualSystem: BrandVisualSystemSchema.default({
    typographyMood: "",
    headlineFontFamily: "",
    bodyFontFamily: "",
    typographyNotes: [],
    compositionPrinciples: [],
    imageTreatment: [],
    textDensity: "balanced",
    realismLevel: "elevated_real"
  }),
  voice: BrandVoiceSchema,
  doRules: z.array(z.string()).default([]),
  dontRules: z.array(z.string()).default([]),
  bannedPatterns: z.array(z.string()).default([]),
  compliance: BrandComplianceSchema.default({
    bannedClaims: [],
    reviewChecks: []
  }),
  referenceCanon: BrandReferenceCanonSchema.default({
    antiReferenceNotes: [],
    usageNotes: []
  })
});

export const ProjectTruthSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  stage: ProjectStageSchema,
  tagline: z.string().default(""),
  positioning: z.string().default(""),
  lifestyleAngle: z.string().default(""),
  audienceSegments: z.array(z.string()).default([]),
  heroAmenities: z.array(z.string()).default([]),
  amenities: z.array(z.string()).default([]),
  locationAdvantages: z.array(z.string()).default([]),
  nearbyLandmarks: z.array(z.string()).default([]),
  constructionStatus: z.string().default(""),
  latestUpdate: z.string().default(""),
  approvedClaims: z.array(z.string()).default([]),
  bannedClaims: z.array(z.string()).default([]),
  legalNotes: z.array(z.string()).default([]),
  credibilityFacts: z.array(z.string()).default([]),
  reraNumber: z.string().default(""),
  actualProjectImageIds: z.array(z.string().uuid()).default([]),
  sampleFlatImageIds: z.array(z.string().uuid()).default([])
});

export const PostTypeContractSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  config: PostTypeConfigSchema,
  playbookKey: z.string(),
  requiredFields: z.array(z.string()).default([]),
  safeZoneGuidance: z.array(z.string()).default([]),
  amenityFocus: z.string().nullable().default(null),
  amenitySelectionSource: z.enum(["explicit", "inferred", "none"]).default("none")
});

export const FestivalTruthSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  category: FestivalCategorySchema,
  community: z.string().nullable().default(null),
  regions: z.array(z.string()).default([]),
  meaning: z.string(),
  dateLabel: z.string().nullable().default(null),
  nextOccursOn: z.string().nullable().default(null)
});

export const TemplateTruthSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  channel: CreativeChannelSchema,
  format: CreativeFormatSchema,
  basePrompt: z.string(),
  promptScaffold: z.string().optional(),
  roles: z.array(z.string()).default([]),
  linkedAssets: z.array(
    z.object({
      assetId: z.string().uuid(),
      role: TemplateAssetRoleSchema
    })
  ).default([])
});

export const ExactAssetContractSchema = z.object({
  logoAssetId: z.string().uuid().nullable().default(null),
  reraQrAssetId: z.string().uuid().nullable().default(null),
  requiredProjectAnchorAssetId: z.string().uuid().nullable().default(null),
  mustUseExactLogo: z.boolean().default(false),
  mustUseExactReraQr: z.boolean().default(false),
  preserveProjectIdentity: z.boolean().default(false)
});

export const GenerationContractSchema = z.object({
  aspectRatio: z.string(),
  chosenModel: z.string(),
  variationCount: z.number().int().min(1).max(6),
  maxSupportingRefs: z.number().int().min(0).default(2),
  hardGuardrails: z.array(z.string()).default([])
});

export const AmenityOptionSchema = z.object({
  name: z.string(),
  assetIds: z.array(z.string().uuid()).default([]),
  hasAssets: z.boolean().default(false),
  sources: z.array(z.enum(["project_profile", "asset_metadata"])).default([])
});

export const AmenityResolutionSchema = z.object({
  availableAmenities: z.array(AmenityOptionSchema).default([]),
  selectedAmenity: z.string().nullable().default(null),
  selectionSource: z.enum(["explicit", "inferred", "none"]).default("none"),
  selectedAssetIds: z.array(z.string().uuid()).default([]),
  hasExactAssetMatch: z.boolean().default(false)
});

export const CreativeTruthBundleSchema = z.object({
  requestContext: CreativeRequestContextSchema,
  brandTruth: BrandTruthSchema,
  projectTruth: ProjectTruthSchema.nullable().default(null),
  postTypeContract: PostTypeContractSchema,
  festivalTruth: FestivalTruthSchema.nullable().default(null),
  templateTruth: TemplateTruthSchema.nullable().default(null),
  candidateAssets: z.array(CandidateAssetSchema).default([]),
  amenityResolution: AmenityResolutionSchema.nullable().default(null),
  exactAssetContract: ExactAssetContractSchema,
  generationContract: GenerationContractSchema
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
  reviewerUserId: z.string().uuid().nullable().default(null),
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
  thumbnailStoragePath: z.string().nullable().default(null),
  providerUrl: z.string().url().nullable(),
  outputIndex: z.number().int(),
  parentOutputId: z.string().uuid().nullable().default(null),
  rootOutputId: z.string().uuid().nullable().default(null),
  editedFromOutputId: z.string().uuid().nullable().default(null),
  versionNumber: z.number().int().min(1).default(1),
  isLatestVersion: z.boolean().default(true),
  reviewState: OutputReviewStateSchema,
  latestVerdict: OutputVerdictSchema.nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  createdBy: z.string().uuid().nullable().default(null),
  previewUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  originalUrl: z.string().url().optional()
});

export const EditorSaveModeSchema = z.enum(["new", "version", "replace"]);

export const EditorSaveOutputResponseSchema = z.object({
  output: CreativeOutputSchema,
  resolvedMode: EditorSaveModeSchema,
  canReplaceSource: z.boolean().default(false)
});

export const ExternalPostUploadResponseSchema = z.object({
  deliverable: DeliverableSchema,
  postVersion: PostVersionSchema,
  output: CreativeOutputSchema
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
  optionCount: z.number().int(),
  finalJobCount: z.number().int(),
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

export const CreateWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  role: WorkspaceMemberUiRoleSchema.default("team")
});

export const UpdateWorkspaceMemberRoleSchema = z.object({
  role: WorkspaceMemberUiRoleSchema
});

export const WorkspaceMemberUpsertResponseSchema = z.object({
  status: z.enum(["added", "invited", "exists"]),
  member: WorkspaceMemberSchema
});

export const WorkspaceMemberRoleUpdateResponseSchema = z.object({
  status: z.literal("updated"),
  member: WorkspaceMemberSchema
});

export const WorkspaceMemberDeleteResponseSchema = z.object({
  status: z.literal("removed"),
  removedUserId: z.string().uuid()
});

export const SetWorkspaceMemberPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

export const WorkspaceMemberPasswordSetResponseSchema = z.object({
  status: z.literal("password_updated"),
  userId: z.string().uuid()
});

export const WorkspaceCreditWalletSchema = z.object({
  workspaceId: z.string().uuid(),
  balance: z.number().int().nonnegative(),
  lifetimeCredited: z.number().int().nonnegative(),
  lifetimeDebited: z.number().int().nonnegative(),
  updatedAt: z.string()
});

export const WorkspaceCreditLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  direction: CreditLedgerDirectionSchema,
  entryKind: CreditLedgerEntryKindSchema,
  amount: z.number().int().positive(),
  balanceAfter: z.number().int().nonnegative(),
  actorUserId: z.string().uuid().nullable().default(null),
  reservationId: z.string().uuid().nullable().default(null),
  source: z.string().nullable().default(null),
  sourceRef: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  metadataJson: JsonRecordSchema.default({}),
  createdAt: z.string()
});

export const WorkspaceCreditLedgerResponseSchema = z.object({
  items: z.array(WorkspaceCreditLedgerEntrySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative()
});

export const AdminCreditGrantRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000_000),
  note: z.string().trim().max(400).optional(),
  sourceRef: z.string().trim().max(120).optional()
});

export const AdminCreditAdjustRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  delta: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0, {
    message: "Delta cannot be zero"
  }),
  note: z.string().trim().max(400).optional(),
  sourceRef: z.string().trim().max(120).optional()
});

export const AdminCreditMutationResponseSchema = z.object({
  status: z.literal("ok"),
  wallet: WorkspaceCreditWalletSchema,
  entry: WorkspaceCreditLedgerEntrySchema
});

export const AdminCreditWorkspaceSummarySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  balance: z.number().int().nonnegative(),
  updatedAt: z.string().nullable().default(null)
});

export const AdminCreditWorkspaceListResponseSchema = z.object({
  items: z.array(AdminCreditWorkspaceSummarySchema)
});

export const AdminFailedJobSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid().nullable().default(null),
  jobType: JobTypeSchema,
  status: JobStatusSchema,
  errorMessage: z.string().nullable().default(null),
  createdAt: z.string()
});

export const AdminOverviewSchema = z.object({
  totals: z.object({
    workspaceCount: z.number().int().nonnegative(),
    memberCount: z.number().int().nonnegative(),
    superAdminCount: z.number().int().nonnegative(),
    totalCreditBalance: z.number().int().nonnegative(),
    pendingReviewOutputs: z.number().int().nonnegative(),
    failedJobsLast24h: z.number().int().nonnegative()
  }),
  topWorkspaces: z.array(AdminCreditWorkspaceSummarySchema),
  recentCreditEntries: z.array(WorkspaceCreditLedgerEntrySchema),
  recentFailedJobs: z.array(AdminFailedJobSchema)
});

export const AdminOrgSummarySchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  balance: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  adminCount: z.number().int().nonnegative(),
  ownerUserId: z.string().uuid().nullable().default(null),
  ownerEmail: z.string().email().nullable().default(null)
});

export const AdminOrgListResponseSchema = z.object({
  items: z.array(AdminOrgSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative()
});

export const AdminOrgMemberSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable().default(null),
  role: WorkspaceRoleSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AdminOrgDetailSchema = z.object({
  workspace: AdminOrgSummarySchema.extend({
    createdByUserId: z.string().uuid().nullable().default(null)
  }),
  wallet: WorkspaceCreditWalletSchema,
  members: z.array(AdminOrgMemberSchema),
  recentCreditEntries: z.array(WorkspaceCreditLedgerEntrySchema),
  recentFailedJobs: z.array(AdminFailedJobSchema)
});

export const AdminPlatformAdminSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable().default(null),
  role: z.literal("super_admin"),
  active: z.boolean(),
  createdByUserId: z.string().uuid().nullable().default(null),
  createdByEmail: z.string().email().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const AdminPlatformAdminListResponseSchema = z.object({
  items: z.array(AdminPlatformAdminSchema)
});

export const AdminPlatformAdminUpsertRequestSchema = z.object({
  email: z.string().email(),
  active: z.boolean().optional()
});

export const AdminPlatformAdminUpdateRequestSchema = z.object({
  active: z.boolean()
});

export const AdminPlatformAdminMutationResponseSchema = z.object({
  status: z.literal("ok"),
  item: AdminPlatformAdminSchema
});

export const AdminOpsJobItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid().nullable().default(null),
  jobType: JobTypeSchema,
  status: JobStatusSchema,
  ageMinutes: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().default(null),
  createdAt: z.string()
});

export const AdminOpsSummarySchema = z.object({
  metrics: z.object({
    queuedJobs: z.number().int().nonnegative(),
    processingJobs: z.number().int().nonnegative(),
    failedJobsLast24h: z.number().int().nonnegative(),
    completedJobsLast24h: z.number().int().nonnegative(),
    pendingReviewOutputs: z.number().int().nonnegative(),
    reservedCreditTransactions: z.number().int().nonnegative()
  }),
  recentFailedJobs: z.array(AdminOpsJobItemSchema),
  stuckJobs: z.array(AdminOpsJobItemSchema)
});

export const AdminAuditKindSchema = z.enum(["credit", "platform_admin", "workspace_member", "job_failure"]);

export const AdminAuditEntrySchema = z.object({
  id: z.string(),
  kind: AdminAuditKindSchema,
  action: z.string(),
  workspaceId: z.string().uuid().nullable().default(null),
  workspaceName: z.string().nullable().default(null),
  actorUserId: z.string().uuid().nullable().default(null),
  actorLabel: z.string().nullable().default(null),
  targetUserId: z.string().uuid().nullable().default(null),
  targetLabel: z.string().nullable().default(null),
  description: z.string(),
  metadataJson: JsonRecordSchema.default({}),
  createdAt: z.string()
});

export const AdminAuditResponseSchema = z.object({
  items: z.array(AdminAuditEntrySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative()
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

export const AiEditFlowSchema = z.enum(["mask", "direct"]);

export const AiEditConfigSchema = z.object({
  flow: AiEditFlowSchema
});

export const BootstrapResponseSchema = z.object({
  viewer: z.object({
    id: z.string().uuid(),
    email: z.string().email().optional(),
    isPlatformAdmin: z.boolean().default(false)
  }),
  aiEdit: AiEditConfigSchema,
  workspace: WorkspaceSchema.nullable(),
  workspaceComplianceSettings: WorkspaceComplianceSettingsSchema.nullable().default(null),
  brands: z.array(BrandSchema),
  brandAssets: z.array(BrandAssetSchema),
  projectReraRegistrations: z.array(ProjectReraRegistrationSchema).default([]),
  styleTemplates: z.array(StyleTemplateSchema),
  recentJobs: z.array(CreativeJobSchema),
  recentOutputs: z.array(CreativeOutputSchema)
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceComplianceSettings = z.infer<typeof WorkspaceComplianceSettingsSchema>;
export type UpdateWorkspaceComplianceSettingsInput = z.infer<typeof UpdateWorkspaceComplianceSettingsSchema>;
export type UpdateProjectReraRegistrationInput = z.infer<typeof UpdateProjectReraRegistrationSchema>;
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
export type CreditLedgerDirection = z.infer<typeof CreditLedgerDirectionSchema>;
export type CreditLedgerEntryKind = z.infer<typeof CreditLedgerEntryKindSchema>;
export type CreditReservationStatus = z.infer<typeof CreditReservationStatusSchema>;
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
export type WorkspaceMemberUiRole = z.infer<typeof WorkspaceMemberUiRoleSchema>;
export type CreateWorkspaceMemberInput = z.infer<typeof CreateWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof UpdateWorkspaceMemberRoleSchema>;
export type WorkspaceMemberUpsertResponse = z.infer<typeof WorkspaceMemberUpsertResponseSchema>;
export type WorkspaceMemberRoleUpdateResponse = z.infer<typeof WorkspaceMemberRoleUpdateResponseSchema>;
export type WorkspaceMemberDeleteResponse = z.infer<typeof WorkspaceMemberDeleteResponseSchema>;
export type SetWorkspaceMemberPasswordInput = z.infer<typeof SetWorkspaceMemberPasswordSchema>;
export type WorkspaceMemberPasswordSetResponse = z.infer<typeof WorkspaceMemberPasswordSetResponseSchema>;
export type WorkspaceCreditWallet = z.infer<typeof WorkspaceCreditWalletSchema>;
export type WorkspaceCreditLedgerEntry = z.infer<typeof WorkspaceCreditLedgerEntrySchema>;
export type WorkspaceCreditLedgerResponse = z.infer<typeof WorkspaceCreditLedgerResponseSchema>;
export type AdminCreditGrantRequest = z.infer<typeof AdminCreditGrantRequestSchema>;
export type AdminCreditAdjustRequest = z.infer<typeof AdminCreditAdjustRequestSchema>;
export type AdminCreditMutationResponse = z.infer<typeof AdminCreditMutationResponseSchema>;
export type AdminCreditWorkspaceSummary = z.infer<typeof AdminCreditWorkspaceSummarySchema>;
export type AdminCreditWorkspaceListResponse = z.infer<typeof AdminCreditWorkspaceListResponseSchema>;
export type AdminFailedJob = z.infer<typeof AdminFailedJobSchema>;
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
export type AdminOrgSummary = z.infer<typeof AdminOrgSummarySchema>;
export type AdminOrgListResponse = z.infer<typeof AdminOrgListResponseSchema>;
export type AdminOrgMember = z.infer<typeof AdminOrgMemberSchema>;
export type AdminOrgDetail = z.infer<typeof AdminOrgDetailSchema>;
export type AdminPlatformAdmin = z.infer<typeof AdminPlatformAdminSchema>;
export type AdminPlatformAdminListResponse = z.infer<typeof AdminPlatformAdminListResponseSchema>;
export type AdminPlatformAdminUpsertRequest = z.infer<typeof AdminPlatformAdminUpsertRequestSchema>;
export type AdminPlatformAdminUpdateRequest = z.infer<typeof AdminPlatformAdminUpdateRequestSchema>;
export type AdminPlatformAdminMutationResponse = z.infer<typeof AdminPlatformAdminMutationResponseSchema>;
export type AdminOpsJobItem = z.infer<typeof AdminOpsJobItemSchema>;
export type AdminOpsSummary = z.infer<typeof AdminOpsSummarySchema>;
export type AdminAuditKind = z.infer<typeof AdminAuditKindSchema>;
export type AdminAuditEntry = z.infer<typeof AdminAuditEntrySchema>;
export type AdminAuditResponse = z.infer<typeof AdminAuditResponseSchema>;
export type CreateMode = z.infer<typeof CreateModeSchema>;
export type SeriesOutputKind = z.infer<typeof SeriesOutputKindSchema>;
export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;
export type PromptPackage = z.infer<typeof PromptPackageSchema>;
export type StyleSeedRequest = z.infer<typeof StyleSeedRequestSchema>;
export type FinalGenerationRequest = z.infer<typeof FinalGenerationRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;
export type AiEditFlow = z.infer<typeof AiEditFlowSchema>;
export type AiEditConfig = z.infer<typeof AiEditConfigSchema>;
export type ImageEditIntent = z.infer<typeof ImageEditIntentSchema>;
export type ImageEditPlanResponse = z.infer<typeof ImageEditPlanResponseSchema>;
export type AiSegmentationResponse = z.infer<typeof AiSegmentationResponseSchema>;
export type AiImageEditResponse = z.infer<typeof AiImageEditResponseSchema>;
export type ImageEditPromptComposerRequest = z.infer<typeof ImageEditPromptComposerRequestSchema>;
export type ImageEditPromptComposerResponse = z.infer<typeof ImageEditPromptComposerResponseSchema>;
export type EditorSaveMode = z.infer<typeof EditorSaveModeSchema>;
export type EditorSaveOutputResponse = z.infer<typeof EditorSaveOutputResponseSchema>;
export type WorkspaceSummary = z.infer<typeof WorkspaceSchema>;
export type BrandRecord = z.infer<typeof BrandSchema>;
export type BrandProfileVersionRecord = z.infer<typeof BrandProfileVersionSchema>;
export type BrandDetail = z.infer<typeof BrandDetailSchema>;
export type ProjectRecord = z.infer<typeof ProjectSchema>;
export type ProjectProfileVersionRecord = z.infer<typeof ProjectProfileVersionSchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type ProjectReraRegistrationRecord = z.infer<typeof ProjectReraRegistrationSchema>;
export type FestivalRecord = z.infer<typeof FestivalSchema>;
export type BrandPersonaRecord = z.infer<typeof BrandPersonaSchema>;
export type ContentPillarRecord = z.infer<typeof ContentPillarSchema>;
export type ChannelAccountRecord = z.infer<typeof ChannelAccountSchema>;
export type PostingWindowRecord = z.infer<typeof PostingWindowSchema>;
export type PostTypeRecord = z.infer<typeof PostTypeSchema>;
export type BrandAssetRecord = z.infer<typeof BrandAssetSchema>;
export type NormalizedAssetMetadata = z.infer<typeof NormalizedAssetMetadataSchema>;
export type CandidateAsset = z.infer<typeof CandidateAssetSchema>;
export type CreativeRequestContext = z.infer<typeof CreativeRequestContextSchema>;
export type BrandTruth = z.infer<typeof BrandTruthSchema>;
export type ProjectTruth = z.infer<typeof ProjectTruthSchema>;
export type PostTypeContract = z.infer<typeof PostTypeContractSchema>;
export type FestivalTruth = z.infer<typeof FestivalTruthSchema>;
export type TemplateTruth = z.infer<typeof TemplateTruthSchema>;
export type ExactAssetContract = z.infer<typeof ExactAssetContractSchema>;
export type GenerationContract = z.infer<typeof GenerationContractSchema>;
export type CreativeTruthBundle = z.infer<typeof CreativeTruthBundleSchema>;
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
export type ExternalPostReviewMode = z.infer<typeof ExternalPostReviewModeSchema>;
export type ExternalPostUploadResponse = z.infer<typeof ExternalPostUploadResponseSchema>;
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
