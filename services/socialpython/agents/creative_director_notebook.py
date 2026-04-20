from __future__ import annotations

from dataclasses import dataclass
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

try:
    from agno.agent import Agent
    from agno.models.openai import OpenAIResponses
    from agno.run import RunContext
    from agno.tools import tool
except ImportError as exc:  # pragma: no cover - exercised only when deps missing
    raise SystemExit(f"Agno dependencies are missing: {exc}") from exc

try:
    from agno.skills import LocalSkills, SkillValidationError, Skills
except (
    ImportError
):  # pragma: no cover - exercised only when optional skills support is unavailable
    LocalSkills = None
    SkillValidationError = None
    Skills = None

try:
    from agno.workflow import Step, Workflow
    from agno.workflow.types import StepInput, StepOutput as WorkflowStepOutput
except ImportError as exc:  # pragma: no cover - exercised when workflow extras are unavailable
    Step = None
    Workflow = None
    StepInput = Any
    WorkflowStepOutput = Any
    WORKFLOW_IMPORT_ERROR = str(exc)
else:
    WORKFLOW_IMPORT_ERROR = None


SKILLS_DIR = Path(
    os.getenv(
        "AGNO_AGENT_V2_SKILLS_DIR",
        Path(__file__).resolve().parents[1] / "skills" / "prompt" / "v2",
    )
)
PIPELINE_WORKFLOW = "agno-sequential-workflow-v2"
PIPELINE_MANUAL = "notebook-style-two-agent"
WORKFLOW_NAME = "Prompt Lab v2 Sequential Workflow"
ANALYST_STEP_NAME = "brief_analysis"
CRAFTER_INPUT_STEP_NAME = "prepare_crafter_input"
CRAFTER_STEP_NAME = "prompt_crafting"


@dataclass(frozen=True)
class AgentBundle:
    brief_analyst: Agent
    prompt_crafter: Agent
    skill_names: list[str]


class PromptVariationOutput(BaseModel):
    title: str = Field(..., description="Short label for this creative route.")
    strategy: str = Field(..., description="How this route is meaningfully different.")
    finalPrompt: str = Field(
        ..., description="Single-image prompt for a finished post option."
    )


class PromptPackageOutput(BaseModel):
    promptSummary: str = Field(
        ..., description="One line description of the creative direction."
    )
    variations: list[PromptVariationOutput] = Field(default_factory=list, min_length=1)

ANALYST_OUTPUT_INSTRUCTION = """
Produce a concise working brief for the prompt crafter.

Required sections:
## Brief Contract
## Truth Summary
## Asset Decision (MUST list the hero asset id, plus at most one secondary style/context asset id when materially useful, plus logo/RERA if enabled)
## Strategy Route
## Risk Checks

Keep it compact.
Retrieve facts through tools instead of hallucinating them.
Only include facts that materially affect the image.

CRITICAL: Asset Decision must list ONLY:
- 1 hero asset id (selected via get_assets_for_post_type tool - this is the PRIMARY reference)
- 0 or 1 secondary style/context asset id only when it materially improves layout or poster fidelity
- logo asset id (if includeBrandLogo is true)
- RERA QR asset id (if includeReraQr is true)

Do NOT list multiple candidate assets, long reference lists, or all available images.
The prompt crafter will use only these selected assets in the final prompt package.
""".strip()

ANALYST_SKILL_WORKFLOW_INSTRUCTION = """
Use Agno Skills before deciding the route.

- First load `brief-interpreter` using `get_skill_instructions`.
- If `postTypeContract.playbookKey` is present, load that exact playbook skill before writing Strategy Route.
- Load `brand-compliance-interpreter` only when brand guidance needs extra translation into image behavior.
- Do not paste raw skill text or raw tool output into the brief.
""".strip()

CRAFTER_OUTPUT_INSTRUCTION = """
Return a distilled prompt package, not a manifest dump.

- promptSummary: one line describing the creative direction.
- variations: create exactly the requested number of distinct finished post options.
- Each variation must have its own title, strategy, and finalPrompt.
- finalPrompt: a resolved, production-ready, single-image post option.
- Variation prompts must differ in composition strategy, visual hierarchy, mood/lighting, and copy treatment.
- Do not make variations minor rewordings of the same prompt.
- Use the analyst output plus loaded skills to synthesize, not restate.
- If exact text is provided, preserve it exactly.
- If logo or RERA QR toggles are on, require exact supplied assets or clean omission. Never invent placeholders.
- When logo is enabled, integrate the exact supplied logo as a small footer/signature sign-off that belongs to the poster composition. Do not place it on a hard white or solid card, badge, chip, pill, banner, floating tile, or sticker-like backing. If legibility needs help, use only a subtle tonal footer band or quiet local contrast already belonging to the poster.
- Never describe mood boards, tiled boards, mockup sheets, artboards, multiple posters, or style exploration inside one frame.
- Resolve conflicts in this order: exact asset contract, exact required text, compliance and factual bans, post-type playbook, project or festival truth, brand hard rules, brand soft preferences, variation styling.
- Concise poster-spec language is allowed when it materially improves generation quality: subject dominance, headline region, support-line region, CTA-safe reserve, footer or signature treatment, and negative-space planning.
- Do not write like a design tool, dashboard, wireframe, or template editor.
- Do not return compatibility fields such as seedPrompt, chosenModel, aspectRatio, templateType, or referenceStrategy. The server derives those.
- Let skills own playbook, composition, copy, reference, asset-use, and verification rules; do not rely on hidden generic prompt rules for those decisions.
""".strip()

SKILL_WORKFLOW_INSTRUCTION = """
Use Agno Skills tools directly for guidance.

- Load only the skill instructions you need using skill tools.
- Always load the playbook skill named by `postTypeContract.playbookKey` before writing final prompts.
- Load `composition-planner`, `prompt-assembler`, and `prompt-verifier` before returning the final prompt package.
- Load `variation-planner` only when more than one variation is requested. Do not load it for a single-option request.
- Load `copy-typography-planner` when the post includes in-image text, logo, QR, offer, or exact copy.
- Load `missing-asset-handler` when the analyst reports no suitable hero asset.
- Do not invent skill names.
- Do not paste raw skill text or raw tool output into the final JSON.
""".strip()


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
        is_validation_error = (
            SkillValidationError is not None and isinstance(exc, SkillValidationError)
        )
        reason = _format_skill_validation_error(exc) if is_validation_error else str(exc)
        raise RuntimeError(
            f"Agno Skills failed to load from {SKILLS_DIR}: {reason}"
        ) from exc

    skill_names = sorted(skills_runtime.get_skill_names())
    if not skill_names:
        raise RuntimeError(f"Agno Skills loaded no skills from {SKILLS_DIR}")

    return skills_runtime, skill_names


