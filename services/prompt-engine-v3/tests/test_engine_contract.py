from __future__ import annotations

import unittest

from src.generator import build_variant_output, coerce_variant_plan, compile_prompt
from src.schemas import CompileRequest


def base_payload(**overrides):
    payload = {
        "brand_id": "brand-1",
        "project_id": "project-1",
        "content_job_id": "project_launch",
        "format": "4:5",
        "brief": "Create a premium project launch post with restrained copy.",
        "variant_count": 1,
        "options": {"disable_dspy": True},
        "context": {
            "brand": {"id": "brand-1", "name": "Sankla Buildcoon"},
            "project": {
                "id": "project-1",
                "name": "East World",
                "profile": {
                    "tagline": "2 & 3 BHK Private Homes",
                    "startingPrice": "₹72 lakh onwards",
                    "reraNumber": "P52100054774",
                    "credibilityFacts": ["Sales phone: 70285 80777"],
                },
            },
            "assets": [
                {
                    "asset_id": "pdf-1",
                    "label": "Floor Plan PDF",
                    "role": "reference",
                    "storage_path": "plans.pdf",
                    "description": "Floor plan document",
                    "metadata": {"assetClass": "generic_reference"},
                },
                {
                    "asset_id": "hero-1",
                    "label": "Eastworld Exterior Facade Towers Hero",
                    "role": "reference",
                    "storage_path": "hero.jpg",
                    "description": "Best overall project hero showing residential towers.",
                    "metadata": {"assetClass": "project_exterior", "qualityTier": "hero", "usageIntent": "truth_anchor"},
                },
                {
                    "asset_id": "lobby-1",
                    "label": "East World Lobby Model Display",
                    "role": "reference",
                    "storage_path": "lobby.jpg",
                    "description": "Lobby interior with a scale model display.",
                    "metadata": {"assetClass": "interior", "subjectType": "lobby", "usageIntent": "supporting_reference"},
                },
                {
                    "asset_id": "rera-1",
                    "label": "East World RERA QR",
                    "role": "rera_qr",
                    "storage_path": "rera.png",
                    "metadata": {"assetClass": "rera_qr"},
                },
            ],
        },
    }
    payload.update(overrides)
    return payload


def quiet_luxury_template():
    return {
        "template_id": "project_launch.quiet_luxury.facade_crop.centered_symmetry.v1",
        "name": "Quiet Luxury Facade Reveal",
        "content_job_id": "project_launch",
        "formats": ["4:5"],
        "lever_signature": {
            "style_family": "quiet_luxury",
            "hero_presentation": "facade_crop",
            "layout_geometry": "centered_symmetry",
            "graphic_layer": ["thin_frame"],
            "type_voice": "quiet_premium",
            "text_architecture": "one_statement",
            "mood_mode": "gallery_white",
            "density": "lean",
            "brand_visibility": "whisper",
            "visual_mode": "editorialized_truth",
        },
        "template_json": {
            "visual_notes": "Centered facade reveal with quiet premium whitespace.",
            "best_for": ["quiet premium launch", "minimal announcement"],
        },
    }


