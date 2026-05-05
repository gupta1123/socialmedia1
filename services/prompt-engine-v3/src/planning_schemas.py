from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


CreativeMode = Literal[
    "auto",
    "image_led",
    "copy_led",
    "asset_led",
    "template_led",
    "proof_led",
    "offer_led",
    "lifestyle_led",
    "brand_led",
    "graphic_led",
]

TextStrategy = Literal[
    "auto",
    "render_exact_text",
    "reserve_editable_space",
    "minimal_text",
    "typography_dominant",
    "no_text_visual_only",
    "proof_badges",
    "poster_copy_block",
]


class ContactIntent(BaseModel):
    requested_items: List[str] = Field(default_factory=list)
    blocked_items: List[str] = Field(default_factory=list)
    source_priority: List[str] = Field(default_factory=lambda: ["brief_override", "project", "brand"])


class CopyIntent(BaseModel):
    mode: str = "auto"
    tone: Optional[str] = None
    role: str = "supporting"
    exact_fields: Dict[str, str] = Field(default_factory=dict)
    required_messages: List[str] = Field(default_factory=list)


class CreativeIntent(BaseModel):
    content_job_id: str
    job_locked: bool = False
    brief_summary: str = ""
    festival_visual_scope: Literal["none", "brand_only", "project_supported", "building_led"] = "none"
    construction_visual_mode: Literal["none", "actual_progress_reference", "visualized_progress_from_project_truth"] = "none"
    construction_progress_percent: int = 50
    audience: Optional[str] = None
    creative_goal: str = ""
    creative_mode: CreativeMode = "auto"
    requested_asset_semantics: List[str] = Field(default_factory=list)
    asset_intent_strength: Literal["none", "soft", "hard"] = "none"
    requested_visual_style: List[str] = Field(default_factory=list)
    copy_intent: CopyIntent = Field(default_factory=CopyIntent)
    contact_intent: ContactIntent = Field(default_factory=ContactIntent)
    text_strategy: TextStrategy = "auto"
    negative_requests: List[str] = Field(default_factory=list)
    risk_claims: List[Dict[str, Any]] = Field(default_factory=list)


class FactValue(BaseModel):
    field: str
    value: str
    source: str
    risk_level: Literal["low", "medium", "high"] = "low"
    requires_client_review: bool = False


class GroundedFactStore(BaseModel):
    values: List[FactValue] = Field(default_factory=list)

    def values_for(self, field: str) -> List[FactValue]:
        return [item for item in self.values if item.field == field]

    def first_value(self, field: str) -> Optional[str]:
        matches = self.values_for(field)
        return matches[0].value if matches else None

    def allowed_strings(self) -> List[str]:
        return [item.value for item in self.values if item.value]


class ResolvedContactPlan(BaseModel):
    requested_items: List[str] = Field(default_factory=list)
    blocked_items: List[str] = Field(default_factory=list)
    items: List[str] = Field(default_factory=list)
    values: Dict[str, str] = Field(default_factory=dict)
    sources: Dict[str, str] = Field(default_factory=dict)
    missing: List[str] = Field(default_factory=list)
    requires_client_review: bool = False
    position: str = "bottom_footer"


class ResolvedLocationPlan(BaseModel):
    required: bool = False
    value: Optional[str] = None
    source: Optional[str] = None
    position: str = "bottom_left"
    fallback_position_without_contact: str = "bottom_center"
    include_pin_icon: bool = False
    missing: bool = False
    rules_extra: Dict[str, Any] = Field(default_factory=dict)


class LogoLayerPlan(BaseModel):
    required: bool = False
    asset_id: Optional[str] = None
    position: str = "top_left"
    rules_extra: Dict[str, Any] = Field(default_factory=dict)
    missing: bool = False
    role: str = "additional_logo"
    label: Optional[str] = None


class SecondaryLogoPlan(LogoLayerPlan):
    role: str = "secondary_logo"