def get_registered_skill_names() -> list[str]:
    _, skill_names = build_skills_runtime()
    return skill_names


def reload_skills() -> list[str]:
    skills_runtime, _ = build_skills_runtime()
    skills_runtime.reload()
    return sorted(skills_runtime.get_skill_names())


def list_local_skill_names() -> list[str]:
    return get_registered_skill_names()

def compact_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


def compact_brand_truth(brand: dict[str, Any]) -> dict[str, Any]:
    visual_system = brand.get("visualSystem") or {}
    voice = brand.get("voice") or {}
    compliance = brand.get("compliance") or {}
    return {
        "name": brand.get("name"),
        "palette": brand.get("palette"),
        "styleDescriptors": take_top(brand.get("styleDescriptors"), 5),
        "visualSystem": {
            "typographyMood": visual_system.get("typographyMood"),
            "headlineFontFamily": visual_system.get("headlineFontFamily"),
            "bodyFontFamily": visual_system.get("bodyFontFamily"),
            "textDensity": visual_system.get("textDensity"),
            "realismLevel": visual_system.get("realismLevel"),
            "imageTreatment": take_top(visual_system.get("imageTreatment"), 3),
            "compositionPrinciples": take_top(
                visual_system.get("compositionPrinciples"), 3
            ),
        },
        "voice": {
            "summary": voice.get("summary"),
            "approvedVocabulary": take_top(voice.get("approvedVocabulary"), 6),
            "bannedPhrases": take_top(voice.get("bannedPhrases"), 6),
        },
        "doRules": take_top(brand.get("doRules"), 4),
        "dontRules": take_top(brand.get("dontRules"), 4),
        "bannedPatterns": take_top(brand.get("bannedPatterns"), 6),
        "compliance": {
            "bannedClaims": take_top(compliance.get("bannedClaims"), 6),
            "reviewChecks": take_top(compliance.get("reviewChecks"), 4),
        },
    }


def compact_project_truth(project: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project.get("id"),
        "name": project.get("name"),
        "stage": project.get("stage"),
        "tagline": project.get("tagline"),
        "positioning": project.get("positioning"),
        "lifestyleAngle": project.get("lifestyleAngle"),
        "audienceSegments": take_top(project.get("audienceSegments"), 4),
        "heroAmenities": take_top(project.get("heroAmenities"), 4),
        "locationAdvantages": take_top(project.get("locationAdvantages"), 3),
        "nearbyLandmarks": take_top(project.get("nearbyLandmarks"), 3),
        "constructionStatus": project.get("constructionStatus"),
        "latestUpdate": project.get("latestUpdate"),
        "approvedClaims": take_top(project.get("approvedClaims"), 5),
        "bannedClaims": take_top(project.get("bannedClaims"), 5),
        "legalNotes": take_top(project.get("legalNotes"), 4),
        "credibilityFacts": take_top(project.get("credibilityFacts"), 4),
        "reraNumber": project.get("reraNumber"),
        "actualProjectImageIds": take_top(project.get("actualProjectImageIds"), 4),
        "sampleFlatImageIds": take_top(project.get("sampleFlatImageIds"), 4),
    }


def compact_generation_contract(contract: dict[str, Any]) -> dict[str, Any]:
    return {
        "aspectRatio": contract.get("aspectRatio"),
        "chosenModel": contract.get("chosenModel"),
        "variationCount": contract.get("variationCount"),
        "maxSupportingRefs": contract.get("maxSupportingRefs"),
        "hardGuardrails": take_top(contract.get("hardGuardrails"), 8),
    }


def compact_candidate_assets(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compacted: list[dict[str, Any]] = []
    for asset in assets[:8]:
        metadata = asset.get("normalizedMetadata") or {}
        compacted.append(
            {
                "id": asset.get("id"),
                "label": asset.get("label"),
                "subjectType": metadata.get("subjectType"),
                "qualityTier": metadata.get("qualityTier"),
                "amenityName": metadata.get("amenityName"),
                "eligibility": {
                    "isExactLogo": (asset.get("eligibility") or {}).get("isExactLogo"),
                    "isExactReraQr": (asset.get("eligibility") or {}).get(
                        "isExactReraQr"
                    ),
                },
            }
        )
    return compacted


def take_top(values: list[str] | None, count: int) -> list[str]:
    if not values:
        return []
    return [value for value in values[:count] if value]


def derive_aspect_ratio(fmt: str | None) -> str:
    mapping = {
        "square": "1:1",
        "portrait": "4:5",
        "landscape": "16:9",
        "story": "9:16",
        "cover": "16:9",
    }
    return mapping.get((fmt or "").strip().lower(), "1:1")


def choose_image_model() -> str:
    provider = os.getenv("IMAGE_GENERATION_PROVIDER", "fal")
    if provider == "openrouter":
        return os.getenv("OPENROUTER_FINAL_MODEL", "google/gemini-2.5-flash-image")
    return os.getenv("FAL_FINAL_MODEL", "fal-ai/nano-banana/edit")


def use_openrouter_for_llm() -> bool:
    return os.getenv("USE_OPENROUTER", "false").lower() == "true"


def resolve_llm_config() -> tuple[str, str]:
    if use_openrouter_for_llm():
        return (
            "openrouter",
            os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash"),
        )
    return ("openai", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))


def is_festival_playbook(payload: dict[str, Any]) -> bool:
    bundle = normalize_external_truth_bundle(payload.get("truthBundle") or {})
    post_type = bundle.get("postTypeContract") or {}
    return post_type.get("playbookKey") == "festival-post-playbook"


def build_playbook_override(payload: dict[str, Any]) -> str:
    if not is_festival_playbook(payload):
        return ""

    festival = (
        normalize_external_truth_bundle(payload.get("truthBundle") or {}).get(
            "festivalTruth"
        )
        or {}
    )
    festival_name = festival.get("name") or "festival greeting"
    return (
        "## Playbook Override\n"
        f"This request is using `festival-post-playbook` for {festival_name}.\n"
        "- Keep the result festival-first, not project-first or architecture-first.\n"
        "- Default to a premium festive poster, invitation-card composition, symbolic devotional graphic, or lightly textured illustration.\n"
        "- Use one clear festival hero idea, one poster archetype, one illustration family, and controlled decorative density.\n"
        "- Brand colors and typography may influence taste and finish, but they must not turn the image into a luxury interior scene or a branded still life.\n"
        "- Do not default to serene architectural interiors, marble ledges, lifestyle photography, or building-led visuals unless the brief explicitly asks for that.\n"
        "- Prefer poster containment, symbolic composition, breathing room, curated multi-color festive palettes, and restrained ornament.\n"
        "- Apply these constraints to every variation. Do not use still-life or interior variants as alternate routes unless the brief explicitly requests them.\n"
        "- Avoid photographic shot-language such as studio-quality photo, shallow depth of field, top-down shot, wide-angle interior, prop styling, or warm natural-light still life unless the brief explicitly requests photography.\n\n"
    )


