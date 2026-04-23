from __future__ import annotations

import sys
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from compiler import (  # noqa: E402
    PromptPackageOutput,
    SKILLS_DIR,
    WORKFLOW_IMPORT_ERROR,
    build_agent,
    execute,
    execute_with_trace,
    get_registered_skill_names,
    get_registered_skill_tool_names,
    list_local_skill_names,
    reload_skills,
    workflow_supported,
)


__all__ = [
    "PromptPackageOutput",
    "SKILLS_DIR",
    "WORKFLOW_IMPORT_ERROR",
    "build_agent",
    "execute",
    "execute_with_trace",
    "get_registered_skill_names",
    "get_registered_skill_tool_names",
    "list_local_skill_names",
    "reload_skills",
    "workflow_supported",
]