class EngineContractTests(unittest.TestCase):
    def test_no_templates_still_produces_creative_variants_and_image_asset(self):
        response = compile_prompt(CompileRequest(**base_payload(variant_count=3)))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        self.assertEqual(len(response.variants), 3)
        self.assertEqual(response.variants[0].render_package.project_asset_ids, ["hero-1"])
        self.assertGreaterEqual(len({variant.variation_label for variant in response.variants}), 2)
        self.assertIn("final art direction", response.variants[0].render_package.renderer_policy)
        self.assertIn("Create a finished premium", response.variants[0].compiled_prompt)

    def test_selected_asset_stays_fixed(self):
        response = compile_prompt(CompileRequest(**base_payload(selected_asset_ids=["hero-1"], variant_count=2)))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        self.assertEqual([variant.render_package.project_asset_ids for variant in response.variants], [["hero-1"], ["hero-1"]])

    def test_project_launch_prefers_exterior_hero_over_lobby(self):
        response = compile_prompt(CompileRequest(**base_payload()))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        variant = response.variants[0]
        self.assertEqual(variant.render_package.project_asset_ids, ["hero-1"])
        self.assertEqual(variant.render_package.asset_selection.get("rank"), 1)
        self.assertIn("building exterior", " ".join(variant.render_package.asset_selection.get("reasons", [])).lower())

    def test_invalid_asset_blocks(self):
        response = compile_prompt(CompileRequest(**base_payload(selected_asset_ids=["missing"])))
        self.assertEqual(response.status, "blocked")
        self.assertFalse(response.validation.passed)

    def test_brief_facts_are_session_overrides(self):
        response = compile_prompt(
            CompileRequest(
                **base_payload(
                    content_job_id="pricing_ad",
                    brief="Create a pricing post. Show phone 98765 43210 and price ₹88 lakh onwards. No QR.",
                )
            )
        )
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        variant = response.variants[0]
        values = [fact.value for fact in variant.render_package.session_fact_overrides]
        self.assertIn("98765 43210", values)
        self.assertIn("₹88 lakh", values)
        self.assertFalse(variant.layout_contract["rera_qr_layer"]["required"])
        self.assertTrue(variant.fact_audit.requires_client_review)

    def test_no_logo_or_qr_assets_do_not_leak_positive_layer_instructions(self):
        response = compile_prompt(CompileRequest(**base_payload(include_logo=False, include_rera_qr=False)))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        variant = response.variants[0]
        self.assertIsNone(variant.render_package.logo_asset_id)
        self.assertIsNone(variant.render_package.rera_qr_asset_id)
        prompt = variant.compiled_prompt.lower()
        self.assertNotIn("use the supplied logo", prompt)
        self.assertNotIn("prescon logo", prompt)
        self.assertNotIn("rera qr", prompt)
        self.assertNotIn("qr code", prompt)

    def test_visual_analysis_unsupported_details_are_forbidden_not_claimed(self):
        payload = base_payload()
        payload["context"]["assets"][1]["metadata"]["visual_analysis"] = {
            "summary": "Exterior tower render with a clean urban foreground.",
            "prompt_adaptation_guidance": "Use the vertical facade as the hero.",
            "not_visible_or_not_supported": ["ocean", "beach"],
        }
        response = compile_prompt(CompileRequest(**payload))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        prompt = response.variants[0].compiled_prompt.lower()
        self.assertIn("do not show or claim these unsupported asset details", prompt)
        self.assertNotRegex(prompt, r"(?<!do not show or claim these unsupported asset details: )ocean view")

    def test_selected_template_levers_are_not_overridden(self):
        template = {
            "template_id": "project_launch.art_poster.cutout_hero.abstract_shape_field.v1",
            "name": "Abstract Shape Tower Cutout Poster",
            "content_job_id": "project_launch",
            "formats": ["4:5"],
            "lever_signature": {
                "style_family": "art_poster_premium",
                "hero_presentation": "cutout_hero",
                "layout_geometry": "blob_cutout",
                "graphic_layer": ["large_abstract_shape", "editorial_rules"],
                "type_voice": "bold_editorial_sans",
                "text_architecture": "project_name_plus_slogan",
                "mood_mode": "campaign_adaptive_editorial",
                "density": "medium",
                "brand_visibility": "visible_brand_led",
                "visual_mode": "cutout_truth",
            },
            "template_json": {
                "visual_notes": "Cut out the tower over a large abstract shape field.",
                "shape_selection_rule": "Use one dominant warm abstract background shape.",
                "reality_policy": "Preserve the real facade and massing.",
            },
        }
        payload = base_payload(
            visual_template_id=template["template_id"],
            context={**base_payload()["context"], "visual_templates": [template]},
        )
        response = compile_prompt(CompileRequest(**payload))
        self.assertIn(response.status, {"ready", "ready_with_warnings"})
        variant = response.variants[0]
        self.assertEqual(variant.selected_template_id, template["template_id"])
        self.assertEqual(variant.creative_direction["type_voice"], "bold_editorial_sans")
        self.assertEqual(variant.creative_direction["density"], "medium")
        self.assertIn("abstract shape", variant.compiled_prompt.lower())
        self.assertNotIn("template_id", variant.compiled_prompt.lower())

    def test_locked_template_ignores_dspy_variant_plan_conflicting_levers(self):
        template = quiet_luxury_template()
        request = CompileRequest(
            **base_payload(
                visual_template_id=template["template_id"],
                visual_template_ids=[template["template_id"]],
                context={**base_payload()["context"], "visual_templates": [template]},
            )
        )
        plan = {
            "variants": [
                {
                    "variant_id": "variant_1",
                    "selected_template_id": "project_launch.art_poster.cutout_hero.abstract_shape_field.v1",
                    "creative_direction": {
                        "style_family": "art_poster_premium",
                        "hero_presentation": "cutout_hero",
                        "layout_geometry": "abstract_shape_field",
                        "density": "medium",
                    },
                }
            ]
        }
        spec = coerce_variant_plan(plan, request, "project_launch", [template])[0]
        self.assertEqual(spec["selected_template_id"], template["template_id"])
        self.assertEqual(spec["creative_direction"]["style_family"], "quiet_luxury")
        self.assertEqual(spec["creative_direction"]["hero_presentation"], "facade_crop")
        self.assertEqual(spec["creative_direction"]["layout_geometry"], "centered_symmetry")
        self.assertEqual(spec["creative_direction"]["density"], "lean")

    def test_locked_template_ignores_dspy_output_conflicting_levers(self):
        template = quiet_luxury_template()
        request = CompileRequest(
            **base_payload(
                visual_template_id=template["template_id"],
                visual_template_ids=[template["template_id"]],
                context={**base_payload()["context"], "visual_templates": [template]},
            )
        )
        context = request.context.copy()
        context["visual_templates"] = [template]
        asset = context["assets"][1]
        variant = build_variant_output(
            request=request,
            context=context,
            content_job_id="project_launch",
            output_format="4:5",
            asset=asset,
            spec={
                "variant_id": "variant_1",
                "label": "Quiet Luxury",
                "variation_axis": "template",
                "selected_template_id": template["template_id"],
                "creative_direction": template["lever_signature"],
            },
            raw_output={
                "prompt": "Create an abstract cutout art poster with warm gradient field.",
                "copy": {"headline": "East World", "subheadline": "Private Homes", "cta": "Discover More"},
                "creative_direction": {
                    "style_family": "art_poster_premium",
                    "hero_presentation": "cutout_hero",
                    "layout_geometry": "abstract_shape_field",
                    "density": "medium",
                },
            },
            session_facts=[],
        )
        self.assertEqual(variant.creative_direction["style_family"], "quiet_luxury")
        self.assertEqual(variant.creative_direction["hero_presentation"], "facade_crop")
        self.assertEqual(variant.creative_direction["layout_geometry"], "centered_symmetry")
        self.assertEqual(variant.creative_direction["density"], "lean")
        prompt = variant.compiled_prompt.lower()
        self.assertIn("quiet luxury facade reveal", prompt)
        self.assertIn("centered facade reveal", prompt)
        self.assertNotIn("creative levers: style family: premium art-poster", prompt)
        self.assertNotIn("layout geometry: large abstract graphic shape field", prompt)

    def test_ready_status_never_has_failed_validation(self):
        response = compile_prompt(CompileRequest(**base_payload()))
        self.assertFalse(response.status == "ready" and not response.validation.passed)


if __name__ == "__main__":
    unittest.main()