def truth_bundle_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    bundle = payload.get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truth bundle is bound for the current request")
    return bundle


def truth_bundle_from_context(run_context: RunContext) -> dict[str, Any]:
    dependencies = run_context.dependencies or {}
    bundle = dependencies.get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truthBundle in run_context.dependencies")
    return bundle


def normalize_external_truth_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    """Normalize incoming truth bundles to a dictionary payload.

    The Prompt Lab sends the internal truthBundle shape, so this is an identity
    normalizer plus a type guard used by helper utilities.
    """
    if not isinstance(bundle, dict):
        return {}
    return bundle


def resolve_variation_count(payload: dict[str, Any]) -> int:
    request_context = truth_bundle_from_payload(payload).get("requestContext") or {}
    raw = request_context.get("variationCount", 3)
    try:
        count = int(raw)
    except (TypeError, ValueError):
        count = 3
    return max(1, min(count, 6))


def resolve_reference_strategy(payload: dict[str, Any]) -> str:
    bundle = truth_bundle_from_payload(payload)
    has_template = bundle.get("templateTruth") is not None
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    has_refs = any(
        not asset.get("eligibility", {}).get("isExactLogo")
        and not asset.get("eligibility", {}).get("isExactReraQr")
        for asset in candidate_assets
    )
    has_exact_assets = bool(exact_asset_contract.get("logoAssetId")) or bool(
        exact_asset_contract.get("reraQrAssetId")
    )
    if has_template and (has_refs or has_exact_assets):
        return "hybrid"
    if has_template:
        return "generated-template"
    if has_refs or has_exact_assets:
        return "uploaded-references"
    return "generated-template"


def resolve_template_type(payload: dict[str, Any]) -> Optional[str]:
    bundle = truth_bundle_from_payload(payload)
    request_context = bundle.get("requestContext") or {}
    template_truth = bundle.get("templateTruth") or {}
    template_type = request_context.get("templateType")
    if isinstance(template_type, str) and template_type:
        return template_type

    config = (bundle.get("postTypeContract") or {}).get("config") or {}
    recommended = config.get("recommendedTemplateTypes") or []
    if isinstance(recommended, list) and recommended:
        first = recommended[0]
        if isinstance(first, str) and first:
            return first
    prompt_scaffold = template_truth.get("promptScaffold")
    if isinstance(prompt_scaffold, str) and prompt_scaffold.strip():
        return "hero"
    return None


@tool()
def get_request_brief(run_context: RunContext) -> str:
    result = compact_json(truth_bundle_from_context(run_context).get("requestContext") or {})
    return result


@tool()
def get_brand_truth(run_context: RunContext) -> str:
    result = compact_json(
        compact_brand_truth(
            truth_bundle_from_context(run_context).get("brandTruth") or {}
        )
    )
    return result


@tool()
def get_project_truth(run_context: RunContext) -> str:
    result = compact_json(
        compact_project_truth(
            truth_bundle_from_context(run_context).get("projectTruth") or {}
        )
    )
    return result


@tool()
def get_post_type_contract(run_context: RunContext) -> str:
    result = compact_json(truth_bundle_from_context(run_context).get("postTypeContract") or {})
    return result


@tool()
def get_festival_truth(run_context: RunContext) -> str:
    result = compact_json(
        (truth_bundle_from_context(run_context).get("festivalTruth") or {"festival": None})
    )
    return result


@tool()
def get_template_truth(run_context: RunContext) -> str:
    result = compact_json(
        (truth_bundle_from_context(run_context).get("templateTruth") or {"template": None})
    )
    return result


@tool()
def list_candidate_assets(run_context: RunContext) -> str:
    result = compact_json(
        compact_candidate_assets(
            truth_bundle_from_context(run_context).get("candidateAssets") or []
        )
    )
    return result


@tool()
def get_available_project_amenities(run_context: RunContext) -> str:
    result = compact_json(
        (truth_bundle_from_context(run_context).get("amenityResolution") or {}).get("availableAmenities") or []
    )
    return result


@tool()
def get_assets_for_amenity(amenity_name: str, run_context: RunContext) -> str:
    bundle = truth_bundle_from_context(run_context)
    resolution = bundle.get("amenityResolution") or {}
    available = resolution.get("availableAmenities") or []
    all_assets = bundle.get("candidateAssets") or []

    selected_option = None
    normalized_target = str(amenity_name or "").strip().lower()
    for option in available:
        option_name = str(option.get("name") or "").strip()
        if option_name.lower() == normalized_target:
            selected_option = option
            break

    asset_ids = (
        selected_option.get("assetIds") if isinstance(selected_option, dict) else []
    )
    assets = [asset for asset in all_assets if asset.get("id") in asset_ids]
    result = {
        "amenityName": amenity_name,
        "matchedAmenity": selected_option,
        "assets": assets,
        "hasExactAssetMatch": bool(assets),
    }

    return compact_json(result)


