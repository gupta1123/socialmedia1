from __future__ import annotations

import json
import os
from pathlib import Path
import re
from typing import Any

from agno.agent import Agent
from agno.media import Image
from agno.models.openai import OpenAIResponses
from pydantic import BaseModel

try:
    from agno.skills import LocalSkills, SkillValidationError, Skills
except ImportError:  # pragma: no cover
    LocalSkills = None
    SkillValidationError = None
    Skills = None

from .schemas import (
    BrandVisibility,
    DeliveryMode,
    DensityLevel,
    FormatType,
    GraphicLayer,
    HeroPresentation,
    LayoutGeometry,
    MoodMode,
    NotebookAnalystInput,
    NotebookBriefAnalysis,
    NotebookCraftedPrompt,
    NotebookVerificationResult,
    NotebookVerifierInput,
    PostType,
    PromptPackageOutput,
    PosterArchetype,
    TextPolicy,
    TextArchitecture,
    TypeVoice,
    VisualMode,
)
from .tools import (
    candidate_assets_for_notebook,
    choose_image_model,
    compact_json,
    derive_aspect_ratio,
    get_brand_guidelines,
    get_project_details,
    get_template_details,
    list_asset_candidates,
    normalize_external_truth_bundle,
    resolve_logo_image_path,
    resolve_reference_strategy,
    resolve_template_image_path,
    resolve_template_type,
    resolve_variation_count,
    truth_bundle_from_payload,
)


SKILLS_DIR = Path(
    os.getenv(
        "AGNO_AGENT_V2_SKILLS_DIR",
        Path(__file__).resolve().parents[1] / "skills" / "prompt" / "v2",
    )
)
PIPELINE_NAME = "briefly-social-notebook-exact-v1"
WORKFLOW_IMPORT_ERROR = "Workflow path intentionally disabled; compiler runs as a deterministic analyst-crafter-verifier chain."


def _format_skill_validation_error(exc: Exception) -> str:
    errors = getattr(exc, "errors", None)
    if callable(errors):
        errors = errors()
    if errors:
        return f"{exc} Errors: {errors}"
    return str(exc)


def build_skills_runtime() -> tuple[Any, list[str]]:
    if LocalSkills is None or Skills is None:
        raise RuntimeError("Agno Skills support is unavailable in this runtime.")
    if not SKILLS_DIR.exists():
        raise RuntimeError(f"Agno Skills directory does not exist: {SKILLS_DIR}")

    try:
        skills_runtime = Skills(loaders=[LocalSkills(str(SKILLS_DIR))])
    except Exception as exc:
        is_validation_error = SkillValidationError is not None and isinstance(exc, SkillValidationError)
        reason = _format_skill_validation_error(exc) if is_validation_error else str(exc)
        raise RuntimeError(f"Agno Skills failed to load from {SKILLS_DIR}: {reason}") from exc

    skill_names = sorted(skills_runtime.get_skill_names())
    if not skill_names:
        raise RuntimeError(f"Agno Skills loaded no skills from {SKILLS_DIR}")

    return skills_runtime, skill_names


def get_registered_skill_names() -> list[str]:
    _, skill_names = build_skills_runtime()
    return skill_names


def get_registered_skill_tool_names() -> list[str]:
    skills_runtime, _ = build_skills_runtime()
    tools = skills_runtime.get_tools()
    return [
        str(getattr(skill_tool, "name", ""))
        for skill_tool in tools
        if getattr(skill_tool, "name", None)
    ]


def reload_skills() -> list[str]:
    skills_runtime, _ = build_skills_runtime()
    skills_runtime.reload()
    return sorted(skills_runtime.get_skill_names())


def list_local_skill_names() -> list[str]:
    return get_registered_skill_names()


def use_openrouter_for_llm() -> bool:
    return os.getenv("USE_OPENROUTER", "false").lower() == "true"


def build_model_kwargs() -> dict[str, Any]:
    timeout = float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "30"))
    max_retries = int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1"))
    if use_openrouter_for_llm():
        return {
            "id": os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite"),
            "base_url": os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            "api_key": os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY"),
            "timeout": timeout,
            "max_retries": max_retries,
        }
    kwargs: dict[str, Any] = {
        "id": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "timeout": timeout,
        "max_retries": max_retries,
    }
    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url
    return kwargs


def use_provider_structured_outputs() -> bool:
    return not use_openrouter_for_llm()


def build_output_contract_instruction(model: type[BaseModel]) -> str:
    return (
        "Return valid JSON only. Do not wrap it in markdown fences. "
        f"Follow this schema exactly:\n{compact_json(model.model_json_schema())}"
    )


def build_agent_output_options(model: type[BaseModel]) -> dict[str, Any]:
    if use_provider_structured_outputs():
        return {
            "output_schema": model,
            "structured_outputs": True,
        }
    return {
        "output_schema": None,
        "structured_outputs": False,
        "use_json_mode": False,
    }


