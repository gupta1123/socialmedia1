from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

try:
    from agno.agent import Agent
    from agno.models.openai import OpenAIChat
except ImportError as exc:  # pragma: no cover - exercised only when deps missing
    raise SystemExit(f"Agno dependencies are missing: {exc}") from exc

try:
    from agno.skills import LocalSkills, Skills
except ImportError:  # pragma: no cover - exercised only when optional skills support is unavailable
    LocalSkills = None
    Skills = None


class PromptPackageOutput(BaseModel):
    promptSummary: str = Field(..., description="One line description of the creative direction.")
    seedPrompt: str = Field(..., description="Prompt used to create style seed templates.")
    finalPrompt: str = Field(..., description="Prompt used to create final creatives.")
    aspectRatio: str = Field(..., description="Target aspect ratio for the requested format.")
    chosenModel: str = Field(..., description="Recommended Fal model id.")
    templateType: Optional[str] = Field(default=None)
    referenceStrategy: str = Field(..., description="How references should be used.")
    resolvedConstraints: dict[str, Any] = Field(default_factory=dict)
    compilerTrace: dict[str, Any] = Field(default_factory=dict)


OUTPUT_FORMAT_INSTRUCTION = """
Return only valid JSON with this exact shape:
{
  "promptSummary": string,
  "seedPrompt": string,
  "finalPrompt": string,
  "aspectRatio": string,
  "chosenModel": string,
  "templateType": string or null,
  "referenceStrategy": string,
  "resolvedConstraints": object,
  "compilerTrace": object
}
Do not wrap the JSON in markdown fences.
""".strip()


def build_agent() -> Agent:
    skills_dir = Path(__file__).resolve().parents[3] / "skills" / "prompt"
    base_url = os.getenv("OPENAI_BASE_URL")
    kwargs: dict[str, Any] = {
        "id": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "timeout": float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "20")),
        "max_retries": int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1")),
    }

    if base_url:
        kwargs["base_url"] = base_url

    instructions = [
        "You are the Creative Director for a brand-aware social image lab.",
        "Use local skills to transform brand, project, post type, template, and calendar context into a model-ready prompt package.",
        "Output only structured data matching the requested schema.",
        "Prefer strong, brand-specific image directions over generic SaaS imagery.",
        "Use the brand identity, voice system, visual system, compliance rules, and reference canon as first-class controls, not as background trivia.",
        "Use the project prompt manifest as the deterministic summary of project facts, approved claims, location facts, and image-usage constraints.",
        "Use post_type_prompt_manifest as the deterministic summary of image-spec direction for the selected post type. Preserve its recipe direction, image-usage rule, composition rule, and negative prompt.",
        "When a reusable template is present, use template.config.promptScaffold as the primary reusable template instruction when available; fall back to template.basePrompt only when scaffold text is missing.",
        "If festival context is present, use its meaning and date as first-class controls for greeting tone, symbolism, and occasion relevance.",
        "Treat prompt_guardrails.seed_clauses and prompt_guardrails.final_clauses as mandatory constraints to preserve in the compiled prompts.",
        "Use brand_prompt_manifest as the deterministic summary of brand controls. Do not omit its usage notes, anti-reference notes, banned terms, or review checks when they are present.",
        "Use festival_prompt_manifest when present. Keep the creative specific to that festival instead of drifting into a generic seasonal greeting.",
        "For festive greetings, write a detailed poster-style image prompt with explicit background, symbolic arrangement, typography placement, decorative accents, style treatment, and a short negative prompt.",
        "For festive greetings, do not pull in project renders, amenities, location facts, pricing, or sales language unless the brief explicitly asks for a project-linked festive post.",
        "Do not require uploaded references for festive greetings by default. Prompt-led composition is valid there.",
        "For construction updates, write a detailed project-image-led progress poster prompt with a real construction photo as the hero element, disciplined headline hierarchy, a premium progress-data treatment, and footer trust cues.",
        "For project launches, write a detailed property-image hero prompt with the supplied building image as the dominant visual, refined overlays, minimal supporting copy, and a premium launch-poster composition.",
        "Do not reuse one fixed sample prompt for every construction update or project launch. Keep the same level of detail, but vary the composition family, supporting copy structure, and panel treatment according to the brief and project facts.",
        "When planning direction exploration, favor materially different creative routes rather than minor sampled variations of the same composition.",
        "If exact text is provided, preserve it exactly and plan safe zones around it.",
        "Treat reusable templates as image-plus-prompt direction packs, not as rigid layouts.",
        "Treat references and reusable templates as style anchors for mood, composition discipline, material language, and typography restraint, not as exact images to replicate.",
        "Preserve the visual language of references without copying exact buildings, text layout, or pixel arrangement unless the brief explicitly demands product-faithful recreation.",
        "For real-estate work, keep claims credible, premium, and project-accurate.",
        "If compliance rules, banned claims, or promise restrictions exist, reflect them in the prompt package explicitly.",
        OUTPUT_FORMAT_INSTRUCTION,
    ]

    agent_kwargs: dict[str, Any] = {
        "name": "Creative Director",
        "model": OpenAIChat(**kwargs),
        "instructions": instructions,
        "markdown": False,
    }

    if LocalSkills is not None and Skills is not None:
        agent_kwargs["skills"] = Skills(loaders=[LocalSkills(str(skills_dir))])
    else:
        instructions.append(
            "Local skill loading is unavailable in this runtime, so rely on the structured request context and produce concise, differentiated prompt packages without external helpers."
        )

    return Agent(**agent_kwargs)


def main() -> None:
    if os.getenv("AGNO_PERSISTENT") == "1":
        run_persistent()
        return

    run_one_shot()


def run_one_shot() -> None:
    payload = json.loads(sys.stdin.read())
    agent = build_agent()
    try:
        print(json.dumps(execute(agent, payload)))
    except Exception as exc:
        print(summarize_exception(exc), file=sys.stderr)
        raise SystemExit(1) from exc


def run_persistent() -> None:
    agent = build_agent()

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue

        request = json.loads(raw)
        request_id = request.get("request_id")

        try:
            result = execute(agent, request["payload"])
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


def execute(agent: Agent, payload: dict[str, Any]) -> dict[str, Any]:
    run = agent.run(
        json.dumps(
            {
                "brand_name": payload["brandName"],
                "brand_profile": payload["brandProfile"],
                "project_name": payload.get("projectName"),
                "project_profile": payload.get("projectProfile"),
                "festival": payload.get("festival"),
                "post_type": payload.get("postType"),
                "template": payload.get("template"),
                "series": payload.get("series"),
                "calendar_item": payload.get("calendarItem"),
                "deliverable_snapshot": payload.get("deliverableSnapshot"),
                "brief": payload["brief"],
                "reference_labels": payload["referenceLabels"],
                "brand_prompt_manifest": payload.get("brandPromptManifest"),
                "festival_prompt_manifest": payload.get("festivalPromptManifest"),
                "project_prompt_manifest": payload.get("projectPromptManifest"),
                "post_type_prompt_manifest": payload.get("postTypePromptManifest"),
                "prompt_guardrails": payload.get("promptGuardrails"),
            },
            indent=2,
        )
    )

    content = run.content
    if isinstance(content, BaseModel):
        return content.model_dump()

    if isinstance(content, dict):
        return PromptPackageOutput.model_validate(content).model_dump()

    if isinstance(content, str):
        return PromptPackageOutput.model_validate_json(content).model_dump()

    raise RuntimeError(f"Unexpected Agno output type: {type(content)!r}")


def summarize_exception(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return exc.__class__.__name__


if __name__ == "__main__":
    main()
