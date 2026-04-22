from __future__ import annotations

import importlib.util
import json
import os
import sys
import threading
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel


APP_ROOT = Path(__file__).resolve().parent
PRESETS_PATH = APP_ROOT / "presets.json"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8787"))
LAB_VENV_PYTHON = APP_ROOT / ".venv" / "bin" / "python"
PROMPT_SKILLS_DIR = APP_ROOT / "skills" / "prompt" / "v2"
IMAGE_EDIT_SKILLS_DIR = APP_ROOT / "skills" / "image-edit" / "v1"
PROMPT_LAB_LOGO_ASSET_ID = "00000000-0000-0000-0000-000000000001"
PROMPT_LAB_RERA_QR_ASSET_ID = "00000000-0000-0000-0000-000000000002"

if sys.version_info < (3, 10):
    raise SystemExit(
        "services/socialpython requires Python 3.10+. "
        "Use python3.11 or run `npm run dev:socialpython` so the repo can pick a compatible interpreter."
    )


def ensure_lab_venv() -> None:
    if os.getenv("AGNO_PROMPT_LAB_SKIP_REEXEC") == "1":
        return

    if not LAB_VENV_PYTHON.exists():
        return

    current_prefix = Path(sys.prefix).resolve()
    target_prefix = (APP_ROOT / ".venv").resolve()
    if current_prefix == target_prefix:
        return

    next_env = dict(os.environ)
    next_env["AGNO_PROMPT_LAB_SKIP_REEXEC"] = "1"
    os.execve(str(LAB_VENV_PYTHON), [str(LAB_VENV_PYTHON), __file__, *sys.argv[1:]], next_env)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text("utf8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if not key:
            continue
        if value == "":
            os.environ.pop(key, None)
            continue
        if key not in os.environ:
            os.environ[key] = value


def absolutize_env_path(key: str) -> None:
    value = os.getenv(key, "").strip()
    if not value:
        return

    candidate = Path(value)
    if candidate.is_absolute():
        os.environ[key] = str(candidate)
        return

    os.environ[key] = str((APP_ROOT / candidate).resolve())


def prime_environment() -> None:
    load_env_file(APP_ROOT / ".env")
    os.environ.setdefault("CREATIVE_DIRECTOR_MODE", "agno")
    os.environ.setdefault("CREATIVE_DIRECTOR_V2_MODE", "agno")
    os.environ.setdefault("AGNO_SKILL_FIRST_MODE", "1")
    os.environ.setdefault("AGNO_AGENT_V2_SCRIPT", "./agents/creative_director_notebook.py")
    os.environ.setdefault("AGNO_AGENT_V2_SKILLS_DIR", str(PROMPT_SKILLS_DIR))
    os.environ.setdefault("AI_EDIT_DIRECTOR_SKILLS_DIR", str(IMAGE_EDIT_SKILLS_DIR))
    os.environ.setdefault("AI_EDIT_PROMPT_LAB_AGENT_SCRIPT", "./agents/ai_edit_director.py")
    absolutize_env_path("AGNO_AGENT_V2_SCRIPT")
    absolutize_env_path("AGNO_AGENT_V2_SKILLS_DIR")
    absolutize_env_path("AI_EDIT_DIRECTOR_SKILLS_DIR")
    absolutize_env_path("AI_EDIT_PROMPT_LAB_AGENT_SCRIPT")


def load_creative_director_module():
    relative_script = os.getenv(
        "AGNO_PROMPT_LAB_AGENT_SCRIPT",
        os.getenv("AGNO_AGENT_V2_SCRIPT", "./agents/creative_director_notebook.py"),
    )
    module_path = (APP_ROOT / relative_script).resolve()
    spec = importlib.util.spec_from_file_location("agno_prompt_lab_creative_director", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load Agno creative director module from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_ai_edit_director_module():
    relative_script = os.getenv("AI_EDIT_PROMPT_LAB_AGENT_SCRIPT", "./agents/ai_edit_director.py")
    module_path = (APP_ROOT / relative_script).resolve()
    spec = importlib.util.spec_from_file_location("agno_prompt_lab_ai_edit_director", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load AI edit director module from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

ensure_lab_venv()
prime_environment()
CREATIVE_DIRECTOR = load_creative_director_module()
AI_EDIT_DIRECTOR = load_ai_edit_director_module()


with PRESETS_PATH.open("r", encoding="utf8") as handle:
    PRESETS = json.load(handle)


@dataclass
class LookupState:
    brand: dict[str, Any]
    post_types: dict[str, dict[str, Any]]
    projects: dict[str, dict[str, Any]]
    festivals: dict[str, dict[str, Any]]


LOOKUPS = LookupState(
    brand=PRESETS["brand"],
    post_types={item["id"]: item for item in PRESETS["postTypes"]},
    projects={item["id"]: item for item in PRESETS["projects"]},
    festivals={item["id"]: item for item in PRESETS["festivals"]},
)

AGENT = None
AGENT_LOCK = threading.Lock()
AI_EDIT_AGENT = None
AI_EDIT_AGENT_LOCK = threading.Lock()
SKILLS_DIR = Path(getattr(CREATIVE_DIRECTOR, "SKILLS_DIR", PROMPT_SKILLS_DIR))
CANONICAL_TRUTH_BUNDLE_KEYS = (
    "requestContext",
    "brandTruth",
    "postTypeContract",
    "generationContract",
)
LEGACY_COMPILE_FIELD_KEYS = (
    "brandId",
    "postTypeId",
    "channel",
    "format",
    "goal",
    "prompt",
    "copyMode",
)


def get_agent():
    global AGENT
    with AGENT_LOCK:
        if AGENT is None:
            AGENT = CREATIVE_DIRECTOR.build_agent()
            if hasattr(AGENT, "output_schema"):
                AGENT.output_schema = None
            if hasattr(AGENT, "structured_outputs"):
                AGENT.structured_outputs = False
        return AGENT


def get_ai_edit_agent():
    global AI_EDIT_AGENT
    with AI_EDIT_AGENT_LOCK:
        if AI_EDIT_AGENT is None:
            AI_EDIT_AGENT = AI_EDIT_DIRECTOR.build_agent()
        return AI_EDIT_AGENT


def get_effective_llm_runtime() -> dict[str, Any]:
    use_openrouter = os.getenv("USE_OPENROUTER", "false").lower() == "true"
    provider = "openrouter" if use_openrouter else "openai"
    model = (
        os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash")
        if use_openrouter
        else os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    )
    base_url = (
        os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip()
        if use_openrouter
        else os.getenv("OPENAI_BASE_URL", "").strip() or "https://api.openai.com/v1"
    )
    api_key_present = bool(
        os.getenv("OPENROUTER_API_KEY") if use_openrouter else os.getenv("OPENAI_API_KEY")
    )
    config_warnings: list[str] = []
    if (
        not use_openrouter
        and (
            os.getenv("OPENROUTER_API_KEY")
            or os.getenv("OPENROUTER_MODEL")
            or os.getenv("OPENROUTER_BASE_URL")
        )
    ):
        config_warnings.append(
            "OpenRouter environment variables are set but USE_OPENROUTER is false, so prompt compilation is using the OpenAI runtime."
        )
    if use_openrouter and not os.getenv("OPENROUTER_API_KEY"):
        config_warnings.append(
            "USE_OPENROUTER is true but OPENROUTER_API_KEY is missing, so prompt compilation cannot authenticate."
        )
    if not use_openrouter and not os.getenv("OPENAI_API_KEY"):
        config_warnings.append(
            "USE_OPENROUTER is false but OPENAI_API_KEY is missing, so prompt compilation cannot authenticate."
        )
    return {
        "useOpenRouter": use_openrouter,
        "llmProvider": provider,
        "llmModel": model,
        "llmBaseUrl": base_url,
        "llmApiKeyPresent": api_key_present,
        "configWarnings": config_warnings,
    }


def runtime_diagnostics(agent: Any | None = None) -> dict[str, Any]:
    skill_runtime_error = None
    try:
        if hasattr(CREATIVE_DIRECTOR, "get_registered_skill_names"):
            skill_names = CREATIVE_DIRECTOR.get_registered_skill_names()
        elif hasattr(CREATIVE_DIRECTOR, "list_local_skill_names"):
            skill_names = CREATIVE_DIRECTOR.list_local_skill_names()
        else:
            skill_names = [
                path.name
                for path in SKILLS_DIR.iterdir()
                if path.is_dir() and (path / "SKILL.md").is_file()
            ]
    except Exception as exc:  # pragma: no cover - diagnostics only
        skill_names = []
        skill_runtime_error = str(exc)

    if skill_names and hasattr(CREATIVE_DIRECTOR, "get_registered_skill_tool_names"):
        try:
            tool_names = CREATIVE_DIRECTOR.get_registered_skill_tool_names()
        except Exception as exc:  # pragma: no cover - diagnostics only
            tool_names = ["get_skill_instructions"]
            skill_runtime_error = skill_runtime_error or str(exc)
    elif skill_names:
        tool_names = ["get_skill_instructions"]
    else:
        tool_names = []
    skills_runtime_available = bool(skill_names)
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    llm_runtime = get_effective_llm_runtime()

    return {
        "skillsRuntimeAvailable": skills_runtime_available,
        "skillsRuntimeSource": "agno-skills" if skill_names else None,
        "skillsRuntimeError": skill_runtime_error,
        "workflowAvailable": (
            CREATIVE_DIRECTOR.workflow_supported()
            if hasattr(CREATIVE_DIRECTOR, "workflow_supported")
            else False
        ),
        "workflowImportError": getattr(CREATIVE_DIRECTOR, "WORKFLOW_IMPORT_ERROR", None),
        "pythonExecutable": sys.executable,
        "agnoVersion": getattr(__import__("agno"), "__version__", "unknown"),
        "skillsDirectory": str(SKILLS_DIR),
        "skillsLoaded": len(skill_names) > 0,
        "loadedSkillCount": len(skill_names),
        "loadedSkillNames": skill_names,
        "loadedToolCount": len(tool_names),
        "loadedToolNames": tool_names,
        "skillFirstMode": os.getenv("AGNO_SKILL_FIRST_MODE", "0") == "1",
        "openAiTimeoutSec": float(os.getenv("AGNO_OPENAI_TIMEOUT_SEC", "20")),
        "openAiMaxRetries": int(os.getenv("AGNO_OPENAI_MAX_RETRIES", "1")),
        **llm_runtime,
        "supabaseConfigured": bool(supabase_url and supabase_service_role_key),
        "supabaseHost": urlparse(supabase_url).netloc if supabase_url else None,
    }


def take_top(values: list[str], count: int) -> list[str]:
    return [value for value in values[:count] if value]


def build_brand_manifest(profile: dict[str, Any]) -> dict[str, Any]:
    voice = profile.get("voice", {})
    visual_system = profile.get("visualSystem", {})
    reference_canon = profile.get("referenceCanon", {})
    compliance = profile.get("compliance", {})
    return {
      "identity": profile.get("identity", {}),
      "voice": {
        "summary": voice.get("summary"),
        "adjectives": take_top(voice.get("adjectives", []), 4),
        "approvedVocabulary": take_top(voice.get("approvedVocabulary", []), 6),
        "bannedPhrases": take_top(voice.get("bannedPhrases", []), 4)
      },
      "visualSystem": {
        "textDensity": visual_system.get("textDensity"),
        "realismLevel": visual_system.get("realismLevel"),
        "typographyMood": visual_system.get("typographyMood"),
        "imageTreatment": take_top(visual_system.get("imageTreatment", []), 3),
        "compositionPrinciples": take_top(visual_system.get("compositionPrinciples", []), 3)
      },
      "palette": profile.get("palette", {}),
      "doRules": take_top(profile.get("doRules", []), 4),
      "dontRules": take_top(profile.get("dontRules", []), 4),
      "referenceCanon": {
        "usageNotes": take_top(reference_canon.get("usageNotes", []), 2),
        "antiReferenceNotes": take_top(reference_canon.get("antiReferenceNotes", []), 2)
      },
      "compliance": {
        "bannedClaims": take_top(compliance.get("bannedClaims", []), 3),
        "reviewChecks": take_top(compliance.get("reviewChecks", []), 3)
      }
    }


def build_project_manifest(profile: dict[str, Any] | None, post_type_code: str | None) -> dict[str, Any] | None:
    if not profile:
        return None

    include_tagline = post_type_code == "project-launch"
    include_location = post_type_code == "site-visit-invite"
    include_amenities = post_type_code == "amenity-spotlight"
    include_progress = post_type_code == "construction-update"

    manifest: dict[str, Any] = {
        "positioning": profile.get("positioning"),
        "lifestyleAngle": profile.get("lifestyleAngle"),
        "approvedClaims": take_top(profile.get("approvedClaims", []), 4),
        "credibilityFacts": take_top(profile.get("credibilityFacts", []), 2),
        "actualProjectImageIds": profile.get("actualProjectImageIds", []),
        "reraNumber": profile.get("reraNumber"),
        "legalNotes": take_top(profile.get("legalNotes", []), 2)
    }

    if include_tagline:
        manifest["tagline"] = profile.get("tagline")
        manifest["configurations"] = take_top(profile.get("configurations", []), 3)
        manifest["sizeRanges"] = take_top(profile.get("sizeRanges", []), 2)

    if include_location:
        manifest["locationAdvantages"] = take_top(profile.get("locationAdvantages", []), 2)
        manifest["nearbyLandmarks"] = take_top(profile.get("nearbyLandmarks", []), 2)
        manifest["travelTimes"] = take_top(profile.get("travelTimes", []), 2)

    if include_amenities:
        manifest["heroAmenities"] = take_top(profile.get("heroAmenities", []), 4)
        manifest["amenities"] = take_top(profile.get("amenities", []), 6)

    if include_progress:
        manifest["constructionStatus"] = profile.get("constructionStatus")
        manifest["latestUpdate"] = profile.get("latestUpdate")
        manifest["milestoneHistory"] = take_top(profile.get("milestoneHistory", []), 2)

    return manifest


def build_post_type_manifest(post_type: dict[str, Any], project_name: str | None) -> dict[str, Any]:
    code = post_type["code"]
    config = post_type.get("config", {})
    manifest: dict[str, Any] = {
        "code": code,
        "name": post_type["name"],
        "allowedFormats": config.get("allowedFormats", []),
        "defaultChannels": config.get("defaultChannels", []),
        "safeZoneGuidance": config.get("safeZoneGuidance", []),
        "recommendedTemplateTypes": config.get("recommendedTemplateTypes", [])
    }

    if code == "project-launch":
        manifest.update(
            {
                "recipeDirection": "Premium property-image reveal with the building image dominating the frame and a clean editorial launch hierarchy.",
                "imageUsageRule": "Use the actual project building image as the dominant hero rather than inventing a new tower.",
                "compositionRule": "Let the tower dominate center and right. Reserve upper-left or left-center for headline hierarchy with one refined overlay.",
                "negativePrompt": "cheap flyer, cluttered brochure, distorted tower, random skyline collage, overpacked icons, neon colors"
            }
        )
    elif code == "site-visit-invite":
        manifest.update(
            {
                "recipeDirection": "Project-image-led invitation poster with a premium visit CTA and trust-building layout.",
                "imageUsageRule": "Use the real building image as the trust anchor.",
                "compositionRule": "Keep the building clear, preserve CTA space, and make the invitation feel welcoming rather than salesy.",
                "negativePrompt": "overcrowded brochure, discount ad energy, multiple CTAs, generic fake building"
            }
        )
    elif code == "amenity-spotlight":
        manifest.update(
            {
                "recipeDirection": "One-amenity poster with premium hospitality styling and disciplined negative space.",
                "imageUsageRule": "Spotlight one amenity only. Do not create a collage of multiple amenities.",
                "compositionRule": "Treat the amenity as the hero. Keep text light and aspirational.",
                "negativePrompt": "collage chaos, stock-family vibe, multi-amenity board, loud brochure clutter"
            }
        )
    elif code == "construction-update":
        manifest.update(
            {
                "recipeDirection": "Project-image-led progress poster with premium trust cues and clear progress storytelling.",
                "imageUsageRule": f"Use the real construction image for {project_name or 'the project'} as the hero if one is available.",
                "compositionRule": "Preserve recognizable construction truth. Pair one clear headline area with restrained metric or milestone treatment.",
                "negativePrompt": "generic construction art, unrealistic cranes, bad infographic clutter, exaggerated progress claims"
            }
        )
    elif code == "festive-greeting":
        manifest.update(
            {
                "recipeDirection": "Single premium greeting poster built from festival symbolism, typography, and restrained decoration.",
                "imageUsageRule": "Do not turn it into a contact sheet, multi-poster board, or property ad unless explicitly requested.",
                "compositionRule": "Create exactly one complete greeting composition with a clear central symbolic arrangement and generous negative space.",
                "negativePrompt": "contact sheet, tiled poster board, property brochure clutter, gaudy glitter, neon overload"
            }
        )

    return manifest


def build_festival_manifest(festival: dict[str, Any] | None) -> dict[str, Any] | None:
    if not festival:
        return None
    return {
        "name": festival["name"],
        "meaning": festival["meaning"],
        "dateLabel": festival["dateLabel"],
        "regions": festival.get("regions", []),
        "singlePosterRule": "Generate one coherent greeting poster per image, never a board of mini greetings.",
        "brandRule": "Keep brand attribution minimal and text-only unless the brief explicitly asks otherwise."
    }


def build_prompt_guardrails(post_type_code: str | None, include_brand_logo: bool, include_rera_qr: bool) -> dict[str, list[str]]:
    seed_clauses = [
        "Across the batch, vary the direction between outputs rather than generating near-duplicates.",
        "Each output must resolve as one complete design only. Never generate grids, contact sheets, or multiple posters inside one frame."
    ]
    final_clauses = [
        "Return one finished design per image.",
        "Preserve only the facts and controls that materially affect composition, subject truth, and required copy."
    ]

    if post_type_code == "festive-greeting":
        seed_clauses.append("Keep festive outputs project-free unless the brief explicitly requests a project-linked greeting.")
        final_clauses.append("Keep the festive composition premium, restrained, and poster-like rather than brochure-like.")

    if include_brand_logo:
        seed_clauses.append("If logo use is enabled, keep a small footer or signature zone reserved for the supplied logo asset.")
        final_clauses.append("If logo use is enabled, preserve the supplied logo exactly or leave the zone blank.")

    if include_rera_qr:
        seed_clauses.append("If RERA QR use is enabled, reserve a small clean compliance zone without inventing a fake QR.")
        final_clauses.append("If RERA QR use is enabled, preserve the supplied QR exactly or leave the zone blank.")

    return {"seedClauses": seed_clauses, "finalClauses": final_clauses}


def summarize_context(post_type: dict[str, Any], project: dict[str, Any] | None, festival: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "postType": post_type["name"],
        "project": project["name"] if project else None,
        "festival": festival["name"] if festival else None
    }


def dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def derive_aspect_ratio(fmt: str | None) -> str:
    mapping = {
        "square": "1:1",
        "portrait": "4:5",
        "landscape": "16:9",
        "story": "9:16",
        "cover": "16:9",
    }
    return mapping.get((fmt or "").strip().lower(), "1:1")


def choose_image_model(has_references: bool) -> str:
    if os.getenv("IMAGE_GENERATION_PROVIDER") == "openrouter":
        return os.getenv("OPENROUTER_FINAL_MODEL", "google/gemini-2.5-flash-image")
    if os.getenv("IMAGE_GENERATION_PROVIDER") == "openai":
        return os.getenv("OPENAI_FINAL_MODEL", "gpt-image-2")
    if has_references:
        return os.getenv("FAL_FINAL_MODEL", "fal-ai/nano-banana/edit")
    return os.getenv("FAL_STYLE_SEED_MODEL", "fal-ai/nano-banana")


def infer_project_stage(project: dict[str, Any] | None) -> str | None:
    if not project:
        return None

    profile = project.get("profile", {})
    status = f"{profile.get('constructionStatus', '')} {profile.get('possessionStatus', '')}".lower()
    if "near possession" in status:
        return "near_possession"
    if "under construction" in status or "construction" in status or "active" in status or "progress" in status:
        return "under_construction"
    if "delivered" in status or "ready" in status:
        return "delivered"
    if "launch" in status:
        return "launch"
    return "launch"


def infer_playbook_key(post_type_code: str | None) -> str:
    return {
        "project-launch": "launch-post-playbook",
        "construction-update": "construction-update-playbook",
        "festive-greeting": "festival-post-playbook",
        "site-visit-invite": "site-visit-playbook",
        "amenity-spotlight": "amenity-spotlight-playbook",
        "location-advantage": "location-advantage-playbook",
        "testimonial": "testimonial-playbook",
    }.get(post_type_code or "", "launch-post-playbook")


def build_asset_catalog(post_type_code: str | None, active_project_id: str | None) -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}

    for project in PRESETS["projects"]:
        profile = project.get("profile", {})
        is_active_project = project["id"] == active_project_id

        for index, asset_id in enumerate(profile.get("actualProjectImageIds", []), start=1):
            subject_type = "construction_progress" if is_active_project and post_type_code == "construction-update" else "project_exterior"
            label_suffix = "construction progress view" if subject_type == "construction_progress" else "building view"
            catalog[asset_id] = {
                "id": asset_id,
                "brandId": PRESETS["brand"]["id"],
                "projectId": project["id"],
                "kind": "reference",
                "label": f"{project['name']} {label_suffix}" if index == 1 else f"{project['name']} {label_suffix} {index}",
                "fileName": f"{project['name'].lower().replace(' ', '_')}_{label_suffix.replace(' ', '_')}_{index}.jpg",
                "storagePath": f"lab://assets/{asset_id}",
                "metadataJson": {
                    "subjectType": subject_type,
                    "viewType": "wide",
                    "usageIntent": "truth_anchor",
                    "preserveIdentity": True,
                    "qualityTier": "hero",
                    "tags": ["project", "building", "hero", project["name"].lower()],
                },
            }

        for index, asset_id in enumerate(profile.get("sampleFlatImageIds", []), start=1):
            catalog[asset_id] = {
                "id": asset_id,
                "brandId": PRESETS["brand"]["id"],
                "projectId": project["id"],
                "kind": "reference",
                "label": f"{project['name']} sample flat view" if index == 1 else f"{project['name']} sample flat view {index}",
                "fileName": f"{project['name'].lower().replace(' ', '_')}_sample_flat_{index}.jpg",
                "storagePath": f"lab://assets/{asset_id}",
                "metadataJson": {
                    "subjectType": "sample_flat",
                    "viewType": "interior",
                    "usageIntent": "supporting_ref",
                    "preserveIdentity": True,
                    "qualityTier": "usable",
                    "tags": ["interior", "sample-flat", project["name"].lower()],
                },
            }

    catalog[PROMPT_LAB_LOGO_ASSET_ID] = {
        "id": PROMPT_LAB_LOGO_ASSET_ID,
        "brandId": PRESETS["brand"]["id"],
        "projectId": None,
        "kind": "logo",
        "label": f"{PRESETS['brand']['name']}_logo.png",
        "fileName": f"{PRESETS['brand']['name'].lower().replace(' ', '_')}_logo.png",
        "storagePath": "lab://assets/brand-logo",
        "metadataJson": {
            "subjectType": "logo",
            "viewType": "wide",
            "usageIntent": "exact_asset",
            "preserveIdentity": True,
            "qualityTier": "usable",
            "textSafeHints": ["small-footer", "corner-lockup"],
            "tags": ["brand", "logo"],
        },
    }

    catalog[PROMPT_LAB_RERA_QR_ASSET_ID] = {
        "id": PROMPT_LAB_RERA_QR_ASSET_ID,
        "brandId": PRESETS["brand"]["id"],
        "projectId": None,
        "kind": "rera_qr",
        "label": f"{PRESETS['brand']['name']}_rera_qr.png",
        "fileName": f"{PRESETS['brand']['name'].lower().replace(' ', '_')}_rera_qr.png",
        "storagePath": "lab://assets/brand-rera-qr",
        "metadataJson": {
            "subjectType": "rera_qr",
            "viewType": "wide",
            "usageIntent": "exact_asset",
            "preserveIdentity": True,
            "qualityTier": "usable",
            "textSafeHints": ["small-compliance-zone"],
            "tags": ["brand", "rera", "qr"],
        },
    }

    return catalog


def build_candidate_assets(
    body: dict[str, Any],
    brand: dict[str, Any],
    project: dict[str, Any] | None,
    post_type: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    selected_reference_ids = [value for value in body.get("referenceAssetIds", []) if isinstance(value, str)]
    project_image_ids = project.get("profile", {}).get("actualProjectImageIds", []) if project else []
    sample_flat_ids = project.get("profile", {}).get("sampleFlatImageIds", []) if project else []
    brand_default_reference_ids = brand.get("profile", {}).get("referenceAssetIds", []) or []
    include_brand_logo = bool(body.get("includeBrandLogo"))
    include_rera_qr = bool(body.get("includeReraQr"))
    brand_logo_id = PROMPT_LAB_LOGO_ASSET_ID if include_brand_logo else None
    rera_qr_id = PROMPT_LAB_RERA_QR_ASSET_ID if include_rera_qr else None

    catalog = build_asset_catalog(post_type["code"], project["id"] if project else None)
    candidate_ids = dedupe_strings(
        [
            *selected_reference_ids,
            *project_image_ids,
            *sample_flat_ids,
            *brand_default_reference_ids,
            *( [brand_logo_id] if brand_logo_id else [] ),
            *( [rera_qr_id] if rera_qr_id else [] ),
        ]
    )

    assets: list[dict[str, Any]] = []
    for asset_id in candidate_ids:
        asset = catalog.get(asset_id)
        if asset is None:
            continue

        if asset["kind"] in {"logo", "rera_qr"}:
            assets.append(asset)
            continue

        if project:
            if asset.get("projectId") and asset.get("projectId") != project["id"]:
                continue
            assets.append(asset)
            continue

        if asset.get("projectId") and asset_id not in selected_reference_ids:
            continue

        assets.append(asset)

    normalized_assets: list[dict[str, Any]] = []
    for asset in assets:
        metadata_json = dict(asset.get("metadataJson", {}))
        asset_id = asset["id"]
        normalized_assets.append(
            {
                "id": asset_id,
                "brandId": asset["brandId"],
                "projectId": asset.get("projectId"),
                "kind": asset["kind"],
                "label": asset["label"],
                "fileName": asset["fileName"],
                "storagePath": asset["storagePath"],
                "metadataJson": metadata_json,
                "normalizedMetadata": {
                    "subjectType": metadata_json.get("subjectType", "generic_reference"),
                    "viewType": metadata_json.get("viewType", "wide"),
                    "amenityName": metadata_json.get("amenityName"),
                    "projectStageHint": metadata_json.get("projectStageHint", infer_project_stage(project)),
                    "usageIntent": metadata_json.get("usageIntent", "supporting_ref"),
                    "preserveIdentity": bool(metadata_json.get("preserveIdentity", False)),
                    "textSafeHints": metadata_json.get("textSafeHints", []),
                    "qualityTier": metadata_json.get("qualityTier", "usable"),
                    "tags": metadata_json.get("tags", []),
                },
                "templateRoles": [],
                "eligibility": {
                    "isProjectScoped": bool(project and asset.get("projectId") == project["id"]),
                    "isTemplateLinked": False,
                    "isSelectedReference": asset_id in selected_reference_ids,
                    "isBrandDefaultReference": asset_id in brand_default_reference_ids,
                    "isExactLogo": bool(brand_logo_id and asset_id == brand_logo_id),
                    "isExactReraQr": bool(rera_qr_id and asset_id == rera_qr_id),
                    "isProjectTruthAnchor": asset_id in project_image_ids,
                },
            }
        )

    exact_asset_contract = {
        "logoAssetId": brand_logo_id,
        "reraQrAssetId": rera_qr_id,
        "requiredProjectAnchorAssetId": next(
            (asset["id"] for asset in normalized_assets if asset["eligibility"]["isProjectTruthAnchor"]),
            None,
        ),
        "mustUseExactLogo": bool(brand_logo_id),
        "mustUseExactReraQr": bool(rera_qr_id),
        "preserveProjectIdentity": any(asset["eligibility"]["isProjectTruthAnchor"] for asset in normalized_assets),
    }

    return normalized_assets, exact_asset_contract


def build_request_payload(body: dict[str, Any]) -> dict[str, Any]:
    if isinstance(body.get("truthBundle"), dict):
        return {"truthBundle": body["truthBundle"]}

    brand = LOOKUPS.brand
    post_type = LOOKUPS.post_types[body["postTypeId"]]
    project = LOOKUPS.projects.get(body.get("projectId") or "")
    festival = LOOKUPS.festivals.get(body.get("festivalId") or "")

    post_type_code = post_type["code"]
    copy_mode = "auto" if body.get("copyMode") == "auto" else "manual"
    include_brand_logo = bool(body.get("includeBrandLogo"))
    include_rera_qr = bool(body.get("includeReraQr"))
    channel = body.get("channel") or post_type["config"]["defaultChannels"][0]
    format_value = body.get("format") or post_type["config"]["allowedFormats"][0]
    goal = (body.get("goal") or post_type.get("defaultGoal") or post_type["name"]).strip()
    prompt = (body.get("prompt") or "").strip()
    exact_text = (body.get("exactText") or "").strip()
    audience = (body.get("audience") or "").strip()
    offer = (body.get("offer") or "").strip()
    if copy_mode == "auto":
        exact_text = ""
        offer = ""
    try:
        variation_count = int(body.get("variationCount") or 3)
    except (TypeError, ValueError):
        variation_count = 3
    variation_count = max(1, min(variation_count, 6))

    if not prompt:
        raise ValueError("Enter a prompt before generating.")

    if post_type_code == "festive-greeting" and not festival:
        raise ValueError("Select a festival for festive greeting prompts.")

    if post_type_code != "festive-greeting" and project is None:
        raise ValueError("Select a project for this post type.")

    template_type = None
    recommended_types = post_type.get("config", {}).get("recommendedTemplateTypes", [])
    if recommended_types:
        template_type = recommended_types[0]

    candidate_assets, exact_asset_contract = build_candidate_assets(body, brand, project, post_type)
    has_references = bool(candidate_assets)

    return {
        "truthBundle": {
            "requestContext": {
                "createMode": "post",
                "channel": channel,
                "format": format_value,
                "goal": goal,
                "prompt": prompt,
                "audience": audience,
                "copyMode": copy_mode,
                "offer": offer,
                "exactText": exact_text,
                "templateType": template_type,
                "variationCount": variation_count,
                "includeBrandLogo": include_brand_logo,
                "includeReraQr": include_rera_qr,
            },
            "brandTruth": {
                "name": brand["name"],
                "identity": brand["profile"].get("identity", {}),
                "palette": brand["profile"].get("palette", {}),
                "styleDescriptors": brand["profile"].get("styleDescriptors", []),
                "visualSystem": brand["profile"].get("visualSystem", {}),
                "voice": brand["profile"].get("voice", {}),
                "doRules": brand["profile"].get("doRules", []),
                "dontRules": brand["profile"].get("dontRules", []),
                "bannedPatterns": brand["profile"].get("bannedPatterns", []),
                "compliance": brand["profile"].get("compliance", {}),
                "referenceCanon": brand["profile"].get("referenceCanon", {}),
            },
            "projectTruth": {
                "id": project["id"],
                "name": project["name"],
                "stage": infer_project_stage(project),
                "tagline": project["profile"].get("tagline"),
                "positioning": project["profile"].get("positioning"),
                "lifestyleAngle": project["profile"].get("lifestyleAngle"),
                "audienceSegments": project["profile"].get("audienceSegments", []),
                "heroAmenities": project["profile"].get("heroAmenities", []),
                "amenities": project["profile"].get("amenities", []),
                "locationAdvantages": project["profile"].get("locationAdvantages", []),
                "nearbyLandmarks": project["profile"].get("nearbyLandmarks", []),
                "constructionStatus": project["profile"].get("constructionStatus"),
                "latestUpdate": project["profile"].get("latestUpdate"),
                "approvedClaims": project["profile"].get("approvedClaims", []),
                "bannedClaims": project["profile"].get("bannedClaims", []),
                "legalNotes": project["profile"].get("legalNotes", []),
                "credibilityFacts": project["profile"].get("credibilityFacts", []),
                "reraNumber": project["profile"].get("reraNumber"),
                "actualProjectImageIds": project["profile"].get("actualProjectImageIds", []),
                "sampleFlatImageIds": project["profile"].get("sampleFlatImageIds", []),
            } if project else None,
            "postTypeContract": {
                "id": post_type["id"],
                "code": post_type["code"],
                "name": post_type["name"],
                "config": post_type["config"],
                "playbookKey": infer_playbook_key(post_type["code"]),
                "requiredFields": post_type.get("config", {}).get("requiredBriefFields", []),
                "safeZoneGuidance": post_type.get("config", {}).get("safeZoneGuidance", []),
            },
            "festivalTruth": {
                "id": festival["id"],
                "code": festival["code"],
                "name": festival["name"],
                "category": festival["category"],
                "community": festival.get("community"),
                "regions": festival.get("regions", []),
                "meaning": festival.get("meaning"),
                "dateLabel": festival.get("dateLabel"),
                "nextOccursOn": festival.get("nextOccursOn"),
            } if festival else None,
            "templateTruth": None,
            "candidateAssets": candidate_assets,
            "exactAssetContract": exact_asset_contract,
            "generationContract": {
                "aspectRatio": derive_aspect_ratio(format_value),
                "chosenModel": choose_image_model(has_references),
                "variationCount": variation_count,
                "maxSupportingRefs": 2,
                "hardGuardrails": build_prompt_guardrails(post_type_code, include_brand_logo, include_rera_qr)["finalClauses"],
            },
        }
    }


def serialize_agent_input(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2)


def simplify_event(event: Any) -> dict[str, Any]:
    item: dict[str, Any] = {
        "event": getattr(event, "event", type(event).__name__),
        "createdAt": getattr(event, "created_at", None)
    }

    content = getattr(event, "content", None)
    if isinstance(content, str) and content.strip():
      item["content"] = content

    tool = getattr(event, "tool", None)
    if tool is not None:
        item["toolName"] = getattr(tool, "tool_name", None) or getattr(tool, "name", None)
        tool_args = getattr(tool, "tool_args", None)
        if tool_args:
            item["toolArgs"] = tool_args
        tool_call_error = getattr(tool, "tool_call_error", None)
        if tool_call_error:
            item["toolError"] = tool_call_error
        tool_result = getattr(tool, "result", None)
        if isinstance(tool_result, str) and tool_result.strip():
            item["toolResult"] = tool_result

    explicit_error = getattr(event, "error", None)
    if explicit_error:
        item["toolError"] = explicit_error

    reasoning_content = getattr(event, "reasoning_content", None)
    if isinstance(reasoning_content, str) and reasoning_content.strip():
        item["reasoning"] = reasoning_content

    return item


def parse_prompt_package(content: Any) -> dict[str, Any]:
    model = CREATIVE_DIRECTOR.PromptPackageOutput
    if isinstance(content, BaseModel):
        return content.model_dump()
    if isinstance(content, dict):
        return model.model_validate(content).model_dump()
    if isinstance(content, str):
        return model.model_validate_json(content).model_dump()
    raise RuntimeError(f"Unexpected Agno output type: {type(content)!r}")


def execute_with_trace(agent: Any, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if hasattr(CREATIVE_DIRECTOR, "execute_with_trace"):
        return CREATIVE_DIRECTOR.execute_with_trace(payload)

    events: list[dict[str, Any]] = []
    final_output = None

    stream = agent.run(
        serialize_agent_input(payload),
        stream=True,
        stream_events=True,
        yield_run_output=True
    )

    for item in stream:
        event_name = getattr(item, "event", None)
        if event_name is not None:
            events.append(simplify_event(item))
            if event_name == "RunCompleted":
                final_output = item
        else:
            final_output = item

    if final_output is None:
        raise RuntimeError("Agno did not return a final RunCompleted event or RunOutput.")

    tool_calls = [event for event in events if event["event"] in {"ToolCallStarted", "ToolCallCompleted", "ToolCallError"}]
    unique_tool_calls = [event for event in events if event["event"] in {"ToolCallStarted", "ToolCallError"}]
    skill_tool_calls = [event for event in unique_tool_calls if str(event.get("toolName", "")).startswith("get_skill_")]
    trace = {
        "eventCount": len(events),
        "toolCallCount": len(unique_tool_calls),
        "skillToolCallCount": len(skill_tool_calls),
        "events": events,
        "toolCalls": tool_calls,
        "skillToolCalls": skill_tool_calls,
        "runId": getattr(final_output, "run_id", None),
        "sessionId": getattr(final_output, "session_id", None),
        "model": getattr(final_output, "model", None),
        "modelProvider": getattr(final_output, "model_provider", None)
    }

    return parse_prompt_package(final_output.content), trace


def execute_payload_with_trace(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    agent = get_agent()
    with AGENT_LOCK:
        result, trace = execute_with_trace(agent, payload)
    return result, trace, runtime_diagnostics(agent)


def options_payload() -> dict[str, Any]:
    return {
        "brand": {"id": PRESETS["brand"]["id"], "name": PRESETS["brand"]["name"]},
        "projects": [{"id": item["id"], "name": item["name"]} for item in PRESETS["projects"]],
        "postTypes": [
            {
                "id": item["id"],
                "code": item["code"],
                "name": item["name"],
                "config": item["config"],
                "defaultGoal": item["defaultGoal"],
                "defaultExactText": item["defaultExactText"],
                "starterPrompt": item["starterPrompt"]
            }
            for item in PRESETS["postTypes"]
        ],
        "festivals": PRESETS["festivals"],
        "channels": PRESETS["channels"],
        "formats": PRESETS["formats"]
    }


def describe_runtime_failure(exc: Exception) -> str:
    message = (str(exc) or exc.__class__.__name__).strip()
    if message.lower() == "connection error.":
        llm_runtime = get_effective_llm_runtime()
        provider = llm_runtime["llmProvider"]
        base_url = llm_runtime["llmBaseUrl"]
        model = llm_runtime["llmModel"]
        key_name = "OPENROUTER_API_KEY" if llm_runtime["useOpenRouter"] else "OPENAI_API_KEY"
        return (
            f"Agno could not reach the configured {provider} chat model. "
            f"Check {key_name}, the effective base URL ({base_url}), network access, and model availability ({model})."
        )
    return message


def log_request_start(request_path: str, payload: dict[str, Any]) -> None:
    bundle = payload.get("truthBundle") or {}
    request_context = bundle.get("requestContext") or {}
    brand_truth = bundle.get("brandTruth") or {}
    project_truth = bundle.get("projectTruth") or {}
    post_type_contract = bundle.get("postTypeContract") or {}
    festival_truth = bundle.get("festivalTruth") or {}
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}

    summary = {
        "path": request_path,
        "status": "started",
        "brand": brand_truth.get("name"),
        "project": project_truth.get("name"),
        "postType": post_type_contract.get("name"),
        "playbookKey": post_type_contract.get("playbookKey"),
        "festival": festival_truth.get("name"),
        "variationCount": request_context.get("variationCount"),
        "candidateAssetIds": [asset.get("id") for asset in candidate_assets if asset.get("id")],
        "exactAssetIds": {
            "projectAnchor": exact_asset_contract.get("requiredProjectAnchorAssetId"),
            "logo": exact_asset_contract.get("logoAssetId"),
            "reraQr": exact_asset_contract.get("reraQrAssetId"),
        },
    }


def has_canonical_truth_bundle(payload: dict[str, Any]) -> bool:
    bundle = payload.get("truthBundle")
    if not isinstance(bundle, dict):
        return False
    return all(isinstance(bundle.get(key), dict) for key in CANONICAL_TRUTH_BUNDLE_KEYS)


def has_legacy_compile_fields(payload: dict[str, Any]) -> bool:
    return any(key in payload for key in LEGACY_COMPILE_FIELD_KEYS)


def normalize_compile_v2_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    if isinstance(payload.get("truthBundle"), dict):
        if has_canonical_truth_bundle(payload):
            return payload, "canonical"
        if has_legacy_compile_fields(payload):
            return build_request_payload(payload), "rebuilt_from_partial_truth_bundle"
        raise ValueError(
            "Malformed V2 payload: truthBundle is present but missing canonical sections such as requestContext, brandTruth, postTypeContract, or generationContract."
        )

    return build_request_payload(payload), "rebuilt_from_legacy_fields"
    print("\n=== Agno Prompt Lab Request Started ===", flush=True)
    print(json.dumps(summary, indent=2, ensure_ascii=False), flush=True)


def log_trace(request_path: str, payload: dict[str, Any], runtime: dict[str, Any], trace: dict[str, Any], result: dict[str, Any]) -> None:
    bundle = payload.get("truthBundle") or {}
    request_context = bundle.get("requestContext") or {}
    brand_truth = bundle.get("brandTruth") or {}
    project_truth = bundle.get("projectTruth") or {}
    post_type_contract = bundle.get("postTypeContract") or {}
    festival_truth = bundle.get("festivalTruth") or {}
    candidate_assets = bundle.get("candidateAssets") or []
    exact_asset_contract = bundle.get("exactAssetContract") or {}
    loaded_skill_names = runtime.get("loadedSkillNames") or []
    skill_tool_calls = trace.get("skillToolCalls") or []
    tool_calls = trace.get("toolCalls") or []
    used_skill_names: list[str] = []

    for call in skill_tool_calls:
        args = call.get("toolArgs")
        skill_name = None
        if isinstance(args, dict):
            skill_name = args.get("skill_name") or args.get("skillName")
        if isinstance(skill_name, str) and skill_name and skill_name not in used_skill_names:
            used_skill_names.append(skill_name)

    summary = {
        "path": request_path,
        "brand": brand_truth.get("name"),
        "project": project_truth.get("name"),
        "postType": post_type_contract.get("name"),
        "festival": festival_truth.get("name"),
        "variationCount": request_context.get("variationCount"),
        "loadedSkills": loaded_skill_names,
        "usedSkills": used_skill_names,
        "toolCallCount": len(tool_calls),
        "skillToolCallCount": len(skill_tool_calls),
        "candidateAssetIds": [asset.get("id") for asset in candidate_assets if asset.get("id")],
        "exactAssetIds": {
            "projectAnchor": exact_asset_contract.get("requiredProjectAnchorAssetId"),
            "logo": exact_asset_contract.get("logoAssetId"),
            "reraQr": exact_asset_contract.get("reraQrAssetId"),
        },
        "promptSummary": result.get("promptSummary"),
    }
    print("\n=== Agno Prompt Lab Request ===", flush=True)
    print(json.dumps(summary, indent=2, ensure_ascii=False), flush=True)

    if tool_calls:
        print("--- Tool Calls ---", flush=True)
        for index, call in enumerate(tool_calls, start=1):
            item = {
                "index": index,
                "event": call.get("event"),
                "toolName": call.get("toolName"),
                "toolArgs": call.get("toolArgs"),
                "toolError": call.get("toolError"),
            }
            print(json.dumps(item, indent=2, ensure_ascii=False), flush=True)

    if skill_tool_calls:
        print("--- Skill Loads ---", flush=True)
        for index, call in enumerate(skill_tool_calls, start=1):
            item = {
                "index": index,
                "toolName": call.get("toolName"),
                "toolArgs": call.get("toolArgs"),
                "toolError": call.get("toolError"),
            }
            print(json.dumps(item, indent=2, ensure_ascii=False), flush=True)

    if candidate_assets:
        print("--- Candidate Assets ---", flush=True)
        for index, asset in enumerate(candidate_assets, start=1):
            item = {
                "index": index,
                "id": asset.get("id"),
                "label": asset.get("label"),
                "projectId": asset.get("projectId"),
                "subjectType": (asset.get("normalizedMetadata") or {}).get("subjectType"),
                "usageIntent": (asset.get("normalizedMetadata") or {}).get("usageIntent"),
                "eligibility": asset.get("eligibility"),
            }
            print(json.dumps(item, indent=2, ensure_ascii=False), flush=True)

    if exact_asset_contract:
        print("--- Exact Asset Contract ---", flush=True)
        print(json.dumps(exact_asset_contract, indent=2, ensure_ascii=False), flush=True)

    compiler_trace = result.get("compilerTrace")
    if isinstance(compiler_trace, dict):
        analyst_output = compiler_trace.get("analystOutput")
        if isinstance(analyst_output, str) and analyst_output.strip():
            print("--- Analyst Output ---", flush=True)
            print(analyst_output.strip(), flush=True)


class PromptLabHandler(BaseHTTPRequestHandler):
    server_version = "AgnoPromptLab/0.1"

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/", "/index.html"):
            self._serve_file("index.html", "text/html; charset=utf-8")
            return
        if self.path == "/styles.css":
            self._serve_file("styles.css", "text/css; charset=utf-8")
            return
        if self.path == "/app.js":
            self._serve_file("app.js", "application/javascript; charset=utf-8")
            return
        if self.path == "/api/options":
            self._send_json(HTTPStatus.OK, options_payload())
            return
        if self.path == "/api/health":
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "agentReady": bool(
                        os.getenv("OPENROUTER_API_KEY")
                        if os.getenv("USE_OPENROUTER", "false").lower() == "true"
                        else os.getenv("OPENAI_API_KEY")
                    ),
                    "mode": os.getenv("CREATIVE_DIRECTOR_MODE", "agno"),
                    "openAiModel": os.getenv("OPENAI_MODEL", "unset"),
                    "runtime": runtime_diagnostics()
                }
            )
            return
        if self.path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/api/compile-v2":
            self._handle_compile_v2()
            return

        if self.path == "/api/image-edit-plan":
            self._handle_image_edit_plan()
            return

        if self.path != "/api/chat":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            body = self._read_json()
            payload = build_request_payload(body)
            result, trace, runtime = execute_payload_with_trace(payload)
            log_trace("/api/chat", payload, runtime, trace, result)
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "result": result,
                    "context": summarize_context(
                        LOOKUPS.post_types[body["postTypeId"]],
                        LOOKUPS.projects.get(body.get("projectId") or ""),
                        LOOKUPS.festivals.get(body.get("festivalId") or "")
                    ),
                    "runtime": runtime,
                    "trace": trace
                }
            )
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - interactive lab handler
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "error": describe_runtime_failure(exc)
                }
            )

    def _handle_compile_v2(self) -> None:
        try:
            body = self._read_json()
            payload = body.get("payload", body)
            if not isinstance(payload, dict):
                raise ValueError("Expected a compiler payload object.")
            payload, contract_mode = normalize_compile_v2_payload(payload)
            print(
                json.dumps(
                    {
                        "path": "/api/compile-v2",
                        "requestContractMode": contract_mode,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

            log_request_start("/api/compile-v2", payload)
            result, trace, runtime = execute_payload_with_trace(payload)
            log_trace("/api/compile-v2", payload, runtime, trace, result)
            compiler_trace = result.get("compilerTrace")
            if not isinstance(compiler_trace, dict):
                compiler_trace = {}
            result["compilerTrace"] = {
                **compiler_trace,
                **trace,
                "runtime": runtime,
                "requestContract": {"mode": contract_mode},
                "runtimeEvents": {
                    "available": bool(trace.get("eventCount")),
                    "reason": "V2 captures Agno workflow executor tool calls from WorkflowRunOutput.step_executor_runs.",
                },
                "pipeline": trace.get("pipeline", compiler_trace.get("pipeline", "v2-notebook")),
                "pythonServer": {
                    "url": f"http://{HOST}:{PORT}",
                    "agentScript": os.getenv("AGNO_PROMPT_LAB_AGENT_SCRIPT", os.getenv("AGNO_AGENT_V2_SCRIPT")),
                },
            }
            self._send_json(HTTPStatus.OK, {"ok": True, "result": result, "runtime": runtime, "trace": trace})
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - interactive lab handler
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": describe_runtime_failure(exc)})

    def _handle_image_edit_plan(self) -> None:
        try:
            body = self._read_json()
            payload = body.get("payload", body)
            if not isinstance(payload, dict):
                raise ValueError("Expected an image edit payload object.")

            result = AI_EDIT_DIRECTOR.execute(get_ai_edit_agent(), payload)
            planner_trace = result.get("plannerTrace")
            if not isinstance(planner_trace, dict):
                planner_trace = {}
            result["plannerTrace"] = {
                **planner_trace,
                "pythonServer": {
                    "url": f"http://{HOST}:{PORT}",
                    "agentScript": os.getenv("AI_EDIT_PROMPT_LAB_AGENT_SCRIPT", "./agents/ai_edit_director.py"),
                },
            }
            self._send_json(HTTPStatus.OK, {"ok": True, "result": result})
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
        except Exception as exc:  # pragma: no cover - interactive lab handler
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": describe_runtime_failure(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON request body.") from exc

    def _serve_file(self, name: str, content_type: str) -> None:
        target = APP_ROOT / name
        if not target.exists():
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        payload = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, status: HTTPStatus, data: dict[str, Any]) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), PromptLabHandler)
    print(f"Agno prompt lab running at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
