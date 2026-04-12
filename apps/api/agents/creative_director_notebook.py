from __future__ import annotations

import json
import os
import re
import sys
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

try:
    from agno.agent import Agent
    from agno.models.openai import OpenAIResponses
    from agno.tools import tool
except ImportError as exc:  # pragma: no cover - exercised only when deps missing
    raise SystemExit(f"Agno dependencies are missing: {exc}") from exc

try:
    from agno.skills import LocalSkills, Skills
except ImportError:  # pragma: no cover - exercised only when optional skills support is unavailable
    LocalSkills = None
    Skills = None


SKILLS_DIR = Path(
    os.getenv("AGNO_AGENT_V2_SKILLS_DIR", Path(__file__).resolve().parents[3] / "skills" / "prompt" / "v2")
)


class PromptVariationOutput(BaseModel):
    id: str = Field(..., description="Stable variation id such as variation_1.")
    title: str = Field(..., description="Short label for this creative route.")
    strategy: str = Field(..., description="How this route is meaningfully different.")
    seedPrompt: str = Field(..., description="Compatibility alias for the finished post option prompt.")
    finalPrompt: str = Field(..., description="Single-image prompt for a finished post option.")
    referenceStrategy: Optional[str] = Field(default=None)
    differenceFromOthers: Optional[str] = Field(default=None)
    resolvedConstraints: dict[str, Any] = Field(default_factory=dict)
    compilerTrace: dict[str, Any] = Field(default_factory=dict)


class PromptPackageOutput(BaseModel):
    promptSummary: str = Field(..., description="One line description of the creative direction.")
    seedPrompt: str = Field(..., description="Compatibility alias for the first finished post option prompt.")
    finalPrompt: str = Field(..., description="Prompt used to create finished post options.")
    aspectRatio: str = Field(..., description="Target aspect ratio for the requested format.")
    chosenModel: str = Field(..., description="Recommended image model id.")
    templateType: Optional[str] = Field(default=None)
    referenceStrategy: str = Field(..., description="How references should be used.")
    variations: list[PromptVariationOutput] = Field(default_factory=list)
    resolvedConstraints: dict[str, Any] = Field(default_factory=dict)
    compilerTrace: dict[str, Any] = Field(default_factory=dict)


CURRENT_PAYLOAD: ContextVar[dict[str, Any] | None] = ContextVar("current_payload", default=None)
CURRENT_TOOL_CALLS: ContextVar[list[dict[str, Any]] | None] = ContextVar("current_tool_calls", default=None)

OUTPUT_FORMAT_INSTRUCTION = """
Return only valid JSON with this exact shape:
{
  "promptSummary": string,
  "seedPrompt": string,
  "finalPrompt": string,
  "aspectRatio": string,
  "chosenModel": string,
  "templateType": string or null,
  "referenceStrategy": "generated-template" | "uploaded-references" | "hybrid",
  "variations": [
    {
      "id": "variation_1",
      "title": string,
      "strategy": string,
      "seedPrompt": string,
      "finalPrompt": string,
      "referenceStrategy": "generated-template" | "uploaded-references" | "hybrid",
      "differenceFromOthers": string,
      "resolvedConstraints": object,
      "compilerTrace": object
    }
  ],
  "resolvedConstraints": object,
  "compilerTrace": object
}
Do not wrap the JSON in markdown fences.
""".strip()

ANALYST_OUTPUT_INSTRUCTION = """
Produce a concise working brief for the prompt crafter.

Required sections:
## Brief Contract
## Truth Summary
## Asset Decision
## Strategy Route
## Risk Checks

Keep it compact.
Retrieve facts through tools instead of hallucinating them.
Only include facts that materially affect the image.
Asset decisions must name the exact selected asset ids when they exist.
""".strip()