class ProductionPlan(BaseModel):
    include_logo: bool = False
    logo_asset_id: Optional[str] = None
    logo_position: str = "top_left"
    logo_rules_extra: Dict[str, Any] = Field(default_factory=dict)
    secondary_logo: SecondaryLogoPlan = Field(default_factory=SecondaryLogoPlan)
    additional_logos: List[LogoLayerPlan] = Field(default_factory=list)
    include_rera_qr: bool = False
    rera_qr_asset_id: Optional[str] = None
    rera_position: str = "top_right"
    rera_triggered_by_preset: bool = False
    contact_plan: ResolvedContactPlan = Field(default_factory=ResolvedContactPlan)
    location_plan: ResolvedLocationPlan = Field(default_factory=ResolvedLocationPlan)
    text_strategy: TextStrategy = "render_exact_text"
    text_treatment: Literal["render_text", "reserve_space"] = "render_text"
    creative_mode: CreativeMode = "auto"
    missing_requirements: List[str] = Field(default_factory=list)
    preset_id: Optional[str] = None
    preset_name: Optional[str] = None


class AssetProfile(BaseModel):
    asset_id: Optional[str] = None
    label: Optional[str] = None
    semantic_type: Optional[str] = None
    truth_status: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    contains: List[str] = Field(default_factory=list)
    best_for: List[str] = Field(default_factory=list)
    bad_for: List[str] = Field(default_factory=list)
    safe_claims: List[str] = Field(default_factory=list)
    do_not_claim: List[str] = Field(default_factory=list)
    prompt_guidance: Optional[str] = None
    visual_analysis: Dict[str, Any] = Field(default_factory=dict)
    raw: Dict[str, Any] = Field(default_factory=dict)


class AssetDecision(BaseModel):
    selected_asset_id: Optional[str] = None
    semantic_type: Optional[str] = None
    confidence: float = 0.0
    reason: str = ""
    asset_use_plan: str = ""
    truth_constraints: List[str] = Field(default_factory=list)
    unsupported_details: List[str] = Field(default_factory=list)
    profile: Optional[AssetProfile] = None
    selection: Dict[str, Any] = Field(default_factory=dict)


class TemplateConstraint(BaseModel):
    template_id: Optional[str] = None
    name: Optional[str] = None
    layout_logic: str = ""
    hierarchy: List[str] = Field(default_factory=list)
    graphic_rules: List[str] = Field(default_factory=list)
    asset_assumptions: List[str] = Field(default_factory=list)
    adaptation_rule: str = ""
    lever_signature: Dict[str, Any] = Field(default_factory=dict)
    raw: Dict[str, Any] = Field(default_factory=dict)


class CreativeStrategy(BaseModel):
    creative_mode: CreativeMode = "auto"
    primary_goal: str = ""
    message_hierarchy: List[str] = Field(default_factory=list)
    asset_strategy: str = ""
    template_strategy: str = ""
    copy_strategy: str = ""
    novelty_requirement: str = ""
    visual_risk_notes: List[str] = Field(default_factory=list)


class VariantConcept(BaseModel):
    variant_id: str
    label: str
    variation_axis: str = "concept"
    selected_template_id: Optional[str] = None
    creative_big_idea: str = ""
    why_distinct: str = ""
    visual_metaphor: str = ""
    asset_treatment: str = ""
    layout_plan: str = ""
    graphic_devices: List[str] = Field(default_factory=list)
    copy_strategy: str = ""
    structured_levers: Dict[str, Any] = Field(default_factory=dict)
    preferred_asset_id: Optional[str] = None


class CopyPlan(BaseModel):
    copy_role: str = "supporting"
    headline: str = ""
    subheadline: str = ""
    cta: str = ""
    proof_points: List[str] = Field(default_factory=list)
    contact_line: Optional[str] = None
    forbidden_claims: List[str] = Field(default_factory=list)
    source: str = "auto"

    def as_contract(self) -> Dict[str, str]:
        return {"headline": self.headline, "subheadline": self.subheadline, "cta": self.cta}
