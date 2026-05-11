from __future__ import annotations

import json
import os
import re
import ast
import tempfile
from typing import Any, Dict, List, Optional, get_origin

os.environ.setdefault("DSPY_CACHEDIR", os.path.join(tempfile.gettempdir(), "briefly-social-dspy-cache"))
os.environ.setdefault("LITELLM_CACHE_DIR", os.path.join(tempfile.gettempdir(), "briefly-social-litellm-cache"))

import dspy
import litellm
from pydantic import BaseModel, ConfigDict, Field, create_model

from dspy.adapters.json_adapter import _has_open_ended_mapping

from .schemas import CompileRequest
from .creative_levers import CONTENT_JOBS as CONTENT_JOB_REGISTRY, lever_options_for_job, sanitize_creative_direction


CONTENT_JOBS = list(CONTENT_JOB_REGISTRY.keys())


class JsonObjectAdapter(dspy.JSONAdapter):
    """DSPy JSON adapter with structured-output support.

    The output signatures below are typed Pydantic objects. Let DSPy request a
    native structured schema where the provider supports it, and use DSPy's own
    JSON fallback otherwise.
    """

    def __call__(self, lm, lm_kwargs, signature, demos, inputs):
        provider = lm.model.split("/", 1)[0] or "openai"
        params = litellm.get_supported_openai_params(model=lm.model, custom_llm_provider=provider)
        if not params or "response_format" not in params:
            return dspy.ChatAdapter.__call__(self, lm, lm_kwargs, signature, demos, inputs)

        if _has_open_ended_mapping(signature):
            lm_kwargs["response_format"] = {"type": "json_object"}
            return dspy.ChatAdapter.__call__(self, lm, lm_kwargs, signature, demos, inputs)

        try:
            lm_kwargs["response_format"] = _get_structured_outputs_response_format(signature)
            return dspy.ChatAdapter.__call__(self, lm, lm_kwargs, signature, demos, inputs)
        except Exception as structured_exc:
            try:
                lm_kwargs["response_format"] = {"type": "json_object"}
                return dspy.ChatAdapter.__call__(self, lm, lm_kwargs, signature, demos, inputs)
            except Exception:
                raise structured_exc


def _get_structured_outputs_response_format(signature):
    for name, field in signature.output_fields.items():
        if get_origin(field.annotation) is dict:
            raise ValueError(f"Field '{name}' has an open-ended mapping type.")

    fields = {}
    for name, field in signature.output_fields.items():
        default = field.default if hasattr(field, "default") else ...
        fields[name] = (field.annotation, default)

    pydantic_model = create_model(
        "DSPyProgramOutputs",
        **fields,
        __config__=ConfigDict(extra="forbid"),
    )
    schema = pydantic_model.model_json_schema()
    for prop in schema.get("properties", {}).values():
        prop.pop("json_schema_extra", None)

    def enforce_required(schema_part: dict) -> None:
        if schema_part.get("type") == "object":
            props = schema_part.get("properties")
            if props is not None:
                schema_part["required"] = list(props.keys())
                schema_part["additionalProperties"] = False
                for sub_schema in props.values():
                    if isinstance(sub_schema, dict):
                        enforce_required(sub_schema)
            else:
                schema_part["properties"] = {}
                schema_part["required"] = []
                schema_part["additionalProperties"] = False
        if schema_part.get("type") == "array" and isinstance(schema_part.get("items"), dict):
            enforce_required(schema_part["items"])
        for key in ("$defs", "definitions"):
            if key in schema_part:
                for def_schema in schema_part[key].values():
                    enforce_required(def_schema)

    enforce_required(schema)
    pydantic_model.model_json_schema = lambda *args, **kwargs: schema
    return pydantic_model


class CreativeDirectionOutput(BaseModel):
    style_family: str = ""
    hero_presentation: str = ""
    layout_geometry: str = ""
    graphic_layer: List[str] = Field(default_factory=list)
    type_voice: str = ""
    text_architecture: str = ""
    mood_mode: str = ""
    density: str = ""
    brand_visibility: str = ""
    visual_mode: str = ""


