from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PostType(str, Enum):
    project_launch = "project-launch"
    ad = "ad"
    construction_update = "construction-update"
    festive_greeting = "festive-greeting"
    amenity_spotlight = "amenity-spotlight"
    site_visit_invite = "site-visit-invite"
    testimonial = "testimonial"
    location_advantage = "location-advantage"


class FormatType(str, Enum):
    social_post = "social_post"
    story = "story"
    banner = "banner"


class VisualMode(str, Enum):
    asset_faithful = "asset_faithful"
    editorialized_truth = "editorialized_truth"
    graphic_led = "graphic_led"


class DeliveryMode(str, Enum):
    finished_poster = "finished_poster"
    base_visual = "base_visual"


class TextPolicy(str, Enum):
    none = "none"
    exact_text = "exact_text"
    reserve_space = "reserve_space"


class StylizationLevel(str, Enum):
    low = "low"
    medium = "medium"
    medium_high = "medium_high"


class PosterArchetype(str, Enum):
    soft_editorial_cutout = "soft_editorial_cutout"
    centered_monolith = "centered_monolith"
    scarcity_panel = "scarcity_panel"
    side_crop_premium_tower = "side_crop_premium_tower"
    philosophy_open_field = "philosophy_open_field"
    dusk_emotional_crop = "dusk_emotional_crop"
    clear_sky_statement = "clear_sky_statement"
    footer_builder_campaign = "footer_builder_campaign"
    white_space_editorial_statement = "white_space_editorial_statement"
    masterplan_scale_reveal = "masterplan_scale_reveal"
    documentary_presence = "documentary_presence"
    quote_led_editorial = "quote_led_editorial"
    symbolic_festive_field = "symbolic_festive_field"
    organic_shape_launch = "organic_shape_launch"
    watermark_catalog = "watermark_catalog"
    inset_image_card = "inset_image_card"
    swiss_grid_premium = "swiss_grid_premium"
    ultra_minimal_address = "ultra_minimal_address"


class HeroPresentation(str, Enum):
    single_tower = "single_tower"
    tower_pair = "tower_pair"
    midrise_block = "midrise_block"
    villa = "villa"
    township_overview = "township_overview"
    facade_crop = "facade_crop"
    entrance_arrival = "entrance_arrival"
    aerial_masterplan = "aerial_masterplan"
    cutout_object = "cutout_object"
    monolith_icon = "monolith_icon"
    architecture_with_environment = "architecture_with_environment"
    tower_with_sky = "tower_with_sky"
    tower_with_dusk = "tower_with_dusk"
    framed_image_card = "framed_image_card"
    candid_presence = "candid_presence"
    amenity_hero = "amenity_hero"
    symbolic_centerpiece = "symbolic_centerpiece"


class LayoutGeometry(str, Enum):
    centered_symmetry = "centered_symmetry"
    left_copy_right_hero = "left_copy_right_hero"
    right_copy_left_hero = "right_copy_left_hero"
    claim_panel_side_crop = "claim_panel_side_crop"
    inset_card = "inset_card"
    billboard_headline_sky = "billboard_headline_sky"
    footer_strip = "footer_strip"
    open_editorial_field = "open_editorial_field"
    framed_catalog = "framed_catalog"
    split_panel = "split_panel"
    lower_hero_upper_copy = "lower_hero_upper_copy"
    swiss_grid = "swiss_grid"
    documentary_crop_overlay = "documentary_crop_overlay"
    balanced_card_layout = "balanced_card_layout"


class GraphicLayer(str, Enum):
    none = "none"
    organic_shape = "organic_shape"
    geometric_blocks = "geometric_blocks"
    line_art_watermark = "line_art_watermark"
    brand_watermark = "brand_watermark"
    thin_frame = "thin_frame"
    translucent_panel = "translucent_panel"
    proposition_box = "proposition_box"
    image_card = "image_card"
    architectural_tracing = "architectural_tracing"
    soft_gradient_field = "soft_gradient_field"
    color_band = "color_band"
    paper_depth = "paper_depth"
    divider_lines = "divider_lines"


class TypeVoice(str, Enum):
    modern_sans = "modern_sans"
    premium_serif = "premium_serif"
    serif_sans_mix = "serif_sans_mix"
    condensed_statement = "condensed_statement"
    swiss_clean = "swiss_clean"
    builder_readable = "builder_readable"
    fashion_editorial = "fashion_editorial"
    quiet_premium = "quiet_premium"


