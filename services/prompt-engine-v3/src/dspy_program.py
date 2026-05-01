from __future__ import annotations

# Backward-compatible module name for the notebook-parity DSPy program layer.
# The implementation remains in dspy_engine.py to avoid breaking existing imports.
from .dspy_engine import (  # noqa: F401
    DspyPromptProgram,
    coerce_asset_selection,
    coerce_content_job,
    coerce_variant_specs,
    dspy_available,
    extract_json,
)