class IntentOutput(BaseModel):
    resolved_content_job_id: str = ""
    confidence: float = 0.0
    brief_summary: str = ""
    explicit_user_requests: List[str] = Field(default_factory=list)
    factual_claims: List[str] = Field(default_factory=list)
    risk_notes: List[str] = Field(default_factory=list)


class BriefIntentOutput(BaseModel):
    primary_visual_goal: str = "selected_asset_hero"
    reference_role: str = "hero_truth_anchor"
    visual_priority: str = ""
    scene_subject: str = ""
    people_required: bool = False
    environment_required: List[str] = Field(default_factory=list)
    must_include: List[str] = Field(default_factory=list)
    must_avoid: List[str] = Field(default_factory=list)
    grounded_facts: List[str] = Field(default_factory=list)
    copy_goal: str = ""
    confidence: float = 0.0


class AssetSelectionOutput(BaseModel):
    selected_asset_id: str = ""
    confidence: float = 0.0
    selection_reason: str = ""
    asset_role: str = ""
    render_truth_notes: str = ""
    warnings: List[str] = Field(default_factory=list)


class VariantPlanItemOutput(BaseModel):
    variant_id: str = ""
    label: str = ""
    variation_axis: str = ""
    selected_template_id: str = ""
    creative_direction: CreativeDirectionOutput = Field(default_factory=CreativeDirectionOutput)
    copy_angle: str = ""
    creative_big_idea: str = ""
    asset_treatment: str = ""
    layout_plan: str = ""
    graphic_devices: List[str] = Field(default_factory=list)
    copy_strategy: str = ""
    why_distinct: str = ""


class VariantPlanOutput(BaseModel):
    variants: List[VariantPlanItemOutput] = Field(default_factory=list)


class CopyOutput(BaseModel):
    headline: str = ""
    subheadline: str = ""
    cta: str = ""


class ImagePromptOutput(BaseModel):
    prompt: str = ""
    negative_prompt: str = ""
    copy_text: CopyOutput = Field(default_factory=CopyOutput, alias="copy")
    visible_text_allowed: List[str] = Field(default_factory=list)
    creative_direction: CreativeDirectionOutput = Field(default_factory=CreativeDirectionOutput)
    text_policy: str = ""
    layout_contract: str = ""


class ValidationOutput(BaseModel):
    passed: bool = True
    score: float = 1.0
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    improvement_notes: List[str] = Field(default_factory=list)


class AuditIssueOutput(BaseModel):
    severity: str = "warning"
    type: str = "prompt_audit"
    message: str = ""


class AuditOutput(BaseModel):
    status: str = "clean"
    repaired_provider_prompt: str = ""
    repaired_negative_prompt: str = ""
    issues_found: List[AuditIssueOutput] = Field(default_factory=list)
    changes_made: List[str] = Field(default_factory=list)
    remaining_risks: List[str] = Field(default_factory=list)
    facts_used_in_prompt: List[str] = Field(default_factory=list)
    facts_used_in_visible_copy: List[str] = Field(default_factory=list)


def dspy_available() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"))