CRAFTER_OUTPUT_INSTRUCTION = """
Return a distilled prompt package, not a manifest dump.

- seedPrompt: compatibility alias only; make it the same finished-post intent as finalPrompt.
- finalPrompt: compact, resolved, production-ready, single-image post option.
- variations: create exactly the requested number of distinct finished post options.
- Each variation must have its own seedPrompt and finalPrompt; both should describe one finished post option, not a draft style board.
- Variation prompts must differ in composition strategy, visual hierarchy, mood/lighting, and copy treatment.
- Do not make variations minor rewordings of the same prompt.
- Keep both prompts image-first. Do not dump brand manifest prose into them.
- Use the analyst output plus loaded skills to synthesize, not restate.
- If exact text is provided, preserve it exactly.
- If logo or RERA QR toggles are on, require exact supplied assets or clean omission. Never invent placeholders.
- Never describe mood boards, tiled boards, mockup sheets, artboards, multiple posters, or "style exploration" inside one frame.
- Top-level seedPrompt and finalPrompt must be aliases of variations[0].seedPrompt and variations[0].finalPrompt.
""".strip()

SKILL_WORKFLOW_INSTRUCTION = """
Use the provided Loaded Skills packet as your skill context.

- Treat every listed skill as already loaded.
- Do not call, fetch, or request skill instructions again.
- Do not invent skill names.
- Do not use a different post-type playbook than postTypeContract.playbookKey.
- Do not paste raw skill text or raw tool output into the final JSON.
""".strip()

AGENTS: tuple[Agent, Agent] | None = None


def list_local_skill_names() -> list[str]:
    if not SKILLS_DIR.exists():
        return []

    return sorted(
        path.name
        for path in SKILLS_DIR.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    )


def load_skill_text(skill_name: str) -> str:
    available = set(list_local_skill_names())
    normalized = skill_name.strip()
    if normalized not in available:
        raise ValueError(f"Unknown skill '{skill_name}'. Available skills: {', '.join(sorted(available))}")

    return (SKILLS_DIR / normalized / "SKILL.md").read_text(encoding="utf-8")


def current_payload() -> dict[str, Any]:
    payload = CURRENT_PAYLOAD.get()
    if payload is None:
        raise RuntimeError("No active request payload is bound for tool usage")
    return payload


