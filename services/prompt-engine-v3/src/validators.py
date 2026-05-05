from __future__ import annotations

from typing import List

from .grounding_validator import validate_full_variant
from .schemas import SessionFactOverride, ValidationResult, VariantOutput


READY_STATUSES = {"ready", "ready_with_warnings", "ready_with_fallback"}


def validate_variant(
    variant: VariantOutput,
    session_facts: List[SessionFactOverride],
    db_facts: List[str],
) -> ValidationResult:
    return validate_full_variant(variant, session_facts=session_facts, db_facts=db_facts, production=None)


def enforce_ready_invariant(status: str, validation: ValidationResult) -> str:
    if status in READY_STATUSES and not validation.passed:
        return "blocked"
    return status