class TextArchitecture(str, Enum):
    slogan_first = "slogan_first"
    proposition_first = "proposition_first"
    scarcity_first = "scarcity_first"
    emotional_headline_first = "emotional_headline_first"
    philosophy_first = "philosophy_first"
    address_first = "address_first"
    configuration_first = "configuration_first"
    quote_first = "quote_first"
    footer_heavy = "footer_heavy"
    one_statement = "one_statement"


class CommercialHook(str, Enum):
    price = "price"
    visit = "visit"
    location = "location"
    amenity = "amenity"
    configuration = "configuration"
    offer = "offer"
    investment = "investment"
    trust = "trust"
    compliance = "compliance"
    credibility = "credibility"


class VisualMechanism(str, Enum):
    price_billboard = "price_billboard"
    comparison_cards = "comparison_cards"
    visit_ticket = "visit_ticket"
    location_receipt = "location_receipt"
    offer_strip = "offer_strip"
    value_stack = "value_stack"
    trust_seal = "trust_seal"
    compliance_footer = "compliance_footer"
    credibility_band = "credibility_band"


class MoodMode(str, Enum):
    crisp_daylight = "crisp_daylight"
    pale_editorial_daylight = "pale_editorial_daylight"
    soft_morning = "soft_morning"
    golden_hour_optimism = "golden_hour_optimism"
    dusk_luxury = "dusk_luxury"
    twilight_calm = "twilight_calm"
    ivory_studio_neutral = "ivory_studio_neutral"
    warm_muted_premium = "warm_muted_premium"
    cool_sustainable_daylight = "cool_sustainable_daylight"


class DensityLevel(str, Enum):
    ultra_lean = "ultra_lean"
    lean = "lean"
    medium = "medium"
    heavy = "heavy"
    regulation_heavy = "regulation_heavy"


class BrandVisibility(str, Enum):
    whisper = "whisper"
    elegant_signature = "elegant_signature"
    visible_brand_led = "visible_brand_led"
    campaign_dominant = "campaign_dominant"
    logo_forward = "logo_forward"
    developer_explicit = "developer_explicit"


class AssetDecision(BaseModel):
    source: str = Field(..., description="One of: candidate_asset, exact_asset_only, none.")
    asset_id: str | None = Field(None)
    asset_label: str | None = Field(None)
    asset_subject_type: str | None = Field(None)
    reason: str = Field(...)
    reference_role: str | None = Field(None)
    fallback_asset_ids: list[str] = Field(default_factory=list)
    recommended_poster_archetype: str | None = Field(None)


class BriefAnalysis(BaseModel):
    project_id: str | None = Field(None)
    project_name: str | None = Field(default=None)
    post_type: PostType
    business_job: str = Field(...)
    persuasion_modes: list[str] = Field(default_factory=list)
    style_modifiers: list[str] = Field(default_factory=list)
    aspect_ratio: str = Field(...)
    delivery_mode: DeliveryMode = Field(default=DeliveryMode.finished_poster)
    text_policy: TextPolicy = Field(default=TextPolicy.exact_text)
    poster_archetype: PosterArchetype
    hero_presentation: HeroPresentation
    layout_geometry: LayoutGeometry
    graphic_layer: list[GraphicLayer] = Field(default_factory=list)
    type_voice: TypeVoice
    text_architecture: TextArchitecture
    commercial_hook: CommercialHook | None = Field(default=None)
    visual_mechanism: VisualMechanism | None = Field(default=None)
    mood_mode: MoodMode
    density: DensityLevel
    brand_visibility: BrandVisibility
    objective_summary: str = Field(...)
    brand_summary: str = Field(...)
    project_truth_summary: str = Field(...)
    template_usage_plan: str | None = Field(None)
    logo_usage_plan: str | None = Field(None)
    reference_usage_plan: str = Field(...)
    asset_decision: AssetDecision
    required_data: list[str] = Field(default_factory=list)
    requested_fact_types: list[str] = Field(
        default_factory=list,
        description="Commercial/project fact kinds the original brief explicitly asks to use.",
    )
    allowed_fact_kinds: list[str] = Field(
        default_factory=list,
        description="Maximum commercial/project fact kinds allowed in final prompts for this brief.",
    )
    required_fact_copies: list[str] = Field(
        default_factory=list,
        description="Exact grounded fact strings that final prompts must include.",
    )
    disallowed_available_fact_kinds: list[str] = Field(
        default_factory=list,
        description="Available fact kinds that the brief did not request and final prompts must avoid.",
    )
    do_not_use_unless_requested: list[dict[str, str]] = Field(
        default_factory=list,
        description="Available facts to keep out of final prompts unless the brief explicitly asks for that kind.",
    )
    conflict_notes: list[str] = Field(default_factory=list)
    negative_rules: list[str] = Field(default_factory=list)


