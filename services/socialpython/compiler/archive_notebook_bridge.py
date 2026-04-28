from __future__ import annotations

import inspect
import json
import os
import re
import shutil
import tempfile
import traceback
from functools import wraps
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel, Field

from .schemas import (
    BrandVisibility as SharedBrandVisibility,
    DensityLevel as SharedDensityLevel,
    GraphicLayer as SharedGraphicLayer,
    HeroPresentation as SharedHeroPresentation,
    LayoutGeometry as SharedLayoutGeometry,
    MoodMode as SharedMoodMode,
    PosterArchetype as SharedPosterArchetype,
    TextArchitecture as SharedTextArchitecture,
    TypeVoice as SharedTypeVoice,
)


APP_ROOT = Path(__file__).resolve().parents[1]
MONOREPO_ROOT = APP_ROOT.parents[1] if len(APP_ROOT.parents) > 1 else APP_ROOT


def resolve_notebook_path() -> Path:
    candidates = (
        APP_ROOT / "notebook" / "working.ipynb",
        MONOREPO_ROOT
        / "archive"
        / "legacy"
        / "services"
        / "socialpython-prompt-compiler"
        / "notebook"
        / "working.ipynb",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


NOTEBOOK_PATH = resolve_notebook_path()
PIPELINE_NAME = "archived-notebook-bridge-v1"

NOTEBOOK_POST_TYPE_MAP = {
    "project-launch": "project_launch",
    "construction-update": "construction_update",
    "festive-greeting": "festival_post",
    "amenity-spotlight": "amenity_spotlight",
    "site-visit-invite": "site_visit_invite",
    "location-advantage": "location_advantage",
    "testimonial": "testimonial",
    "ad": "ad",
}
ANALYST_SKILL_NAMES = (
    "briefly-social-core",
    "briefly-social-archetypes",
)
MAX_BRIDGE_VARIATIONS = 3

ARCHETYPE_ROUTE_DEFAULTS: dict[str, dict[str, Any]] = {
    "soft_editorial_cutout": {
        "hero_presentation": "cutout_object",
        "layout_geometry": "open_editorial_field",
        "graphic_layer": ["organic_shape"],
        "type_voice": "serif_sans_mix",
        "text_architecture": "slogan_first",
        "mood_mode": "warm_muted_premium",
        "density": "lean",
        "brand_visibility": "elegant_signature",
    },
    "centered_monolith": {
        "hero_presentation": "monolith_icon",
        "layout_geometry": "centered_symmetry",
        "graphic_layer": [],
        "type_voice": "premium_serif",
        "text_architecture": "proposition_first",
        "mood_mode": "ivory_studio_neutral",
        "density": "ultra_lean",
        "brand_visibility": "visible_brand_led",
    },
    "scarcity_panel": {
        "hero_presentation": "single_tower",
        "layout_geometry": "claim_panel_side_crop",
        "graphic_layer": ["proposition_box"],
        "type_voice": "modern_sans",
        "text_architecture": "scarcity_first",
        "mood_mode": "crisp_daylight",
        "density": "lean",
        "brand_visibility": "campaign_dominant",
    },
    "side_crop_premium_tower": {
        "hero_presentation": "single_tower",
        "layout_geometry": "left_copy_right_hero",
        "graphic_layer": ["thin_frame"],
        "type_voice": "serif_sans_mix",
        "text_architecture": "slogan_first",
        "mood_mode": "golden_hour_optimism",
        "density": "lean",
        "brand_visibility": "visible_brand_led",
    },
    "philosophy_open_field": {
        "hero_presentation": "architecture_with_environment",
        "layout_geometry": "open_editorial_field",
        "graphic_layer": ["architectural_tracing"],
        "type_voice": "premium_serif",
        "text_architecture": "philosophy_first",
        "mood_mode": "pale_editorial_daylight",
        "density": "lean",
        "brand_visibility": "whisper",
    },
    "dusk_emotional_crop": {
        "hero_presentation": "tower_with_dusk",
        "layout_geometry": "left_copy_right_hero",
        "graphic_layer": ["soft_gradient_field"],
        "type_voice": "premium_serif",
        "text_architecture": "emotional_headline_first",
        "mood_mode": "dusk_luxury",
        "density": "lean",
        "brand_visibility": "elegant_signature",
    },
    "clear_sky_statement": {
        "hero_presentation": "tower_with_sky",
        "layout_geometry": "billboard_headline_sky",
        "graphic_layer": ["thin_frame"],
        "type_voice": "modern_sans",
        "text_architecture": "proposition_first",
        "mood_mode": "crisp_daylight",
        "density": "lean",
        "brand_visibility": "visible_brand_led",
    },
    "footer_builder_campaign": {
        "hero_presentation": "single_tower",
        "layout_geometry": "footer_strip",
        "graphic_layer": ["color_band"],
        "type_voice": "builder_readable",
        "text_architecture": "proposition_first",
        "mood_mode": "crisp_daylight",
        "density": "medium",
        "brand_visibility": "developer_explicit",
    },
    "white_space_editorial_statement": {
        "hero_presentation": "monolith_icon",
        "layout_geometry": "open_editorial_field",
        "graphic_layer": ["thin_frame"],
        "type_voice": "premium_serif",
        "text_architecture": "one_statement",
        "mood_mode": "ivory_studio_neutral",
        "density": "ultra_lean",
        "brand_visibility": "whisper",
    },
    "masterplan_scale_reveal": {
        "hero_presentation": "township_overview",
        "layout_geometry": "balanced_card_layout",
        "graphic_layer": ["translucent_panel"],
        "type_voice": "modern_sans",
        "text_architecture": "proposition_first",
        "mood_mode": "golden_hour_optimism",
        "density": "medium",
        "brand_visibility": "visible_brand_led",
    },
    "documentary_presence": {
        "hero_presentation": "candid_presence",
        "layout_geometry": "documentary_crop_overlay",
        "graphic_layer": ["translucent_panel"],
        "type_voice": "builder_readable",
        "text_architecture": "proposition_first",
        "mood_mode": "crisp_daylight",
        "density": "medium",
        "brand_visibility": "developer_explicit",
    },
    "quote_led_editorial": {
        "hero_presentation": "framed_image_card",
        "layout_geometry": "balanced_card_layout",
        "graphic_layer": ["thin_frame"],
        "type_voice": "premium_serif",
        "text_architecture": "quote_first",
        "mood_mode": "warm_muted_premium",
        "density": "lean",
        "brand_visibility": "elegant_signature",
    },
    "symbolic_festive_field": {
        "hero_presentation": "symbolic_centerpiece",
        "layout_geometry": "centered_symmetry",
        "graphic_layer": ["soft_gradient_field"],
        "type_voice": "premium_serif",
        "text_architecture": "one_statement",
        "mood_mode": "warm_muted_premium",
        "density": "ultra_lean",
        "brand_visibility": "elegant_signature",
    },
    "organic_shape_launch": {
        "hero_presentation": "cutout_object",
        "layout_geometry": "split_panel",
        "graphic_layer": ["organic_shape"],
        "type_voice": "serif_sans_mix",
        "text_architecture": "slogan_first",
        "mood_mode": "soft_morning",
        "density": "medium",
        "brand_visibility": "visible_brand_led",
    },
    "watermark_catalog": {
        "hero_presentation": "framed_image_card",
        "layout_geometry": "framed_catalog",
        "graphic_layer": ["brand_watermark"],
        "type_voice": "premium_serif",
        "text_architecture": "emotional_headline_first",
        "mood_mode": "ivory_studio_neutral",
        "density": "lean",
        "brand_visibility": "whisper",
    },
    "inset_image_card": {
        "hero_presentation": "framed_image_card",
        "layout_geometry": "inset_card",
        "graphic_layer": ["image_card"],
        "type_voice": "quiet_premium",
        "text_architecture": "emotional_headline_first",
        "mood_mode": "warm_muted_premium",
        "density": "lean",
        "brand_visibility": "elegant_signature",
    },
    "swiss_grid_premium": {
        "hero_presentation": "facade_crop",
        "layout_geometry": "swiss_grid",
        "graphic_layer": ["thin_frame"],
        "type_voice": "swiss_clean",
        "text_architecture": "proposition_first",
        "mood_mode": "ivory_studio_neutral",
        "density": "lean",
        "brand_visibility": "visible_brand_led",
    },
    "ultra_minimal_address": {
        "hero_presentation": "monolith_icon",
        "layout_geometry": "centered_symmetry",
        "graphic_layer": [],
        "type_voice": "premium_serif",
        "text_architecture": "address_first",
        "mood_mode": "ivory_studio_neutral",
        "density": "ultra_lean",
        "brand_visibility": "whisper",
    },
}


class BridgeCrafterInput(BaseModel):
    brief_analysis: dict[str, Any]
    requested_variation_count: int = Field(ge=1, le=3)


class BridgePromptVariationDraft(BaseModel):
    title: str = Field(...)
    strategy: str = Field(...)
    poster_archetype: str = Field(...)
    prompt: str = Field(...)
    negative: str = Field(default="")
    difference_from_others: str | None = Field(default=None)


class BridgeCraftedSet(BaseModel):
    prompt_summary: str = Field(...)
    variations: list[BridgePromptVariationDraft] = Field(default_factory=list, min_length=1, max_length=3)


class BridgeVerifierInput(BaseModel):
    brief_analysis: dict[str, Any]
    crafted_set: BridgeCraftedSet
    requested_variation_count: int = Field(ge=1, le=3)


class BridgeVerifiedVariation(BaseModel):
    title: str = Field(...)
    strategy: str = Field(...)
    poster_archetype: str = Field(...)
    revised_prompt: str = Field(...)
    revised_negative: str = Field(default="")
    difference_from_others: str | None = Field(default=None)


class BridgeVerificationSet(BaseModel):
    approved: bool = Field(...)
    issues: list[str] = Field(default_factory=list)
    prompt_summary: str = Field(...)
    variations: list[BridgeVerifiedVariation] = Field(default_factory=list, min_length=1, max_length=3)
    verification_summary: str = Field(...)


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    result, _ = execute_with_trace(payload)
    return result


def execute_with_trace(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        bundle = payload.get("truthBundle")
        if not isinstance(bundle, dict):
            raise RuntimeError("Archived notebook bridge requires a truthBundle payload.")

        with tempfile.TemporaryDirectory(prefix="archived-notebook-bridge-") as temp_dir:
            runtime_dir = Path(temp_dir)
            namespace, traced_calls = load_notebook_namespace(runtime_dir)
            sync_notebook_runtime_data(namespace, payload)

            analysis_result = namespace["generate_image_prompt"](
                project_slug=derive_project_slug(payload, bundle),
                post_type=map_notebook_post_type((bundle.get("postTypeContract") or {}).get("code")),
                user_brief=build_user_brief(bundle),
                reference_image_paths=derive_reference_image_urls(payload),
                reference_image_note=build_reference_image_note(bundle, payload),
                template_id=derive_template_id(namespace, bundle),
                template_image_path=derive_template_image_url(payload),
                template_note=build_template_note(bundle),
                logo_image_path=derive_logo_image_url(payload),
                logo_note=build_logo_note(bundle),
                canonical_project_name=get_project_display_name(payload),
                exact_text_supplied=has_exact_text_input(payload),
                exact_logo_supplied=has_exact_logo_input(payload),
                exact_rera_qr_supplied=has_exact_rera_qr_input(payload),
                requested_variation_count=derive_requested_variation_count(payload),
                requested_aspect_ratio=(bundle.get("generationContract") or {}).get("aspectRatio"),
                supplied_exact_text=(bundle.get("requestContext") or {}).get("exactText"),
                supplied_offer=(bundle.get("requestContext") or {}).get("offer"),
                available_commercial_facts=build_project_commercial_fact_lines(
                    bundle.get("projectTruth") or {}
                ),
                print_steps=False,
            )

        analysis = analysis_result["analysis"]
        crafted = analysis_result["crafted"]
        verified = analysis_result["verified"]

        result, trace = normalize_notebook_bridge_result(
            payload=payload,
            analysis=analysis,
            crafted=crafted,
            verified=verified,
            tool_calls=traced_calls,
        )
        return result, trace
    except Exception as exc:  # pragma: no cover - debug path
        raise RuntimeError(traceback.format_exc()) from exc


def load_notebook_namespace(runtime_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    notebook = json.loads(NOTEBOOK_PATH.read_text(encoding="utf-8"))
    code_cells = [
        sanitize_notebook_cell("".join(cell.get("source", [])))
        for cell in notebook.get("cells", [])
        if cell.get("cell_type") == "code"
    ]
    agent_index = next(
        index for index, source in enumerate(code_cells) if "analyst = Agent(" in source
    )

    namespace: dict[str, Any] = {"__name__": "__not_main__", "__file__": str(NOTEBOOK_PATH)}
    traced_calls: list[dict[str, Any]] = []

    with pushd(runtime_dir):
        for source in code_cells[:agent_index]:
            if source.strip():
                exec(compile(source, str(NOTEBOOK_PATH), "exec"), namespace, namespace)

        rebuild_notebook_models(namespace)
        install_tool_tracing(namespace, traced_calls)

        for source in code_cells[agent_index:]:
            if source.strip():
                exec(compile(source, str(NOTEBOOK_PATH), "exec"), namespace, namespace)

        rebuild_notebook_models(namespace)
        patch_notebook_image_helpers(namespace)
        patch_notebook_agents(namespace, runtime_dir)
        patch_notebook_run_pipeline(namespace)

    return namespace, traced_calls


def sanitize_notebook_cell(source: str) -> str:
    lines: list[str] = []
    for raw_line in source.splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("!pip install"):
            continue
        if stripped == "from __future__ import annotations":
            continue
        if 'os.environ["OPENAI_API_KEY"]' in raw_line:
            continue
        if 'os.environ["OPENROUTER_API_KEY"]' in raw_line:
            continue
        if stripped.startswith("UPLOAD_REFERENCE_IMAGE ="):
            lines.append("UPLOAD_REFERENCE_IMAGE = False")
            continue
        if stripped.startswith("UPLOAD_TEMPLATE_IMAGE ="):
            lines.append("UPLOAD_TEMPLATE_IMAGE = False")
            continue
        if stripped.startswith("UPLOAD_LOGO_IMAGE ="):
            lines.append("UPLOAD_LOGO_IMAGE = False")
            continue
        lines.append(raw_line)
    return "\n".join(lines)


@contextmanager
def pushd(target: Path):
    original = Path.cwd()
    os.chdir(target)
    try:
        yield
    finally:
        os.chdir(original)


def install_tool_tracing(namespace: dict[str, Any], traced_calls: list[dict[str, Any]]) -> None:
    for tool_name in (
        "get_brand_guidelines",
        "get_project_details",
        "get_template_details",
        "list_asset_candidates",
        "get_skill_instructions",
        "get_skill_reference",
        "get_skill_script",
    ):
        original = namespace.get(tool_name)
        if not callable(original):
            continue

        signature = inspect.signature(original)

        def make_wrapper(name: str, fn: Callable[..., Any], sig: inspect.Signature):
            @wraps(fn)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                try:
                    bound = sig.bind_partial(*args, **kwargs)
                    tool_args = {
                        key: serialize_tool_arg(value)
                        for key, value in bound.arguments.items()
                    }
                except Exception:
                    tool_args = {}
                try:
                    result = fn(*args, **kwargs)
                    traced_calls.append(
                        {
                            "event": "ToolCallCompleted",
                            "toolName": name,
                            "toolArgs": tool_args,
                            "toolError": False,
                        }
                    )
                    return result
                except Exception as exc:
                    traced_calls.append(
                        {
                            "event": "ToolCallError",
                            "toolName": name,
                            "toolArgs": tool_args,
                            "toolError": str(exc),
                        }
                    )
                    raise

            wrapper.__signature__ = sig
            wrapper._wrapped_for_validation = True
            return wrapper

        namespace[tool_name] = make_wrapper(tool_name, original, signature)


def rebuild_notebook_models(namespace: dict[str, Any]) -> None:
    for value in namespace.values():
        if (
            isinstance(value, type)
            and issubclass(value, BaseModel)
            and getattr(value, "__module__", None) == "__not_main__"
        ):
            value.model_rebuild(_types_namespace=namespace)


def patch_notebook_image_helpers(namespace: dict[str, Any]) -> None:
    image_cls = namespace.get("Image")
    analyst_input_cls = namespace.get("AnalystInput")
    if image_cls is None or analyst_input_cls is None:
        return

    def unique_paths(paths: list[str] | None) -> list[str]:
        output: list[str] = []
        seen: set[str] = set()
        for raw_path in paths or []:
            if not isinstance(raw_path, str):
                continue
            value = raw_path.strip()
            if not value or value in seen:
                continue
            if re.match(r"^https?://", value):
                seen.add(value)
                output.append(value)
                continue
            path = Path(value).expanduser()
            if path.exists():
                normalized = str(path)
                seen.add(normalized)
                output.append(normalized)
        return output

    def build_run_images(analyst_input: Any) -> list[Any]:
        ordered_paths: list[str] = []
        ordered_paths.extend(analyst_input.reference_image_paths or [])
        if analyst_input.template_image_path:
            ordered_paths.append(analyst_input.template_image_path)

        images: list[Any] = []
        for value in unique_paths(ordered_paths):
            if re.match(r"^https?://", value):
                images.append(image_cls(url=value))
            else:
                images.append(image_cls(filepath=value))
        return images

    namespace["_unique_existing_paths"] = unique_paths
    namespace["_build_run_images"] = build_run_images


def patch_notebook_agents(namespace: dict[str, Any], runtime_dir: Path) -> None:
    analyst = namespace.get("analyst")
    crafter = namespace.get("crafter")
    verifier = namespace.get("verifier")

    if analyst is not None:
        analyst.skills = None
        analyst.tool_call_limit = 6
        analyst.instructions = filter_instruction_lines(
            analyst.instructions,
            [
                "You have access to Briefly Social skills.",
                "Skill usage is optional.",
                "Call get_skill_instructions('briefly-social-core')",
                "Call get_skill_instructions('briefly-social-archetypes')",
                "Call get_skill_instructions",
                "Call get_skill_reference",
                "Call get_skill_script",
            ],
        )
        analyst.instructions = append_instruction_lines(
            analyst.instructions,
            [
                "Briefly Social skill guidance is already preloaded in this run. Do not call or request skill tools.",
                "The logo_image_path is metadata for exact downstream logo placement. Do not inspect the logo with vision in the analyst stage.",
                "When available project commercial facts are present in the brief, infer requested_fact_types, allowed_fact_kinds, required_fact_copies, disallowed_available_fact_kinds, and do_not_use_unless_requested from the original user request. These fields are your intent judgment, not string matching.",
                "Use required_fact_copies only for exact facts the brief asks to show. Put true-but-unrequested facts into disallowed_available_fact_kinds and do_not_use_unless_requested so QA can keep final prompts grounded.",
                "Never make payment plans, location advantages, landmarks, RERA, contact, website, offers, area, or starting price mandatory just because they are available. They belong in required_fact_copies only when the brief explicitly requests that kind.",
                "If the brief asks for configuration-wise pricing, required_fact_copies should contain the exact requested configuration price values only. Do not also require payment plan, location, RERA, contact, website, offers, or landmarks unless the brief asks for them.",
                "If the brief says show only one fact kind or says do not show certain fact kinds, treat that as a hard boundary in allowed_fact_kinds and disallowed_available_fact_kinds.",
            ],
        )

    if crafter is not None:
        crafter.input_schema = BridgeCrafterInput
        crafter.output_schema = BridgeCraftedSet
        crafter.skills = None
        crafter.tool_call_limit = 0
        crafter.instructions = [
            "You are a real-estate image prompt engineer creating a set of distinct poster routes.",
            "Return ONLY structured data matching the schema.",
            "",
            "Use brief_analysis as the shared truth anchor for every variation.",
            "If requested_variation_count is 1, return exactly one strongest route.",
            "If requested_variation_count is greater than 1, return exactly that many routes.",
            "Every variation must use a different poster_archetype.",
            "Do not create superficial copies with renamed titles.",
            "Route 1 may keep the analyst's selected archetype when it fits. Remaining routes must choose other compatible archetypes for the same asset and business job.",
            "For project_launch, site_visit_invite, location_advantage, testimonial, and ad, every registered poster_archetype is allowed. Rank by asset fit and business job, but do not treat post type alone as a blocker.",
            "If brief_analysis.post_type is testimonial, do not describe the creative as a project launch. The business job is social proof, trust, quote, resident/buyer proof, or experience-led credibility.",
            "If brief_analysis.post_type is ad, keep one dominant commercial hook and make the prompt feel like a premium ad, not a generic promo flyer.",
            "For trust-led or compliance-led ads, commercial_hook may be trust, compliance, or credibility. Do not force those briefs into price, location, offer, or configuration hooks.",
            "All variations must preserve the same project truth, asset truth, and text-policy obligations.",
            "If the asset limits possible diversity, choose the nearest distinct compatible archetypes instead of forcing invalid styles.",
            "Every prompt must remain a finished social poster, not a scenic base-image prompt.",
            "The requested aspect ratio is output metadata only. Do not mention aspect ratio, ratio values, dimensions, or canvas size in the prompt.",
            "Do not invent address lines, street names, RERA, contact details, or location facts that are not grounded in the brief analysis.",
            "Do not include phone numbers, WhatsApp numbers, website URLs, email addresses, social handles, RERA numbers, or contact details unless they are explicitly supplied in exact requested text or the brief.",
            "Do not include a logo, brand mark, emblem, monogram, watermark, or invented branding asset unless an exact logo is supplied in the input.",
            "Do not invent asset filenames, reference filenames, filepaths, or hero image names. If asset_decision.filename is null, describe the visual subject without naming a file.",
            "Do not write literal placeholder labels such as Address, Headline, Call to Action, Contact Details, Phone, Website, RERA, Logo, or Brand Mark.",
            "If brief_analysis.exact_text_supplied is false, do not name text fields. Use post-type-aware generic copy language like minimal launch copy, minimal location/context copy, short invitation line, minimal testimonial/quote copy, minimal ad hook copy, or minimal copy block.",
            "If brief_analysis.exact_text_supplied is true, every variation prompt must include brief_analysis.supplied_exact_text verbatim as required on-image text. Do not paraphrase, translate, reorder, shorten, or replace it with generic headline language.",
            "If brief_analysis.supplied_offer is present, every variation prompt must include it verbatim as the supplied offer or CTA copy. Do not replace it with generic call-to-action wording.",
            "If brief_analysis.required_fact_copies is non-empty, every variation prompt must include each value exactly. These are grounded project facts selected by the analyst from the original brief intent.",
            "required_fact_copies means literal substring copy/paste. Do not translate, rewrite, shorten, reorder, or convert digits to words. For example, keep '2 BHK' as '2 BHK' and '4.5 BHK' as '4.5 BHK'.",
            "Every variation must obey brief_analysis.allowed_fact_kinds and brief_analysis.disallowed_available_fact_kinds. Required copies are mandatory; disallowed available facts must not appear even if they are true project facts.",
            "Available commercial facts are grounding context, not a menu of optional claims. Do not add starting price, configuration pricing, offers, RERA, contact, area, or landmark facts merely because they are available; include them when the original user brief asks for that fact or required_fact_copies requires it.",
            "For price-led ads, do not write generic substitutes such as 'Starting Price', 'pricing information', or 'price details' when an exact required_fact_copies value exists.",
            "If exact logo or RERA QR assets are not supplied, do not mention logo, brand mark, watermark, QR, or RERA in the prompt or negative prompt.",
            "Keep the negative prompt visual-only. Do not put compliance, contact, logo, URL, email, phone, RERA, placeholder, or address words in negative.",
            "Do not expose internal labels such as Business job, Text architecture, Layout, Voice, Brand visibility, Density, or Visual mode in the prompt. Translate them into natural visual direction.",
            "If copy is not supplied, describe the hierarchy generically without naming unavailable text fields.",
            "For site-visit creatives, the invitation CTA may be implied compositionally, but do not request contact details unless supplied.",
            "Treat project_name strictly as the project display name, not as a city or geographic setting. If the name could be a place name, write 'project named <project_name>' and keep actual location context separate.",
            "For each variation, provide title, strategy, poster_archetype, prompt, negative, and difference_from_others.",
        ]

    if verifier is not None:
        verifier.input_schema = BridgeVerifierInput
        verifier.output_schema = BridgeVerificationSet
        verifier.tool_call_limit = 0
        verifier.instructions = [
            "You are the final QA gate for a set of real-estate prompt variations.",
            "Return ONLY structured data matching the schema.",
            "",
            "You must review the set, not just one route.",
            "Keep exactly requested_variation_count variations unless a route is impossible to salvage.",
            "Every kept variation must stay grounded in the same project truth and reference truth.",
            "Every kept variation must preserve exact text obligations and must not invent address lines, street names, location facts, contact details, or RERA details.",
            "Every kept variation must omit phone numbers, WhatsApp numbers, website URLs, email addresses, social handles, RERA numbers, and contact details unless exact requested text or the brief supplies them.",
            "Every kept variation must omit logos, brand marks, emblems, monograms, watermarks, and invented branding assets unless an exact logo is supplied in the input.",
            "Every kept variation must omit invented asset filenames, filepaths, and hero image names. If no filename is supplied in asset_decision, never write one in prompt_summary, revised_prompt, or revised_negative.",
            "Every kept variation must remove literal placeholder labels such as Address, Headline, Call to Action, Contact Details, Phone, Website, RERA, Logo, or Brand Mark.",
            "Every kept variation must treat aspect ratio as output metadata only. If a crafted prompt mentions aspect ratio, ratio values, dimensions, or canvas size, rewrite that sentence out of prompt_summary and revised_prompt.",
            "If text is not supplied, keep copy direction generic and do not name unavailable text fields.",
            "When brief_analysis.exact_text_supplied is true, prompt_summary and every revised_prompt must contain brief_analysis.supplied_exact_text exactly. If a crafted prompt drops it, rewrite the prompt to include that exact string as on-image text.",
            "When brief_analysis.supplied_offer is present, every revised_prompt must preserve it exactly as supplied offer or CTA copy. If a crafted prompt replaces it with generic action wording, rewrite it.",
            "When brief_analysis.required_fact_copies is non-empty, prompt_summary and every revised_prompt must include each value exactly. If a crafted prompt uses generic wording instead, rewrite it using the exact grounded value.",
            "Exact required_fact_copies matching is character-level. Do not approve paraphrases such as 'Two BHK' for '2 BHK' or 'Four point five BHK' for '4.5 BHK'. Copy the required value literally into revised_prompt.",
            "Grounded required_fact_copies are allowed even when exact_text_supplied is false; they are verified project truth, not invented copy.",
            "brief_analysis.allowed_fact_kinds is the maximum fact boundary for final prompts. If a prompt contains a fact kind in brief_analysis.disallowed_available_fact_kinds, rewrite it out even when the fact is true.",
            "If a prompt includes available commercial facts that the original user brief did not ask for and no required_fact_copies entry requires, rewrite them out. Especially remove unrequested prices, offers, RERA numbers, contact, area, and landmark lists.",
            "When brief_analysis.exact_text_supplied is false, prompt_summary, revised_prompt, and revised_negative must not contain address, headline, CTA, call to action, contact details, phone, website, email, RERA, logo, watermark, brand mark, or invented filenames.",
            "If no exact text is supplied, revised_prompt must not contain field-label lists such as headline/location/CTA/contact/RERA. Rewrite them as a generic post-type-aware copy hierarchy.",
            "If the crafted prompt asks for unavailable contact, compliance, logo, or placeholder text, you must rewrite the sentence instead of approving it.",
            "Keep revised_negative visual-only. Do not use it for contact, compliance, logo, URL, email, phone, RERA, or placeholder restrictions.",
            "revised_negative should be a short visual-quality list only, for example: low quality, clutter, harsh lighting, distorted architecture.",
            "revised_negative must not contain these words: phone, website, email, contact, RERA, logo, watermark, placeholder, address, URL.",
            "revised_prompt must not expose internal compiler labels such as Business job, Text architecture, Layout, Voice, Brand visibility, Density, Visual mode, or Hero presentation.",
            "Translate internal text architecture into natural creative direction. If exact_text_supplied is false, use post-type-aware wording instead of address/headline/CTA wording. For location_advantage use 'minimal location/context copy treatment', not invitation wording. For testimonial use 'minimal testimonial/quote copy treatment', not launch wording. For ad use 'minimal ad hook copy treatment' with one short proof line at most.",
            "Use 'contact info' rather than 'contact details' in any negative constraint that must refer to contact.",
            "Use the project_name value from brief_analysis exactly. Do not spell-correct, expand, translate, or rename it.",
            "Every kept variation must treat project_name as a display name only. Revise wording like 'in <project_name>' or '<project_name> project' when it could imply location.",
            "If brief_analysis.post_type is testimonial, prompt_summary, revised_prompt, and revised_negative must not call the output a project launch or launch poster.",
            "Every kept variation must feel poster-grade, not scenic-render-grade.",
            "",
            "Set-level checks:",
            "- poster_archetypes must be distinct",
            "- prompts must not be near-duplicates with renamed labels",
            "- weak or invalid routes must be revised into clearly different compatible routes",
            "- for project_launch, site_visit_invite, location_advantage, testimonial, and ad, do not reject an archetype solely because it is unusual for the post type",
            "",
            "Per-route checks:",
            "- truthfulness and recognisability",
            "- correct use of the reference image",
            "- template staying style-only instead of identity-changing",
            "- business-job fit, hierarchy, style-family fidelity, and anti-repetition quality",
            "",
            "Approve only if the whole set is grounded, distinct, and usable.",
        ]


def build_scoped_skills(
    namespace: dict[str, Any],
    runtime_dir: Path,
    allowed_skill_names: tuple[str, ...],
):
    skills_dir = namespace.get("SKILLS_DIR")
    skills_cls = namespace.get("Skills")
    local_skills_cls = namespace.get("LocalSkills")
    if skills_dir is None or skills_cls is None or local_skills_cls is None:
        return None

    scoped_root = runtime_dir / "__scoped_skills"
    scoped_root.mkdir(parents=True, exist_ok=True)
    source_root = Path(skills_dir)

    for skill_name in allowed_skill_names:
        source = source_root / skill_name
        target = scoped_root / skill_name
        if not source.exists() or target.exists():
            continue
        shutil.copytree(source, target)

    return skills_cls(loaders=[local_skills_cls(str(scoped_root))])


def filter_instruction_lines(
    instructions: Any,
    blocked_substrings: list[str],
) -> list[str]:
    return [
        line
        for line in coerce_instruction_lines(instructions)
        if not any(blocked in line for blocked in blocked_substrings)
    ]


def append_instruction_lines(
    instructions: Any,
    extra_lines: list[str],
) -> list[str]:
    lines = coerce_instruction_lines(instructions)
    for line in extra_lines:
        if line not in lines:
            lines.append(line)
    return lines


def coerce_instruction_lines(instructions: Any) -> list[str]:
    if isinstance(instructions, str):
        return [instructions]
    if isinstance(instructions, list):
        return [str(line) for line in instructions if str(line).strip()]
    return []


def patch_notebook_run_pipeline(namespace: dict[str, Any]) -> None:
    analyst = namespace.get("analyst")
    crafter = namespace.get("crafter")
    verifier = namespace.get("verifier")
    analyst_input_cls = namespace.get("AnalystInput")
    normalize_post_type = namespace.get("_normalize_post_type")
    build_run_images = namespace.get("_build_run_images")
    step_session_id = namespace.get("_step_session_id")
    repair_analysis_grounding = namespace.get("_repair_analysis_grounding")
    list_asset_candidates = namespace.get("list_asset_candidates")

    if not all(
        [
            analyst,
            crafter,
            verifier,
            analyst_input_cls,
            normalize_post_type,
            build_run_images,
            step_session_id,
            repair_analysis_grounding,
        ]
    ):
        return

    def run_pipeline(
        project_slug: str,
        user_brief: str,
        post_type: object | None = None,
        reference_image_paths: list[str] | None = None,
        reference_image_note: str | None = None,
        template_id: str | None = None,
        template_image_path: str | None = None,
        template_note: str | None = None,
        logo_image_path: str | None = None,
        logo_note: str | None = None,
        canonical_project_name: str | None = None,
        exact_text_supplied: bool = False,
        exact_logo_supplied: bool = False,
        exact_rera_qr_supplied: bool = False,
        requested_variation_count: int = 1,
        requested_aspect_ratio: str | None = None,
        supplied_exact_text: str | None = None,
        supplied_offer: str | None = None,
        available_commercial_facts: list[str] | None = None,
        session_id: str | None = None,
        print_steps: bool = True,
    ) -> dict[str, Any]:
        analyst_input = analyst_input_cls(
            project_slug=project_slug,
            user_brief=user_brief,
            selected_post_type=normalize_post_type(post_type),
            reference_image_paths=reference_image_paths or [],
            reference_image_note=reference_image_note,
            template_id=template_id,
            template_image_path=template_image_path,
            template_note=template_note,
            logo_image_path=logo_image_path,
            logo_note=logo_note,
        )

        analyst_kwargs: dict[str, Any] = {
            "input": analyst_input,
            "session_id": step_session_id(session_id, "analyst"),
        }
        analyst_images = build_run_images(analyst_input)
        if analyst_images:
            analyst_kwargs["images"] = analyst_images
        analyst_response = analyst.run(**analyst_kwargs)
        analysis_content = coerce_notebook_model_content(
            analyst_response.content,
            namespace.get("BriefAnalysis"),
            "analyst",
        )
        analysis = repair_analysis_grounding(analysis_content)
        analysis_payload = to_jsonable_model(analysis)
        analysis_payload = repair_location_advantage_archetype(analysis_payload)
        if canonical_project_name:
            analysis_payload["project_name"] = canonical_project_name
        if isinstance(requested_aspect_ratio, str) and requested_aspect_ratio.strip():
            analysis_payload["aspect_ratio"] = requested_aspect_ratio.strip()
        if str(analysis_payload.get("post_type") or "") == "ad":
            commercial_hook = str(analysis_payload.get("commercial_hook") or "").strip()
            if commercial_hook:
                analysis_payload["commercial_hook"] = commercial_hook
                analysis_payload["visual_mechanism"] = (
                    str(analysis_payload.get("visual_mechanism") or "").strip()
                    or visual_mechanism_for_ad_hook(commercial_hook)
                )
            else:
                analysis_payload.pop("commercial_hook", None)
                analysis_payload.pop("visual_mechanism", None)
            asset_decision = analysis_payload.get("asset_decision")
            if (
                isinstance(asset_decision, dict)
                and asset_decision.get("source") == "none"
                and not (analysis_payload.get("reference_image_paths") or [])
                and callable(list_asset_candidates)
            ):
                try:
                    asset_payload = json.loads(
                        list_asset_candidates(
                            project_slug=analysis_payload["project_slug"],
                            post_type="ad",
                            specific_amenity=analysis_payload.get("specific_amenity"),
                            occasion=analysis_payload.get("occasion"),
                            no_building_image=bool(analysis_payload.get("no_building_image")),
                            brief_text=user_brief,
                        )
                    )
                except Exception:
                    asset_payload = {}
                selected_asset = choose_ad_project_library_asset(
                    asset_payload.get("available_assets") or [],
                    commercial_hook or "credibility",
                )
                if selected_asset:
                    analysis_payload["asset_decision"] = {
                        **asset_decision,
                        "source": "project_library",
                        "category": selected_asset.get("category"),
                        "filename": selected_asset.get("filename"),
                        "filepath": None,
                        "reference_tag": selected_asset.get("reference_tag"),
                        "reason": (
                            "Ads should stay anchored to a truthful project or amenity asset when one exists. "
                            f"Selected project-library asset {selected_asset.get('filename')} for the analyst-selected ad hook."
                        ),
                    }
                    analysis_payload["reference_usage_plan"] = (
                        f"Use the project-library asset {selected_asset.get('filename')} as the truthful primary anchor. "
                        "Support the analyst-selected ad hook through hierarchy and framing without inventing commercial claims."
                    )
                    note = (
                        "System repair applied: ad creatives should prefer a truthful project-library anchor when no uploaded reference is supplied."
                    )
                    conflict_notes = coerce_string_list(analysis_payload.get("conflict_notes"))
                    if note not in conflict_notes:
                        conflict_notes.append(note)
                    analysis_payload["conflict_notes"] = conflict_notes
        analysis_payload["exact_text_supplied"] = exact_text_supplied
        analysis_payload["exact_logo_supplied"] = exact_logo_supplied
        analysis_payload["exact_rera_qr_supplied"] = exact_rera_qr_supplied
        if exact_text_supplied and isinstance(supplied_exact_text, str) and supplied_exact_text.strip():
            analysis_payload["supplied_exact_text"] = supplied_exact_text.strip()
        if isinstance(supplied_offer, str) and supplied_offer.strip():
            analysis_payload["supplied_offer"] = supplied_offer.strip()
        analysis_payload["available_commercial_facts"] = available_commercial_facts or []
        normalize_agent_fact_boundary(analysis_payload)
        if not exact_text_supplied:
            if analysis_payload.get("text_architecture") in {"address_first", "footer_heavy"}:
                analysis_payload["text_architecture"] = "slogan_first"
            analysis_payload["required_data"] = [
                item
                for item in coerce_string_list(analysis_payload.get("required_data"))
                if normalize_choice_token(item) not in {"address", "rera", "rera_number", "contact", "contact_details", "phone", "website", "email"}
            ]
            analysis_payload["copy_availability_note"] = (
                get_no_exact_copy_note(str(analysis_payload.get("post_type") or ""))
            )
        variation_count = clamp_requested_variation_count(requested_variation_count)

        crafter_response = crafter.run(
            input=BridgeCrafterInput(
                brief_analysis=analysis_payload,
                requested_variation_count=variation_count,
            ),
            session_id=step_session_id(session_id, "crafter"),
        )
        crafted = sanitize_crafted_set(
            crafter_response.content,
            analysis_payload,
            variation_count,
        )

        verifier_input = BridgeVerifierInput(
            brief_analysis=analysis_payload,
            crafted_set=crafted,
            requested_variation_count=variation_count,
        )
        verifier_response = verifier.run(
            input=verifier_input,
            session_id=step_session_id(session_id, "verifier"),
        )
        verified = sanitize_verification_set(
            verifier_response.content,
            analysis_payload,
            crafted,
            variation_count,
        )
        validate_verified_prompt_contract(analysis_payload, verified)

        if print_steps:
            print("=" * 90)
            print("STEP 1 — ANALYSIS")
            print("=" * 90)
            print(json.dumps(analysis_payload, indent=2, ensure_ascii=False))
            print("\n" + "=" * 90)
            print("STEP 2 — CRAFTING")
            print("=" * 90)
            print(crafted.model_dump_json(indent=2) if hasattr(crafted, "model_dump_json") else crafted)
            print("\n" + "=" * 90)
            print("STEP 3 — VERIFICATION")
            print("=" * 90)
            print(verified.model_dump_json(indent=2) if hasattr(verified, "model_dump_json") else verified)

        return {
            "session_id": session_id or verifier_response.session_id,
            "analysis": analysis_payload,
            "crafted": to_jsonable_model(crafted),
            "verified": to_jsonable_model(verified),
        }

    namespace["run_pipeline"] = run_pipeline

    def generate_image_prompt(
        project_slug: str,
        user_brief: str,
        post_type: object | None = None,
        reference_image_paths: list[str] | None = None,
        reference_image_note: str | None = None,
        template_id: str | None = None,
        template_image_path: str | None = None,
        template_note: str | None = None,
        logo_image_path: str | None = None,
        logo_note: str | None = None,
        canonical_project_name: str | None = None,
        exact_text_supplied: bool = False,
        exact_logo_supplied: bool = False,
        exact_rera_qr_supplied: bool = False,
        requested_variation_count: int = 1,
        requested_aspect_ratio: str | None = None,
        supplied_exact_text: str | None = None,
        supplied_offer: str | None = None,
        available_commercial_facts: list[str] | None = None,
        session_id: str | None = None,
        print_steps: bool = True,
    ) -> dict[str, Any]:
        result = run_pipeline(
            project_slug=project_slug,
            user_brief=user_brief,
            post_type=post_type,
            reference_image_paths=reference_image_paths,
            reference_image_note=reference_image_note,
            template_id=template_id,
            template_image_path=template_image_path,
            template_note=template_note,
            logo_image_path=logo_image_path,
            logo_note=logo_note,
            canonical_project_name=canonical_project_name,
            exact_text_supplied=exact_text_supplied,
            exact_logo_supplied=exact_logo_supplied,
            exact_rera_qr_supplied=exact_rera_qr_supplied,
            requested_variation_count=requested_variation_count,
            requested_aspect_ratio=requested_aspect_ratio,
            supplied_exact_text=supplied_exact_text,
            supplied_offer=supplied_offer,
            available_commercial_facts=available_commercial_facts,
            session_id=session_id,
            print_steps=print_steps,
        )

        if print_steps:
            analysis = result["analysis"]
            verified = result["verified"]
            print("\n" + "=" * 90)
            print("FINAL APPROVED OUTPUT")
            print("=" * 90)
            print(f"Session: {result['session_id']}")
            print(f"Project: {analysis.get('project_name')} ({analysis.get('project_slug')})")
            print(f"Post Type: {analysis.get('post_type')} | Format: {analysis.get('format_type')} ({analysis.get('aspect_ratio')})")
            print(f"Approved: {verified.get('approved')}")
            print(f"Prompt summary: {verified.get('prompt_summary')}")
            for index, variation in enumerate(verified.get("variations") or [], start=1):
                print(
                    f"\nVariation {index}: {variation.get('title')} | "
                    f"archetype={variation.get('poster_archetype')} | "
                    f"layout={variation.get('layout_geometry')}"
                )
                print(variation.get("revised_prompt"))

        return result

    namespace["generate_image_prompt"] = generate_image_prompt


def serialize_tool_arg(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, list):
        return [serialize_tool_arg(item) for item in value]
    if isinstance(value, dict):
        return {str(key): serialize_tool_arg(item) for key, item in value.items()}
    return str(value)


def to_jsonable_model(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def coerce_notebook_model_content(content: Any, model_cls: Any, stage_name: str) -> Any:
    if model_cls is None or isinstance(content, model_cls):
        return content
    if isinstance(content, dict):
        return model_cls.model_validate(content)
    if isinstance(content, str):
        parsed = parse_json_object_from_text(content)
        if isinstance(parsed, dict):
            return model_cls.model_validate(parsed)
        excerpt = content.strip().replace("\n", " ")[:300]
        raise RuntimeError(f"{stage_name} returned non-structured content: {excerpt}")
    return content


def parse_json_object_from_text(text: str) -> Any:
    stripped = text.strip()
    if not stripped:
        return None
    for candidate in (stripped, extract_braced_json_candidate(stripped)):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def extract_braced_json_candidate(text: str) -> str | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


def sync_notebook_runtime_data(namespace: dict[str, Any], payload: dict[str, Any]) -> None:
    bundle = payload["truthBundle"]
    data_dir = Path(namespace["DATA_DIR"])
    project_slug = derive_project_slug(payload, bundle)

    brand_guidelines = build_notebook_brand_guidelines(bundle)
    projects = build_notebook_projects(payload, bundle, project_slug)

    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "brand_guidelines.json").write_text(
        json.dumps(brand_guidelines, indent=2),
        encoding="utf-8",
    )
    (data_dir / "projects.json").write_text(
        json.dumps(projects, indent=2),
        encoding="utf-8",
    )

    sync_notebook_template_library(namespace, bundle)


def build_notebook_brand_guidelines(bundle: dict[str, Any]) -> dict[str, Any]:
    brand = bundle.get("brandTruth") or {}
    request_context = bundle.get("requestContext") or {}
    palette = brand.get("palette") or {}
    identity = brand.get("identity") or {}
    visual_system = brand.get("visualSystem") or {}
    voice = brand.get("voice") or {}

    primary_colors = dedupe_strings(
        [
            color
            for color in [
                palette.get("primary"),
                palette.get("accent"),
            ]
            if isinstance(color, str) and color
        ]
    )
    secondary_colors = dedupe_strings(
        [
            color
            for color in [
                palette.get("secondary"),
                *(
                    palette.get("neutrals")
                    if isinstance(palette.get("neutrals"), list)
                    else []
                ),
            ]
            if isinstance(color, str) and color
        ]
    )

    text_policy_default = (
        "exact_text"
        if str(request_context.get("exactText") or "").strip()
        else "reserve_space"
    )

    return {
        "brand_name": brand.get("name") or "Brand",
        "tagline": identity.get("tagline") or identity.get("positioning") or "",
        "visual_positioning": identity.get("positioning")
        or voice.get("summary")
        or "Premium real-estate brand with grounded, recognisable visuals.",
        "architecture_style_brand_note": (
            "Preserve project-specific architecture and reference truth. "
            + " ".join(
                item
                for item in [
                    visual_system.get("typographyMood"),
                    voice.get("summary"),
                ]
                if isinstance(item, str) and item
            )
        ).strip(),
        "primary_colors": primary_colors or ["#1A1A1A"],
        "secondary_colors": secondary_colors or ["#F5F5F5"],
        "typography_mood": visual_system.get("typographyMood")
        or visual_system.get("headlineFontFamily")
        or "Premium contemporary sans-serif",
        "target_audience": request_context.get("audience")
        or identity.get("audienceSummary")
        or "Urban real-estate buyers and investors.",
        "people_representation": "Believable premium lifestyle presence only when it supports the post.",
        "text_policy_default": text_policy_default,
        "visual_donts": dedupe_strings(
            [
                *coerce_string_list(brand.get("dontRules")),
                *coerce_string_list(brand.get("bannedPatterns")),
                *coerce_string_list((brand.get("compliance") or {}).get("bannedClaims")),
            ]
        )[:10],
        "default_aspect_ratios": {
            "social_post": "1:1",
            "story": "9:16",
            "banner": "16:9",
        },
    }


def build_notebook_projects(
    payload: dict[str, Any], bundle: dict[str, Any], project_slug: str
) -> dict[str, Any]:
    project = bundle.get("projectTruth") or {}
    candidate_assets = bundle.get("candidateAssets") or []
    media_context = payload.get("mediaContext") or {}
    logo_image = media_context.get("logoImage") or {}
    image_library = build_notebook_image_library(candidate_assets, media_context)

    approved_claims = coerce_string_list(project.get("approvedClaims"))
    configurations = coerce_string_list(project.get("configurations"))
    location_pieces = dedupe_strings(
        [
            *project_location_fields(project),
            *coerce_string_list(project.get("locationAdvantages")),
            *coerce_string_list(project.get("nearbyLandmarks")),
        ]
    )

    logo_available = bool(logo_image.get("url") or (bundle.get("exactAssetContract") or {}).get("logoAssetId"))

    return {
        project_slug: {
            "project_name": project.get("name") or "Project",
            "location": ", ".join(location_pieces[:2]) if location_pieces else "",
            "type": project.get("positioning")
            or project.get("stage")
            or "Residential project",
            "floors": None,
            "units": ", ".join(configurations[:4]) or None,
            "status": project.get("constructionStatus") or project.get("stage") or "",
            "completion_date": None,
            "usp": project.get("lifestyleAngle")
            or (approved_claims[0] if approved_claims else ""),
            "architecture_description": " ".join(
                part
                for part in [
                    project.get("positioning"),
                    project.get("lifestyleAngle"),
                    *(approved_claims[:2]),
                ]
                if isinstance(part, str) and part
            ).strip(),
            "rera_number": project.get("reraNumber"),
            "starting_price": project.get("startingPrice"),
            "pricing_band": project.get("pricingBand"),
            "price_range_by_config": coerce_string_list(project.get("priceRangeByConfig")),
            "current_offers": coerce_string_list(project.get("currentOffers")),
            "payment_plan": project.get("paymentPlanSummary"),
            "booking_amount": project.get("bookingAmount"),
            "contact": "",
            "amenities": coerce_string_list(project.get("amenities")),
            "brand_assets": {
                "logo_primary": {
                    "available": logo_available,
                    "filename": Path(str(logo_image.get("url") or "logo.png")).name if logo_available else None,
                    "description": "Exact brand logo for disciplined lockup usage." if logo_available else None,
                }
            },
            "image_library": image_library,
        }
    }


def build_notebook_image_library(
    candidate_assets: list[dict[str, Any]], media_context: dict[str, Any]
) -> dict[str, Any]:
    image_library: dict[str, Any] = {}
    reference_urls_by_id = {
        item.get("assetId"): item.get("url")
        for item in media_context.get("referenceImages") or []
        if isinstance(item, dict) and item.get("assetId")
    }

    for asset in candidate_assets:
        eligibility = asset.get("eligibility") or {}
        if eligibility.get("isExactLogo") or eligibility.get("isExactReraQr"):
            continue

        category = notebook_category_for_asset(asset)
        description = notebook_description_for_asset(asset)
        if not category:
            continue

        existing = image_library.get(category)
        if existing and existing.get("available"):
            continue

        asset_id = asset.get("id")
        image_library[category] = {
            "available": True,
            "filename": asset.get("fileName") or f"{asset_id or category}.png",
            "description": description,
            "signed_url": reference_urls_by_id.get(asset_id),
        }

    return image_library


def notebook_category_for_asset(asset: dict[str, Any]) -> str:
    metadata = asset.get("normalizedMetadata") or {}
    subject_type = str(metadata.get("subjectType") or "").strip().lower()
    view_type = str(metadata.get("viewType") or "").strip().lower()
    amenity_name = str(metadata.get("amenityName") or "").strip().lower()

    if subject_type == "construction_progress":
        return "construction_progress"
    if subject_type == "sample_flat":
        return "sample_flat_living_room"
    if subject_type == "project_exterior":
        if "aerial" in view_type:
            return "aerial_view"
        if "entrance" in view_type:
            return "entrance_gate"
        return "main_building_exterior"
    if subject_type == "township_overview":
        return "township_overview"
    if subject_type == "entrance_gate":
        return "entrance_gate"
    if subject_type == "amenity":
        if "pool" in amenity_name:
            return "swimming_pool"
        if "club" in amenity_name:
            return "clubhouse"
        if "gym" in amenity_name:
            return "gymnasium"
        slug = re.sub(r"[^a-z0-9]+", "_", amenity_name).strip("_")
        return slug or "amenity_rendering"
    return subject_type or "project_visual"


def notebook_description_for_asset(asset: dict[str, Any]) -> str:
    metadata = asset.get("normalizedMetadata") or {}
    parts = [
        asset.get("label"),
        metadata.get("subjectType"),
        metadata.get("viewType"),
        metadata.get("amenityName"),
    ]
    cleaned = [str(part).strip() for part in parts if isinstance(part, str) and part.strip()]
    return ", ".join(dict.fromkeys(cleaned))


def sync_notebook_template_library(namespace: dict[str, Any], bundle: dict[str, Any]) -> None:
    template = bundle.get("templateTruth") or {}
    if not template:
        return

    template_library = namespace.get("TEMPLATE_LIBRARY")
    if not isinstance(template_library, dict):
        return

    template_id = template.get("id") or "api-template"
    if template_id in template_library:
        return

    prompt_scaffold = template.get("promptScaffold")
    template_library[template_id] = {
        "template_id": template_id,
        "use_for": [map_notebook_post_type((bundle.get("postTypeContract") or {}).get("code")) or "project_launch"],
        "poster_archetype": "side_crop_premium_tower",
        "lever_hints": {
            "hero_presentation": "single_tower",
            "layout_geometry": "left_copy_right_hero",
            "graphic_layer": ["thin_frame"],
            "type_voice": "serif_sans_mix",
            "text_architecture": "proposition_first",
            "mood_mode": "warm_muted_premium",
            "density": "lean",
            "brand_visibility": "elegant_signature",
        },
        "rules": [
            "Use the supplied template as a style cue only.",
            str(prompt_scaffold or "Keep template influence subordinate to project truth."),
        ],
    }


def derive_project_slug(payload: dict[str, Any], bundle: dict[str, Any]) -> str:
    explicit = str(payload.get("projectSlug") or "").strip()
    if explicit:
        return explicit
    project = bundle.get("projectTruth") or {}
    name = str(project.get("name") or "").strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    name = re.sub(r"-{2,}", "-", name).strip("-")
    return name or "project"


def map_notebook_post_type(value: Any) -> str | None:
    code = str(value or "").strip()
    return NOTEBOOK_POST_TYPE_MAP.get(code)


def build_user_brief(bundle_or_request_context: dict[str, Any]) -> str:
    if "requestContext" in bundle_or_request_context or "projectTruth" in bundle_or_request_context:
        request_context = bundle_or_request_context.get("requestContext") or {}
        project_truth = bundle_or_request_context.get("projectTruth") or {}
    else:
        request_context = bundle_or_request_context
        project_truth = {}

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
    commercial_facts = build_project_commercial_fact_lines(project_truth)
    if commercial_facts:
        parts.append(
            "Available project commercial facts. Treat these as grounding context, not optional filler. "
            "Use the original brief intent to decide requested_fact_types, allowed_fact_kinds, required_fact_copies, disallowed_available_fact_kinds, and do_not_use_unless_requested. "
            "If the brief asks for a fact kind, use only these exact values and do not invent missing facts. "
            "If the brief does not ask for a fact kind, keep that available fact out of the final prompts:\n"
            + "\n".join(commercial_facts)
        )
    parts.append(
        "Use the provided format only to guide composition and layout. "
        "Do not mention aspect ratio, dimensions, or canvas size in the final prompt."
    )

    return "\n".join(parts).strip() or "Create a strong real-estate social poster."


def build_project_commercial_fact_lines(project: dict[str, Any]) -> list[str]:
    if not isinstance(project, dict):
        return []

    lines: list[str] = []
    scalar_fields = [
        ("Starting price", "startingPrice"),
        ("Booking amount", "bookingAmount"),
        ("Payment plan", "paymentPlanSummary"),
        ("Offer validity", "offerValidity"),
    ]
    list_fields = [
        ("Configurations", "configurations"),
        ("Size ranges", "sizeRanges"),
        ("Price by configuration", "priceRangeByConfig"),
        ("Current offers", "currentOffers"),
        ("Financing partners", "financingPartners"),
        ("Location advantages", "locationAdvantages"),
        ("Nearby landmarks", "nearbyLandmarks"),
        ("Connectivity points", "connectivityPoints"),
        ("Travel times", "travelTimes"),
    ]

    rera_number = str(project.get("reraNumber") or "").strip()
    if rera_number:
        lines.append(f"- RERA number: {rera_number}")

    for label, key in scalar_fields:
        value = str(project.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: {value}")

    for label, key in list_fields:
        values = coerce_string_list(project.get(key))
        if values:
            lines.append(f"- {label}: {'; '.join(values[:6])}")

    return lines


def normalize_agent_fact_boundary(analysis: dict[str, Any]) -> None:
    available_facts = parse_available_commercial_facts(
        coerce_string_list(analysis.get("available_commercial_facts"))
    )
    if not available_facts:
        return

    requested_kinds = expand_requested_fact_kinds(analysis.get("requested_fact_types"))
    raw_allowed_kinds = {
        normalize_fact_kind(value)
        for value in coerce_string_list(analysis.get("allowed_fact_kinds"))
    }
    raw_allowed_kinds.discard("")
    raw_disallowed_kinds = {
        normalize_fact_kind(value)
        for value in coerce_string_list(analysis.get("disallowed_available_fact_kinds"))
    }
    raw_disallowed_kinds.discard("")

    if requested_kinds:
        allowed_kinds = raw_allowed_kinds & requested_kinds if raw_allowed_kinds else set(requested_kinds)
    else:
        allowed_kinds = set()

    available_kinds = {fact["kind"] for fact in available_facts}
    allowed_kinds &= available_kinds
    allowed_kinds -= raw_disallowed_kinds

    post_type = str(analysis.get("post_type") or "").replace("-", "_")
    if post_type == "location_advantage":
        location_non_fact_kinds = {
            "starting_price",
            "price_by_configuration",
            "current_offers",
            "booking_amount",
            "payment_plan",
            "rera_number",
            "offer_validity",
            "financing_partners",
        }
        allowed_kinds -= location_non_fact_kinds

    disallowed_kinds = available_kinds - allowed_kinds

    required_copies = []
    for value in coerce_string_list(analysis.get("required_fact_copies")):
        matching_fact = find_available_fact_for_copy(value, available_facts)
        if matching_fact is None:
            continue
        if matching_fact["kind"] in allowed_kinds:
            required_copies.append(value)

    existing_do_not_use = normalize_do_not_use_facts(analysis.get("do_not_use_unless_requested"))
    blocked_by_copy = {(fact["kind"], fact["copy"]) for fact in existing_do_not_use}
    do_not_use = list(existing_do_not_use)
    for fact in available_facts:
        if not is_enforceable_public_fact(fact):
            continue
        if fact["kind"] not in disallowed_kinds:
            continue
        key = (fact["kind"], fact["copy"])
        if key in blocked_by_copy:
            continue
        blocked_by_copy.add(key)
        do_not_use.append(fact)

    analysis["requested_fact_types"] = sorted(requested_kinds)
    analysis["allowed_fact_kinds"] = sorted(allowed_kinds)
    analysis["required_fact_copies"] = dedupe_preserve_order(required_copies)
    analysis["disallowed_available_fact_kinds"] = sorted(disallowed_kinds)
    analysis["do_not_use_unless_requested"] = do_not_use


def parse_available_commercial_facts(lines: list[str]) -> list[dict[str, str]]:
    facts: list[dict[str, str]] = []
    for line in lines:
        cleaned = line.strip()
        if cleaned.startswith("-"):
            cleaned = cleaned[1:].strip()
        if ":" not in cleaned:
            continue
        label, copy = cleaned.split(":", 1)
        kind = normalize_fact_kind(label)
        value = copy.strip()
        if kind and value:
            facts.append({"kind": kind, "copy": value})
    return facts


def is_enforceable_public_fact(fact: dict[str, str]) -> bool:
    kind = str(fact.get("kind") or "").strip()
    copy = str(fact.get("copy") or "").strip()
    if not kind or not copy:
        return False
    if kind in INTERNAL_FACT_KINDS:
        return False
    return True


def normalize_do_not_use_facts(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    facts: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or "").strip()
        copy = str(item.get("copy") or "").strip()
        if not kind or not copy:
            string_items = [(str(key), str(val)) for key, val in item.items() if str(val).strip()]
            if len(string_items) == 1:
                kind, copy = string_items[0]
        normalized_kind = normalize_fact_kind(kind)
        if normalized_kind and copy:
            facts.append({"kind": normalized_kind, "copy": copy.strip()})
    return facts


def find_available_fact_for_copy(value: str, available_facts: list[dict[str, str]]) -> dict[str, str] | None:
    normalized = value.strip()
    if not normalized:
        return None
    exact_matches = [fact for fact in available_facts if fact["copy"] == normalized]
    if exact_matches:
        return exact_matches[0]

    containing_matches = [
        fact
        for fact in available_facts
        if normalized in fact["copy"] or fact["copy"] in normalized
    ]
    if containing_matches:
        return max(containing_matches, key=lambda fact: len(fact["copy"]))

    for fact in available_facts:
        copy = fact["copy"]
        if normalized == copy or normalized in copy or copy in normalized:
            return fact
    return None


def normalize_fact_kind(value: Any) -> str:
    normalized = normalize_choice_token(value)
    return FACT_KIND_ALIASES.get(normalized, normalized)


def expand_requested_fact_kinds(value: Any) -> set[str]:
    expanded: set[str] = set()
    for raw_kind in coerce_string_list(value):
        kind = normalize_fact_kind(raw_kind)
        if not kind:
            continue
        expanded.update(REQUESTED_FACT_KIND_EXPANSIONS.get(kind, {kind}))
    return expanded


FACT_KIND_ALIASES = {
    "area": "size_ranges",
    "booking": "booking_amount",
    "booking_benefit": "current_offers",
    "booking_benefits": "current_offers",
    "configuration": "configurations",
    "configuration_pricing": "price_by_configuration",
    "configurations_pricing": "price_by_configuration",
    "config_wise_pricing": "price_by_configuration",
    "connectivity": "connectivity_points",
    "landmark": "nearby_landmarks",
    "landmarks": "nearby_landmarks",
    "location": "location_advantages",
    "offer": "current_offers",
    "offers": "current_offers",
    "payment": "payment_plan",
    "payment_plan_summary": "payment_plan",
    "price": "starting_price",
    "pricing": "starting_price",
    "rera": "rera_number",
    "size": "size_ranges",
    "travel_time": "travel_times",
}


REQUESTED_FACT_KIND_EXPANSIONS = {
    "starting_price": {"starting_price"},
    "price_by_configuration": {"price_by_configuration", "configurations"},
    "configurations": {"configurations"},
    "size_ranges": {"size_ranges"},
    "current_offers": {"current_offers", "offer_validity"},
    "booking_amount": {"booking_amount"},
    "payment_plan": {"payment_plan"},
    "rera_number": {"rera_number"},
    "location_advantages": {
        "location_advantages",
        "nearby_landmarks",
        "connectivity_points",
        "travel_times",
    },
    "nearby_landmarks": {"nearby_landmarks", "travel_times"},
    "connectivity_points": {"connectivity_points", "travel_times"},
    "travel_times": {"travel_times"},
    "financing_partners": {"financing_partners"},
}


INTERNAL_FACT_KINDS = {
    "pricing_band",
}


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(value.strip())
    return result


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


def get_no_exact_copy_note(post_type: str) -> str:
    if post_type == "site_visit_invite":
        copy_treatment = "a short invitation copy treatment"
    elif post_type == "location_advantage":
        copy_treatment = "a minimal location/context copy treatment"
    elif post_type == "project_launch":
        copy_treatment = "a minimal launch copy treatment"
    elif post_type == "amenity_spotlight":
        copy_treatment = "a minimal amenity-benefit copy treatment"
    elif post_type == "construction_update":
        copy_treatment = "a minimal progress/update copy treatment"
    elif post_type == "testimonial":
        copy_treatment = "a minimal testimonial/quote copy treatment"
    elif post_type == "ad":
        copy_treatment = "a minimal ad hook copy treatment with one short proof line at most"
    else:
        copy_treatment = "a minimal copy treatment"

    return f"No exact copy was supplied. Do not name unavailable text fields; use {copy_treatment}."


def validate_verified_prompt_contract(analysis: dict[str, Any], verified: dict[str, Any]) -> None:
    if isinstance(verified, BaseModel):
        verified = verified.model_dump()
    validate_supplied_copy_contract(analysis, verified)
    validate_agent_fact_boundary(analysis, verified)


def validate_supplied_copy_contract(analysis: dict[str, Any], verified: dict[str, Any]) -> None:
    exact_text = str(analysis.get("supplied_exact_text") or "").strip()
    offer = str(analysis.get("supplied_offer") or "").strip()
    variations = verified.get("variations") or []
    missing: list[str] = []

    for index, variation in enumerate(variations, start=1):
        prompt = str(variation.get("revised_prompt") or "")
        if exact_text and exact_text not in prompt:
            missing.append(f"variation {index} missing exact text")
        if offer and offer not in prompt:
            missing.append(f"variation {index} missing supplied offer")

    if missing:
        raise RuntimeError(
            "Verifier failed to preserve supplied manual copy: " + "; ".join(missing)
        )


def validate_agent_fact_boundary(analysis: dict[str, Any], verified: dict[str, Any]) -> None:
    required_copies = analysis.get("required_fact_copies") or []
    variations = verified.get("variations") or []
    violations: list[str] = []

    for index, variation in enumerate(variations, start=1):
        prompt = str(variation.get("revised_prompt") or "")
        for required_copy in required_copies:
            required = str(required_copy or "").strip()
            if required and required not in prompt:
                violations.append(f"variation {index} missing required fact: {required}")

        for fact in analysis.get("do_not_use_unless_requested") or []:
            if not isinstance(fact, dict):
                continue
            kind = str(fact.get("kind") or "").strip()
            copy = str(fact.get("copy") or "").strip()
            if copy and copy in prompt:
                violations.append(f"variation {index} contains disallowed {kind}: {copy}")

    if violations:
        raise RuntimeError(
            "Verifier failed agent fact boundary: " + "; ".join(violations)
        )


def validate_prompt_hygiene_contract(verified: dict[str, Any]) -> None:
    forbidden_fragments = (
        "aspect ratio",
        "canvas size",
        "canvas dimension",
    )
    violations: list[str] = []

    for index, variation in enumerate(verified.get("variations") or [], start=1):
        prompt = str(variation.get("revised_prompt") or "").lower()
        for fragment in forbidden_fragments:
            if fragment in prompt:
                violations.append(f"variation {index} contains {fragment}")

    if violations:
        raise RuntimeError(
            "Verifier failed to remove prompt-only metadata: " + "; ".join(violations)
        )


def visual_mechanism_for_ad_hook(commercial_hook: str) -> str:
    return {
        "price": "price_billboard",
        "visit": "visit_ticket",
        "location": "location_receipt",
        "amenity": "value_stack",
        "configuration": "comparison_cards",
        "offer": "offer_strip",
        "investment": "value_stack",
        "trust": "trust_seal",
        "compliance": "compliance_footer",
        "credibility": "credibility_band",
    }.get(commercial_hook, "credibility_band")


def repair_location_advantage_archetype(
    analysis: dict[str, Any]
) -> dict[str, Any]:
    if analysis.get("post_type") != "location_advantage":
        return analysis

    split_context_archetypes = {
        "split_panel",
        "left_copy_right_hero",
        "right_copy_left_hero",
        "claim_panel_side_crop",
        "balanced_card_layout",
    }

    if analysis.get("poster_archetype") in split_context_archetypes:
        return analysis

    analysis["poster_archetype"] = "split_panel"
    analysis["layout_geometry"] = "split_panel"
    analysis["graphic_layer"] = ["geometric_blocks"]

    repair_note = (
        "System repair applied: location-advantage requires a split-context proof archetype "
        "with project hero on one side and a compact map/connectivity panel on the other. "
        "Corrected poster_archetype to split_panel and layout_geometry to split_panel."
    )
    conflict_notes = analysis.get("conflict_notes") or []
    if repair_note not in conflict_notes:
        conflict_notes.append(repair_note)
    analysis["conflict_notes"] = conflict_notes

    return analysis


def choose_ad_project_library_asset(
    available_assets: list[dict[str, Any]],
    commercial_hook: str,
) -> dict[str, Any] | None:
    if not available_assets:
        return None

    priority_by_hook = {
        "amenity": ["amenity", "sales_gallery", "main_building_exterior", "aerial_view"],
        "visit": ["sales_gallery", "entrance_gate", "main_building_exterior", "aerial_view"],
        "location": ["aerial_view", "entrance_gate", "main_building_exterior", "sales_gallery"],
        "price": ["main_building_exterior", "aerial_view", "entrance_gate", "sales_gallery", "amenity"],
        "configuration": ["main_building_exterior", "aerial_view", "sales_gallery", "amenity"],
        "offer": ["main_building_exterior", "aerial_view", "entrance_gate", "sales_gallery", "amenity"],
        "investment": ["aerial_view", "main_building_exterior", "entrance_gate", "sales_gallery"],
        "trust": ["main_building_exterior", "sales_gallery", "entrance_gate", "aerial_view", "amenity"],
        "compliance": ["main_building_exterior", "sales_gallery", "entrance_gate", "aerial_view", "amenity"],
        "credibility": ["main_building_exterior", "sales_gallery", "entrance_gate", "aerial_view", "amenity"],
    }
    priorities = priority_by_hook.get(commercial_hook, priority_by_hook["offer"])

    def category_score(category: str) -> int:
        normalized = str(category or "").strip().lower()
        for index, token in enumerate(priorities):
            if token in normalized:
                return index
        return len(priorities) + 1

    ranked = sorted(
        [asset for asset in available_assets if isinstance(asset, dict)],
        key=lambda asset: (
            category_score(str(asset.get("category") or "")),
            str(asset.get("category") or ""),
            str(asset.get("filename") or ""),
        ),
    )
    return ranked[0] if ranked else None


def derive_reference_image_urls(payload: dict[str, Any]) -> list[str] | None:
    media_context = payload.get("mediaContext") or {}
    urls = [
        item.get("url")
        for item in media_context.get("referenceImages") or []
        if isinstance(item, dict) and isinstance(item.get("url"), str) and item.get("url")
    ]
    return urls or None


def derive_template_image_url(payload: dict[str, Any]) -> str | None:
    media_context = payload.get("mediaContext") or {}
    template_image = media_context.get("templateImage") or {}
    url = template_image.get("url")
    return url if isinstance(url, str) and url else None


def derive_logo_image_url(payload: dict[str, Any]) -> str | None:
    # Exact logos are passed at generation time as direct references.
    # The compiler does not need logo vision, and attaching it to all three
    # notebook agent passes adds avoidable multimodal latency.
    return None


def derive_template_id(namespace: dict[str, Any], bundle: dict[str, Any]) -> str | None:
    template = bundle.get("templateTruth") or {}
    if not template:
        return None
    template_library = namespace.get("TEMPLATE_LIBRARY")
    template_id = template.get("id") or "api-template"
    if isinstance(template_library, dict) and template_id in template_library:
        return template_id
    return template_id


def build_reference_image_note(bundle: dict[str, Any], payload: dict[str, Any]) -> str | None:
    if not derive_reference_image_urls(payload):
        return None
    exact_assets = bundle.get("exactAssetContract") or {}
    if exact_assets.get("requiredProjectAnchorAssetId"):
        return (
            "Use vision to understand the supplied project reference, preserve architectural identity, "
            "and choose crop, angle, and realism treatment without replacing the project."
        )
    return "Use the supplied reference image as the primary visual truth anchor."


def build_template_note(bundle: dict[str, Any]) -> str | None:
    if not bundle.get("templateTruth"):
        return None
    return "Use the supplied template only as a style and composition cue. Do not let it override project truth."


def build_logo_note(bundle: dict[str, Any]) -> str | None:
    exact_assets = bundle.get("exactAssetContract") or {}
    if not exact_assets.get("logoAssetId"):
        return None
    return (
        "An exact brand logo will be supplied separately at generation time. "
        "Do not analyze it visually, do not invent logo details, and do not redesign it."
    )


def clamp_requested_variation_count(value: Any) -> int:
    try:
        parsed = int(value)
    except Exception:
        return 1
    return max(1, min(MAX_BRIDGE_VARIATIONS, parsed))


def derive_requested_variation_count(payload: dict[str, Any]) -> int:
    bundle = payload.get("truthBundle") or {}
    request_context = bundle.get("requestContext") or {}
    return clamp_requested_variation_count(request_context.get("variationCount", 1))


def enum_values(enum_cls: type[Any]) -> list[str]:
    return [item.value for item in enum_cls]


POSTER_ARCHETYPE_VALUES = enum_values(SharedPosterArchetype)
HERO_PRESENTATION_VALUES = set(enum_values(SharedHeroPresentation))
LAYOUT_GEOMETRY_VALUES = set(enum_values(SharedLayoutGeometry))
GRAPHIC_LAYER_VALUES = set(enum_values(SharedGraphicLayer))
TYPE_VOICE_VALUES = set(enum_values(SharedTypeVoice))
TEXT_ARCHITECTURE_VALUES = set(enum_values(SharedTextArchitecture))
MOOD_MODE_VALUES = set(enum_values(SharedMoodMode))
DENSITY_VALUES = set(enum_values(SharedDensityLevel))
BRAND_VISIBILITY_VALUES = set(enum_values(SharedBrandVisibility))


def normalize_choice_token(value: Any) -> str:
    token = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower())
    return re.sub(r"_+", "_", token).strip("_")


def coerce_choice(value: Any, allowed_values: list[str] | set[str]) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    allowed_list = list(allowed_values)
    if raw in allowed_list:
        return raw
    normalized = normalize_choice_token(raw)
    for candidate in allowed_list:
        if normalize_choice_token(candidate) == normalized:
            return candidate
    return None


def rank_archetypes_for_analysis(analysis: dict[str, Any]) -> list[str]:
    current = coerce_choice(analysis.get("poster_archetype"), POSTER_ARCHETYPE_VALUES)
    post_type = str(analysis.get("post_type") or "")
    hero = str(analysis.get("hero_presentation") or "")

    ranked: list[str] = []
    if current:
        ranked.append(current)

    if post_type == "project_launch":
        ranked.extend(
            [
                "dusk_emotional_crop",
                "side_crop_premium_tower",
                "clear_sky_statement",
                "centered_monolith",
                "white_space_editorial_statement",
                "philosophy_open_field",
                "swiss_grid_premium",
                "organic_shape_launch",
                "watermark_catalog",
                "inset_image_card",
            ]
        )
    elif post_type == "site_visit_invite":
        ranked.extend(
            [
                "documentary_presence",
                "side_crop_premium_tower",
                "clear_sky_statement",
                "footer_builder_campaign",
                "centered_monolith",
                "white_space_editorial_statement",
                "philosophy_open_field",
                "swiss_grid_premium",
                "soft_editorial_cutout",
                "inset_image_card",
                "watermark_catalog",
                "organic_shape_launch",
                "dusk_emotional_crop",
                "masterplan_scale_reveal",
                "quote_led_editorial",
                "symbolic_festive_field",
                "scarcity_panel",
                "ultra_minimal_address",
            ]
        )
    elif post_type == "location_advantage":
        location_specific_archetypes = [
            "map_backdrop_project_hero",
            "split_context_proof",
        ]
        ranked.extend(location_specific_archetypes)
        ranked = dedupe_strings(ranked)
        return ranked
    elif post_type == "testimonial":
        ranked.extend(
            [
                "quote_led_editorial",
                "inset_image_card",
                "watermark_catalog",
                "white_space_editorial_statement",
                "soft_editorial_cutout",
                "swiss_grid_premium",
                "philosophy_open_field",
            ]
        )
    elif post_type == "ad":
        ranked.extend(
            [
                "scarcity_panel",
                "clear_sky_statement",
                "side_crop_premium_tower",
                "footer_builder_campaign",
                "swiss_grid_premium",
                "organic_shape_launch",
                "soft_editorial_cutout",
            ]
        )
    elif post_type == "construction_update":
        ranked.extend(
            [
                "documentary_presence",
                "footer_builder_campaign",
                "side_crop_premium_tower",
            ]
        )
    elif post_type == "festival_post":
        ranked.extend(
            [
                "symbolic_festive_field",
                "white_space_editorial_statement",
                "soft_editorial_cutout",
            ]
        )
    elif post_type == "amenity_spotlight":
        ranked.extend(
            [
                "soft_editorial_cutout",
                "inset_image_card",
                "watermark_catalog",
            ]
        )

    if hero in {"villa", "framed_image_card"}:
        ranked.extend(
            [
                "watermark_catalog",
                "inset_image_card",
                "white_space_editorial_statement",
            ]
        )
    elif hero in {"township_overview", "aerial_masterplan"}:
        ranked.extend(
            [
                "masterplan_scale_reveal",
                "philosophy_open_field",
            ]
        )
    else:
        ranked.extend(
            [
                "side_crop_premium_tower",
                "dusk_emotional_crop",
                "clear_sky_statement",
                "centered_monolith",
                "white_space_editorial_statement",
                "philosophy_open_field",
                "swiss_grid_premium",
                "soft_editorial_cutout",
            ]
        )

    ranked.extend(POSTER_ARCHETYPE_VALUES)
    return dedupe_strings(ranked)


def select_route_archetype(raw_value: Any, analysis: dict[str, Any], used: set[str]) -> str:
    post_type = str(analysis.get("post_type") or "")
    location_advantage_valid = {"map_backdrop_project_hero", "split_context_proof"}
    candidate = coerce_choice(raw_value, POSTER_ARCHETYPE_VALUES)
    if candidate and candidate not in used:
        if post_type == "location_advantage" and candidate not in location_advantage_valid:
            pass
        else:
            return candidate
    for fallback in rank_archetypes_for_analysis(analysis):
        if fallback not in used:
            if post_type == "location_advantage" and fallback not in location_advantage_valid:
                continue
            return fallback
    if post_type == "location_advantage":
        valid_remaining = [a for a in location_advantage_valid if a not in used]
        if valid_remaining:
            return valid_remaining[0]
        return list(location_advantage_valid)[0]
    return POSTER_ARCHETYPE_VALUES[0]


def route_defaults_for_archetype(archetype: str, analysis: dict[str, Any]) -> dict[str, Any]:
    defaults = ARCHETYPE_ROUTE_DEFAULTS.get(archetype, {})
    return {
        "poster_archetype": archetype,
        "hero_presentation": coerce_choice(defaults.get("hero_presentation"), HERO_PRESENTATION_VALUES)
        or analysis.get("hero_presentation"),
        "layout_geometry": coerce_choice(defaults.get("layout_geometry"), LAYOUT_GEOMETRY_VALUES)
        or analysis.get("layout_geometry"),
        "graphic_layer": [
            layer
            for layer in [
                coerce_choice(layer, GRAPHIC_LAYER_VALUES)
                for layer in (defaults.get("graphic_layer") or [])
            ]
            if layer
        ]
        or analysis.get("graphic_layer")
        or [],
        "type_voice": coerce_choice(defaults.get("type_voice"), TYPE_VOICE_VALUES)
        or analysis.get("type_voice"),
        "text_architecture": coerce_choice(defaults.get("text_architecture"), TEXT_ARCHITECTURE_VALUES)
        or analysis.get("text_architecture"),
        "mood_mode": coerce_choice(defaults.get("mood_mode"), MOOD_MODE_VALUES)
        or analysis.get("mood_mode"),
        "density": coerce_choice(defaults.get("density"), DENSITY_VALUES)
        or analysis.get("density"),
        "brand_visibility": coerce_choice(defaults.get("brand_visibility"), BRAND_VISIBILITY_VALUES)
        or analysis.get("brand_visibility"),
    }


def build_fallback_route_prompt(analysis: dict[str, Any], route_context: dict[str, Any]) -> str:
    project_name = str(analysis.get("project_name") or "the project").strip()
    objective = str(analysis.get("business_job") or analysis.get("objective_summary") or "").strip()
    hero = str(route_context.get("hero_presentation") or "").replace("_", " ")
    layout = str(route_context.get("layout_geometry") or "").replace("_", " ")
    mood = str(route_context.get("mood_mode") or "").replace("_", " ")
    return (
        f"Finished social poster for {project_name}. Use a {hero} hero treatment with a "
        f"{layout} composition and a {mood} mood. Preserve the supplied project reference as truth. "
        f"Keep the result premium, poster-grade, and grounded in the same project identity. "
        f"Do not invent address lines, contact details, RERA information, website URLs, phone numbers, or logos."
    ).strip()


def build_fallback_variation(index: int, analysis: dict[str, Any], archetype: str) -> dict[str, Any]:
    route_context = route_defaults_for_archetype(archetype, analysis)
    strategy = str(analysis.get("business_job") or analysis.get("objective_summary") or "Distinct creative route").strip()
    return {
        "title": f"Variation {index}",
        "strategy": strategy,
        "poster_archetype": archetype,
        "prompt": build_fallback_route_prompt(analysis, route_context),
        "negative": "",
        "difference_from_others": None,
    }


def sanitize_crafted_set(
    crafted: Any,
    analysis: dict[str, Any],
    requested_variation_count: int,
) -> BridgeCraftedSet:
    raw = to_jsonable_model(crafted)
    if not isinstance(raw, dict):
        raw = {}
    raw_variations = raw.get("variations") if isinstance(raw.get("variations"), list) else []
    prompt_summary = str(raw.get("prompt_summary") or "").strip()

    sanitized_variations: list[BridgePromptVariationDraft] = []
    used_archetypes: set[str] = set()
    for index, variation in enumerate(raw_variations[:requested_variation_count], start=1):
        if not isinstance(variation, dict):
            continue
        selected_archetype = select_route_archetype(variation.get("poster_archetype"), analysis, used_archetypes)
        used_archetypes.add(selected_archetype)
        prompt = str(variation.get("prompt") or "").strip() or build_fallback_route_prompt(
            analysis,
            route_defaults_for_archetype(selected_archetype, analysis),
        )
        sanitized_variations.append(
            BridgePromptVariationDraft(
                title=str(variation.get("title") or f"Variation {index}").strip(),
                strategy=str(
                    variation.get("strategy")
                    or analysis.get("business_job")
                    or analysis.get("objective_summary")
                    or "Distinct creative route"
                ).strip(),
                poster_archetype=selected_archetype,
                prompt=prompt,
                negative=str(variation.get("negative") or "").strip(),
                difference_from_others=(
                    str(variation.get("difference_from_others")).strip()
                    if isinstance(variation.get("difference_from_others"), str)
                    and str(variation.get("difference_from_others")).strip()
                    else None
                ),
            )
        )

    while len(sanitized_variations) < requested_variation_count:
        selected_archetype = select_route_archetype(None, analysis, used_archetypes)
        used_archetypes.add(selected_archetype)
        sanitized_variations.append(
            BridgePromptVariationDraft(
                **build_fallback_variation(
                    len(sanitized_variations) + 1,
                    analysis,
                    selected_archetype,
                )
            )
        )

    return BridgeCraftedSet(
        prompt_summary=prompt_summary or str(analysis.get("objective_summary") or analysis.get("business_job") or "").strip(),
        variations=sanitized_variations,
    )


def sanitize_verification_set(
    verified: Any,
    analysis: dict[str, Any],
    crafted_set: BridgeCraftedSet,
    requested_variation_count: int,
) -> BridgeVerificationSet:
    raw = to_jsonable_model(verified)
    if not isinstance(raw, dict):
        raw = {}
    raw_variations = raw.get("variations") if isinstance(raw.get("variations"), list) else []
    prompt_summary = str(raw.get("prompt_summary") or crafted_set.prompt_summary).strip()

    crafted_by_archetype = {
        variation.poster_archetype: variation
        for variation in crafted_set.variations
    }
    sanitized_variations: list[BridgeVerifiedVariation] = []
    used_archetypes: set[str] = set()

    for index, variation in enumerate(raw_variations[:requested_variation_count], start=1):
        if not isinstance(variation, dict):
            continue
        selected_archetype = select_route_archetype(variation.get("poster_archetype"), analysis, used_archetypes)
        used_archetypes.add(selected_archetype)
        crafted_match = crafted_by_archetype.get(selected_archetype) or crafted_set.variations[min(index - 1, len(crafted_set.variations) - 1)]
        revised_prompt = str(variation.get("revised_prompt") or "").strip() or crafted_match.prompt
        sanitized_variations.append(
            BridgeVerifiedVariation(
                title=str(variation.get("title") or crafted_match.title or f"Variation {index}").strip(),
                strategy=str(variation.get("strategy") or crafted_match.strategy).strip(),
                poster_archetype=selected_archetype,
                revised_prompt=revised_prompt,
                revised_negative=str(variation.get("revised_negative") or crafted_match.negative or "").strip(),
                difference_from_others=(
                    str(variation.get("difference_from_others")).strip()
                    if isinstance(variation.get("difference_from_others"), str)
                    and str(variation.get("difference_from_others")).strip()
                    else crafted_match.difference_from_others
                ),
            )
        )

    while len(sanitized_variations) < requested_variation_count:
        crafted_match = crafted_set.variations[len(sanitized_variations)]
        used_archetypes.add(crafted_match.poster_archetype)
        sanitized_variations.append(
            BridgeVerifiedVariation(
                title=crafted_match.title,
                strategy=crafted_match.strategy,
                poster_archetype=crafted_match.poster_archetype,
                revised_prompt=crafted_match.prompt,
                revised_negative=crafted_match.negative,
                difference_from_others=crafted_match.difference_from_others,
            )
        )

    issues = [str(item).strip() for item in raw.get("issues") or [] if str(item).strip()]
    return BridgeVerificationSet(
        approved=bool(raw.get("approved", True)),
        issues=issues,
        prompt_summary=prompt_summary or crafted_set.prompt_summary,
        variations=sanitized_variations,
        verification_summary=str(raw.get("verification_summary") or "Verified variation set.").strip(),
    )


def coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = str(value or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(value.strip())
    return result


def normalize_notebook_bridge_result(
    *,
    payload: dict[str, Any],
    analysis: dict[str, Any],
    crafted: dict[str, Any],
    verified: dict[str, Any],
    tool_calls: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    bundle = payload.get("truthBundle") or {}
    generation_contract = bundle.get("generationContract") or {}
    requested_variation_count = derive_requested_variation_count(payload)

    used_skill_names = sorted(
        {
            str((call.get("toolArgs") or {}).get("skill_name"))
            for call in tool_calls
            if str(call.get("toolName", "")).startswith("get_skill_")
            and isinstance((call.get("toolArgs") or {}).get("skill_name"), str)
        }
    )
    loaded_skill_names = [
        "briefly-social-archetypes",
        "briefly-social-core",
    ]
    verified_variations = verified.get("variations") if isinstance(verified.get("variations"), list) else []
    normalized_variations: list[dict[str, Any]] = []

    if verified_variations:
        for index, route in enumerate(verified_variations, start=1):
            route_prompt = sanitize_public_prompt_text(str(route.get("revised_prompt") or "").strip(), payload)
            route_negative = sanitize_negative_prompt_text(
                str(route.get("revised_negative") or "").strip(),
                payload,
            )
            route_final_prompt = (
                f"{route_prompt} Negative prompt: {route_negative}".strip()
                if route_negative
                else route_prompt
            )
            route_archetype = select_route_archetype(
                route.get("poster_archetype"),
                analysis,
                {item["resolvedConstraints"]["posterArchetype"] for item in normalized_variations},
            )
            route_defaults = route_defaults_for_archetype(route_archetype, analysis)
            route_context = {
                **analysis,
                **route_defaults,
            }
            normalized_variations.append(
                {
                    "id": f"variation_{index}",
                    "title": str(route.get("title") or f"Variation {index}").strip(),
                    "strategy": str(
                        route.get("strategy")
                        or analysis.get("objective_summary")
                        or analysis.get("business_job")
                        or "Distinct creative route"
                    ).strip(),
                    "seedPrompt": build_seed_prompt(route_prompt, route_context, bundle),
                    "finalPrompt": route_final_prompt,
                    "referenceStrategy": resolve_reference_strategy(payload),
                    "differenceFromOthers": (
                        str(route.get("difference_from_others")).strip()
                        if isinstance(route.get("difference_from_others"), str)
                        and str(route.get("difference_from_others")).strip()
                        else None
                    ),
                    "resolvedConstraints": {
                        "posterArchetype": route_context.get("poster_archetype"),
                        "heroPresentation": route_context.get("hero_presentation"),
                        "layoutGeometry": route_context.get("layout_geometry"),
                        "graphicLayer": route_context.get("graphic_layer") or [],
                        "textArchitecture": route_context.get("text_architecture"),
                        "typeVoice": route_context.get("type_voice"),
                        "moodMode": route_context.get("mood_mode"),
                        "density": route_context.get("density"),
                        "brandVisibility": route_context.get("brand_visibility"),
                        "commercialHook": analysis.get("commercial_hook"),
                        "visualMechanism": analysis.get("visual_mechanism"),
                        "variationIndex": index,
                    },
                    "compilerTrace": {
                        "verified": verified.get("approved"),
                        "verificationSummary": verified.get("verification_summary"),
                    },
                }
            )

    if not normalized_variations:
        clean_prompt = sanitize_public_prompt_text(str(verified.get("revised_prompt") or "").strip(), payload)
        clean_negative = sanitize_negative_prompt_text(
            str(verified.get("revised_negative") or "").strip(),
            payload,
        )
        final_prompt = f"{clean_prompt} Negative prompt: {clean_negative}".strip() if clean_negative else clean_prompt
        normalized_variations.append(
            {
                "id": "variation_1",
                "title": str(analysis.get("poster_archetype") or "Notebook Direction").replace("_", " ").title(),
                "strategy": analysis.get("objective_summary") or analysis.get("business_job") or build_prompt_summary(clean_prompt, analysis),
                "seedPrompt": build_seed_prompt(clean_prompt, analysis, bundle),
                "finalPrompt": final_prompt,
                "referenceStrategy": resolve_reference_strategy(payload),
                "resolvedConstraints": {
                    "posterArchetype": analysis.get("poster_archetype"),
                    "heroPresentation": analysis.get("hero_presentation"),
                    "layoutGeometry": analysis.get("layout_geometry"),
                    "graphicLayer": analysis.get("graphic_layer") or [],
                    "textArchitecture": analysis.get("text_architecture"),
                    "commercialHook": analysis.get("commercial_hook"),
                    "visualMechanism": analysis.get("visual_mechanism"),
                    "variationIndex": 1,
                },
                "compilerTrace": {
                    "verified": verified.get("approved"),
                    "verificationSummary": verified.get("verification_summary"),
                },
            }
        )

    first_variation = normalized_variations[0]
    prompt_summary = build_variation_set_summary(analysis, normalized_variations)

    compiler_trace = {
        "pipeline": PIPELINE_NAME,
        "orchestration": "archived-notebook-exec",
        "loadedSkillNames": loaded_skill_names,
        "loadedSkillCount": len(loaded_skill_names),
        "usedSkillNames": used_skill_names,
        "requestedVariationCount": requested_variation_count,
        "returnedVariationCount": len(normalized_variations),
        "toolCalls": tool_calls,
        "skillToolCalls": [
            call for call in tool_calls if str(call.get("toolName", "")).startswith("get_skill_")
        ],
        "eventCount": len(tool_calls),
        "analystOutput": analysis,
        "craftedOutput": crafted,
        "verifierOutput": verified,
        "verifierApproved": verified.get("approved"),
        "verifierIssues": verified.get("issues") or [],
        "verificationSummary": verified.get("verification_summary"),
        "promptSystemVersion": PIPELINE_NAME,
        "truthBundleSummary": {
            "postTypeCode": (bundle.get("postTypeContract") or {}).get("code"),
            "candidateAssetIds": [
                asset.get("id")
                for asset in (bundle.get("candidateAssets") or [])
                if asset.get("id")
            ],
            "exactAssetIds": {
                "logo": (bundle.get("exactAssetContract") or {}).get("logoAssetId"),
                "reraQr": (bundle.get("exactAssetContract") or {}).get("reraQrAssetId"),
                "projectAnchor": (bundle.get("exactAssetContract") or {}).get("requiredProjectAnchorAssetId"),
            },
        },
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
        "variationCount": len(normalized_variations),
        "compilerMode": "archived-notebook-bridge",
        "promptDetailMode": "archived-notebook",
        "posterArchetype": first_variation["resolvedConstraints"].get("posterArchetype"),
        "heroPresentation": first_variation["resolvedConstraints"].get("heroPresentation"),
        "layoutGeometry": first_variation["resolvedConstraints"].get("layoutGeometry"),
        "graphicLayer": first_variation["resolvedConstraints"].get("graphicLayer") or [],
        "typeVoice": first_variation["resolvedConstraints"].get("typeVoice") or analysis.get("type_voice"),
        "textArchitecture": first_variation["resolvedConstraints"].get("textArchitecture"),
        "moodMode": first_variation["resolvedConstraints"].get("moodMode") or analysis.get("mood_mode"),
        "density": first_variation["resolvedConstraints"].get("density") or analysis.get("density"),
        "brandVisibility": first_variation["resolvedConstraints"].get("brandVisibility") or analysis.get("brand_visibility"),
        "commercialHook": first_variation["resolvedConstraints"].get("commercialHook") or analysis.get("commercial_hook"),
        "visualMechanism": first_variation["resolvedConstraints"].get("visualMechanism") or analysis.get("visual_mechanism"),
    }

    result = {
        "promptSummary": prompt_summary,
        "seedPrompt": first_variation["seedPrompt"],
        "finalPrompt": first_variation["finalPrompt"],
        "aspectRatio": analysis.get("aspect_ratio")
        or generation_contract.get("aspectRatio")
        or "1:1",
        "chosenModel": generation_contract.get("chosenModel"),
        "referenceStrategy": resolve_reference_strategy(payload),
        "templateType": derive_template_type(bundle),
        "variations": normalized_variations,
        "resolvedConstraints": resolved_constraints,
        "compilerTrace": compiler_trace,
        "selectedAmenity": analysis.get("specific_amenity"),
        "amenityImageAssetIds": (
            (bundle.get("amenityResolution") or {}).get("selectedAssetIds") or []
        ),
    }
    return result, compiler_trace


def sanitize_public_prompt_text(
    prompt: str,
    payload: dict[str, Any],
    include_identity_guardrail: bool = True,
    include_output_guardrails: bool = True,
) -> str:
    bundle = payload.get("truthBundle") or {}
    text = prompt.strip()
    candidate_assets = bundle.get("candidateAssets") or []
    for asset in candidate_assets:
        replacement = replacement_label_for_asset(asset, bundle)
        asset_id = asset.get("id")
        if isinstance(asset_id, str) and asset_id:
            text = re.sub(rf"\b{re.escape(asset_id)}\b", replacement, text)
        file_name = asset.get("fileName")
        if isinstance(file_name, str) and file_name:
            text = re.sub(rf"\b{re.escape(file_name)}\b", replacement, text)
        storage_path = asset.get("storagePath")
        if isinstance(storage_path, str) and storage_path:
            text = text.replace(storage_path, replacement)
    text = re.sub(
        r"\b(?:the\s+)?project[-\s]library asset ['\"]the supplied project reference['\"]",
        "the supplied project reference",
        text,
        flags=re.IGNORECASE,
    )
    media_context = payload.get("mediaContext") or {}
    for collection_key in ("referenceImages",):
        for item in media_context.get(collection_key) or []:
            url = item.get("url")
            if isinstance(url, str) and url:
                text = text.replace(url, "the supplied reference")
    for item in (media_context.get("templateImage"), media_context.get("logoImage")):
        if isinstance(item, dict):
            url = item.get("url")
            if isinstance(url, str) and url:
                text = text.replace(url, "the supplied asset")
    text = normalize_project_name_location_phrasing(text, payload)
    if include_identity_guardrail:
        text = append_project_identity_guardrail(text, payload)
    if include_output_guardrails:
        text = append_output_authenticity_guardrails(text, payload)
    text = strip_explicit_aspect_ratio_mentions(text)
    return re.sub(r"\s{2,}", " ", text).strip()


def sanitize_negative_prompt_text(prompt: str, payload: dict[str, Any]) -> str:
    cleaned = sanitize_public_prompt_text(
        prompt,
        payload,
        include_identity_guardrail=False,
        include_output_guardrails=False,
    )
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
        "invented",
        "unsupplied",
        "extra promotion",
        "extra offer",
        "offer claim",
        "social media handle",
        "deadline",
    )
    remove_photo_negatives = has_truthful_visual_anchor(payload)
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


def normalize_project_name_location_phrasing(text: str, payload: dict[str, Any]) -> str:
    project_name = get_project_display_name(payload)
    if not project_name:
        return text

    replacements = [
        (f"for a {project_name} project launch", f"for the launch of project named {project_name}"),
        (f"for an {project_name} project launch", f"for the launch of project named {project_name}"),
        (f"for the {project_name} project launch", f"for the launch of project named {project_name}"),
        (f"a {project_name} project launch", f"the launch of project named {project_name}"),
        (f"an {project_name} project launch", f"the launch of project named {project_name}"),
        (f"the {project_name} project launch", f"the launch of project named {project_name}"),
        (f"for a project launch in {project_name}", f"for the launch of project named {project_name}"),
        (f"for the project launch in {project_name}", f"for the launch of project named {project_name}"),
        (f"project launch in {project_name}", f"launch for the project named {project_name}"),
        (f"Project launch in {project_name}", f"Launch for the project named {project_name}"),
        (f"launch in {project_name}", f"launch for the project named {project_name}"),
        (f"Launch in {project_name}", f"Launch for the project named {project_name}"),
        (f"for a {project_name} project", f"for the project named {project_name}"),
        (f"for an {project_name} project", f"for the project named {project_name}"),
        (f"for the {project_name} project", f"for the project named {project_name}"),
        (f"the {project_name} project", f"the project named {project_name}"),
        (f"a {project_name} project", f"a project named {project_name}"),
        (f"an {project_name} project", f"a project named {project_name}"),
        (f"{project_name} project launch", f"project named {project_name} launch"),
        (f"{project_name} Project Launch", f"project named {project_name} launch"),
    ]
    normalized = text
    for source, target in replacements:
        normalized = normalized.replace(source, target)
    return normalized


def append_project_identity_guardrail(text: str, payload: dict[str, Any]) -> str:
    project_name = get_project_display_name(payload)
    if not project_name:
        return text

    location = get_project_location_context(payload)
    if not location:
        return text

    guardrail = (
        f"Project name: {project_name}. Actual location context: {location}. "
        f"Use {project_name} only as the project name."
    )
    if guardrail in text:
        return text

    negative_marker = "Negative prompt:"
    if negative_marker in text:
        before, after = text.split(negative_marker, 1)
        return f"{before.strip()} {guardrail} {negative_marker}{after}".strip()

    return f"{text} {guardrail}".strip()


def append_output_authenticity_guardrails(text: str, payload: dict[str, Any]) -> str:
    clauses = [
        "Do not add unsupplied phone, WhatsApp, website, email, social, RERA, or contact info.",
        "Do not add unavailable field-label text or placeholder copy.",
    ]

    if not has_exact_logo_input(payload):
        clauses.append(
            "Do not add logos, brand marks, emblems, monograms, or watermarks unless a logo asset is supplied."
        )

    output = text
    for clause in clauses:
        if clause not in output:
            output = f"{output} {clause}".strip()
    return output


def has_truthful_visual_anchor(payload: dict[str, Any]) -> bool:
    bundle = payload.get("truthBundle") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
    media_context = payload.get("mediaContext") or {}
    return bool(
        exact_assets.get("requiredProjectAnchorAssetId")
        or (media_context.get("referenceImages") or [])
    )


def has_exact_logo_input(payload: dict[str, Any]) -> bool:
    bundle = payload.get("truthBundle") or {}
    request_context = bundle.get("requestContext") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
    return bool(request_context.get("includeBrandLogo") and exact_assets.get("logoAssetId"))


def has_exact_rera_qr_input(payload: dict[str, Any]) -> bool:
    bundle = payload.get("truthBundle") or {}
    request_context = bundle.get("requestContext") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
    return bool(request_context.get("includeReraQr") and exact_assets.get("reraQrAssetId"))


def has_exact_text_input(payload: dict[str, Any]) -> bool:
    request_context = (payload.get("truthBundle") or {}).get("requestContext") or {}
    return bool(str(request_context.get("exactText") or "").strip())


def get_project_display_name(payload: dict[str, Any]) -> str:
    project = ((payload.get("truthBundle") or {}).get("projectTruth") or {})
    name = project.get("name")
    return name.strip() if isinstance(name, str) else ""


def get_project_location_context(payload: dict[str, Any]) -> str:
    project = ((payload.get("truthBundle") or {}).get("projectTruth") or {})
    location_values = dedupe_strings(
        [
            *project_location_fields(project),
            *coerce_string_list(project.get("locationAdvantages")),
            *coerce_string_list(project.get("nearbyLandmarks")),
        ]
    )
    return ", ".join(location_values[:2])


def project_location_fields(project: dict[str, Any]) -> list[str]:
    micro_location = str(project.get("microLocation") or "").strip()
    city = str(project.get("city") or "").strip()
    values = [micro_location] if micro_location else []
    if city and city.lower() not in micro_location.lower():
        values.append(city)
    return values


def strip_explicit_aspect_ratio_mentions(text: str) -> str:
    cleaned = re.sub(
        r"\bAspect ratio\s*\d+:\d+\b(?:,\s*finished poster)?\.?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b((?:A\s+)?(?:finished\s+)?(?:social\s+)?(?:poster|post|creative|ad)),?\s*\d+:\d+\s+aspect\s+ratio\.?",
        r"\1",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(1:1|4:5|9:16|16:9|3:2)\b(?=\s+(?:project|social|poster|story|banner|launch|invite|amenity|festive|testimonial|location|construction|portrait|landscape)\b)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:right[_-]copy[_-]left[_-]hero|left[_-]copy[_-]right[_-]hero)\s+geometry\b",
        "balanced hero and copy layout",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:right[_-]copy[_-]left[_-]hero|left[_-]copy[_-]right[_-]hero)\b",
        "balanced hero and copy layout",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:an?\s+|the\s+)?(?:asset[_-]faithful visual mode|editorialized[_-]truth visual mode)\b",
        "a truthful visual treatment",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\btext architecture\b",
        "copy hierarchy",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"['\"]?elegant_signature['\"]?\s+brand visibility",
        "subtle project branding",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"['\"]?lean['\"]?\s+density",
        "an uncluttered layout",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bThe hero presentation is architecture with environment\.?",
        "Keep the architecture connected to its surrounding environment.",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r"\s+\.", ".", cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


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


def build_seed_prompt(clean_prompt: str, analysis: dict[str, Any], bundle: dict[str, Any]) -> str:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", clean_prompt)
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
    if analysis.get("delivery_mode") == "finished_poster":
        guardrails.append("One poster direction only.")
    if exact_assets.get("requiredProjectAnchorAssetId"):
        guardrails.append("Preserve the supplied project identity.")
    if str(request_context.get("exactText") or "").strip():
        guardrails.append("Keep the exact supplied text unchanged and minimal.")
    guardrails.append("No collage, no multi-panel layout, and no generic replacement.")
    return " ".join([*" ".join(selected).split(), *" ".join(guardrails).split()]).strip()


def build_prompt_summary(clean_prompt: str, analysis: dict[str, Any]) -> str:
    first_sentence = re.split(r"(?<=[.!?])\s+", clean_prompt.strip(), maxsplit=1)[0].strip()
    return first_sentence[:320] if first_sentence else str(analysis.get("objective_summary") or "").strip()


def build_variation_set_summary(analysis: dict[str, Any], variations: list[dict[str, Any]]) -> str:
    project_name = str(analysis.get("project_name") or "the project").strip()
    post_type = str(analysis.get("post_type") or "social_post").replace("_", " ")
    business_job = str(analysis.get("business_job") or analysis.get("objective_summary") or "").strip()
    route_parts: list[str] = []
    for variation in variations:
        title = str(variation.get("title") or "").strip()
        archetype = str((variation.get("resolvedConstraints") or {}).get("posterArchetype") or "").strip()
        if title and archetype:
            route_parts.append(f"{title} ({archetype})")
        elif title:
            route_parts.append(title)
        elif archetype:
            route_parts.append(archetype)

    count = len(variations)
    summary = f"{count} {post_type} variation{'s' if count != 1 else ''} for {project_name}"
    if business_job:
        summary = f"{summary}, focused on {business_job}"
    if route_parts:
        return f"{summary}. Routes: {'; '.join(route_parts)}."
    return f"{summary}."


def resolve_reference_strategy(payload: dict[str, Any]) -> str:
    bundle = payload.get("truthBundle") or {}
    has_template = bundle.get("templateTruth") is not None
    has_references = bool((payload.get("mediaContext") or {}).get("referenceImages"))
    exact_assets = bundle.get("exactAssetContract") or {}
    has_exact_assets = bool(exact_assets.get("logoAssetId")) or bool(exact_assets.get("reraQrAssetId"))
    if has_template and (has_references or has_exact_assets):
        return "hybrid"
    if has_template:
        return "generated-template"
    if has_references or has_exact_assets:
        return "uploaded-references"
    return "generated-template"


def derive_template_type(bundle: dict[str, Any]) -> str | None:
    request_context = bundle.get("requestContext") or {}
    template_type = request_context.get("templateType")
    if isinstance(template_type, str) and template_type:
        return template_type
    return None