def compact_json(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


def record_tool_call(name: str, result: str, tool_args: dict[str, Any] | None = None) -> None:
    tool_calls = CURRENT_TOOL_CALLS.get()
    if tool_calls is None:
        return

    item: dict[str, Any] = {
        "event": "ToolCallCompleted",
        "toolName": name,
        "toolResult": result,
        "createdAt": time.time(),
    }
    if tool_args:
        item["toolArgs"] = tool_args

    tool_calls.append(item)


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


def truth_bundle() -> dict[str, Any]:
    bundle = current_payload().get("truthBundle")
    if not isinstance(bundle, dict):
        raise RuntimeError("No truth bundle is bound for the current request")
    return bundle


def resolve_variation_count(payload: dict[str, Any]) -> int:
    request_context = truth_bundle().get("requestContext") or {}
    raw = request_context.get("variationCount", 3)
    try:
        count = int(raw)
    except (TypeError, ValueError):
        count = 3
    return max(1, min(count, 6))


def resolve_reference_strategy(payload: dict[str, Any]) -> str:
    bundle = truth_bundle()
    has_template = bundle.get("templateTruth") is not None
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    has_refs = any(not asset.get("eligibility", {}).get("isExactLogo") and not asset.get("eligibility", {}).get("isExactReraQr") for asset in candidate_assets)
    has_exact_assets = bool(exact_asset_contract.get("logoAssetId")) or bool(exact_asset_contract.get("reraQrAssetId"))
    if has_template and (has_refs or has_exact_assets):
        return "hybrid"
    if has_template:
        return "generated-template"
    if has_refs or has_exact_assets:
        return "uploaded-references"
    return "generated-template"


def resolve_template_type(payload: dict[str, Any]) -> Optional[str]:
    bundle = truth_bundle()
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
def get_request_brief() -> str:
    result = compact_json(truth_bundle().get("requestContext") or {})
    record_tool_call("get_request_brief", result)
    return result


@tool()
def get_brand_truth() -> str:
    result = compact_json(truth_bundle().get("brandTruth") or {})
    record_tool_call("get_brand_truth", result)
    return result


@tool()
def get_project_truth() -> str:
    result = compact_json((truth_bundle().get("projectTruth") or {"project": None}))
    record_tool_call("get_project_truth", result)
    return result


@tool()
def get_post_type_contract() -> str:
    result = compact_json(truth_bundle().get("postTypeContract") or {})
    record_tool_call("get_post_type_contract", result)
    return result


@tool()
def get_festival_truth() -> str:
    result = compact_json((truth_bundle().get("festivalTruth") or {"festival": None}))
    record_tool_call("get_festival_truth", result)
    return result


@tool()
def get_template_truth() -> str:
    result = compact_json((truth_bundle().get("templateTruth") or {"template": None}))
    record_tool_call("get_template_truth", result)
    return result


@tool()
def list_candidate_assets() -> str:
    result = compact_json(truth_bundle().get("candidateAssets") or [])
    record_tool_call("list_candidate_assets", result)
    return result


@tool()
def get_exact_asset_contract() -> str:
    result = compact_json(truth_bundle().get("exactAssetContract") or {})
    record_tool_call("get_exact_asset_contract", result)
    return result


@tool()
def get_generation_contract() -> str:
    result = compact_json(truth_bundle().get("generationContract") or {})
    record_tool_call("get_generation_contract", result)
    return result


@tool()
def get_skill_instructions(skill_name: str) -> str:
    """Load one local prompt skill by exact directory name."""
    text = load_skill_text(skill_name)
    record_tool_call(
        "get_skill_instructions",
        compact_json({"skillName": skill_name, "characters": len(text)}),
        {"skill_name": skill_name},
    )
    return text


def append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def required_skill_names(payload: dict[str, Any]) -> list[str]:
    bundle = payload.get("truthBundle") or {}
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    post_type_contract = bundle.get("postTypeContract") or {}
    project_truth = bundle.get("projectTruth")
    playbook_key = post_type_contract.get("playbookKey")

    names: list[str] = []
    for name in [
        "brief-interpreter",
        "brand-compliance-interpreter",
        "composition-planner",
        "copy-typography-planner",
        "variation-planner",
        "prompt-assembler",
        "prompt-verifier",
    ]:
        append_unique(names, name)

    if candidate_assets:
        append_unique(names, "asset-ranker")

    if (
        exact_asset_contract.get("requiredProjectAnchorAssetId")
        or exact_asset_contract.get("logoAssetId")
        or exact_asset_contract.get("reraQrAssetId")
    ):
        append_unique(names, "reference-preservation-planner")

    if isinstance(project_truth, dict) and project_truth:
        append_unique(names, "project-truth-synthesizer")

    weak_assets = not candidate_assets or all(
        ((asset.get("normalizedMetadata") or {}).get("qualityTier") == "weak")
        for asset in candidate_assets
        if isinstance(asset, dict)
    )
    if weak_assets:
        append_unique(names, "missing-asset-handler")

    if isinstance(playbook_key, str) and playbook_key:
        append_unique(names, playbook_key)

    available = set(list_local_skill_names())
    return [name for name in names if name in available]


def build_skill_packet(payload: dict[str, Any]) -> tuple[list[str], str]:
    names = required_skill_names(payload)
    sections: list[str] = []
    for name in names:
        text = load_skill_text(name)
        record_tool_call(
            "get_skill_instructions",
            compact_json({"skillName": name, "characters": len(text), "loadedBy": "deterministic-preload"}),
            {"skill_name": name},
        )
        sections.append(f"## {name}\n{text.strip()}")

    return names, "\n\n".join(sections)


def build_agents() -> tuple[Agent, Agent]:
    global AGENTS
    if AGENTS is not None:
        return AGENTS

    base_url = os.getenv("OPENAI_BASE_URL")
    model_kwargs: dict[str, Any] = {
        "id": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "timeout": float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "20")),
        "max_retries": int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1")),
    }

    if base_url:
        model_kwargs["base_url"] = base_url

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
            get_exact_asset_contract,
            get_generation_contract,
        ],
        instructions=[
            "You are a senior visual brief analyst for brand-aware social image generation.",
            "When given a request summary, first call get_request_brief, get_post_type_contract, and get_generation_contract.",
            "Always call get_brand_truth and list_candidate_assets.",
            "Call get_project_truth when project truth exists.",
            "Call get_festival_truth when festival truth exists.",
            "Call get_template_truth when template truth exists.",
            "Always call get_exact_asset_contract before finishing.",
            "Prefer tool output over assumptions.",
            "Summarize only image-relevant facts, not full manifests.",
            "Asset Decision must list the exact asset ids chosen as truth anchors, exact assets, or supporting references.",
            "If postTypeContract.playbookKey is present, mention that exact playbook key in Strategy Route and do not introduce other playbook families.",
            ANALYST_OUTPUT_INSTRUCTION,
        ],
        markdown=True,
    )

    prompt_crafter_kwargs: dict[str, Any] = {
        "name": "Prompt Crafter",
        "role": "Turn the analyzed brief into compact prompts for finished post option generation.",
        "model": OpenAIResponses(**model_kwargs),
        "instructions": [
            "You are an expert image prompt crafter for a real-estate social image lab.",
            "Work exactly like a prompt specialist: use the preloaded skills, synthesize, then write compact prompts.",
            "Keep output focused on what the image model needs, not everything you know.",
            "Every variation is a finished post option. Do not create exploratory previews or draft style boards.",
            "Keep seedPrompt as a compatibility alias for the same finished option intent as finalPrompt.",
            "Each prompt must describe one single complete image only.",
            "Never describe multiple posters, a board, a sheet, a mockup page, or a tiled layout inside one image.",
            f"Available prompt skills: {', '.join(list_local_skill_names())}.",
            SKILL_WORKFLOW_INSTRUCTION,
            CRAFTER_OUTPUT_INSTRUCTION,
            OUTPUT_FORMAT_INSTRUCTION,
        ],
        "expected_output": CRAFTER_OUTPUT_INSTRUCTION,
        "markdown": False,
    }

    prompt_crafter = Agent(**prompt_crafter_kwargs)

    AGENTS = (brief_analyst, prompt_crafter)
    return AGENTS