class PromptVariationOutput(BaseModel):
    title: str = Field(...)
    strategy: str = Field(...)
    finalPrompt: str = Field(...)


class PromptPackageOutput(BaseModel):
    promptSummary: str = Field(...)
    variations: list[PromptVariationOutput] = Field(default_factory=list, min_length=1)


class VerificationResult(BaseModel):
    approved: bool = Field(...)
    issues: list[str] = Field(default_factory=list)
    promptSummary: str = Field(...)
    variations: list[PromptVariationOutput] = Field(default_factory=list, min_length=1)
    verificationSummary: str = Field(...)


class NotebookAnalystInput(BaseModel):
    project_slug: str = Field(..., description="Canonical project slug supplied by orchestration.")
    user_brief: str = Field(..., description="Raw user brief for the social creative.")
    requested_variation_count: int = Field(
        default=1,
        ge=1,
        le=6,
        description="Exact number of prompt options requested by orchestration.",
    )
    selected_post_type: PostType | None = Field(
        None,
        description="Explicit post type selected by the caller. If provided, use this instead of inferring from the brief.",
    )
    reference_image_paths: list[str] = Field(
        default_factory=list,
        description="Uploaded reference image file paths. These are identity or scene anchors.",
    )
    reference_image_note: str | None = Field(
        None,
        description="Optional instruction for how the reference images should be used.",
    )
    template_id: str | None = Field(
        None,
        description="Optional structured template id from the template library.",
    )
    template_image_path: str | None = Field(
        None,
        description="Optional template image path used as a style or composition cue.",
    )
    template_note: str | None = Field(
        None,
        description="Optional note about how strongly to follow the template.",
    )
    logo_image_path: str | None = Field(
        None,
        description="Optional logo image path. If provided, treat it as an exact brand mark.",
    )
    logo_note: str | None = Field(
        None,
        description="Optional note about logo usage.",
    )


class NotebookAssetDecision(BaseModel):
    source: str = Field(
        ...,
        description="One of: project_library, uploaded_reference, exact_asset_only, none.",
    )
    category: str | None = Field(None)
    filename: str | None = Field(None)
    filepath: str | None = Field(None)
    asset_id: str | None = Field(None)
    asset_label: str | None = Field(None)
    asset_subject_type: str | None = Field(None)
    reason: str = Field(...)
    reference_tag: str | None = Field(None)
    reference_role: str | None = Field(None)
    fallback_categories: list[str] = Field(default_factory=list)
    fallback_asset_ids: list[str] = Field(default_factory=list)
    recommended_poster_archetype: str | None = Field(None)