@tool()
def get_assets_for_post_type(post_type_code: str, run_context: RunContext) -> str:
    """
    Get the most relevant asset for a specific post type based on its subjectType.

    Rules for asset selection:
    - amenity-spotlight: first use get_available_project_amenities and get_assets_for_amenity
    - construction-update: use asset with subjectType='construction_progress' or 'project_exterior'
    - project-launch: use asset with subjectType='project_exterior' or 'facade'
    - site-visit-invite: use asset with subjectType='project_exterior' or 'facade'
    - location-advantage: use asset with subjectType='aerial' or 'street'
    - festive-greeting: use asset with subjectType='generic_reference' or 'interior' (or none - standalone greeting)

    Returns the single best matching asset with its metadata for use in prompt.
    """
    bundle = truth_bundle_from_context(run_context)
    all_assets = bundle.get("candidateAssets") or []
    post_type_contract = bundle.get("postTypeContract") or {}
    amenity_focus = post_type_contract.get("amenityFocus")

    # Map post types to their preferred subject types (in priority order)
    subject_type_priority = {
        "amenity-spotlight": ["amenity", "interior"],
        "construction-update": ["construction_progress", "project_exterior", "facade"],
        "project-launch": ["project_exterior", "facade", "aerial"],
        "site-visit-invite": ["project_exterior", "facade", "aerial"],
        "location-advantage": ["aerial", "street", "facade"],
        "project-tour": ["interior", "sample_flat"],
        "testimonial": ["interior", "sample_flat"],
        "festive-greeting": [
            "generic_reference",
            "interior",
        ],  # Can be None for standalone
    }

    # Get exact assets (logo, RERA QR) - these are always available
    exact_contract = bundle.get("exactAssetContract") or {}
    logo_asset_id = exact_contract.get("logoAssetId")
    rera_qr_asset_id = exact_contract.get("reraQrAssetId")

    # Find the logo asset if available
    logo_asset = None
    if logo_asset_id:
        for asset in all_assets:
            if asset.get("id") == logo_asset_id:
                logo_asset = asset
                break

    # Filter assets by preferred subject types for this post type
    preferred_types = subject_type_priority.get(post_type_code, ["generic_reference"])

    # Score and rank assets by subject type match
    scored_assets = []
    for asset in all_assets:
        metadata = asset.get("normalizedMetadata") or {}
        subject_type = metadata.get("subjectType", "")

        # Skip exact assets (logo, rera) - they are handled separately
        if asset.get("id") == logo_asset_id or asset.get("id") == rera_qr_asset_id:
            continue

        # Score based on subject type priority
        score = 0
        if subject_type in preferred_types:
            score = len(preferred_types) - preferred_types.index(subject_type)

        # Boost quality tier
        quality_tier = metadata.get("qualityTier", "usable")
        if quality_tier == "hero":
            score += 1
        elif quality_tier == "high":
            score += 0.5
        elif quality_tier in {"medium", "usable"}:
            score += 0.25

        if (
            post_type_code == "amenity-spotlight"
            and isinstance(amenity_focus, str)
            and amenity_focus.strip()
        ):
            asset_amenity = metadata.get("amenityName") or ""
            asset_search_text = f"{asset.get('label', '')} {asset_amenity}".lower()
            normalized_focus = amenity_focus.strip().lower()
            focus_tokens = [
                token for token in normalized_focus.split() if len(token) > 2
            ]
            if normalized_focus in asset_search_text:
                score += 5
            elif any(token in asset_search_text for token in focus_tokens):
                score += 1
            else:
                score -= 5

        if score > 0:
            scored_assets.append(
                {
                    "score": score,
                    "asset": asset,
                    "match_reason": f"subjectType={subject_type}, quality={quality_tier}",
                }
            )

    # Sort by score and get the best match
    scored_assets.sort(key=lambda x: x["score"], reverse=True)

    # Get top hero asset
    hero_asset = scored_assets[0]["asset"] if scored_assets else None

    result = {
        "postTypeCode": post_type_code,
        "preferredSubjectTypes": preferred_types,
        "amenityFocus": amenity_focus
        if isinstance(amenity_focus, str) and amenity_focus.strip()
        else None,
        "heroAsset": hero_asset,
        "logoAsset": logo_asset,  # Can be used in prompt if includeBrandLogo=true
        "availableAssetCount": len(scored_assets),
    }

    return compact_json(result)


@tool()
def get_exact_asset_contract(run_context: RunContext) -> str:
    result = compact_json(truth_bundle_from_context(run_context).get("exactAssetContract") or {})
    return result


@tool()
def get_generation_contract(run_context: RunContext) -> str:
    result = compact_json(
        compact_generation_contract(
            truth_bundle_from_context(run_context).get("generationContract") or {}
        )
    )
    return result


def build_agents() -> AgentBundle:
    llm_provider, llm_model = resolve_llm_config()
    base_url = os.getenv("OPENAI_BASE_URL")
    model_kwargs: dict[str, Any] = {
        "id": llm_model,
        "timeout": float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "20")),
        "max_retries": int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1")),
    }

    if llm_provider == "openrouter":
        model_kwargs["base_url"] = os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        )
        openrouter_api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv(
            "OPENAI_API_KEY"
        )
        if openrouter_api_key:
            model_kwargs["api_key"] = openrouter_api_key
    elif base_url:
        model_kwargs["base_url"] = base_url

    skills_runtime, skill_names = build_skills_runtime()

    brief_analyst = Agent(
        name="Brief Analyst",
        role="Analyze the request, fetch only the necessary context, and produce a compact working brief for prompt generation.",
        model=OpenAIResponses(**model_kwargs),
        tools=[
            get_request_brief,
            get_brand_truth,
            get_project_truth,
            get_post_type_contract,
            get_festival_truth,
            get_template_truth,
            list_candidate_assets,
            get_available_project_amenities,
            get_assets_for_amenity,
            get_assets_for_post_type,
            get_exact_asset_contract,
            get_generation_contract,
        ],
        instructions=[
            "You are a senior visual brief analyst for brand-aware social image generation.",
            "Use the attached Agno Skills runtime for brief interpretation and playbook routing.",
            "When given a request summary, first call get_request_brief, get_post_type_contract, and get_generation_contract.",
            "Before writing Strategy Route, call get_skill_instructions for brief-interpreter and for the exact postTypeContract.playbookKey when present.",
            "Always call get_brand_truth.",
            "For amenity-spotlight, call get_available_project_amenities after get_post_type_contract.",
            "The amenity choice must come from the project's available amenities only. Do not invent or hardcode amenity types.",
            "For amenity-spotlight, choose the amenity before writing prompt guidance, then call get_assets_for_amenity for that exact amenity.",
            "If get_assets_for_amenity returns no assets, explicitly record that there is no exact amenity image match and do not substitute a different amenity asset.",
            "For non-amenity post types, call get_assets_for_post_type with the post type code to get the single best hero asset.",
            "Use the selected hero asset as the primary reference in your Asset Decision - do NOT list unrelated assets.",
            "Call list_candidate_assets only when the hero asset choice is ambiguous or you need fallback context.",
            "Call get_project_truth when project truth exists.",
            "Call get_festival_truth when festival truth exists.",
            "Call get_template_truth when template truth exists.",
            "Always call get_exact_asset_contract before finishing.",
            "Prefer tool output over assumptions.",
            "Summarize only image-relevant facts, not full manifests.",
            "Asset Decision must list only the single chosen hero asset id, the logo (if enabled), and the RERA QR (if enabled). Do NOT list multiple reference images.",
            "If postTypeContract.playbookKey is present, mention that exact playbook key in Strategy Route and do not introduce other playbook families.",
            ANALYST_SKILL_WORKFLOW_INSTRUCTION,
            ANALYST_OUTPUT_INSTRUCTION,
        ],
        skills=skills_runtime,
        markdown=True,
    )

    prompt_crafter_kwargs: dict[str, Any] = {
        "name": "Prompt Crafter",
        "role": "Turn the analyzed brief into finished-post prompts for single-image generation.",
        "model": OpenAIResponses(**model_kwargs),
        "instructions": [
            "You are an expert image prompt crafter for a real-estate social image lab.",
            "Work exactly like a prompt specialist: use available skills, synthesize, then write detailed finished-post prompts.",
            "Keep output focused on what the image model needs, not everything you know, but be specific about composition, spatial hierarchy, text-safe regions, restrained overlays, and negative constraints when they affect output quality.",
            "Poster-spec language is allowed when it directly improves generation quality, but avoid design-tool, wireframe, dashboard, or template-editor phrasing.",
            "If a logo is used, it must read as an integrated footer/signature element within the poster finish, not a pasted-on sticker, white card, badge, or floating logo tile.",
            "For construction updates, preserve the supplied project image as identity truth but let the brief control the construction stage. If the anchor looks complete, rewrite it as the same recognizable building in a believable under-construction state.",
            "Every variation is a finished post option. Do not create exploratory previews or draft style boards.",
            "Each prompt must describe one single complete image only.",
            "Never describe multiple posters, a board, a sheet, a mockup page, or a tiled layout inside one image.",
            SKILL_WORKFLOW_INSTRUCTION,
            CRAFTER_OUTPUT_INSTRUCTION,
        ],
        "output_schema": PromptPackageOutput,
        "markdown": False,
    }
    prompt_crafter_kwargs["skills"] = skills_runtime

    prompt_crafter = Agent(**prompt_crafter_kwargs)

    return AgentBundle(
        brief_analyst=brief_analyst,
        prompt_crafter=prompt_crafter,
        skill_names=skill_names,
    )