def build_agent() -> Agent:
    _, prompt_crafter = build_agents()
    return prompt_crafter


def build_request_summary(payload: dict[str, Any]) -> str:
    bundle = payload.get("truthBundle") or {}
    brief = bundle.get("requestContext") or {}
    brand = bundle.get("brandTruth") or {}
    post_type = bundle.get("postTypeContract") or {}
    festival = bundle.get("festivalTruth") or {}
    project = bundle.get("projectTruth") or {}
    exact_assets = bundle.get("exactAssetContract") or {}
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
    generation = bundle.get("generationContract") or {}
    exact_assets = bundle.get("exactAssetContract") or {}

    context = {
        "brandName": brand.get("name"),
        "brandPalette": brand.get("palette"),
        "visualSystem": {
            "styleDescriptors": brand.get("styleDescriptors"),
            "typographyMood": (brand.get("visualSystem") or {}).get("typographyMood"),
            "textDensity": (brand.get("visualSystem") or {}).get("textDensity"),
            "realismLevel": (brand.get("visualSystem") or {}).get("realismLevel"),
            "imageTreatment": (brand.get("visualSystem") or {}).get("imageTreatment"),
        },
        "projectName": project.get("name"),
        "postTypeCode": post_type.get("code"),
        "playbookKey": post_type.get("playbookKey"),
        "briefPrompt": brief.get("prompt"),
        "exactText": brief.get("exactText"),
        "offer": brief.get("offer"),
        "aspectRatio": generation.get("aspectRatio"),
        "variationCount": resolve_variation_count(payload),
        "projectAnchorAssetId": exact_assets.get("requiredProjectAnchorAssetId"),
    }
    return compact_json(context)


