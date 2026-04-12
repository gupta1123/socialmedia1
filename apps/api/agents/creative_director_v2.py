from __future__ import annotations

import json
import sys
from typing import Any

import creative_director_notebook as notebook


def decorate_result(result: dict[str, Any]) -> dict[str, Any]:
    compiler_trace = result.get("compilerTrace")
    if not isinstance(compiler_trace, dict):
        compiler_trace = {}

    existing_loaded_skill_names = compiler_trace.get("loadedSkillNames")
    loaded_skill_names = existing_loaded_skill_names if isinstance(existing_loaded_skill_names, list) else []
    skills_available = bool(loaded_skill_names)

    if not loaded_skill_names:
        try:
            loaded_skill_names = notebook.list_local_skill_names()
            skills_available = len(loaded_skill_names) > 0
        except Exception as exc:  # pragma: no cover - diagnostics only
            compiler_trace["skillInspectionError"] = str(exc)

    compiler_trace.update(
        {
            "pipeline": "v2-notebook-two-agent",
            "skillsAvailable": skills_available,
            "loadedSkillNames": loaded_skill_names,
            "runtimeEvents": compiler_trace.get(
                "runtimeEvents",
                {
                    "available": False,
                    "reason": "Agno runtime event capture is not enabled for the v2 test endpoint yet.",
                },
            ),
            "toolCalls": compiler_trace.get("toolCalls", []),
            "skillToolCalls": compiler_trace.get("skillToolCalls", []),
        }
    )
    result["compilerTrace"] = compiler_trace
    return result


def decorate_trace(result: dict[str, Any], trace: dict[str, Any]) -> dict[str, Any]:
    compiler_trace = result.get("compilerTrace")
    if not isinstance(compiler_trace, dict):
        compiler_trace = {}

    compiler_trace.update(
        {
            **trace,
            "pipeline": "v2-notebook-two-agent",
            "runtimeEvents": {
                "available": bool(trace.get("eventCount")),
                "reason": "V2 captures deterministic notebook context tool calls. Agno streaming runtime events are still best-effort.",
            },
        }
    )
    result["compilerTrace"] = compiler_trace
    return decorate_result(result)


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    if hasattr(notebook, "execute_with_trace"):
        result, trace = notebook.execute_with_trace(payload)
        return decorate_trace(result, trace)
    return decorate_result(notebook.execute(payload))


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
        except Exception as exc:  # pragma: no cover - exercised through integration
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
    if notebook.os.getenv("AGNO_PERSISTENT") == "1":
        run_persistent()
        return
    run_one_shot()


if __name__ == "__main__":
    main()