def build_agent() -> Agent:
    return build_agents().prompt_crafter


def build_request_summary(payload: dict[str, Any]) -> str:
    bundle = payload.get("truthBundle") or {}
    brief = bundle.get("requestContext") or {}
    brand = bundle.get("brandTruth") or {}
    post_type = bundle.get("postTypeContract") or {}
    festival = bundle.get("festivalTruth") or {}
    project = bundle.get("projectTruth") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
    amenity_resolution = bundle.get("amenityResolution") or {}
    candidate_assets = bundle.get("candidateAssets") or []
    selected = {
        "brand": brand.get("name"),
        "brandPalette": brand.get("palette"),
        "project": project.get("name"),
        "postType": post_type.get("name"),
        "festival": festival.get("name"),
        "channel": brief.get("channel"),
        "format": brief.get("format"),
        "goal": brief.get("goal"),
        "prompt": brief.get("prompt"),
        "audience": brief.get("audience"),
        "offer": brief.get("offer"),
        "exactText": brief.get("exactText"),
        "variationCount": resolve_variation_count(payload),
        "templateType": brief.get("templateType"),
        "amenityFocus": post_type.get("amenityFocus"),
        "availableAmenities": [
            option.get("name")
            for option in (amenity_resolution.get("availableAmenities") or [])
            if isinstance(option, dict) and option.get("name")
        ],
        "selectedAmenity": amenity_resolution.get("selectedAmenity"),
        "selectedAmenityAssetIds": amenity_resolution.get("selectedAssetIds") or [],
        "amenityHasExactAssetMatch": amenity_resolution.get("hasExactAssetMatch"),
        "candidateAssetCount": len(candidate_assets),
        "truthAnchorAssetId": exact_assets.get("requiredProjectAnchorAssetId"),
        "logoAssetId": exact_assets.get("logoAssetId"),
        "reraQrAssetId": exact_assets.get("reraQrAssetId"),
        "includeBrandLogo": brief.get("includeBrandLogo", False),
        "includeReraQr": brief.get("includeReraQr", False),
    }
    return compact_json(selected)


def build_crafter_context(payload: dict[str, Any]) -> str:
    bundle = payload.get("truthBundle") or {}
    brief = bundle.get("requestContext") or {}
    brand = bundle.get("brandTruth") or {}
    project = bundle.get("projectTruth") or {}
    post_type = bundle.get("postTypeContract") or {}
    amenity_resolution = bundle.get("amenityResolution") or {}
    generation = bundle.get("generationContract") or {}
    exact_assets = bundle.get("exactAssetContract") or {}

    context = {
        "brandName": brand.get("name"),
        "brandPalette": brand.get("palette"),
        "visualSystem": {
            "styleDescriptors": brand.get("styleDescriptors"),
            "typographyMood": (brand.get("visualSystem") or {}).get("typographyMood"),
            "headlineFontFamily": (brand.get("visualSystem") or {}).get(
                "headlineFontFamily"
            ),
            "bodyFontFamily": (brand.get("visualSystem") or {}).get("bodyFontFamily"),
            "typographyNotes": (brand.get("visualSystem") or {}).get("typographyNotes"),
            "textDensity": (brand.get("visualSystem") or {}).get("textDensity"),
            "realismLevel": (brand.get("visualSystem") or {}).get("realismLevel"),
            "imageTreatment": (brand.get("visualSystem") or {}).get("imageTreatment"),
        },
        "projectName": project.get("name"),
        "postTypeCode": post_type.get("code"),
        "playbookKey": post_type.get("playbookKey"),
        "amenityFocus": post_type.get("amenityFocus"),
        "availableAmenities": [
            option.get("name")
            for option in (amenity_resolution.get("availableAmenities") or [])
            if isinstance(option, dict) and option.get("name")
        ],
        "selectedAmenity": amenity_resolution.get("selectedAmenity"),
        "selectedAmenityAssetIds": amenity_resolution.get("selectedAssetIds") or [],
        "amenityHasExactAssetMatch": amenity_resolution.get("hasExactAssetMatch"),
        "briefPrompt": brief.get("prompt"),
        "exactText": brief.get("exactText"),
        "offer": brief.get("offer"),
        "aspectRatio": generation.get("aspectRatio"),
        "variationCount": resolve_variation_count(payload),
        "projectAnchorAssetId": exact_assets.get("requiredProjectAnchorAssetId"),
    }
    return compact_json(context)