def configure_dspy_once() -> None:
    if getattr(configure_dspy_once, "_configured", False):
        return

    if os.getenv("OPENROUTER_API_KEY"):
        model = os.getenv("PROMPT_ENGINE_V3_LLM_MODEL", os.getenv("OPENROUTER_MODEL", "openrouter/google/gemini-2.5-flash"))
        if not model.startswith("openrouter/"):
            model = f"openrouter/{model}"
        lm = dspy.LM(
            model,
            api_key=os.getenv("OPENROUTER_API_KEY"),
            temperature=float(os.getenv("PROMPT_ENGINE_V3_LLM_TEMPERATURE", "0.25")),
            max_tokens=int(os.getenv("PROMPT_ENGINE_V3_LLM_MAX_TOKENS", "12000")),
        )
    else:
        model = os.getenv("PROMPT_ENGINE_V3_LLM_MODEL", os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
        lm = dspy.LM(
            model,
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=float(os.getenv("PROMPT_ENGINE_V3_LLM_TEMPERATURE", "0.25")),
            max_tokens=int(os.getenv("PROMPT_ENGINE_V3_LLM_MAX_TOKENS", "12000")),
        )

    dspy.configure(lm=lm, adapter=JsonObjectAdapter())
    setattr(configure_dspy_once, "_configured", True)


def extract_json(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, BaseModel):
        return value.model_dump(by_alias=True)
    if hasattr(value, "model_dump"):
        try:
            data = value.model_dump(by_alias=True)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    if hasattr(value, "toDict"):
        try:
            data = value.toDict()
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    text = str(value or "").strip()
    if not text:
        return {}

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.I | re.S)
    if fenced:
        text = fenced.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]

    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception as exc:
        try:
            parsed = ast.literal_eval(text)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {"parse_error": True, "message": str(exc), "raw": str(value)[:2000]}


class ResolveCreativeIntent(dspy.Signature):
    """Resolve the user's real estate social media intent into a supported content job.

    If request_json.content_job_locked is true, keep request_json.content_job_id unless it is unsupported.
    Treat the brief as creative guidance within that selected post type, not permission to switch jobs.
    """

    request_json: str = dspy.InputField()
    project_context_json: str = dspy.InputField()
    available_content_jobs_json: str = dspy.InputField()
    intent_json: IntentOutput = dspy.OutputField(
        desc=(
            "JSON object with resolved_content_job_id, confidence, brief_summary, "
            "explicit_user_requests, factual_claims, risk_notes."
        )
    )


class SelectHeroAsset(dspy.Signature):
    """Choose the best hero/reference asset from a factual asset shortlist."""

    request_json: str = dspy.InputField()
    content_job_id: str = dspy.InputField()
    asset_candidates_json: str = dspy.InputField()
    selection_json: AssetSelectionOutput = dspy.OutputField(
        desc=(
            "JSON object with selected_asset_id, confidence, selection_reason, "
            "asset_role, render_truth_notes, warnings."
        )
    )


class ResolveBriefVisualIntent(dspy.Signature):
    """Classify the user's actual visual ask before asset/template planning.

    Decide whether selected references should be the hero image or only context grounding.
    If the brief asks for a generated scene with people/family/couple/lifestyle/township/environment,
    return primary_visual_goal generated_lifestyle_scene and reference_role context_grounding unless the user explicitly says
    to use the selected/supplied image as the hero. Preserve compliance/factual constraints; do not invent facts.
    """

    request_json: str = dspy.InputField()
    project_context_json: str = dspy.InputField()
    preliminary_intent_json: str = dspy.InputField()
    brief_intent_json: BriefIntentOutput = dspy.OutputField(
        desc=(
            "JSON object with primary_visual_goal, reference_role, visual_priority, scene_subject, "
            "people_required, environment_required, must_include, must_avoid, grounded_facts, copy_goal, confidence."
        )
    )


class GenerateVariantPlan(dspy.Signature):
    """Plan up to three visually distinct but grounded single-post variants.

    Use only eligible templates for content_job_id. For festive_greeting, make the occasion/festival
    the central creative axis and avoid launch, pricing, or site-visit framing unless explicitly requested.
    """

    request_json: str = dspy.InputField()
    content_job_id: str = dspy.InputField()
    selected_asset_json: str = dspy.InputField()
    eligible_templates_json: str = dspy.InputField()
    lever_options_json: str = dspy.InputField()
    variant_plan_json: VariantPlanOutput = dspy.OutputField(
        desc=(
            "JSON object with variants array. Each variant has variant_id, label, "
            "variation_axis, selected_template_id, creative_direction, copy_angle, "
            "creative_big_idea, asset_treatment, layout_plan, graphic_devices, copy_strategy, "
            "and why_distinct. Use lever_options_json as structured vocabulary for creative_direction, "
            "but invent a fresh free-form visual concept and asset treatment. Do not invent facts."
        )
    )


