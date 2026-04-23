from __future__ import annotations

import os

from . import pipeline
from .archive_notebook_bridge import execute as execute_archived_notebook_bridge
from .archive_notebook_bridge import execute_with_trace as execute_archived_notebook_bridge_with_trace
from .schemas import PromptPackageOutput

SKILLS_DIR = pipeline.SKILLS_DIR
WORKFLOW_IMPORT_ERROR = pipeline.WORKFLOW_IMPORT_ERROR
build_agent = pipeline.build_agent
get_registered_skill_names = pipeline.get_registered_skill_names
get_registered_skill_tool_names = pipeline.get_registered_skill_tool_names
list_local_skill_names = pipeline.list_local_skill_names
reload_skills = pipeline.reload_skills
workflow_supported = pipeline.workflow_supported


def use_archived_notebook_bridge() -> bool:
    return os.getenv("AGNO_COMPILER_BACKEND", "").strip().lower() in {
        "archive-notebook-bridge",
        "archived-notebook-bridge",
    }


def execute(payload):
    if use_archived_notebook_bridge():
        return execute_archived_notebook_bridge(payload)
    return pipeline.execute(payload)


def execute_with_trace(payload):
    if use_archived_notebook_bridge():
        return execute_archived_notebook_bridge_with_trace(payload)
    return pipeline.execute_with_trace(payload)

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