def normalize_prompt_package(
    result: dict[str, Any],
    payload: dict[str, Any],
    analyst_output: str,
    *,
    pipeline: str,
    orchestration: str,
    registered_skill_names: Optional[list[str]] = None,
) -> dict[str, Any]:
    variation_count = resolve_variation_count(payload)
    variations = result.get("variations")
    if not isinstance(variations, list):
        variations = []

    normalized_variations: list[dict[str, Any]] = []
    for index, variation in enumerate(variations[:variation_count]):
        if not isinstance(variation, dict):
            continue
        final_prompt = str(
            variation.get("finalPrompt") or variation.get("seedPrompt") or ""
        ).strip()
        if not final_prompt:
            continue
        item = {
            "id": str(variation.get("id") or f"variation_{index + 1}"),
            "title": str(variation.get("title") or f"Variation {index + 1}"),
            "strategy": str(variation.get("strategy") or "Distinct creative route"),
            "seedPrompt": final_prompt,
            "finalPrompt": final_prompt,
            "referenceStrategy": resolve_reference_strategy(payload),
            "resolvedConstraints": variation.get("resolvedConstraints")
            if isinstance(variation.get("resolvedConstraints"), dict)
            else {},
            "compilerTrace": variation.get("compilerTrace")
            if isinstance(variation.get("compilerTrace"), dict)
            else {},
        }
        normalized_variations.append(item)

    if not normalized_variations:
        normalized_variations = [
            {
                "id": "variation_1",
                "title": "Primary route",
                "strategy": "Primary route generated by the prompt compiler",
                "seedPrompt": str(
                    result.get("finalPrompt") or result.get("seedPrompt") or ""
                ).strip(),
                "finalPrompt": str(
                    result.get("finalPrompt") or result.get("seedPrompt") or ""
                ).strip(),
                "referenceStrategy": resolve_reference_strategy(payload),
                "resolvedConstraints": {},
                "compilerTrace": {"fallbackVariation": True},
            }
        ]

    first_variation = normalized_variations[0]
    bundle = truth_bundle_from_payload(payload)
    request_context = bundle.get("requestContext") or {}
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    result["variations"] = normalized_variations
    result["seedPrompt"] = first_variation["seedPrompt"]
    result["finalPrompt"] = first_variation["finalPrompt"]
    result["aspectRatio"] = (bundle.get("generationContract") or {}).get(
        "aspectRatio"
    ) or derive_aspect_ratio(request_context.get("format"))
    result["chosenModel"] = (bundle.get("generationContract") or {}).get(
        "chosenModel"
    ) or choose_image_model()
    result["referenceStrategy"] = resolve_reference_strategy(payload)
    result["templateType"] = resolve_template_type(payload)

    resolved_constraints = result.get("resolvedConstraints")
    if not isinstance(resolved_constraints, dict):
        resolved_constraints = {}
    resolved_constraints.update(
        {
            "brandName": (bundle.get("brandTruth") or {}).get("name"),
            "projectName": (bundle.get("projectTruth") or {}).get("name"),
            "festivalName": (bundle.get("festivalTruth") or {}).get("name"),
            "channel": request_context.get("channel"),
            "format": request_context.get("format"),
            "includeBrandLogo": request_context.get("includeBrandLogo", False),
            "includeReraQr": request_context.get("includeReraQr", False),
            "candidateAssetIds": [
                asset.get("id")
                for asset in (bundle.get("candidateAssets") or [])
                if asset.get("id")
            ],
            "projectAnchorAssetId": exact_asset_contract.get(
                "requiredProjectAnchorAssetId"
            ),
            "brandLogoAssetId": exact_asset_contract.get("logoAssetId"),
            "reraQrAssetId": exact_asset_contract.get("reraQrAssetId"),
            "variationCount": variation_count,
        }
    )
    result["resolvedConstraints"] = resolved_constraints

    compiler_trace = result.get("compilerTrace")
    if not isinstance(compiler_trace, dict):
        compiler_trace = {}
    skill_names = (
        registered_skill_names
        if isinstance(registered_skill_names, list)
        else get_registered_skill_names()
    )
    compiler_trace.update(
        {
            "pipeline": pipeline,
            "orchestration": orchestration,
            "analystAgent": "Brief Analyst",
            "crafterAgent": "Prompt Crafter",
            "analystOutput": analyst_output,
            "skillsLoaded": len(skill_names) > 0,
            "loadedSkillNames": skill_names,
            "registeredSkillNames": skill_names,
            "registeredSkillCount": len(skill_names),
            "skillsRuntimeSource": "agno-skills",
            "skillsReloadedPerRun": True,
            "requestedVariationCount": variation_count,
            "returnedVariationCount": len(normalized_variations),
            "workflowAvailable": bool(Workflow is not None and Step is not None),
            "workflowImportError": WORKFLOW_IMPORT_ERROR,
            "truthBundleSummary": {
                "postTypeCode": (bundle.get("postTypeContract") or {}).get("code"),
                "playbookKey": (bundle.get("postTypeContract") or {}).get(
                    "playbookKey"
                ),
                "candidateAssetIds": [
                    asset.get("id")
                    for asset in (bundle.get("candidateAssets") or [])
                    if asset.get("id")
                ],
                "exactAssetIds": {
                    "logo": exact_asset_contract.get("logoAssetId"),
                    "reraQr": exact_asset_contract.get("reraQrAssetId"),
                    "projectAnchor": exact_asset_contract.get(
                        "requiredProjectAnchorAssetId"
                    ),
                },
            },
        }
    )
    result["compilerTrace"] = compiler_trace
    return result


def parse_prompt_package(raw: Any) -> dict[str, Any]:
    if isinstance(raw, PromptPackageOutput):
        return raw.model_dump()
    if isinstance(raw, BaseModel):
        return PromptPackageOutput.model_validate(raw.model_dump()).model_dump()
    if isinstance(raw, dict):
        return PromptPackageOutput.model_validate(raw).model_dump()
    if isinstance(raw, str):
        return PromptPackageOutput.model_validate_json(raw).model_dump()
    raise TypeError(f"Unexpected Agno output type: {type(raw)!r}")


def build_run_dependencies(payload: dict[str, Any]) -> dict[str, Any]:
    return {"truthBundle": payload.get("truthBundle") or {}}


def truth_bundle_from_step_input(step_input: StepInput) -> dict[str, Any]:
    additional_data = getattr(step_input, "additional_data", None)
    if not isinstance(additional_data, dict):
        raise RuntimeError("No additional_data payload was provided to workflow step")

    bundle = additional_data.get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truthBundle in StepInput.additional_data")
    return bundle


def build_crafter_input(payload: dict[str, Any], analyst_output: str) -> str:
    variation_count = resolve_variation_count(payload)
    if variation_count == 1:
        variation_instruction = (
            "Create exactly 1 finished post option in variations[0]. Do not write exploration language, multi-route comparison, or variation-difference narration.\n"
        )
    else:
        variation_instruction = (
            f"Create exactly {variation_count} variations. Each variation must be a separate single-image creative route, not several layouts inside one image.\n"
            "Make the routes materially different in composition, hierarchy, mood, and copy treatment.\n"
        )
    return (
        "Using the analyzed brief and request truth context below, return the final prompt package JSON.\n"
        f"{variation_instruction}"
        "Return only promptSummary and variations with title, strategy, and finalPrompt. Do not return seedPrompt, chosenModel, aspectRatio, templateType, or referenceStrategy.\n\n"
        f"{build_playbook_override(payload)}"
        "## Request Truth Context\n"
        f"{build_crafter_context(payload)}\n\n"
        "## Analyzed Brief\n"
        f"{analyst_output}\n"
    )


def workflow_supported() -> bool:
    return Workflow is not None and Step is not None


def flatten_step_results(step_results: Any) -> list[Any]:
    if not isinstance(step_results, list):
        return []

    flattened: list[Any] = []
    for step_result in step_results:
        if isinstance(step_result, list):
            flattened.extend(flatten_step_results(step_result))
        else:
            flattened.append(step_result)
    return flattened


def extract_step_content(step_results: Any, step_name: str) -> str:
    for step_result in flatten_step_results(step_results):
        if getattr(step_result, "step_name", None) != step_name:
            continue
        content = getattr(step_result, "content", None)
        return content if isinstance(content, str) else str(content)
    return ""