class NotebookBriefAnalysis(BaseModel):
    project_slug: str = Field(..., description="Canonical project slug.")
    requested_variation_count: int = Field(
        default=1,
        ge=1,
        le=6,
        description="Exact number of prompt options requested by orchestration.",
    )
    project_id: str | None = Field(None)
    project_name: str = Field(..., description="Display name of the project.")
    post_type: PostType
    business_job: str = Field(..., description="One-line communication job for the post.")
    persuasion_modes: list[str] = Field(default_factory=list, description="1-2 persuasion modes.")
    style_modifiers: list[str] = Field(
        default_factory=list,
        description="Optional modifiers like scarcity, dusk, family_tone.",
    )
    format_type: FormatType
    aspect_ratio: str = Field(..., description="Resolved aspect ratio, such as 1:1 or 9:16.")
    occasion: str | None = Field(None, description="Festival or occasion if relevant.")
    specific_amenity: str | None = Field(None, description="Exact amenity key if relevant.")
    no_building_image: bool = Field(
        ...,
        description="Whether the brief explicitly avoids building imagery.",
    )
    visual_mode: VisualMode
    delivery_mode: DeliveryMode
    text_policy: TextPolicy
    poster_archetype: PosterArchetype
    hero_presentation: HeroPresentation
    layout_geometry: LayoutGeometry
    graphic_layer: list[GraphicLayer] = Field(default_factory=list, description="0-2 graphic layers.")
    type_voice: TypeVoice
    text_architecture: TextArchitecture
    commercial_hook: CommercialHook | None = Field(
        default=None,
        description="For ads only: the dominant commercial selling hook.",
    )
    visual_mechanism: VisualMechanism | None = Field(
        default=None,
        description="For ads only: the main ad device or conversion-oriented visual mechanism.",
    )
    mood_mode: MoodMode
    density: DensityLevel
    brand_visibility: BrandVisibility
    stylization_level: StylizationLevel = Field(default=StylizationLevel.medium)
    truth_priority: str = Field(..., description="How strict factual fidelity must be.")
    objective_summary: str = Field(..., description="One-line summary of the post objective.")
    brand_summary: str = Field(..., description="Condensed brand guidance relevant to this post.")
    project_truth_summary: str = Field(
        ...,
        description="Condensed factual project information relevant to this post.",
    )
    reference_image_paths: list[str] = Field(
        default_factory=list,
        description="Uploaded reference image paths available to the run.",
    )
    template_id: str | None = Field(None, description="Resolved structured template id, if any.")
    template_image_path: str | None = Field(None, description="Uploaded template image path, if any.")
    logo_image_path: str | None = Field(None, description="Uploaded logo image path, if any.")
    reference_usage_plan: str = Field(
        ...,
        description="How the main reference visual should be used: hero choice, crop, angle, realism treatment, and what must stay true.",
    )
    template_usage_plan: str | None = Field(
        None,
        description="How the template should influence style, composition, or hierarchy without changing project identity.",
    )
    logo_usage_plan: str | None = Field(
        None,
        description="How the logo should be reproduced and placed.",
    )
    asset_decision: NotebookAssetDecision = Field(...)
    required_data: list[str] = Field(
        default_factory=list,
        description="Required payload elements such as brand, project, headline, location, RERA, and contact.",
    )
    conflict_notes: list[str] = Field(
        default_factory=list,
        description="Any brief conflicts and how they were resolved.",
    )
    logo_asset_filename: str | None = Field(
        None,
        description="Exact logo file if available for post-processing or planning.",
    )
    negative_rules: list[str] = Field(
        default_factory=list,
        description="Critical negative constraints to preserve truth.",
    )


class NotebookCraftedPrompt(BaseModel):
    post_type: PostType
    business_job: str
    project_name: str
    format_type: FormatType
    aspect_ratio: str
    visual_mode: VisualMode
    delivery_mode: DeliveryMode
    text_policy: TextPolicy
    poster_archetype: PosterArchetype
    style_modifiers: list[str] = Field(default_factory=list)
    hero_presentation: HeroPresentation
    layout_geometry: LayoutGeometry
    graphic_layer: list[GraphicLayer] = Field(default_factory=list)
    type_voice: TypeVoice
    text_architecture: TextArchitecture
    commercial_hook: CommercialHook | None = Field(default=None)
    visual_mechanism: VisualMechanism | None = Field(default=None)
    mood_mode: MoodMode
    density: DensityLevel
    brand_visibility: BrandVisibility
    primary_reference_filename: str | None = None
    prompt: str = Field(..., description="Final image generation prompt.")
    negative: str = Field(..., description="Compact negative string.")
    rationale: str = Field(..., description="Short explanation of why this prompt structure works.")
    variations: list[PromptVariationOutput] = Field(
        default_factory=list,
        description="Prompt options. Must contain exactly requested_variation_count items when more than one option is requested.",
    )


class NotebookVerifierInput(BaseModel):
    brief_analysis: NotebookBriefAnalysis
    crafted_prompt: NotebookCraftedPrompt


class NotebookVerificationResult(BaseModel):
    approved: bool = Field(..., description="Whether the final prompt passed verification.")
    issues: list[str] = Field(default_factory=list, description="Detected issues.")
    revised_prompt: str = Field(..., description="Verified or revised prompt.")
    revised_negative: str = Field(..., description="Verified or revised negative constraints.")
    verification_summary: str = Field(..., description="Short summary of what was checked.")
    variations: list[PromptVariationOutput] = Field(
        default_factory=list,
        description="Verified prompt options. Must contain exactly requested_variation_count items when more than one option is requested.",
    )
