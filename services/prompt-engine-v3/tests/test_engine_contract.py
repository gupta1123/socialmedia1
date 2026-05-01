from __future__ import annotations

import unittest

from src.generator import compile_prompt
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


class EngineContractTests(unittest.TestCase):
    def test_no_templates_still_produces_creative_variants_and_image_asset(self):
        response = compile_prompt(CompileRequest(**base_payload(variant_count=3)))
        self.assertEqual(response.status, "ready")
        self.assertEqual(len(response.variants), 3)
        self.assertEqual(response.variants[0].render_package.project_asset_ids, ["hero-1"])
        self.assertGreaterEqual(len({variant.variation_label for variant in response.variants}), 2)
        self.assertIn("Hard constraints", response.variants[0].compiled_prompt)

    def test_selected_asset_stays_fixed(self):
        response = compile_prompt(CompileRequest(**base_payload(selected_asset_ids=["hero-1"], variant_count=2)))
        self.assertEqual(response.status, "ready")
        self.assertEqual([variant.render_package.project_asset_ids for variant in response.variants], [["hero-1"], ["hero-1"]])

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
        self.assertEqual(response.status, "ready")
        variant = response.variants[0]
        values = [fact.value for fact in variant.render_package.session_fact_overrides]
        self.assertIn("98765 43210", values)
        self.assertIn("₹88 lakh", values)
        self.assertFalse(variant.layout_contract["rera_qr_layer"]["required"])
        self.assertTrue(variant.fact_audit.requires_client_review)

    def test_ready_status_never_has_failed_validation(self):
        response = compile_prompt(CompileRequest(**base_payload()))
        self.assertFalse(response.status == "ready" and not response.validation.passed)


if __name__ == "__main__":
    unittest.main()