def build_compiler_workflow(brief_analyst: Agent, prompt_crafter: Agent) -> Any:
    if not workflow_supported():
        raise RuntimeError(
            f"Agno workflow support is unavailable. Import error: {WORKFLOW_IMPORT_ERROR}"
        )

    def prepare_crafter_input(step_input: StepInput) -> WorkflowStepOutput:
        analyst_output = step_input.get_step_content(ANALYST_STEP_NAME)
        if analyst_output is None:
            analyst_output = step_input.get_last_step_content()
        analyst_output_text = (
            analyst_output if isinstance(analyst_output, str) else str(analyst_output or "")
        )
        payload = {"truthBundle": truth_bundle_from_step_input(step_input)}
        return WorkflowStepOutput(
            content=build_crafter_input(payload, analyst_output_text)
        )

    return Workflow(
        name=WORKFLOW_NAME,
        description="Deterministic brief analysis then prompt crafting.",
        steps=[
            Step(name=ANALYST_STEP_NAME, agent=brief_analyst),
            Step(name=CRAFTER_INPUT_STEP_NAME, executor=prepare_crafter_input),
            Step(name=CRAFTER_STEP_NAME, agent=prompt_crafter),
        ],
    )


def serialize_tool_call(tool_execution: Any, source_agent: str) -> dict[str, Any]:
    tool_name = getattr(tool_execution, "tool_name", None)
    tool_args = getattr(tool_execution, "tool_args", None)
    tool_error = getattr(tool_execution, "tool_call_error", None)
    tool_result = getattr(tool_execution, "result", None)
    created_at = getattr(tool_execution, "created_at", None)
    return {
        "event": "ToolCallCompleted",
        "toolName": tool_name,
        "toolArgs": tool_args if isinstance(tool_args, dict) else None,
        "toolError": tool_error,
        "toolResult": tool_result,
        "createdAt": created_at,
        "sourceAgent": source_agent,
    }


def serialize_tool_event(event: Any) -> Optional[dict[str, Any]]:
    event_name = getattr(event, "event", None)
    if event_name not in {"ToolCallCompleted", "ToolCallError"}:
        return None

    tool_execution = getattr(event, "tool", None)
    if tool_execution is None:
        return None

    source_agent = (
        getattr(event, "agent_name", None)
        or getattr(event, "step_name", None)
        or "agent"
    )
    item = serialize_tool_call(tool_execution, str(source_agent))
    item["event"] = event_name
    explicit_error = getattr(event, "error", None)
    if explicit_error:
        item["toolError"] = explicit_error
    return item


def run_agent_with_trace(
    agent: Agent,
    *,
    agent_input: str,
    dependencies: dict[str, Any],
    add_dependencies_to_context: bool,
) -> dict[str, Any]:
    events_count = 0
    tool_calls: list[dict[str, Any]] = []
    final_content: Any = None
    model: Optional[str] = None
    model_provider: Optional[str] = None
    run_id: Optional[str] = None
    session_id: Optional[str] = None

    stream = agent.run(
        input=agent_input,
        dependencies=dependencies,
        add_dependencies_to_context=add_dependencies_to_context,
        stream=True,
        stream_events=True,
    )

    for event in stream:
        events_count += 1
        event_name = getattr(event, "event", None)
        if event_name == "RunStarted":
            model = getattr(event, "model", None) or model
            model_provider = getattr(event, "model_provider", None) or model_provider
            run_id = getattr(event, "run_id", None) or run_id
            session_id = getattr(event, "session_id", None) or session_id
        elif event_name == "RunCompleted":
            final_content = getattr(event, "content", None)
            run_id = getattr(event, "run_id", None) or run_id
            session_id = getattr(event, "session_id", None) or session_id

        tool_call = serialize_tool_event(event)
        if tool_call is not None:
            tool_calls.append(tool_call)

    if final_content is None:
        raise RuntimeError("Agent stream ended without RunCompleted content")

    return {
        "content": final_content,
        "toolCalls": tool_calls,
        "eventCount": events_count,
        "runId": run_id,
        "sessionId": session_id,
        "model": model,
        "modelProvider": model_provider,
    }


def run_workflow_with_trace(
    workflow: Any,
    normalized_payload: dict[str, Any],
    dependencies: dict[str, Any],
) -> dict[str, Any]:
    workflow_run = workflow.run(
        input=build_request_summary(normalized_payload),
        dependencies=dependencies,
        additional_data={"truthBundle": dependencies["truthBundle"]},
        add_dependencies_to_context=False,
    )

    analyst_output = extract_step_content(workflow_run.step_results, ANALYST_STEP_NAME)
    tool_calls: list[dict[str, Any]] = []
    model: Optional[str] = None
    model_provider: Optional[str] = None
    crafter_run_id: Optional[str] = None
    crafter_session_id: Optional[str] = None
    workflow_executor_runs = getattr(workflow_run, "step_executor_runs", None)
    if isinstance(workflow_executor_runs, list):
        for executor_run in workflow_executor_runs:
            source_agent = getattr(executor_run, "agent_name", None) or "workflow-step"
            tools = getattr(executor_run, "tools", None)
            if isinstance(tools, list):
                for tool_execution in tools:
                    tool_calls.append(serialize_tool_call(tool_execution, str(source_agent)))

            if source_agent == "Prompt Crafter":
                model = getattr(executor_run, "model", None) or model
                model_provider = getattr(executor_run, "model_provider", None) or model_provider
                crafter_run_id = getattr(executor_run, "run_id", None) or crafter_run_id
                crafter_session_id = getattr(executor_run, "session_id", None) or crafter_session_id

    return {
        "parsed": parse_prompt_package(workflow_run.content),
        "analystOutput": analyst_output,
        "toolCalls": tool_calls,
        "eventCount": len(tool_calls),
        "workflowName": getattr(workflow_run, "workflow_name", None),
        "workflowRunId": getattr(workflow_run, "run_id", None),
        "runId": crafter_run_id or getattr(workflow_run, "run_id", None),
        "sessionId": crafter_session_id or getattr(workflow_run, "session_id", None),
        "model": model,
        "modelProvider": model_provider,
    }


def collect_used_skill_names(skill_tool_calls: list[dict[str, Any]]) -> list[str]:
    used: list[str] = []
    for call in skill_tool_calls:
        args = call.get("toolArgs")
        skill_name = None
        if isinstance(args, dict):
            skill_name = args.get("skill_name") or args.get("skillName") or args.get("name")
        if isinstance(skill_name, str) and skill_name and skill_name not in used:
            used.append(skill_name)
    return used