def with_output_contract_instruction(
    instructions: list[str], model: type[BaseModel]
) -> list[str]:
    if use_provider_structured_outputs():
        return instructions
    return [*instructions, build_output_contract_instruction(model)]


def workflow_supported() -> bool:
    return False


def slugify_project_name(value: str | None) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "project"


def normalize_post_type(value: Any) -> PostType | None:
    if value is None:
        return None
    if isinstance(value, PostType):
        return value
    candidate = str(value).strip()
    if not candidate:
        return None
    try:
        return PostType(candidate)
    except ValueError:
        try:
            return PostType(candidate.replace("_", "-"))
        except ValueError:
            return None


def map_format_type(fmt: str | None) -> FormatType:
    normalized = str(fmt or "").strip().lower()
    if normalized == "story":
        return FormatType.story
    if normalized in {"landscape", "cover", "banner"}:
        return FormatType.banner
    return FormatType.social_post


def infer_no_building_image(brief_text: str) -> bool:
    normalized = brief_text.strip().lower()
    if not normalized:
        return False
    patterns = (
        "no building",
        "without building",
        "avoid building",
        "avoid showing building",
        "no tower",
        "without tower",
        "avoid tower",
        "no facade",
        "without facade",
    )
    return any(pattern in normalized for pattern in patterns)


