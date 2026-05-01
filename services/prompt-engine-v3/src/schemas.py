from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CopyContract(BaseModel):
    headline: Optional[str] = None
    subheadline: Optional[str] = None
    cta: Optional[str] = None


class AssetInput(BaseModel):
    asset_id: str
    label: str
    role: str = "reference"
    storage_path: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    truth_status: Optional[str] = None
    scene_type: Optional[str] = None
    visual_use: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BrandPresetInput(BaseModel):
    preset_id: str
    name: str
    preset_json: Dict[str, Any] = Field(default_factory=dict)


class VisualTemplateInput(BaseModel):
    template_id: str
    name: str
    content_job_id: Optional[str] = None
    formats: List[str] = Field(default_factory=list)
    lever_signature: Dict[str, Any] = Field(default_factory=dict)
    template_json: Dict[str, Any] = Field(default_factory=dict)


class CompileRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    capability: Literal["image_prompt_generation", "carousel_prompt_generation"] = "image_prompt_generation"
    brand_id: str
    project_id: Optional[str] = None
    festival_id: Optional[str] = None
    content_job_id: Optional[str] = None
    format: str = "4:5"
    brief: str
    audience: Optional[str] = None
    variant_count: int = Field(default=1, ge=1, le=3)
    variation_strategy: str = "auto"
    asset_variation: bool = True
    copy_mode: Literal["auto", "manual"] = "auto"
    copy_contract: CopyContract = Field(default_factory=CopyContract, alias="copy")
    visual_template_id: Optional[str] = None
    visual_template_ids: List[str] = Field(default_factory=list)
    brand_preset_id: Optional[str] = None
    selected_asset_ids: List[str] = Field(default_factory=list)
    include_logo: bool = False
    logo_asset_id: Optional[str] = None
    include_rera_qr: bool = False
    rera_qr_asset_id: Optional[str] = None
    contact_items: List[str] = Field(default_factory=list)
    options: Dict[str, Any] = Field(default_factory=dict)
    context: Dict[str, Any] = Field(default_factory=dict)


class ValidationResult(BaseModel):
    passed: bool = True
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class SessionFactOverride(BaseModel):
    field: str
    value: str
    source: Literal["client_brief_override"] = "client_brief_override"
    overrides: Optional[str] = None
    confidence: float = 0.8
    rationale: Optional[str] = None
    risk_level: Literal["low", "medium", "high"] = "medium"
    requires_client_review: bool = True


class AssetRoleEntry(BaseModel):
    asset_id: Optional[str] = None
    label: Optional[str] = None
    usage: Optional[str] = None
    grounding_note: Optional[str] = None


class AssetRolePlan(BaseModel):
    project_assets: List[AssetRoleEntry] = Field(default_factory=list)
    logo_asset: Optional[AssetRoleEntry] = None
    rera_qr_asset: Optional[AssetRoleEntry] = None
    reference_images: List[AssetRoleEntry] = Field(default_factory=list)
    fallback_visuals: List[AssetRoleEntry] = Field(default_factory=list)


class RenderPackage(BaseModel):
    project_asset_ids: List[str] = Field(default_factory=list)
    logo_asset_id: Optional[str] = None
    rera_qr_asset_id: Optional[str] = None
    reference_image_ids: List[str] = Field(default_factory=list)
    image_model_mode: str = "asset_reference_generation"
    format: str = "4:5"
    prompt: str = ""
    compiled_prompt: str = ""
    negative_prompt: str = ""
    exact_text_layers: Dict[str, Any] = Field(default_factory=dict)
    logo_rules: Dict[str, Any] = Field(default_factory=dict)
    rera_qr_rules: Dict[str, Any] = Field(default_factory=dict)
    contact_rules: Dict[str, Any] = Field(default_factory=dict)
    truth_rules: Dict[str, Any] = Field(default_factory=dict)
    session_fact_overrides: List[SessionFactOverride] = Field(default_factory=list)


class FactAudit(BaseModel):
    project_db_facts_used: List[str] = Field(default_factory=list)
    brief_declared_facts_used: List[SessionFactOverride] = Field(default_factory=list)
    llm_inferred_claims: List[str] = Field(default_factory=list)
    requires_client_review: bool = False


class VariantOutput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    variant_id: str
    variation_label: str
    variation_axis: str
    selected_template_id: Optional[str] = None
    creative_direction: Dict[str, Any] = Field(default_factory=dict)
    selected_assets: List[Dict[str, Any]] = Field(default_factory=list)
    asset_role_plan: AssetRolePlan = Field(default_factory=AssetRolePlan)
    copy_contract: Dict[str, Any] = Field(default_factory=dict, alias="copy")
    visible_text_allowed: List[str] = Field(default_factory=list)
    prompt: str
    compiled_prompt: str
    negative_prompt: str
    text_policy: Dict[str, Any] = Field(default_factory=dict)
    layout_contract: Dict[str, Any] = Field(default_factory=dict)
    render_package: RenderPackage = Field(default_factory=RenderPackage)
    fact_audit: FactAudit = Field(default_factory=FactAudit)
    validation: ValidationResult = Field(default_factory=ValidationResult)


class CompileResponse(BaseModel):
    status: Literal["ready", "needs_input", "blocked", "failed"]
    capability: str
    content_job_id: Optional[str] = None
    format: str
    variant_count: int
    variation_strategy: str
    variants: List[VariantOutput] = Field(default_factory=list)
    validation: ValidationResult = Field(default_factory=ValidationResult)
    debug: Dict[str, Any] = Field(default_factory=dict)