def normalize_prompt_package(result: dict[str, Any], payload: dict[str, Any], analyst_output: str) -> dict[str, Any]:
    variation_count = resolve_variation_count(payload)
    variations = result.get("variations")
    if not isinstance(variations, list):
        variations = []

    normalized_variations: list[dict[str, Any]] = []
    for index, variation in enumerate(variations[:variation_count]):
        if not isinstance(variation, dict):
            continue
        seed_prompt = str(variation.get("seedPrompt") or "").strip()
        final_prompt = str(variation.get("finalPrompt") or "").strip()
        if not seed_prompt or not final_prompt:
            continue
        normalized_variations.append(
            {
                "id": str(variation.get("id") or f"variation_{index + 1}"),
                "title": str(variation.get("title") or f"Variation {index + 1}"),
                "strategy": str(variation.get("strategy") or "Distinct creative route"),
                "seedPrompt": seed_prompt,
                "finalPrompt": final_prompt,
                "referenceStrategy": variation.get("referenceStrategy") or resolve_reference_strategy(payload),
                "differenceFromOthers": variation.get("differenceFromOthers"),
                "resolvedConstraints": variation.get("resolvedConstraints")
                if isinstance(variation.get("resolvedConstraints"), dict)
                else {},
                "compilerTrace": variation.get("compilerTrace") if isinstance(variation.get("compilerTrace"), dict) else {},
            }
        )

    if not normalized_variations:
        normalized_variations = [
            {
                "id": "variation_1",
                "title": "Primary route",
                "strategy": "Primary route generated by the prompt compiler",
                "seedPrompt": str(result.get("seedPrompt") or "").strip(),
                "finalPrompt": str(result.get("finalPrompt") or "").strip(),
                "referenceStrategy": resolve_reference_strategy(payload),
                "differenceFromOthers": None,
                "resolvedConstraints": {},
                "compilerTrace": {"fallbackVariation": True},
            }
        ]

    first_variation = normalized_variations[0]
    bundle = truth_bundle()
    request_context = bundle.get("requestContext") or {}
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    result["variations"] = normalized_variations
    result["seedPrompt"] = first_variation["seedPrompt"]
    result["finalPrompt"] = first_variation["finalPrompt"]
    result["aspectRatio"] = (bundle.get("generationContract") or {}).get("aspectRatio") or derive_aspect_ratio(request_context.get("format"))
    result["chosenModel"] = (bundle.get("generationContract") or {}).get("chosenModel") or choose_image_model()
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
            "candidateAssetIds": [asset.get("id") for asset in (bundle.get("candidateAssets") or []) if asset.get("id")],
            "projectAnchorAssetId": exact_asset_contract.get("requiredProjectAnchorAssetId"),
            "brandLogoAssetId": exact_asset_contract.get("logoAssetId"),
            "reraQrAssetId": exact_asset_contract.get("reraQrAssetId"),
            "variationCount": variation_count,
        }
    )
    result["resolvedConstraints"] = resolved_constraints

    compiler_trace = result.get("compilerTrace")
    if not isinstance(compiler_trace, dict):
        compiler_trace = {}
    compiler_trace.update(
        {
            "pipeline": "notebook-style-two-agent",
            "analystAgent": "Brief Analyst",
            "crafterAgent": "Prompt Crafter",
            "analystOutput": analyst_output,
            "skillsLoaded": len(list_local_skill_names()) > 0,
            "loadedSkillNames": list_local_skill_names(),
            "requestedVariationCount": variation_count,
            "returnedVariationCount": len(normalized_variations),
            "truthBundleSummary": {
                "postTypeCode": (bundle.get("postTypeContract") or {}).get("code"),
                "playbookKey": (bundle.get("postTypeContract") or {}).get("playbookKey"),
                "candidateAssetIds": [asset.get("id") for asset in (bundle.get("candidateAssets") or []) if asset.get("id")],
                "exactAssetIds": {
                    "logo": exact_asset_contract.get("logoAssetId"),
                    "reraQr": exact_asset_contract.get("reraQrAssetId"),
                    "projectAnchor": exact_asset_contract.get("requiredProjectAnchorAssetId"),
                },
            },
        }
    )
    result["compilerTrace"] = compiler_trace
    return result