class GenerateImagePrompt(dspy.Signature):
    """Write a grounded image-generation prompt and render contract for one variant."""

    request_json: str = dspy.InputField()
    project_context_json: str = dspy.InputField()
    asset_json: str = dspy.InputField()
    variant_spec_json: str = dspy.InputField()
    output_json: ImagePromptOutput = dspy.OutputField(
        desc=(
            "JSON object with prompt, negative_prompt, copy, visible_text_allowed, "
            "creative_direction, text_policy, layout_contract. Preserve asset truth. "
            "Render headline/subheadline/CTA visibly as clean poster typography for preview. "
            "Keep logo/RERA/contact as exact supplied layer references. No facade signage. "
            "Use variant_spec_json's free-form concept, asset_treatment, layout_plan, and graphic_devices. "
            "Do not flatten the output into a generic premium real-estate wrapper."
        )
    )


class ValidateCreativeQuality(dspy.Signature):
    """Judge whether the prompt is grounded, non-generic, and useful for image rendering."""

    request_json: str = dspy.InputField()
    output_json: str = dspy.InputField()
    validation_json: ValidationOutput = dspy.OutputField(
        desc="JSON object with passed boolean, score 0-1, errors array, warnings array, improvement_notes array."
    )


class RepairCreativeOutput(dspy.Signature):
    """Repair one generated creative output without changing grounded facts or selected assets."""

    request_json: str = dspy.InputField()
    output_json: str = dspy.InputField()
    validation_json: str = dspy.InputField()
    repaired_output_json: ImagePromptOutput = dspy.OutputField(
        desc="JSON object with the same output fields, fixed for validation errors while preserving selected asset, facts, and copy."
    )


class AuditAndRepairPrompt(dspy.Signature):
    """Final prompt audit and semantic repair for one provider prompt.

    Preserve the creative idea, but remove contradictions, unsafe facts, wrong post-type language,
    and asset/template leakage. Return JSON only.
    """

    audit_payload_json: str = dspy.InputField()
    audit_result_json: AuditOutput = dspy.OutputField(
        desc=(
            "JSON object with status clean|repaired|needs_input|blocked, repaired_provider_prompt, "
            "repaired_negative_prompt, issues_found array, changes_made array, remaining_risks array, "
            "facts_used_in_prompt array, facts_used_in_visible_copy array. Do not invent facts."
        )
    )


