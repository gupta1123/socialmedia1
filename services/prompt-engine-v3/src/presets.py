from __future__ import annotations

from typing import Any, Dict, List, Optional


def selected_preset(context: Dict[str, Any], preset_id: Optional[str]) -> Dict[str, Any]:
    if not preset_id:
        return {}
    presets = context.get("brand_presets") if isinstance(context.get("brand_presets"), list) else []
    for preset in presets:
        if not isinstance(preset, dict):
            continue
        if preset.get("preset_id") == preset_id or preset.get("db_id") == preset_id:
            return preset
    return {}


def preset_json(preset: Dict[str, Any]) -> Dict[str, Any]:
    value = preset.get("preset_json") if isinstance(preset, dict) else {}
    return value if isinstance(value, dict) else {}


def preset_requires_logo(preset: Dict[str, Any]) -> bool:
    logo = preset_json(preset).get("logo") or preset_json(preset).get("logo_layer")
    return bool(isinstance(logo, dict) and logo.get("required"))


def preset_requires_rera_qr(preset: Dict[str, Any]) -> bool:
    rera = preset_json(preset).get("rera_qr") or preset_json(preset).get("rera_qr_layer")
    return bool(isinstance(rera, dict) and rera.get("required"))


def preset_logo_position(preset: Dict[str, Any]) -> str:
    logo = preset_json(preset).get("logo") or preset_json(preset).get("logo_layer")
    return str(logo.get("position") or "top_left") if isinstance(logo, dict) else "top_left"


def preset_logo_rules(preset: Dict[str, Any]) -> Dict[str, Any]:
    logo = preset_json(preset).get("logo") or preset_json(preset).get("logo_layer")
    return dict(logo) if isinstance(logo, dict) else {}


def preset_secondary_logo_rules(preset: Dict[str, Any]) -> Dict[str, Any]:
    logo = preset_json(preset).get("secondary_logo") or preset_json(preset).get("secondary_logo_layer")
    return dict(logo) if isinstance(logo, dict) else {}


def preset_requires_secondary_logo(preset: Dict[str, Any]) -> bool:
    logo = preset_secondary_logo_rules(preset)
    return bool(logo.get("required"))


def preset_secondary_logo_position(preset: Dict[str, Any]) -> str:
    logo = preset_secondary_logo_rules(preset)
    return str(logo.get("position") or "top_left") if logo else "top_left"


def preset_rera_position(preset: Dict[str, Any]) -> str:
    rera = preset_json(preset).get("rera_qr") or preset_json(preset).get("rera_qr_layer")
    return str(rera.get("position") or "top_right") if isinstance(rera, dict) else "top_right"


def preset_rera_trigger_fact_types(preset: Dict[str, Any]) -> List[str]:
    rera = preset_json(preset).get("rera_qr") or preset_json(preset).get("rera_qr_layer")
    if not isinstance(rera, dict):
        return []
    raw = rera.get("trigger_required_when_fact_types") or rera.get("required_when_fact_types") or []
    return [str(item).strip().lower() for item in raw if str(item).strip()] if isinstance(raw, list) else []


def preset_contact_items(preset: Dict[str, Any]) -> List[str]:
    contact = preset_json(preset).get("contact") or preset_json(preset).get("contact_layer")
    if not isinstance(contact, dict):
        return []
    items = contact.get("items")
    return [str(item) for item in items if str(item).strip()] if isinstance(items, list) else []


def preset_contact_position(preset: Dict[str, Any]) -> str:
    contact = preset_json(preset).get("contact") or preset_json(preset).get("contact_layer")
    return str(contact.get("position") or "bottom_footer") if isinstance(contact, dict) else "bottom_footer"


def preset_location_rules(preset: Dict[str, Any]) -> Dict[str, Any]:
    location = preset_json(preset).get("location") or preset_json(preset).get("location_layer")
    return dict(location) if isinstance(location, dict) else {}


def preset_requires_location(preset: Dict[str, Any]) -> bool:
    location = preset_location_rules(preset)
    return bool(location.get("required"))


def contact_values_from_context(context: Dict[str, Any], items: List[str]) -> Dict[str, str]:
    profile_values = []
    project = context.get("project") if isinstance(context.get("project"), dict) else {}
    brand = context.get("brand") if isinstance(context.get("brand"), dict) else {}
    for profile in [project.get("profile"), brand.get("profile")]:
        if isinstance(profile, dict):
            profile_values.append(profile)
    haystacks: List[str] = []
    for profile in profile_values:
        for key in ["credibilityFacts", "legalNotes", "approvedClaims"]:
            value = profile.get(key)
            if isinstance(value, list):
                haystacks.extend(str(item) for item in value)
        for key in ["phone", "salesPhone", "contactPhone", "email", "salesEmail", "website", "websiteUrl"]:
            value = profile.get(key)
            if isinstance(value, str):
                haystacks.append("%s: %s" % (key, value))
    text = "\n".join(haystacks)
    out: Dict[str, str] = {}
    if "phone" in items:
        import re

        match = re.search(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}", text)
        if match:
            out["phone"] = match.group(0)
    if "email" in items:
        import re

        match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text)
        if match:
            out["email"] = match.group(0)
    if "website" in items:
        import re

        match = re.search(r"https?://[^\s]+|www\.[^\s]+", text)
        if match:
            out["website"] = match.group(0).rstrip(".,)")
    return out