def resolve_selected_reference_paths(bundle: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    seen: set[str] = set()
    for asset in bundle.get("candidateAssets") or []:
        eligibility = asset.get("eligibility") or {}
        if not eligibility.get("isSelectedReference"):
            continue
        storage_path = asset.get("storagePath")
        if not isinstance(storage_path, str) or not storage_path or storage_path in seen:
            continue
        seen.add(storage_path)
        paths.append(storage_path)
    return paths


def build_user_brief(request_context: dict[str, Any]) -> str:
    parts: list[str] = []
    prompt = str(request_context.get("prompt") or "").strip()
    audience = str(request_context.get("audience") or "").strip()
    offer = str(request_context.get("offer") or "").strip()
    exact_text = str(request_context.get("exactText") or "").strip()
    template_type = describe_creative_direction(request_context.get("templateType"))

    if prompt:
        parts.append(prompt)
    if audience:
        parts.append(f"This creative is for {audience}.")
    if template_type:
        parts.append(
            f"Preferred creative direction: {template_type}. Use this only if it fits the post type, asset truth, and business job."
        )
    if offer:
        parts.append(f"Offer: {offer}")
    if exact_text:
        parts.append(f"Exact text: {exact_text}")

    return "\n".join(parts).strip() or "Create a strong real-estate social poster."


def describe_creative_direction(value: Any) -> str | None:
    mapping = {
        "announcement": "editorial",
        "hero": "image-led",
        "product-focus": "feature-led",
        "testimonial": "proof-led",
        "quote": "copy-led",
        "offer": "offer-led",
    }
    normalized = str(value or "").strip().lower()
    return mapping.get(normalized) or None


def build_analyst_input(payload: dict[str, Any]) -> NotebookAnalystInput:
    bundle = truth_bundle_from_payload(payload)
    media_context = payload.get("mediaContext") or {}
    request_context = bundle.get("requestContext") or {}
    project = bundle.get("projectTruth") or {}
    template = bundle.get("templateTruth") or {}
    include_brand_logo = bool(request_context.get("includeBrandLogo"))

    selected_post_type = normalize_post_type((bundle.get("postTypeContract") or {}).get("code"))
    project_slug = str(payload.get("projectSlug") or project.get("slug") or "").strip() or slugify_project_name(project.get("name"))

    template_id = template.get("id")
    reference_images = media_context.get("referenceImages") or []
    reference_image_paths = [
        item.get("url")
        for item in reference_images
        if isinstance(item, dict) and isinstance(item.get("url"), str) and item.get("url")
    ]

    template_image = media_context.get("templateImage") or {}
    template_path = (
        template_image.get("url")
        if isinstance(template_image, dict) and isinstance(template_image.get("url"), str)
        else None
    ) or resolve_template_image_path(bundle)

    logo_image = media_context.get("logoImage") or {}
    logo_path = (
        logo_image.get("url")
        if isinstance(logo_image, dict) and isinstance(logo_image.get("url"), str)
        else None
    )
    if not logo_path and include_brand_logo:
        logo_path = resolve_logo_image_path(bundle)

    return NotebookAnalystInput(
        project_slug=project_slug,
        user_brief=build_user_brief(request_context),
        selected_post_type=selected_post_type,
        reference_image_paths=reference_image_paths,
        reference_image_note=None,
        template_id=str(template_id) if template_id else None,
        template_image_path=template_path,
        template_note=(
            "Treat the template as a style and composition cue only. It must not change project identity."
            if template_id or template_path
            else None
        ),
        logo_image_path=logo_path,
        logo_note=(
            "Treat the logo image as an exact brand mark. Preserve it faithfully."
            if logo_path
            else None
        ),
    )


def build_run_images(analyst_input: NotebookAnalystInput) -> list[Image]:
    ordered_paths: list[str] = []
    ordered_paths.extend(analyst_input.reference_image_paths)
    if analyst_input.template_image_path:
        ordered_paths.append(analyst_input.template_image_path)

    images: list[Image] = []
    seen: set[str] = set()
    for raw_path in ordered_paths:
        path = str(raw_path or "").strip()
        if not path or path in seen:
            continue
        seen.add(path)
        if re.match(r"^https?://", path, flags=re.IGNORECASE):
            images.append(Image(url=path))
            continue
        candidate = Path(path)
        if candidate.exists():
            images.append(Image(filepath=str(candidate)))
    return images


def parse_model_output(raw: Any, model: type[BaseModel]) -> BaseModel:
    if isinstance(raw, model):
        return raw
    if isinstance(raw, BaseModel):
        return model.model_validate(raw.model_dump())
    if isinstance(raw, dict):
        return model.model_validate(raw)
    if isinstance(raw, str):
        return model.model_validate_json(strip_json_fences(raw))
    raise TypeError(f"Unexpected Agno output type: {type(raw)!r}")


def strip_json_fences(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, count=1, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, count=1)
    return text.strip()


def serialize_tool_call(tool_execution: Any, source_agent: str) -> dict[str, Any]:
    return {
        "event": "ToolCallCompleted",
        "toolName": getattr(tool_execution, "tool_name", None),
        "toolArgs": getattr(tool_execution, "tool_args", None)
        if isinstance(getattr(tool_execution, "tool_args", None), dict)
        else None,
        "toolError": getattr(tool_execution, "tool_call_error", None),
        "toolResult": getattr(tool_execution, "result", None),
        "createdAt": getattr(tool_execution, "created_at", None),
        "sourceAgent": source_agent,
    }


def serialize_tool_event(event: Any) -> dict[str, Any] | None:
    event_name = getattr(event, "event", None)
    if event_name not in {"ToolCallCompleted", "ToolCallError"}:
        return None
    tool_execution = getattr(event, "tool", None)
    if tool_execution is None:
        return None
    source_agent = getattr(event, "agent_name", None) or "agent"
    item = serialize_tool_call(tool_execution, str(source_agent))
    item["event"] = event_name
    explicit_error = getattr(event, "error", None)
    if explicit_error:
        item["toolError"] = explicit_error
    return item


def run_agent_with_trace(
    agent: Agent,
    *,
    agent_input: Any,
    dependencies: dict[str, Any],
    model: type[BaseModel],
    images: list[Image] | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    events_count = 0
    tool_calls: list[dict[str, Any]] = []
    final_content: Any = None
    run_id: str | None = None
    resolved_session_id: str | None = None
    llm_model: str | None = None
    model_provider: str | None = None

    run_kwargs: dict[str, Any] = {
        "input": agent_input,
        "dependencies": dependencies,
        "add_dependencies_to_context": False,
        "stream": True,
        "stream_events": True,
    }
    if images:
        run_kwargs["images"] = images
    if session_id:
        run_kwargs["session_id"] = session_id

    stream = agent.run(**run_kwargs)

    for event in stream:
        events_count += 1
        event_name = getattr(event, "event", None)
        if event_name == "RunStarted":
            llm_model = getattr(event, "model", None) or llm_model
            model_provider = getattr(event, "model_provider", None) or model_provider
            run_id = getattr(event, "run_id", None) or run_id
            resolved_session_id = getattr(event, "session_id", None) or resolved_session_id
        elif event_name == "RunCompleted":
            final_content = getattr(event, "content", None)
            run_id = getattr(event, "run_id", None) or run_id
            resolved_session_id = getattr(event, "session_id", None) or resolved_session_id

        tool_call = serialize_tool_event(event)
        if tool_call is not None:
            tool_calls.append(tool_call)

    if final_content is None:
        raise RuntimeError("Agent stream ended without RunCompleted content")

    parsed = parse_model_output(final_content, model)
    return {
        "content": parsed,
        "toolCalls": tool_calls,
        "eventCount": events_count,
        "runId": run_id,
        "sessionId": resolved_session_id,
        "model": llm_model,
        "modelProvider": model_provider,
    }


def collect_used_skill_names(skill_tool_calls: list[dict[str, Any]]) -> list[str]:
    used: list[str] = []
    for call in skill_tool_calls:
        args = call.get("toolArgs")
        if not isinstance(args, dict):
            continue
        skill_name = args.get("skill_name") or args.get("skillName") or args.get("name")
        if isinstance(skill_name, str) and skill_name and skill_name not in used:
            used.append(skill_name)
    return used


def repair_analysis_grounding(
    payload: dict[str, Any], analysis: NotebookBriefAnalysis
) -> NotebookBriefAnalysis:
    if analysis.post_type != PostType.construction_update:
        return analysis
    if analysis.reference_image_paths:
        return analysis
    if analysis.asset_decision.source != "none":
        return analysis

    bundle = truth_bundle_from_payload(payload)
    construction_asset = None
    for asset in candidate_assets_for_notebook(bundle):
        if asset.get("category") == "construction_progress":
            construction_asset = asset
            break

    if not construction_asset:
        return analysis

    analysis.asset_decision.source = "project_library"
    analysis.asset_decision.category = construction_asset.get("category")
    analysis.asset_decision.filename = construction_asset.get("filename")
    analysis.asset_decision.filepath = None
    analysis.asset_decision.asset_id = construction_asset.get("id")
    analysis.asset_decision.asset_label = construction_asset.get("label")
    analysis.asset_decision.asset_subject_type = construction_asset.get("subject_type")
    analysis.asset_decision.reference_tag = construction_asset.get("reference_tag")
    analysis.asset_decision.reason = (
        "Repaired grounding: construction_update requires a truthful construction asset, "
        "and the project library contains construction_progress."
    )
    analysis.asset_decision.fallback_categories = ["project_exterior", "facade"]
    analysis.asset_decision.fallback_asset_ids = []
    analysis.asset_decision.recommended_poster_archetype = (
        PosterArchetype.documentary_presence.value
    )

    analysis.poster_archetype = PosterArchetype.documentary_presence
    analysis.hero_presentation = HeroPresentation.candid_presence
    analysis.layout_geometry = LayoutGeometry.documentary_crop_overlay
    analysis.mood_mode = MoodMode.crisp_daylight
    analysis.visual_mode = VisualMode.asset_faithful
    analysis.delivery_mode = DeliveryMode.finished_poster
    analysis.text_policy = TextPolicy.exact_text

    analysis.reference_usage_plan = (
        f"Use the project-library construction asset {construction_asset.get('filename')} as the truthful primary anchor. "
        "Show real progress, keep the construction state accurate, and use crop / hierarchy / overlay treatment to make it premium without falsifying the site."
    )

    repair_note = (
        "System repair applied: analyst returned source='none' for construction_update even though a project-library "
        "construction_progress asset exists. Grounding was corrected automatically."
    )
    if repair_note not in analysis.conflict_notes:
        analysis.conflict_notes.append(repair_note)

    return analysis


def replacement_label_for_asset(asset: dict[str, Any], bundle: dict[str, Any]) -> str:
    exact_assets = bundle.get("exactAssetContract") or {}
    asset_id = asset.get("id")
    subject_type = (asset.get("normalizedMetadata") or {}).get("subjectType")
    if asset_id == exact_assets.get("requiredProjectAnchorAssetId"):
        return "the supplied project reference"
    if asset_id == exact_assets.get("logoAssetId"):
        return "the supplied logo"
    if asset_id == exact_assets.get("reraQrAssetId"):
        return "the supplied RERA QR"
    if subject_type == "amenity":
        return "the supplied amenity reference"
    return "the supplied reference"


def sanitize_public_prompt_text(prompt: str, bundle: dict[str, Any]) -> str:
    text = prompt.strip()
    candidate_assets = bundle.get("candidateAssets") or []

    for asset in candidate_assets:
        replacement = replacement_label_for_asset(asset, bundle)
        asset_id = asset.get("id")
        if isinstance(asset_id, str) and asset_id:
            escaped = re.escape(asset_id)
            text = re.sub(rf"`{escaped}`", replacement, text)
            text = re.sub(rf"\b{escaped}\b", replacement, text)

        file_name = asset.get("fileName")
        if isinstance(file_name, str) and file_name:
            escaped_file = re.escape(file_name)
            text = re.sub(rf"\{{\s*{escaped_file}\s*\}}", replacement, text)

        storage_path = asset.get("storagePath")
        if isinstance(storage_path, str) and storage_path:
            text = text.replace(storage_path, replacement)

    text = re.sub(r"\bAspect ratio\s+\d+:\d+\.\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


def sanitize_negative_prompt_text(prompt: str, bundle: dict[str, Any]) -> str:
    cleaned = sanitize_public_prompt_text(prompt, bundle)
    if not cleaned:
        return ""

    parts = [cleaned]
    for separator in (",", ";", "\n"):
        next_parts: list[str] = []
        for part in parts:
            next_parts.extend(part.split(separator))
        parts = next_parts

    banned_fragments = (
        "phone",
        "whatsapp",
        "website",
        "email",
        "contact",
        "rera",
        "logo",
        "brand mark",
        "brand logos",
        "watermark",
        "placeholder",
        "url",
        "address",
        "cta",
        "call to action",
        "field-label",
        "field label",
    )
    remove_photo_negatives = bool((bundle.get("exactAssetContract") or {}).get("requiredProjectAnchorAssetId"))
    photo_conflict_fragments = (
        "photograph",
        "photo",
        "photorealistic",
        "existing building",
        "building photo",
    )

    visual_parts: list[str] = []
    seen: set[str] = set()
    for raw_part in parts:
        part = raw_part.strip(" .")
        if not part:
            continue
        lowered = part.lower()
        if any(fragment in lowered for fragment in banned_fragments):
            continue
        if remove_photo_negatives and any(fragment in lowered for fragment in photo_conflict_fragments):
            continue
        if lowered in seen:
            continue
        seen.add(lowered)
        visual_parts.append(part)

    return ", ".join(visual_parts)


def build_seed_prompt(
    verified_prompt: str, analysis: NotebookBriefAnalysis, bundle: dict[str, Any]
) -> str:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", verified_prompt.strip())
        if sentence.strip()
    ]

    selected: list[str] = []
    total_length = 0
    for sentence in sentences:
        projected = total_length + len(sentence) + (1 if selected else 0)
        if projected > 720 and selected:
            break
        selected.append(sentence)
        total_length = projected
        if len(selected) >= 4:
            break

    request_context = bundle.get("requestContext") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
    guardrails: list[str] = []
    if analysis.delivery_mode == DeliveryMode.finished_poster:
        guardrails.append("One poster direction only.")
    if exact_assets.get("requiredProjectAnchorAssetId"):
        guardrails.append("Preserve the supplied project identity.")
    if isinstance(request_context.get("exactText"), str) and request_context.get("exactText").strip():
        guardrails.append("Keep the exact supplied text unchanged and minimal.")
    elif analysis.text_policy != TextPolicy.none:
        guardrails.append("Keep text minimal with one clear reserved zone.")
    guardrails.append("No collage, no multi-panel layout, and no generic replacement.")

    condensed = " ".join(selected).strip()
    suffix = " ".join(guardrails).strip()
    if not condensed:
        return suffix
    return f"{condensed} {suffix}".strip()


def build_prompt_summary(
    analysis: NotebookBriefAnalysis, verified_prompt: str
) -> str:
    cleaned = re.sub(r"\s+", " ", verified_prompt.strip())
    first_sentence = re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)[0].strip()
    if first_sentence:
        return first_sentence[:320]
    return analysis.objective_summary


def normalize_prompt_package(
    payload: dict[str, Any],
    analysis: NotebookBriefAnalysis,
    crafted: NotebookCraftedPrompt,
    verified: NotebookVerificationResult,
    *,
    skill_names: list[str],
    tool_calls: list[dict[str, Any]],
    event_count: int,
    run_id: str | None,
    session_id: str | None,
    llm_model: str | None,
    model_provider: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle = truth_bundle_from_payload(payload)
    generation_contract = bundle.get("generationContract") or {}
    requested_variation_count = resolve_variation_count(payload)

    clean_prompt = sanitize_public_prompt_text(verified.revised_prompt, bundle)
    clean_negative = sanitize_negative_prompt_text(verified.revised_negative, bundle)
    final_prompt = clean_prompt
    if clean_negative:
        final_prompt = f"{clean_prompt} Negative prompt: {clean_negative}".strip()

    seed_prompt = build_seed_prompt(clean_prompt, analysis, bundle)
    prompt_summary = build_prompt_summary(analysis, clean_prompt)

    normalized_variations = [
        {
            "id": "variation_1",
            "title": analysis.poster_archetype.value.replace("_", " ").title(),
            "strategy": analysis.objective_summary,
            "seedPrompt": seed_prompt,
            "finalPrompt": final_prompt,
            "referenceStrategy": resolve_reference_strategy(payload),
            "resolvedConstraints": {
                "posterArchetype": analysis.poster_archetype.value,
                "heroPresentation": analysis.hero_presentation.value,
                "layoutGeometry": analysis.layout_geometry.value,
                "graphicLayer": [layer.value for layer in analysis.graphic_layer],
                "textArchitecture": analysis.text_architecture.value,
                "commercialHook": analysis.commercial_hook.value if analysis.commercial_hook else None,
                "visualMechanism": analysis.visual_mechanism.value if analysis.visual_mechanism else None,
            },
            "compilerTrace": {
                "verified": verified.approved,
                "verificationSummary": verified.verification_summary,
            },
        }
    ]

    skill_tool_calls = [
        call for call in tool_calls if str(call.get("toolName", "")).startswith("get_skill_")
    ]
    used_skill_names = collect_used_skill_names(skill_tool_calls)
    compiler_trace = {
        "pipeline": PIPELINE_NAME,
        "orchestration": "manual-three-agent",
        "analystAgent": "Brief Analyst",
        "crafterAgent": "Prompt Crafter",
        "verifierAgent": "Prompt Verifier",
        "analystOutput": analysis.model_dump(mode="json"),
        "craftedOutput": crafted.model_dump(mode="json"),
        "verifierOutput": verified.model_dump(mode="json"),
        "verifierApproved": verified.approved,
        "verifierIssues": verified.issues,
        "verificationSummary": verified.verification_summary,
        "skillsLoaded": bool(skill_names),
        "loadedSkillNames": skill_names,
        "loadedSkillCount": len(skill_names),
        "registeredSkillNames": skill_names,
        "registeredSkillCount": len(skill_names),
        "usedSkillNames": used_skill_names,
        "requestedVariationCount": requested_variation_count,
        "returnedVariationCount": len(normalized_variations),
        "toolCalls": tool_calls,
        "skillToolCalls": skill_tool_calls,
        "eventCount": event_count,
        "runId": run_id,
        "sessionId": session_id,
        "model": llm_model,
        "modelProvider": model_provider,
        "workflowAvailable": False,
        "workflowImportError": WORKFLOW_IMPORT_ERROR,
        "truthBundleSummary": {
            "postTypeCode": (bundle.get("postTypeContract") or {}).get("code"),
            "playbookKey": (bundle.get("postTypeContract") or {}).get("playbookKey"),
            "candidateAssetIds": [
                asset.get("id") for asset in (bundle.get("candidateAssets") or []) if asset.get("id")
            ],
            "exactAssetIds": {
                "logo": (bundle.get("exactAssetContract") or {}).get("logoAssetId"),
                "reraQr": (bundle.get("exactAssetContract") or {}).get("reraQrAssetId"),
                "projectAnchor": (bundle.get("exactAssetContract") or {}).get("requiredProjectAnchorAssetId"),
            },
        },
        "promptSystemVersion": "briefly-social-notebook-exact-v1",
    }
    resolved_constraints = {
        "brandName": (bundle.get("brandTruth") or {}).get("name"),
        "projectName": (bundle.get("projectTruth") or {}).get("name"),
        "festivalName": (bundle.get("festivalTruth") or {}).get("name"),
        "channel": (bundle.get("requestContext") or {}).get("channel"),
        "format": (bundle.get("requestContext") or {}).get("format"),
        "includeBrandLogo": (bundle.get("requestContext") or {}).get("includeBrandLogo", False),
        "includeReraQr": (bundle.get("requestContext") or {}).get("includeReraQr", False),
        "brandLogoAssetId": (bundle.get("exactAssetContract") or {}).get("logoAssetId"),
        "reraQrAssetId": (bundle.get("exactAssetContract") or {}).get("reraQrAssetId"),
        "projectAnchorAssetId": (bundle.get("exactAssetContract") or {}).get("requiredProjectAnchorAssetId"),
        "variationCount": requested_variation_count,
        "compilerMode": "briefly-social-agno",
        "promptDetailMode": "notebook-exact-adapter",
        "posterArchetype": analysis.poster_archetype.value,
        "heroPresentation": analysis.hero_presentation.value,
        "layoutGeometry": analysis.layout_geometry.value,
        "graphicLayer": [layer.value for layer in analysis.graphic_layer],
        "typeVoice": analysis.type_voice.value,
        "textArchitecture": analysis.text_architecture.value,
        "moodMode": analysis.mood_mode.value,
        "density": analysis.density.value,
        "brandVisibility": analysis.brand_visibility.value,
        "commercialHook": analysis.commercial_hook.value if analysis.commercial_hook else None,
        "visualMechanism": analysis.visual_mechanism.value if analysis.visual_mechanism else None,
    }

    result = {
        "promptSummary": prompt_summary,
        "seedPrompt": seed_prompt,
        "finalPrompt": final_prompt,
        "aspectRatio": analysis.aspect_ratio
        or generation_contract.get("aspectRatio")
        or derive_aspect_ratio((bundle.get("requestContext") or {}).get("format")),
        "chosenModel": generation_contract.get("chosenModel") or choose_image_model(),
        "referenceStrategy": resolve_reference_strategy(payload),
        "templateType": resolve_template_type(payload),
        "variations": normalized_variations,
        "resolvedConstraints": resolved_constraints,
        "compilerTrace": compiler_trace,
        "selectedAmenity": analysis.specific_amenity
        or ((bundle.get("amenityResolution") or {}).get("selectedAmenity")),
        "amenityImageAssetIds": (bundle.get("amenityResolution") or {}).get("selectedAssetIds")
        or [],
    }
    return result, compiler_trace


def build_agents() -> dict[str, Any]:
    model_kwargs = build_model_kwargs()
    _skills_runtime, skill_names = build_skills_runtime()
    analyst_output_options = build_agent_output_options(NotebookBriefAnalysis)
    crafter_output_options = build_agent_output_options(NotebookCraftedPrompt)
    verifier_output_options = build_agent_output_options(NotebookVerificationResult)

    analyst = Agent(
        name="Brief Analyst",
        model=OpenAIResponses(**model_kwargs),
        input_schema=NotebookAnalystInput,
        tools=[
            get_project_details,
            get_brand_guidelines,
            get_template_details,
            list_asset_candidates,
        ],
        skills=None,
        debug_mode=True,
        markdown=True,
        instructions=with_output_contract_instruction(
            [
                "You are a structured brief analyst for a real-estate social-media prompt pipeline.",
                "Return ONLY structured data matching the schema.",
                "",
                "Briefly Social skill guidance is preloaded for this run. Do not call or request skill tools.",
                "",
                "Workflow:",
                "1. Read the supplied project_slug. It is canonical for this run.",
                "2. If selected_post_type is provided, use it. Otherwise infer post_type from the brief.",
                "3. Call get_project_details(project_slug) and get_brand_guidelines().",
                "4. If template_id is provided, call get_template_details(template_id).",
                "5. The attached images correspond only to reference_image_paths and template_image_path in the input.",
                "6. If reference_image_paths are provided, use vision to understand what the image(s) show, decide the strongest hero, and decide crop / angle / realism treatment.",
                "7. Treat template_image_path as a style and composition cue only. It must not change project identity.",
                "8. Treat logo_image_path as exact brand-mark metadata for downstream placement; do not inspect it with vision in the analyst stage.",
                "9. If reference_image_paths are provided, prefer uploaded_reference as the primary asset source unless the brief clearly needs a project-library asset instead.",
                "10. If reference_image_paths are empty and the post type requires a truthful visual anchor, you must use a project-library asset when one exists.",
                "11. For construction_update, if no uploaded reference image is provided, call list_asset_candidates(project_slug, post_type, specific_amenity, occasion, no_building_image, brief_text=user_brief) and choose the truthful construction_progress asset from the project library when available.",
                "12. Do not use asset_decision.source='none' for construction_update when a project-library construction asset exists.",
                "13. If you need a project-library asset, call list_asset_candidates(project_slug, post_type, specific_amenity, occasion, no_building_image, brief_text=user_brief).",
                "14. If asset_decision.source='project_library', copy category, filename, and reference_tag verbatim from the tool output.",
                "15. If asset_decision.source='uploaded_reference', copy filepath verbatim from the input, set filename to the basename of the chosen path, and set reference_tag=null.",
                "16. Use asset_decision.source='none' only when visual_mode is graphic_led or no truthful visual anchor fits.",
                "17. For ad post types, choose exactly one dominant commercial_hook and one visual_mechanism. Keep them narrow and conversion-oriented rather than stylistic.",
                "",
                "Non-negotiable rules:",
                "- Do not fabricate filenames, filepaths, reference_tags, or template ids.",
                "- Do not let the template image override reference-image truth.",
                "- Do not let the logo become stylized, distorted, or rewritten.",
                "- Do not treat post_type as design style.",
                "- For ads, do not let price, offer, proof, CTA, and compliance compete equally. One hook must dominate.",
                "",
                "Defaults:",
                "- Default delivery_mode to finished_poster unless the brief explicitly asks for a base visual.",
                "- For finished_poster mode, default text_policy to exact_text.",
                "- social_post=1:1, story=9:16, banner=16:9 unless the brief explicitly says otherwise.",
                "- visual_mode: asset_faithful for documentary truth, editorialized_truth for most premium posters, graphic_led only when no truthful asset fits.",
                "",
                "You must fill:",
                "- reference_image_paths",
                "- template_id / template_image_path / logo_image_path if present",
                "- reference_usage_plan",
                "- template_usage_plan when a template exists",
                "- logo_usage_plan when a logo image exists",
                "- conflict_notes when brief, template, and truth pull in different directions",
            ],
            NotebookBriefAnalysis,
        ),
        **analyst_output_options,
    )

    crafter = Agent(
        name="Prompt Crafter",
        model=OpenAIResponses(**model_kwargs),
        input_schema=NotebookBriefAnalysis,
        skills=None,
        debug_mode=True,
        markdown=True,
        instructions=with_output_contract_instruction(
            [
                "You are a real-estate image prompt engineer.",
                "Return ONLY structured data matching the schema.",
                "",
                "Briefly Social skill guidance is preloaded for this run. Do not call or request skill tools.",
                "",
                "Rules:",
                "- The attached images correspond to reference_image_paths and template_image_path in the analysis. logo_image_path is exact brand-mark metadata, not a visual-analysis input.",
                "- If asset_decision.reference_tag exists, start the prompt with it.",
                "- If asset_decision.source='uploaded_reference', do not invent a filename; rely on the attached reference image and the reference_usage_plan.",
                "- If asset_decision.source='project_library', the prompt must stay anchored to the selected category and reference_tag.",
                "- Preserve actual architecture, amenity design, construction state, and recognisable identity.",
                "- You may improve crop, camera angle, clarity, realism, and editorial finish when the reference_usage_plan allows it.",
                "- template_usage_plan shapes style and composition only. It must not replace project truth.",
                "- logo_usage_plan means the logo image should be reproduced exactly and placed with discipline.",
                "- Keep prompts dense, visual, and compositional.",
                "- If delivery_mode=finished_poster, write a finished poster prompt, not a scenic base-image prompt.",
                "- poster_archetype and levers must be visible in the final prompt.",
                "- For ad post types, commercial_hook and visual_mechanism must be visible as the obvious hook device and hierarchy, not as internal labels.",
                "- If text_policy=exact_text, include the exact text and integrate it into the poster composition.",
                "- Do not write a generic prompt for construction_update without a truthful primary asset.",
            ],
            NotebookCraftedPrompt,
        ),
        **crafter_output_options,
    )

    verifier = Agent(
        name="Prompt Verifier",
        model=OpenAIResponses(**model_kwargs),
        input_schema=NotebookVerifierInput,
        debug_mode=True,
        markdown=True,
        instructions=with_output_contract_instruction(
            [
                "You are the final QA gate for real-estate image prompts.",
                "Return ONLY structured data matching the schema.",
                "",
                "Check:",
                "- truthfulness and recognisability",
                "- correct use of the reference image",
                "- template staying style-only instead of identity-changing",
                "- exact-logo requirement when a logo image is present",
                "- business-job fit, hierarchy, style-family fidelity, and anti-repetition quality",
                "",
                "Revision rules:",
                "- Reject outputs where construction_update has no truthful primary asset while a project-library construction asset exists.",
                "- Reject outputs that describe a generic facade crop or generic documentary poster without a grounded primary asset.",
                "- Reject outputs where the template image is likely to override project identity.",
                "- Reject outputs where the logo could be distorted or rewritten.",
                "- Reject outputs that feel like a plain hero image plus normal text.",
                "- Reject outputs where the selected style family is named but not visibly executed.",
                "",
                "Approval rules:",
                "- Approve only if the prompt is grounded, specific, recognisable, and poster-grade.",
                "- If the prompt is already good, keep it with minimal edits.",
                "- If the prompt is weak, revise the prompt and negative constraints directly instead of describing the problem only.",
            ],
            NotebookVerificationResult,
        ),
        **verifier_output_options,
    )

    analyst.tool_call_limit = 6
    crafter.tool_call_limit = 2
    verifier.tool_call_limit = 0

    return {
        "analyst": analyst,
        "crafter": crafter,
        "verifier": verifier,
        "skillNames": skill_names,
    }


def build_agent() -> Agent:
    return build_agents()["crafter"]


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    result, _ = execute_with_trace(payload)
    return result


def execute_with_trace(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    normalized_payload = {
        **payload,
        "truthBundle": normalize_external_truth_bundle(payload.get("truthBundle") or {}),
    }
    dependencies = {"truthBundle": normalized_payload.get("truthBundle") or {}}
    agents = build_agents()

    analyst_input = build_analyst_input(normalized_payload)
    run_images = build_run_images(analyst_input)

    analyst_traced = run_agent_with_trace(
        agents["analyst"],
        agent_input=analyst_input,
        dependencies=dependencies,
        model=NotebookBriefAnalysis,
        images=run_images,
    )
    analysis = repair_analysis_grounding(normalized_payload, analyst_traced["content"])

    crafter_traced = run_agent_with_trace(
        agents["crafter"],
        agent_input=analysis,
        dependencies=dependencies,
        model=NotebookCraftedPrompt,
        images=run_images,
    )

    verifier_traced = run_agent_with_trace(
        agents["verifier"],
        agent_input=NotebookVerifierInput(
            brief_analysis=analysis,
            crafted_prompt=crafter_traced["content"],
        ),
        dependencies=dependencies,
        model=NotebookVerificationResult,
        images=run_images,
    )

    tool_calls = [
        *analyst_traced["toolCalls"],
        *crafter_traced["toolCalls"],
        *verifier_traced["toolCalls"],
    ]
    event_count = (
        analyst_traced["eventCount"]
        + crafter_traced["eventCount"]
        + verifier_traced["eventCount"]
    )
    result, trace = normalize_prompt_package(
        normalized_payload,
        analysis,
        crafter_traced["content"],
        verifier_traced["content"],
        skill_names=agents["skillNames"],
        tool_calls=tool_calls,
        event_count=event_count,
        run_id=verifier_traced["runId"] or crafter_traced["runId"] or analyst_traced["runId"],
        session_id=verifier_traced["sessionId"]
        or crafter_traced["sessionId"]
        or analyst_traced["sessionId"],
        llm_model=verifier_traced["model"] or crafter_traced["model"] or analyst_traced["model"],
        model_provider=verifier_traced["modelProvider"]
        or crafter_traced["modelProvider"]
        or analyst_traced["modelProvider"],
    )
    return result, trace