def execute_pipeline(payload: dict[str, Any]) -> dict[str, Any]:
    agents = build_agents()
    brief_analyst = agents.brief_analyst
    prompt_crafter = agents.prompt_crafter
    raw_bundle = payload.get("truthBundle") or {}
    normalized_bundle = normalize_external_truth_bundle(raw_bundle)
    normalized_payload = {**payload, "truthBundle": normalized_bundle}
    dependencies = build_run_dependencies(normalized_payload)

    if workflow_supported():
        workflow = build_compiler_workflow(brief_analyst, prompt_crafter)
        workflow_run = workflow.run(
            input=build_request_summary(normalized_payload),
            dependencies=dependencies,
            additional_data={"truthBundle": dependencies["truthBundle"]},
            add_dependencies_to_context=False,
        )
        analyst_output = extract_step_content(workflow_run.step_results, ANALYST_STEP_NAME)

        return {
            "parsed": parse_prompt_package(workflow_run.content),
            "normalizedPayload": normalized_payload,
            "analystOutput": analyst_output,
            "pipeline": PIPELINE_WORKFLOW,
            "orchestration": "workflow",
            "skillNames": agents.skill_names,
        }

    analyst_run = brief_analyst.run(
        input=build_request_summary(normalized_payload),
        dependencies=dependencies,
        add_dependencies_to_context=False,
    )
    analyst_output = (
        analyst_run.content
        if isinstance(analyst_run.content, str)
        else str(analyst_run.content)
    )
    crafter_run = prompt_crafter.run(
        input=build_crafter_input(normalized_payload, analyst_output),
        dependencies=dependencies,
        add_dependencies_to_context=False,
    )
    return {
        "parsed": parse_prompt_package(crafter_run.content),
        "normalizedPayload": normalized_payload,
        "analystOutput": analyst_output,
        "pipeline": PIPELINE_MANUAL,
        "orchestration": "manual-chain",
        "skillNames": agents.skill_names,
    }


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    pipeline_result = execute_pipeline(payload)
    return normalize_prompt_package(
        pipeline_result["parsed"],
        pipeline_result["normalizedPayload"],
        pipeline_result["analystOutput"],
        pipeline=pipeline_result["pipeline"],
        orchestration=pipeline_result["orchestration"],
        registered_skill_names=pipeline_result.get("skillNames"),
    )


def execute_with_trace(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    agents = build_agents()
    brief_analyst = agents.brief_analyst
    prompt_crafter = agents.prompt_crafter
    raw_bundle = payload.get("truthBundle") or {}
    normalized_bundle = normalize_external_truth_bundle(raw_bundle)
    normalized_payload = {**payload, "truthBundle": normalized_bundle}
    dependencies = build_run_dependencies(normalized_payload)

    if workflow_supported():
        workflow = build_compiler_workflow(brief_analyst, prompt_crafter)
        traced = run_workflow_with_trace(workflow, normalized_payload, dependencies)
        pipeline = PIPELINE_WORKFLOW
        orchestration = "workflow"
    else:
        analyst_traced = run_agent_with_trace(
            brief_analyst,
            agent_input=build_request_summary(normalized_payload),
            dependencies=dependencies,
            add_dependencies_to_context=False,
        )
        analyst_output = (
            analyst_traced["content"]
            if isinstance(analyst_traced["content"], str)
            else str(analyst_traced["content"])
        )
        crafter_traced = run_agent_with_trace(
            prompt_crafter,
            agent_input=build_crafter_input(normalized_payload, analyst_output),
            dependencies=dependencies,
            add_dependencies_to_context=False,
        )
        traced = {
            "parsed": parse_prompt_package(crafter_traced["content"]),
            "analystOutput": analyst_output,
            "toolCalls": [
                *analyst_traced["toolCalls"],
                *crafter_traced["toolCalls"],
            ],
            "eventCount": analyst_traced["eventCount"] + crafter_traced["eventCount"],
            "workflowName": None,
            "workflowRunId": None,
            "runId": crafter_traced["runId"],
            "sessionId": crafter_traced["sessionId"],
            "model": crafter_traced["model"],
            "modelProvider": crafter_traced["modelProvider"],
        }
        pipeline = PIPELINE_MANUAL
        orchestration = "manual-chain"

    normalized = normalize_prompt_package(
        traced["parsed"],
        normalized_payload,
        traced["analystOutput"],
        pipeline=pipeline,
        orchestration=orchestration,
        registered_skill_names=agents.skill_names,
    )

    tool_calls = traced["toolCalls"]
    skill_tool_calls = [
        call
        for call in tool_calls
        if str(call.get("toolName", "")).startswith("get_skill_")
    ]
    used_skill_names = collect_used_skill_names(skill_tool_calls)
    loaded_skill_names = agents.skill_names

    trace = {
        "eventCount": traced["eventCount"],
        "toolCallCount": len(tool_calls),
        "skillToolCallCount": len(skill_tool_calls),
        "events": tool_calls,
        "toolCalls": tool_calls,
        "skillToolCalls": skill_tool_calls,
        "runId": traced["runId"],
        "sessionId": traced["sessionId"],
        "model": traced["model"],
        "modelProvider": traced["modelProvider"],
        "workflowName": traced["workflowName"],
        "workflowRunId": traced["workflowRunId"],
        "analystOutput": traced["analystOutput"],
        "loadedSkillNames": loaded_skill_names,
        "loadedSkillCount": len(loaded_skill_names),
        "registeredSkillNames": loaded_skill_names,
        "registeredSkillCount": len(loaded_skill_names),
        "usedSkillNames": used_skill_names,
        "deterministicSkillLoading": False,
        "skillsRuntimeAvailable": True,
        "skillsRuntimeSource": "agno-skills",
        "skillsReloadedPerRun": True,
        "pipeline": pipeline,
        "orchestration": orchestration,
        "workflowAvailable": workflow_supported(),
        "workflowImportError": WORKFLOW_IMPORT_ERROR,
    }
    return normalized, trace


def summarize_exception(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return exc.__class__.__name__


def run_one_shot() -> None:
    payload = json.loads(sys.stdin.read())
    try:
        print(json.dumps(execute(payload)))
    except Exception as exc:
        print(summarize_exception(exc), file=sys.stderr)
        raise SystemExit(1) from exc


def run_persistent() -> None:
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue

        request = json.loads(raw)
        request_id = request.get("request_id")

        try:
            result = execute(request["payload"])
            print(
                json.dumps({"request_id": request_id, "ok": True, "result": result}),
                flush=True,
            )
        except (
            Exception
        ) as exc:  # pragma: no cover - exercised only through integration
            print(
                json.dumps(
                    {
                        "request_id": request_id,
                        "ok": False,
                        "error": str(exc),
                    }
                ),
                flush=True,
            )


def main() -> None:
    if os.getenv("AGNO_PERSISTENT") == "1":
        run_persistent()
        return
    run_one_shot()


if __name__ == "__main__":
    main()
