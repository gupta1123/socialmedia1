from __future__ import annotations

import json
import os
import re
import ast
import tempfile
from typing import Any, Dict, List, Optional

os.environ.setdefault("DSPY_CACHEDIR", os.path.join(tempfile.gettempdir(), "briefly-social-dspy-cache"))
os.environ.setdefault("LITELLM_CACHE_DIR", os.path.join(tempfile.gettempdir(), "briefly-social-litellm-cache"))

import dspy

from .schemas import CompileRequest
from .creative_levers import CONTENT_JOBS as CONTENT_JOB_REGISTRY, lever_options_for_job, sanitize_creative_direction


CONTENT_JOBS = list(CONTENT_JOB_REGISTRY.keys())


class JsonObjectAdapter(dspy.JSONAdapter):
    """Use provider JSON mode without structured-output retries.

    This mirrors the notebook setup for OpenRouter/Gemini. The default DSPy JSON
    adapter can ask providers for structured output in a way OpenRouter does not
    always support, and then parse only ChainOfThought reasoning. JSON mode keeps
    the response shape stable while preserving DSPy's field extraction.
    """

    def __call__(self, lm, lm_kwargs, signature, demos, inputs):
        lm_kwargs["response_format"] = {"type": "json_object"}
        return dspy.ChatAdapter.__call__(self, lm, lm_kwargs, signature, demos, inputs)


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

    request_json = dspy.InputField()
    project_context_json = dspy.InputField()
    available_content_jobs_json = dspy.InputField()
    intent_json = dspy.OutputField(
        desc=(
            "JSON object with resolved_content_job_id, confidence, brief_summary, "
            "explicit_user_requests, factual_claims, risk_notes."
        )
    )


class SelectHeroAsset(dspy.Signature):
    """Choose the best hero/reference asset from a factual asset shortlist."""

    request_json = dspy.InputField()
    content_job_id = dspy.InputField()
    asset_candidates_json = dspy.InputField()
    selection_json = dspy.OutputField(
        desc=(
            "JSON object with selected_asset_id, confidence, selection_reason, "
            "asset_role, render_truth_notes, warnings."
        )
    )


class GenerateVariantPlan(dspy.Signature):
    """Plan up to three visually distinct but grounded single-post variants.

    Use only eligible templates for content_job_id. For festive_greeting, make the occasion/festival
    the central creative axis and avoid launch, pricing, or site-visit framing unless explicitly requested.
    """

    request_json = dspy.InputField()
    content_job_id = dspy.InputField()
    selected_asset_json = dspy.InputField()
    eligible_templates_json = dspy.InputField()
    lever_options_json = dspy.InputField()
    variant_plan_json = dspy.OutputField(
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

    request_json = dspy.InputField()
    project_context_json = dspy.InputField()
    asset_json = dspy.InputField()
    variant_spec_json = dspy.InputField()
    output_json = dspy.OutputField(
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

    request_json = dspy.InputField()
    output_json = dspy.InputField()
    validation_json = dspy.OutputField(
        desc="JSON object with passed boolean, score 0-1, errors array, warnings array, improvement_notes array."
    )


class RepairCreativeOutput(dspy.Signature):
    """Repair one generated creative output without changing grounded facts or selected assets."""

    request_json = dspy.InputField()
    output_json = dspy.InputField()
    validation_json = dspy.InputField()
    repaired_output_json = dspy.OutputField(
        desc="JSON object with the same output fields, fixed for validation errors while preserving selected asset, facts, and copy."
    )


class AuditAndRepairPrompt(dspy.Signature):
    """Final prompt audit and semantic repair for one provider prompt.

    Preserve the creative idea, but remove contradictions, unsafe facts, wrong post-type language,
    and asset/template leakage. Return JSON only.
    """

    audit_payload_json = dspy.InputField()
    audit_result_json = dspy.OutputField(
        desc=(
            "JSON object with status clean|repaired|needs_input|blocked, repaired_provider_prompt, "
            "repaired_negative_prompt, issues_found array, changes_made array, remaining_risks array, "
            "facts_used_in_prompt array, facts_used_in_visible_copy array. Do not invent facts."
        )
    )


class DspyPromptProgram:
    def __init__(self) -> None:
        configure_dspy_once()
        self.resolve_intent = dspy.ChainOfThought(ResolveCreativeIntent)
        self.select_asset = dspy.ChainOfThought(SelectHeroAsset)
        self.plan_variants = dspy.ChainOfThought(GenerateVariantPlan)
        self.generate_prompt = dspy.ChainOfThought(GenerateImagePrompt)
        self.validate_quality = dspy.ChainOfThought(ValidateCreativeQuality)
        self.repair_output = dspy.ChainOfThought(RepairCreativeOutput)
        self.audit_prompt = dspy.ChainOfThought(AuditAndRepairPrompt)

    def resolve(self, request: CompileRequest, context: Dict[str, Any]) -> Dict[str, Any]:
        pred = self.resolve_intent(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            project_context_json=json.dumps(_project_context_for_model(context), ensure_ascii=False),
            available_content_jobs_json=json.dumps(CONTENT_JOBS, ensure_ascii=False),
        )
        return extract_json(getattr(pred, "intent_json", pred))

    def select_hero_asset(self, request: CompileRequest, content_job_id: str, assets: List[Dict[str, Any]], asset_selection_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pred = self.select_asset(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            content_job_id=content_job_id,
            asset_candidates_json=json.dumps(asset_selection_context or assets[:12], ensure_ascii=False),
        )
        return extract_json(getattr(pred, "selection_json", pred))

    def make_variant_plan(
        self,
        request: CompileRequest,
        content_job_id: str,
        asset: Dict[str, Any],
        templates: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        pred = self.plan_variants(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            content_job_id=content_job_id,
            selected_asset_json=json.dumps(asset, ensure_ascii=False),
            eligible_templates_json=json.dumps(templates[:8], ensure_ascii=False),
            lever_options_json=json.dumps(lever_options_for_job(content_job_id), ensure_ascii=False),
        )
        return extract_json(getattr(pred, "variant_plan_json", pred))

    def generate_variant_output(
        self,
        request: CompileRequest,
        context: Dict[str, Any],
        asset: Dict[str, Any],
        variant_spec: Dict[str, Any],
    ) -> Dict[str, Any]:
        pred = self.generate_prompt(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            project_context_json=json.dumps(_project_context_for_model(context), ensure_ascii=False),
            asset_json=json.dumps(asset, ensure_ascii=False),
            variant_spec_json=json.dumps(variant_spec, ensure_ascii=False),
        )
        return extract_json(getattr(pred, "output_json", pred))

    def validate_output(self, request: CompileRequest, output: Dict[str, Any]) -> Dict[str, Any]:
        pred = self.validate_quality(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            output_json=json.dumps(output, ensure_ascii=False),
        )
        return extract_json(getattr(pred, "validation_json", pred))

    def audit_and_repair_prompt(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        pred = self.audit_prompt(
            audit_payload_json=json.dumps(payload, ensure_ascii=False),
        )
        return extract_json(getattr(pred, "audit_result_json", pred))

    def repair_variant_output(self, request: CompileRequest, output: Dict[str, Any], validation: Dict[str, Any]) -> Dict[str, Any]:
        pred = self.repair_output(
            request_json=json.dumps(_request_for_model(request), ensure_ascii=False),
            output_json=json.dumps(output, ensure_ascii=False),
            validation_json=json.dumps(validation, ensure_ascii=False),
        )
        return extract_json(getattr(pred, "repaired_output_json", pred))


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