def extract_json_object(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in Agno output")
    return text[start : end + 1]


def parse_prompt_package(raw: Any) -> dict[str, Any]:
    def with_alias_prompts(value: dict[str, Any]) -> dict[str, Any]:
        variations = value.get("variations")
        if isinstance(variations, list) and variations and isinstance(variations[0], dict):
            first = variations[0]
            if not value.get("seedPrompt") and first.get("seedPrompt"):
                value["seedPrompt"] = first["seedPrompt"]
            if not value.get("finalPrompt") and first.get("finalPrompt"):
                value["finalPrompt"] = first["finalPrompt"]
        return value

    if isinstance(raw, BaseModel):
        return raw.model_dump()
    if isinstance(raw, dict):
        return PromptPackageOutput.model_validate(with_alias_prompts(raw)).model_dump()
    if isinstance(raw, str):
        parsed = json.loads(extract_json_object(raw))
        return PromptPackageOutput.model_validate(with_alias_prompts(parsed)).model_dump()
    raise TypeError(f"Unexpected Agno output type: {type(raw)!r}")


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    brief_analyst, prompt_crafter = build_agents()
    token = CURRENT_PAYLOAD.set(payload)
    try:
        analyst_run = brief_analyst.run(build_request_summary(payload))
        analyst_output = analyst_run.content if isinstance(analyst_run.content, str) else str(analyst_run.content)
        skill_names, skill_packet = build_skill_packet(payload)

        crafter_input = (
            "Using the analyzed brief and preloaded skills below, return the final prompt package JSON.\n"
            f"Create exactly {resolve_variation_count(payload)} variations. Each variation must be a separate single-image creative route, not several layouts inside one image.\n"
            "Make the routes materially different in composition, hierarchy, mood, and copy treatment.\n\n"
        "## Loaded Skills\n"
        f"{skill_packet}\n\n"
        "## Request Truth Context\n"
        f"{build_crafter_context(payload)}\n\n"
        "## Analyzed Brief\n"
        f"{analyst_output}\n"
    )
        crafter_run = prompt_crafter.run(crafter_input)
        parsed = parse_prompt_package(crafter_run.content)
        return normalize_prompt_package(parsed, payload, analyst_output)
    finally:
        CURRENT_PAYLOAD.reset(token)


def execute_with_trace(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    brief_analyst, prompt_crafter = build_agents()
    token = CURRENT_PAYLOAD.set(payload)
    tool_calls: list[dict[str, Any]] = []
    tool_token = CURRENT_TOOL_CALLS.set(tool_calls)
    try:
        analyst_run = brief_analyst.run(build_request_summary(payload))
        analyst_output = analyst_run.content if isinstance(analyst_run.content, str) else str(analyst_run.content)
        skill_names, skill_packet = build_skill_packet(payload)

        crafter_input = (
            "Using the analyzed brief and preloaded skills below, return the final prompt package JSON.\n"
            f"Create exactly {resolve_variation_count(payload)} variations. Each variation must be a separate single-image creative route, not several layouts inside one image.\n"
            "Make the routes materially different in composition, hierarchy, mood, and copy treatment.\n\n"
        "## Loaded Skills\n"
        f"{skill_packet}\n\n"
        "## Request Truth Context\n"
        f"{build_crafter_context(payload)}\n\n"
        "## Analyzed Brief\n"
        f"{analyst_output}\n"
    )
        crafter_run = prompt_crafter.run(crafter_input)
        parsed = parse_prompt_package(crafter_run.content)
        normalized = normalize_prompt_package(parsed, payload, analyst_output)

        loaded_skill_names = list_local_skill_names()
        skill_tool_calls = [
            call
            for call in tool_calls
            if call.get("toolName") == "get_skill_instructions"
        ]

        trace = {
            "eventCount": len(tool_calls),
            "toolCallCount": len(tool_calls),
            "skillToolCallCount": len(skill_tool_calls),
            "events": tool_calls,
            "toolCalls": tool_calls,
            "skillToolCalls": skill_tool_calls,
            "runId": None,
            "sessionId": None,
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            "modelProvider": "openai-responses",
            "analystOutput": analyst_output,
            "loadedSkillNames": loaded_skill_names,
            "loadedSkillCount": len(loaded_skill_names),
            "usedSkillNames": skill_names,
            "deterministicSkillLoading": True,
            "skillsRuntimeAvailable": SKILLS_DIR.exists(),
            "pipeline": "notebook-style-two-agent",
        }
        return normalized, trace
    finally:
        CURRENT_TOOL_CALLS.reset(tool_token)
        CURRENT_PAYLOAD.reset(token)


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
            print(json.dumps({"request_id": request_id, "ok": True, "result": result}), flush=True)
        except Exception as exc:  # pragma: no cover - exercised only through integration
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