class DspyPromptProgram:
    def __init__(self) -> None:
        configure_dspy_once()
        # JSON mode is stricter and more stable when each call returns only the
        # requested JSON field. ChainOfThought adds an extra `reasoning` field that
        # some providers return without the final output field, causing parse-only
        # failures and unnecessary fallback to the deterministic planner.
        self.resolve_intent = dspy.Predict(ResolveCreativeIntent)
        self.resolve_brief_visual_intent = dspy.Predict(ResolveBriefVisualIntent)
        self.select_asset = dspy.Predict(SelectHeroAsset)
        self.plan_variants = dspy.Predict(GenerateVariantPlan)
        self.generate_prompt = dspy.Predict(GenerateImagePrompt)
        self.validate_quality = dspy.Predict(ValidateCreativeQuality)
        self.repair_output = dspy.Predict(RepairCreativeOutput)
        self.audit_prompt = dspy.Predict(AuditAndRepairPrompt)

    def resolve(self, request: CompileRequest, context: Dict[str, Any]) -> Dict[str, Any]:
        return self._predict_json(
            self.resolve_intent,
            "intent_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            project_context_json=json.dumps(_project_context_for_model(context), ensure_ascii=False),
            available_content_jobs_json=json.dumps(CONTENT_JOBS, ensure_ascii=False),
        )

    def plan_brief_visual_intent(self, request: CompileRequest, context: Dict[str, Any], preliminary_intent: Dict[str, Any]) -> Dict[str, Any]:
        return self._predict_json(
            self.resolve_brief_visual_intent,
            "brief_intent_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            project_context_json=json.dumps(_project_context_for_model(context), ensure_ascii=False),
            preliminary_intent_json=json.dumps(preliminary_intent, ensure_ascii=False),
        )

    def select_hero_asset(self, request: CompileRequest, content_job_id: str, assets: List[Dict[str, Any]], asset_selection_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._predict_json(
            self.select_asset,
            "selection_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            content_job_id=content_job_id,
            asset_candidates_json=json.dumps(asset_selection_context or assets[:12], ensure_ascii=False),
        )

    def make_variant_plan(
        self,
        request: CompileRequest,
        content_job_id: str,
        asset: Dict[str, Any],
        templates: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        return self._predict_json(
            self.plan_variants,
            "variant_plan_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            content_job_id=content_job_id,
            selected_asset_json=json.dumps(asset, ensure_ascii=False),
            eligible_templates_json=json.dumps(templates[:8], ensure_ascii=False),
            lever_options_json=json.dumps(lever_options_for_job(content_job_id), ensure_ascii=False),
        )

    def generate_variant_output(
        self,
        request: CompileRequest,
        context: Dict[str, Any],
        asset: Dict[str, Any],
        variant_spec: Dict[str, Any],
    ) -> Dict[str, Any]:
        return self._predict_json(
            self.generate_prompt,
            "output_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            project_context_json=json.dumps(_project_context_for_model(context), ensure_ascii=False),
            asset_json=json.dumps(asset, ensure_ascii=False),
            variant_spec_json=json.dumps(variant_spec, ensure_ascii=False),
        )

    def validate_output(self, request: CompileRequest, output: Dict[str, Any]) -> Dict[str, Any]:
        return self._predict_json(
            self.validate_quality,
            "validation_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            output_json=json.dumps(output, ensure_ascii=False),
        )

    def audit_and_repair_prompt(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._predict_json(
            self.audit_prompt,
            "audit_result_json",
            audit_payload_json=json.dumps(payload, ensure_ascii=False),
        )

    def repair_variant_output(self, request: CompileRequest, output: Dict[str, Any], validation: Dict[str, Any]) -> Dict[str, Any]:
        return self._predict_json(
            self.repair_output,
            "repaired_output_json",
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            output_json=json.dumps(output, ensure_ascii=False),
            validation_json=json.dumps(validation, ensure_ascii=False),
        )

    def _predict_json(self, predictor: Any, field_name: str, **kwargs: Any) -> Dict[str, Any]:
        attempts = max(1, int(os.getenv("PROMPT_ENGINE_V3_DSPY_PARSE_RETRIES", "2")) + 1)
        last_exc: Optional[Exception] = None
        for attempt in range(attempts):
            try:
                pred = predictor(**kwargs)
                parsed = extract_json(getattr(pred, field_name, pred))
                if parsed.get("parse_error"):
                    raise ValueError(str(parsed.get("message") or "Model response was not parseable JSON."))
                return parsed
            except Exception as exc:
                last_exc = exc
                if attempt == attempts - 1:
                    raise
        if last_exc:
            raise last_exc
        return {}


def _request_for_model(request: CompileRequest) -> Dict[str, Any]:
    return {
        "capability": request.capability,
        "project_id": request.project_id,
        "festival_id": request.festival_id,
        "content_job_id": request.content_job_id,
        "content_job_locked": bool(request.content_job_id),
        "format": request.format,
        "brief": request.brief,
        "audience": request.audience,
        "variant_count": request.variant_count,
        "variation_strategy": request.variation_strategy,
        "asset_variation": request.asset_variation,
        "copy_mode": request.copy_mode,
        "copy": request.copy_contract.model_dump(),
        "visual_template_id": request.visual_template_id,
        "visual_template_ids": request.visual_template_ids,
        "brand_preset_id": request.brand_preset_id,
        "selected_asset_ids": request.selected_asset_ids,
        "include_logo": request.include_logo,
        "logo_asset_id": request.logo_asset_id,
        "additional_logo_asset_ids": request.additional_logo_asset_ids,
        "include_rera_qr": request.include_rera_qr,
        "rera_qr_asset_id": request.rera_qr_asset_id,
        "contact_items": request.contact_items,
        "options": request.options,
        "creative_mode": getattr(request, "creative_mode", "auto"),
        "text_strategy": getattr(request, "text_strategy", "auto"),
        "novelty_level": getattr(request, "novelty_level", 0.7),
        "construction_visual_mode": getattr(request, "construction_visual_mode", "auto"),
        "construction_progress_percent": getattr(request, "construction_progress_percent", 50),
        "festival_visual_scope": getattr(request, "festival_visual_scope", "auto"),
    }


def _project_context_for_model(context: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "brand": context.get("brand"),
        "project": context.get("project"),
        "post_type": context.get("post_type"),
        "festival": context.get("festival"),
        "content_job": context.get("content_job"),
        "session_fact_overrides": context.get("session_fact_overrides"),
        "rera_compliance_block": context.get("rera_compliance_block"),
    }


def coerce_content_job(value: Any, fallback: str) -> str:
    candidate = str(value or "").strip()
    return candidate if candidate in CONTENT_JOBS else fallback


def coerce_asset_selection(selection: Dict[str, Any], assets: List[Dict[str, Any]], fallback: Dict[str, Any]) -> Dict[str, Any]:
    selected_id = selection.get("selected_asset_id")
    if selected_id:
        for asset in assets:
            if asset.get("asset_id") == selected_id:
                return asset
    return fallback


def coerce_variant_specs(plan: Dict[str, Any], request: CompileRequest, content_job_id: str) -> List[Dict[str, Any]]:
    raw = plan.get("variants") if isinstance(plan, dict) else None
    specs = raw if isinstance(raw, list) else []
    out: List[Dict[str, Any]] = []
    count = max(1, min(3, request.variant_count))

    for index, item in enumerate(specs[:count]):
        if not isinstance(item, dict):
            continue
        raw_axis = item.get("variation_axis")
        variation_axis = raw_axis if isinstance(raw_axis, str) and raw_axis.strip() else request.variation_strategy or "auto"
        raw_direction = item.get("creative_direction")
        if isinstance(raw_direction, dict):
            creative_direction = raw_direction
        elif isinstance(raw_direction, str) and raw_direction.strip():
            creative_direction = {"direction_summary": raw_direction.strip()}
        else:
            creative_direction = {}
        raw_variant_id = str(item.get("variant_id") or "").strip()
        variant_id = raw_variant_id if raw_variant_id.startswith("variant_") else "variant_%d" % (index + 1)
        creative_direction = sanitize_creative_direction(creative_direction)
        out.append(
            {
                "variant_id": variant_id,
                "label": str(item.get("label") or item.get("variation_label") or "Creative Option %d" % (index + 1)),
                "variation_axis": variation_axis,
                "selected_template_id": item.get("selected_template_id") or request.visual_template_id,
                "creative_direction": creative_direction,
                "copy_angle": item.get("copy_angle"),
                "why_distinct": item.get("why_distinct"),
                "content_job_id": content_job_id,
            }
        )

    while len(out) < count:
        index = len(out)
        out.append(
            {
                "variant_id": "variant_%d" % (index + 1),
                "label": "Grounded Option %d" % (index + 1),
                "variation_axis": request.variation_strategy if request.variation_strategy != "auto" else "mood",
                "selected_template_id": request.visual_template_id,
                "creative_direction": {},
                "copy_angle": None,
                "why_distinct": "Fallback variant because DSPy returned fewer plans.",
                "content_job_id": content_job_id,
            }
        )

    return out
