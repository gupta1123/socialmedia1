from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

try:
    from agno.agent import Agent
    from agno.models.openai import OpenAIResponses
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"Agno dependencies are missing: {exc}") from exc

try:
    from agno.skills import LocalSkills, Skills
except ImportError:  # pragma: no cover
    LocalSkills = None
    Skills = None


class SegmentationHintsOutput(BaseModel):
    requiresPointSelection: bool = Field(default=False)
    suggestedTargetPointLabel: str | None = Field(default=None)
    notes: list[str] = Field(default_factory=list)


class ImageEditPlanOutput(BaseModel):
    targetObject: str
    editIntent: str
    rewrittenPrompt: str
    segmentationHints: SegmentationHintsOutput = Field(default_factory=SegmentationHintsOutput)
    ambiguityNotes: list[str] = Field(default_factory=list)
    plannerTrace: dict[str, Any] = Field(default_factory=dict)


SKILLS_DIR = Path(
    os.getenv("AI_EDIT_DIRECTOR_SKILLS_DIR", Path(__file__).resolve().parents[3] / "skills" / "image-edit" / "v1")
)

OUTPUT_FORMAT_INSTRUCTION = """
Return only valid JSON with this exact shape:
{
  "targetObject": string,
  "editIntent": "remove" | "replace" | "recolor" | "cleanup" | "insert" | "background-change" | "other",
  "rewrittenPrompt": string,
  "segmentationHints": {
    "requiresPointSelection": boolean,
    "suggestedTargetPointLabel": string or null,
    "notes": string[]
  },
  "ambiguityNotes": string[],
  "plannerTrace": object
}
Do not wrap the JSON in markdown fences.
""".strip()

EXPECTED_OUTPUT = """
Produce a deterministic masked-image edit plan.

- targetObject: the exact thing or region that should be segmented
- editIntent: classify the requested edit
- rewrittenPrompt: compact masked-edit prompt for a mask-aware image model
- segmentationHints: say whether click-guided targeting is recommended
- ambiguityNotes: explain underspecified requests instead of inventing detail
- plannerTrace: include only compact diagnostics
""".strip()


def list_local_skill_names() -> list[str]:
    if not SKILLS_DIR.exists():
        return []

    return sorted(path.name for path in SKILLS_DIR.iterdir() if path.is_dir() and (path / "SKILL.md").is_file())


def build_agent() -> Agent:
    base_url = os.getenv("OPENAI_BASE_URL")
    model_kwargs: dict[str, Any] = {
        "id": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "timeout": float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "20")),
        "max_retries": int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1")),
    }

    if base_url:
        model_kwargs["base_url"] = base_url

    instructions = [
        "You are an AI Edit Planner for a mask-based image editing tool.",
        "Interpret the user's edit request into a deterministic segmentation target and a concise prompt for a masked inpainting model.",
        "Do not invent target objects that are not reasonably implied by the user's request.",
        "If the prompt is vague, admit ambiguity in ambiguityNotes and keep the target generic.",
        "Assume the actual editing model is mask-aware and preserves all unmasked pixels.",
        "Rewrite the prompt so it only describes the change inside the masked region.",
        "Prefer short, operational masked-edit prompts over verbose prose.",
        "Recommend click-guided targeting when the likely target could appear multiple times in the image.",
        OUTPUT_FORMAT_INSTRUCTION,
    ]

    agent_kwargs: dict[str, Any] = {
        "name": "AI Edit Planner",
        "model": OpenAIResponses(**model_kwargs),
        "instructions": instructions,
        "expected_output": EXPECTED_OUTPUT,
        "markdown": False,
    }

    if LocalSkills is not None and Skills is not None:
        agent_kwargs["skills"] = Skills(loaders=[LocalSkills(str(SKILLS_DIR))])
    else:
        instructions.append(
            "Local skill loading is unavailable in this runtime, so rely on the structured request payload only."
        )

    return Agent(**agent_kwargs)


def decorate_result(result: dict[str, Any]) -> dict[str, Any]:
    planner_trace = result.get("plannerTrace")
    if not isinstance(planner_trace, dict):
        planner_trace = {}

    planner_trace.update(
        {
            "pipeline": "ai-edit-v2-agno",
            "loadedSkillNames": list_local_skill_names(),
        }
    )
    result["plannerTrace"] = planner_trace
    return result


def execute(agent: Agent, payload: dict[str, Any]) -> dict[str, Any]:
    run = agent.run(json.dumps(payload, indent=2))
    content = run.content

    if isinstance(content, BaseModel):
        return decorate_result(content.model_dump())

    if isinstance(content, dict):
        return decorate_result(ImageEditPlanOutput.model_validate(content).model_dump())

    if isinstance(content, str):
        return decorate_result(ImageEditPlanOutput.model_validate_json(content).model_dump())

    raise RuntimeError(f"Unexpected Agno output type: {type(content)!r}")


def summarize_exception(exc: Exception) -> str:
    message = str(exc).strip()
    return message if message else exc.__class__.__name__


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
        except Exception as exc:  # pragma: no cover
            print(json.dumps({"request_id": request_id, "ok": False, "error": str(exc)}), flush=True)


def main() -> None:
    if os.getenv("AGNO_PERSISTENT") == "1":
        run_persistent()
        return

    run_one_shot()


if __name__ == "__main__":
    main()
