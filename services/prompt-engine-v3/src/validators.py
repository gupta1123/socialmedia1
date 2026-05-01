from __future__ import annotations

import re
from typing import Any, Dict, List

from .schemas import SessionFactOverride, ValidationResult, VariantOutput


READY_STATUSES = {"ready", "ready_with_fallback"}


def validate_variant(
    variant: VariantOutput,
    session_facts: List[SessionFactOverride],
    db_facts: List[str],
) -> ValidationResult:
    errors: List[str] = []
    warnings: List[str] = []
    if not variant.compiled_prompt.strip():
        errors.append("compiled_prompt is required.")
    if not variant.render_package.project_asset_ids:
        warnings.append("No primary project asset selected; image generation may be concept-led.")
    if variant.validation and not variant.validation.passed:
        warnings.extend(variant.validation.warnings)
        errors.extend(variant.validation.errors)
    unsupported = _unsupported_high_risk_claims(variant.compiled_prompt, session_facts, db_facts)
    errors.extend(unsupported)
    if "template_id" in variant.compiled_prompt.lower() or "asset_id" in variant.compiled_prompt.lower():
        errors.append("compiled_prompt exposes internal pipeline identifiers.")
    return ValidationResult(passed=not errors, errors=errors, warnings=warnings)


def enforce_ready_invariant(status: str, validation: ValidationResult) -> str:
    if status in READY_STATUSES and not validation.passed:
        return "blocked"
    return status


def _unsupported_high_risk_claims(prompt: str, session_facts: List[SessionFactOverride], db_facts: List[str]) -> List[str]:
    errors: List[str] = []
    allowed = " ".join([fact.value for fact in session_facts] + db_facts).lower()
    for label, pattern in [
        ("phone", r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}"),
        ("email", r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"),
        ("price", r"(?:₹|rs\.?|inr)\s?[0-9][0-9,]*(?:\s?(?:lakh|lac|cr|crore|k))?|[0-9][0-9,.]*\s?(?:lakh|lac|cr|crore)\b"),
        ("rera", r"\b(?:maha)?rera\b[^.?!,;]*?[A-Z]?\d{6,}"),
    ]:
        for match in re.finditer(pattern, prompt, flags=re.IGNORECASE):
            value = match.group(0).strip().lower()
            if value and value not in allowed:
                errors.append("Unsupported %s claim in compiled prompt: %s" % (label, match.group(0).strip()))
    return errors
