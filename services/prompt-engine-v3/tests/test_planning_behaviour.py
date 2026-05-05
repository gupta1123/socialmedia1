from __future__ import annotations

from src.generator import compile_prompt
from src.schemas import CompileRequest


def payload(**overrides):
    base = {
        "brand_id": "brand-1",
        "project_id": "project-1",
        "content_job_id": "project_launch",
        "format": "4:5",
        "brief": "Create a premium project launch post.",
        "variant_count": 1,
        "options": {"disable_dspy": True},
        "context": {
            "brand": {"id": "brand-1", "name": "Test Developer"},
            "project": {
                "id": "project-1",
                "name": "Aurum Heights",
                "city": "Pune",
                "micro_location": "Baner",
                "profile": {
                    "salesPhone": "77777 88888",
                    "website": "https://aurum.example",
                    "reraNumber": "P52100054774",
                    "approvedClaims": ["Located in Baner, Pune"],
                },
            },
            "assets": [
                {
                    "asset_id": "exterior-1",
                    "label": "Aurum Exterior Tower Facade Hero",
                    "role": "reference",
                    "storage_path": "exterior.jpg",
                    "description": "Tall exterior tower render with facade and balconies.",
                    "metadata": {"assetClass": "project_exterior", "qualityTier": "hero", "usageIntent": "truth_anchor"},
                },
                {
                    "asset_id": "interior-1",
                    "label": "Aurum Warm Living Room Interior",
                    "role": "reference",
                    "storage_path": "interior.jpg",
                    "description": "Warm living room interior with sofa, window, daylight and premium finishes.",
                    "metadata": {"assetClass": "interior", "qualityTier": "hero", "usageIntent": "truth_anchor"},
                },
            ],
        },
    }
    base.update(overrides)
    return base


def test_project_launch_with_interior_brief_selects_interior_asset():
    response = compile_prompt(CompileRequest(**payload(brief="Create a project launch post but show a warm interior for families.")))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.render_package.project_asset_ids == ["interior-1"]
    prompt = variant.compiled_prompt.lower()
    assert "interior" in prompt
    assert "preserve room layout" in prompt
    assert "facade rhythm" not in prompt


def test_brief_phone_overrides_project_phone_in_contact_layer():
    response = compile_prompt(CompileRequest(**payload(brief="Create a launch post. Show phone 98765 43210.")))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.layout_contract["contact_layer"]["values"]["phone"] == "98765 43210"
    assert "98765 43210" in variant.compiled_prompt
    assert "77777 88888" not in variant.compiled_prompt


def test_preset_rules_drive_location_contact_secondary_logo_and_rera_trigger():
    preset = {
        "preset_id": "pwc_township_standard_dual_logo_location_contact",
        "name": "Township Standard",
        "preset_json": {
            "logo": {"required": True, "position": "top_right", "brand_mark": "pwc_logo"},
            "secondary_logo": {"required": True, "position": "top_left", "brand_mark": "pride_group_logo"},
            "rera_qr": {
                "required": False,
                "position": "top_right",
                "trigger_required_when_fact_types": ["project", "typology", "pricing"],
            },
            "location": {
                "required": True,
                "position": "bottom_left",
                "fallback_position_without_contact": "bottom_center",
                "include_pin_icon": True,
            },
            "contact": {"items": ["phone"], "position": "bottom_right", "include_if_grounded": True},
        },
    }
    base = payload(
        brand_preset_id=preset["preset_id"],
        context={
            **payload()["context"],
            "brand_presets": [preset],
            "assets": [
                *payload()["context"]["assets"],
                {
                    "asset_id": "pwc-logo",
                    "label": "PWC logo",
                    "role": "logo",
                    "storage_path": "pwc-logo.png",
                    "metadata": {"assetClass": "project_logo", "brandMark": "pwc_logo"},
                },
                {
                    "asset_id": "pride-logo",
                    "label": "Pride Group logo",
                    "role": "logo",
                    "storage_path": "pride-logo.png",
                    "metadata": {"assetClass": "brand_logo", "brandMark": "pride_group_logo"},
                },
                {
                    "asset_id": "rera-1",
                    "label": "RERA QR",
                    "role": "rera_qr",
                    "storage_path": "rera.png",
                    "metadata": {"assetClass": "rera_qr"},
                },
            ],
        },
    )
    response = compile_prompt(CompileRequest(**base))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.layout_contract["logo_layer"]["position"] == "top_right"
    assert variant.layout_contract["secondary_logo_layer"]["asset_id"] == "pride-logo"
    assert variant.layout_contract["rera_qr_layer"]["required"] is True
    assert variant.layout_contract["rera_qr_layer"]["triggered_by_preset"] is True
    assert variant.layout_contract["contact_layer"]["position"] == "bottom_right"
    assert variant.layout_contract["location_layer"]["value"] == "Baner"
    assert variant.layout_contract["location_layer"]["position"] == "bottom_left"
    assert variant.render_package.secondary_logo_asset_id == "pride-logo"
    assert variant.render_package.exact_text_layers["contact_footer"] == "77777 88888"
    assert variant.render_package.exact_text_layers["location_label"] == "Baner"
    assert any(ref.asset_id == "pride-logo" and ref.sent_to_model for ref in variant.render_package.provider_references)
    prompt = variant.compiled_prompt.lower()
    assert "bottom right" in prompt
    assert "bottom left" in prompt
    assert "secondary logo" in prompt


def test_preset_can_require_multiple_additional_logo_layers():
    preset = {
        "preset_id": "multi_logo",
        "name": "Multi Logo",
        "preset_json": {
            "logo": {"required": True, "position": "top_right", "brand_mark": "pwc_logo"},
            "secondary_logo": {"required": True, "position": "top_left", "brand_mark": "pride_group_logo"},
            "additional_logos": [
                {"required": True, "position": "bottom_left", "brand_mark": "partner_logo", "label": "Partner logo"}
            ],
        },
    }
    base = payload(
        brand_preset_id=preset["preset_id"],
        context={
            **payload()["context"],
            "brand_presets": [preset],
            "assets": [
                *payload()["context"]["assets"],
                {
                    "asset_id": "pwc-logo",
                    "label": "PWC logo",
                    "role": "logo",
                    "storage_path": "pwc-logo.png",
                    "metadata": {"assetClass": "project_logo", "brandMark": "pwc_logo"},
                },
                {
                    "asset_id": "pride-logo",
                    "label": "Pride Group logo",
                    "role": "logo",
                    "storage_path": "pride-logo.png",
                    "metadata": {"assetClass": "brand_logo", "brandMark": "pride_group_logo"},
                },
                {
                    "asset_id": "partner-logo",
                    "label": "Partner logo",
                    "role": "logo",
                    "storage_path": "partner-logo.png",
                    "metadata": {"assetClass": "brand_logo", "brandMark": "partner_logo"},
                },
            ],
        },
    )
    response = compile_prompt(CompileRequest(**base))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.render_package.secondary_logo_asset_id == "pride-logo"
    assert variant.render_package.additional_logo_asset_ids == ["pride-logo", "partner-logo"]
    assert variant.layout_contract["additional_logo_layers"][1]["asset_id"] == "partner-logo"
    assert any(ref.asset_id == "partner-logo" and ref.role == "exact_additional_logo_layer" for ref in variant.render_package.provider_references)
    assert "additional logo instruction" in variant.compiled_prompt.lower()


def test_manual_additional_logo_ids_work_without_preset():
    base = payload(
        include_logo=True,
        logo_asset_id="project-logo",
        additional_logo_asset_ids=["developer-logo", "partner-logo"],
        context={
            **payload()["context"],
            "assets": [
                *payload()["context"]["assets"],
                {
                    "asset_id": "project-logo",
                    "label": "Project logo",
                    "role": "logo",
                    "storage_path": "project-logo.png",
                    "metadata": {"assetClass": "project_logo"},
                },
                {
                    "asset_id": "developer-logo",
                    "label": "Developer logo",
                    "role": "logo",
                    "storage_path": "developer-logo.png",
                    "metadata": {"assetClass": "brand_logo"},
                },
                {
                    "asset_id": "partner-logo",
                    "label": "Partner logo",
                    "role": "logo",
                    "storage_path": "partner-logo.png",
                    "metadata": {"assetClass": "brand_logo"},
                },
            ],
        },
    )
    response = compile_prompt(CompileRequest(**base))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.render_package.logo_asset_id == "project-logo"
    assert variant.render_package.additional_logo_asset_ids == ["developer-logo", "partner-logo"]
    assert variant.layout_contract["additional_logo_layers"][0]["position"] == "top_right"
    assert variant.layout_contract["additional_logo_layers"][1]["position"] == "bottom_left"
    assert any(ref.asset_id == "developer-logo" and ref.role == "exact_secondary_logo_layer" for ref in variant.render_package.provider_references)
    assert any(ref.asset_id == "partner-logo" and ref.role == "exact_additional_logo_layer" for ref in variant.render_package.provider_references)


def test_no_text_visual_only_creates_reserved_text_policy():
    response = compile_prompt(CompileRequest(**payload(brief="Create a launch key visual with no text, background only.")))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.text_policy["text_treatment"] == "reserve_space"
    assert variant.render_package.exact_text_layers == {}
    assert "do not render any poster text" in variant.compiled_prompt.lower()


def test_copy_led_mode_changes_strategy_and_prompt():
    response = compile_prompt(CompileRequest(**payload(creative_mode="copy_led", brief="Create a copy led launch announcement.")))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.layout_contract["creative_strategy"]["creative_mode"] == "copy_led"
    assert variant.copy_contract["headline"]
    assert "copy-led" in variant.compiled_prompt.lower() or "copy led" in variant.compiled_prompt.lower()


def test_single_variant_asset_variation_still_uses_best_asset():
    response = compile_prompt(
        CompileRequest(
            **payload(
                variant_count=1,
                asset_variation=True,
                options={"disable_dspy": True, "generation_run_id": "force-offset"},
            )
        )
    )
    assert response.status in {"ready", "ready_with_warnings"}
    assert response.variants[0].render_package.project_asset_ids == ["exterior-1"]
    assert response.variants[0].render_package.asset_selection.get("rank") == 1


def test_entrance_asset_with_tower_template_gets_arrival_led_prompt():
    template = {
        "template_id": "project_launch.art_poster.cutout_hero.abstract_shape_field.v1",
        "db_id": "87c4c3ef-0df0-40cf-a274-33fa95a48801",
        "name": "Abstract Shape Tower Cutout Poster",
        "content_job_id": "project_launch",
        "formats": ["4:5"],
        "lever_signature": {
            "style_family": "art_poster_premium",
            "hero_presentation": "cutout_hero",
            "layout_geometry": "abstract_shape_field",
            "graphic_layer": ["large_abstract_shape", "cutout_edge"],
            "type_voice": "bold_editorial_sans",
            "text_architecture": "project_name_plus_slogan",
            "mood_mode": "campaign_adaptive_editorial",
            "density": "medium",
            "brand_visibility": "visible_brand_led",
            "visual_mode": "cutout_truth",
        },
        "template_json": {
            "reality_policy": "Use selected building as faithful cutout. Preserve facade rhythm.",
        },
    }
    base = payload(
        brief="Create a premium project launch post using the lobby entrance as an arrival moment.",
        visual_template_id=template["template_id"],
        context={
            **payload()["context"],
            "assets": [
                {
                    "asset_id": "entrance-1",
                    "project_id": "project-1",
                    "label": "Aurum Lobby Entrance",
                    "role": "reference",
                    "storage_path": "entrance.jpg",
                    "scene_type": "lobby",
                    "visual_use": "hero_anchor",
                    "description": "Real arrival/lobby entrance with glass doors and warm lighting.",
                    "metadata": {"assetClass": "lobby", "qualityTier": "hero", "usageIntent": "truth_anchor"},
                }
            ],
            "visual_templates": [template],
        },
    )
    response = compile_prompt(CompileRequest(**base))
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.render_package.project_asset_ids == ["entrance-1"]
    assert "arrival/lobby" in variant.compiled_prompt.lower() or "arrival" in variant.compiled_prompt.lower()
    assert "hero arrival/entrance image treatment" in variant.compiled_prompt.lower()
    assert "abstract shape tower cutout poster" not in variant.compiled_prompt.lower()


def test_brand_only_festive_does_not_add_building_and_fills_empty_manual_copy():
    response = compile_prompt(
        CompileRequest(
            **payload(
                project_id=None,
                content_job_id="festive_greeting",
                brief="Create a premium Pongal greeting for the brand.",
                copy_mode="manual",
                copy={"headline": None, "subheadline": None, "cta": None},
                include_logo=True,
                logo_asset_id="project-logo-ok-as-explicit-layer",
                context={
                    "brand": {"id": "brand-1", "name": "Prescon"},
                    "project": None,
                    "festival": {"name": "Pongal", "code": "pongal"},
                    "assets": [
                        {
                            "asset_id": "project-logo-ok-as-explicit-layer",
                            "project_id": "project-1",
                            "label": "Project Logo",
                            "role": "logo",
                            "storage_path": "logo.png",
                            "scene_type": "logo",
                            "metadata": {"assetClass": "project_logo"},
                        }
                    ],
                },
            )
        )
    )
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    prompt = variant.compiled_prompt.lower()
    assert variant.render_package.project_asset_ids == []
    assert variant.render_package.logo_asset_id == "project-logo-ok-as-explicit-layer"
    assert any(ref.asset_id == "project-logo-ok-as-explicit-layer" and ref.sent_to_model and not ref.composited_after for ref in variant.render_package.provider_references)
    assert variant.copy_contract["headline"]
    assert variant.render_package.exact_text_layers["headline"]
    assert "brand festive greeting poster" in prompt
    assert "no project or building image is required" in prompt
    assert "use the supplied project visual asset" not in prompt
    assert "building exterior" not in prompt
    assert "tower facade" not in prompt
    assert "do not introduce a building" in prompt


def test_construction_update_without_construction_photo_visualizes_50_percent_progress():
    response = compile_prompt(
        CompileRequest(
            **payload(
                content_job_id="construction_update",
                brief="Create a premium construction update post.",
                options={"disable_dspy": True, "textTreatment": "reserve_space"},
            )
        )
    )
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    prompt = variant.compiled_prompt.lower()
    assert "construction-stage visualization" in prompt
    assert "approximately 50%" in prompt
    assert "not an actual current site photo" in prompt or "not a verified current site photograph" in prompt
    assert "captured recently" not in prompt
    assert "advancing rapidly" not in prompt


def test_visual_analysis_semantic_overrides_text_fallback():
    from src.asset_indexer import asset_semantic, profile_asset

    asset = {
        "asset_id": "a1",
        "label": "generic project image tower facade text should not win",
        "description": "ambiguous image",
        "metadata": {
            "visualAnalysis": {
                "semanticType": "lobby",
                "dominantSubject": "real reception desk and lobby seating",
                "bestUseCases": ["site_visit"],
                "promptGuidance": "Use as site visit arrival proof.",
            }
        },
    }
    assert asset_semantic(asset) == "lobby"
    profile = profile_asset(asset)
    assert profile.visual_analysis["semantic_type"] == "lobby"
    assert "site_visit" in profile.visual_analysis["best_use_cases"]


def test_prompt_auditor_repairs_brand_only_festive_building_language():
    from src.prompt_auditor import audit_and_repair_prompt
    from src.planning_schemas import CreativeIntent, ProductionPlan, AssetDecision, TemplateConstraint, CreativeStrategy, VariantConcept, CopyPlan

    intent = CreativeIntent(content_job_id="festive_greeting", festival_visual_scope="brand_only", brief_summary="Create Pongal greeting")
    production = ProductionPlan(include_logo=True, logo_asset_id="logo-1", text_strategy="render_exact_text", text_treatment="render_text")
    copy = CopyPlan(headline="Happy Pongal", subheadline="Celebrating gratitude, abundance, and new beginnings.", cta="Warm wishes from Prescon")
    result = audit_and_repair_prompt(
        request=type("Req", (), {"options": {"disable_prompt_auditor": True}})(),
        context={"brand": {"name": "Prescon"}},
        intent=intent,
        production=production,
        asset_decision=AssetDecision(),
        template_constraint=TemplateConstraint(),
        strategy=CreativeStrategy(primary_goal="festival poster"),
        concept=VariantConcept(variant_id="variant_1", label="Festival", creative_big_idea="Pongal poster"),
        copy_plan=copy,
        provider_prompt="Use the supplied project visual asset as the factual visual anchor. Preserve facade rhythm and tower massing. Create Happy Pongal poster.",
        negative_prompt="",
        allowed_facts=["Prescon"],
    )
    prompt = result["repaired_provider_prompt"].lower()
    assert "no project or building image is required" in prompt or "brand-only festive rule" in prompt
    assert "facade rhythm" not in prompt
    assert "render only this exact visible text" in prompt
    assert "happy pongal" in prompt


def test_prompt_auditor_repairs_construction_visualization_language():
    from src.prompt_auditor import audit_and_repair_prompt
    from src.planning_schemas import CreativeIntent, ProductionPlan, AssetDecision, TemplateConstraint, CreativeStrategy, VariantConcept, CopyPlan, AssetProfile

    intent = CreativeIntent(content_job_id="construction_update", construction_visual_mode="visualized_progress_from_project_truth", construction_progress_percent=50)
    production = ProductionPlan(text_strategy="reserve_editable_space", text_treatment="reserve_space")
    asset = AssetDecision(selected_asset_id="asset-1", semantic_type="building_exterior", profile=AssetProfile(asset_id="asset-1", semantic_type="building_exterior"))
    result = audit_and_repair_prompt(
        request=type("Req", (), {"options": {"disable_prompt_auditor": True}})(),
        context={"project": {"name": "Project"}},
        intent=intent,
        production=production,
        asset_decision=asset,
        template_constraint=TemplateConstraint(),
        strategy=CreativeStrategy(primary_goal="construction"),
        concept=VariantConcept(variant_id="variant_1", label="Construction", creative_big_idea="Progress"),
        copy_plan=CopyPlan(),
        provider_prompt="Create an under construction photograph captured recently showing actual current site progress advancing rapidly.",
        negative_prompt="",
        allowed_facts=[],
    )
    prompt = result["repaired_provider_prompt"].lower()
    assert "not an actual current site photograph" in prompt
    assert "captured recently" not in prompt
    assert "advancing rapidly" not in prompt
    assert "approximately 50%" in prompt


def test_contact_website_from_profile_is_allowed_even_with_punctuation_in_contract():
    from src.grounding_validator import validate_full_variant
    from src.planning_schemas import ProductionPlan
    from src.schemas import VariantOutput, RenderPackage

    variant = VariantOutput(
        variant_id="v1",
        variation_label="Test",
        variation_axis="test",
        negative_prompt="",
        prompt="Render website https://prescon.in'}, in footer",
        compiled_prompt="Render website https://prescon.in'}, in footer",
        render_package=RenderPackage(
            format="4:5",
            prompt="Render website https://prescon.in'}, in footer",
            compiled_prompt="Render website https://prescon.in'}, in footer",
            provider_prompt="Render website https://prescon.in'}, in footer",
            exact_text_layers={"cta": "https://prescon.in"},
            contact_rules={"values": {"website": "https://prescon.in"}},
            project_asset_ids=["asset-1"],
        ),
        copy_contract={"cta": "https://prescon.in"},
        visible_text_allowed=["https://prescon.in"],
        text_policy={"text_treatment": "render_text", "text_strategy": "render_exact_text"},
        layout_contract={"contact_layer": {"values": {"website": "https://prescon.in"}}},
    )
    result = validate_full_variant(
        variant,
        session_facts=[],
        db_facts=["https://prescon.in"],
        production=ProductionPlan(),
    )
    assert result.passed
    assert not any("Unsupported website" in error for error in result.errors)


def test_nested_contact_fields_are_exposed_to_fact_store_and_contact_plan():
    from src.fact_store import build_fact_store
    from src.contact_resolver import resolve_contact_plan
    from src.planning_schemas import CreativeIntent, ContactIntent

    context = {
        "brand": {"name": "Prescon", "profile": {"contact": {"website": "https://prescon.in", "phone": "+91-22-49616170", "email": "info@prescon.in"}}},
        "project": {"name": "Prescon Midtown Bay", "profile": {"contact": {"website": "https://prescon.in", "phone": "+91-22-49616170", "email": "info@prescon.in"}}},
    }
    store = build_fact_store(context, [])
    plan = resolve_contact_plan(
        intent=CreativeIntent(content_job_id="site_visit", contact_intent=ContactIntent(requested_items=["phone", "email", "website"])),
        fact_store=store,
    )
    assert plan.values["website"] == "https://prescon.in"
    assert plan.values["phone"] == "+91-22-49616170"
    assert plan.values["email"] == "info@prescon.in"
    assert plan.missing == []


def test_pricing_ad_with_verify_before_use_db_price_needs_input():
    base = payload(
        content_job_id="pricing_ad",
        brief="Create a premium offer-led real-estate post using only verified or client-provided pricing details.",
        context={
            **payload()["context"],
            "project": {
                **payload()["context"]["project"],
                "profile": {
                    **payload()["context"]["project"]["profile"],
                    "startingPrice": "₹2.85 Cr all inclusive",
                    "priceRangeByConfig": ["2.5 BHK: ₹4.75 Cr all inclusive (verify before ad use)"],
                    "commercialClaimsToVerify": ["Price by configuration"],
                    "commercialDataConfidence": "medium; pricing/payment data should be verified before performance ads",
                    "legalNotes": ["Do not use pricing, payment plan, offers or possession claims in ads unless client confirms."],
                },
            },
        },
    )
    response = compile_prompt(CompileRequest(**base))
    assert response.status == "needs_input"
    assert response.variants == []
    assert any("verify-before-ad-use" in err or "client-confirmation" in err for err in response.validation.errors)


def test_prompt_auditor_uses_model_rendered_logo_not_composite_safe_zone():
    from src.prompt_auditor import audit_and_repair_prompt
    from src.planning_schemas import CreativeIntent, ProductionPlan, AssetDecision, TemplateConstraint, CreativeStrategy, VariantConcept, CopyPlan

    result = audit_and_repair_prompt(
        request=type("Req", (), {"options": {"disable_prompt_auditor": True}})(),
        context={"project": {"name": "Aurum"}},
        intent=CreativeIntent(content_job_id="project_launch"),
        production=ProductionPlan(include_logo=True, logo_asset_id="logo-1", logo_position="top_left", text_strategy="render_exact_text", text_treatment="render_text"),
        asset_decision=AssetDecision(selected_asset_id="asset-1", semantic_type="building_exterior"),
        template_constraint=TemplateConstraint(),
        strategy=CreativeStrategy(primary_goal="launch"),
        concept=VariantConcept(variant_id="variant_1", label="Launch", creative_big_idea="Hero"),
        copy_plan=CopyPlan(headline="Aurum Heights", subheadline="Premium homes", cta="Discover More"),
        provider_prompt="Leave a clean top_left logo-safe zone for exact post-generation compositing. Render only this exact visible text: Headline: \"Old\" Do not render any other readable poster text.",
        negative_prompt="",
        allowed_facts=["Aurum Heights"],
    )
    prompt = result["repaired_provider_prompt"]
    assert "Logo instruction: use the supplied logo reference exactly once" in prompt
    assert "post-generation compositing" not in prompt
    assert prompt.count("Render only this exact visible text:") == 1
    assert "Old" not in prompt


def test_render_text_with_grounded_contact_includes_contact_footer_exact_layer():
    response = compile_prompt(
        CompileRequest(
            **payload(
                content_job_id="construction_update",
                brief="Create a premium construction update post that feels credible, current, and grounded.",
                contact_items=["phone", "email", "website"],
                copy_language="hi",
                context={
                    **payload()["context"],
                    "project": {
                        **payload()["context"]["project"],
                        "profile": {
                            **payload()["context"]["project"]["profile"],
                            "phone": "+91-22-49616170",
                            "email": "info@prescon.in",
                            "website": "https://prescon.in",
                        },
                    },
                },
            )
        )
    )
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    assert variant.render_package.exact_text_layers["contact_footer"] == "+91-22-49616170 | info@prescon.in | https://prescon.in"
    assert 'Footer: "+91-22-49616170 | info@prescon.in | https://prescon.in"' in variant.compiled_prompt
    assert "do not render any other readable poster text" in variant.compiled_prompt.lower()


def test_construction_visualization_copy_does_not_claim_now_50_percent_complete():
    from src.generator import sanitize_copy_plan_for_policy
    from src.planning_schemas import CopyPlan, CreativeIntent

    plan = CopyPlan(
        headline="वास्तुशिल्प परिकल्पना साकार हो रही है",
        subheadline="Prescon Midtown Bay अब 50% पूर्ण हो चुका है, जो डिज़ाइन उत्कृष्टता का प्रमाण है।",
        cta="अपडेट देखें",
    )
    intent = CreativeIntent(
        content_job_id="construction_update",
        construction_visual_mode="visualized_progress_from_project_truth",
        construction_progress_percent=50,
    )
    fixed = sanitize_copy_plan_for_policy(plan, intent)
    assert "अब 50% पूर्ण हो चुका" not in fixed.subheadline
    assert "विज़ुअलाइज़" in fixed.subheadline


def test_low_confidence_contact_sets_review_warning():
    from src.fact_store import build_fact_store
    from src.contact_resolver import resolve_contact_plan
    from src.planning_schemas import CreativeIntent, ContactIntent

    context = {
        "project": {
            "name": "Prescon Midtown Bay",
            "profile": {
                "phone": "+91-22-49616170",
                "email": "info@prescon.in",
                "website": "https://prescon.in",
                "contactConfidence": {"phone": "medium", "email": "low", "website": "high"},
            },
        },
        "brand": {"name": "Prescon"},
    }
    store = build_fact_store(context, [])
    plan = resolve_contact_plan(
        intent=CreativeIntent(content_job_id="site_visit", contact_intent=ContactIntent(requested_items=["phone", "email", "website"])),
        fact_store=store,
    )
    assert plan.values["phone"] == "+91-22-49616170"
    assert plan.values["email"] == "info@prescon.in"
    assert plan.requires_client_review is True


def test_reserve_space_prompt_does_not_render_exact_text_or_contact_footer():
    response = compile_prompt(
        CompileRequest(
            **payload(
                brief="Create a premium launch post and keep copy editable later.",
                options={"disable_dspy": True, "textTreatment": "reserve_space"},
                contact_items=["phone", "website"],
            )
        )
    )
    assert response.status in {"ready", "ready_with_warnings"}
    variant = response.variants[0]
    prompt = variant.render_package.provider_prompt.lower()
    assert variant.text_policy["text_treatment"] == "reserve_space"
    assert variant.render_package.exact_text_layers == {}
    assert "render only this exact visible text" not in prompt
    assert "headline:" not in prompt
    assert "subheadline:" not in prompt
    assert "footer:" not in prompt
    assert "text reserve-space rule:" in prompt
    assert "do not render any headline" in prompt
    assert variant.layout_contract["contact_layer"]["values"]["phone"] == "77777 88888"
    assert variant.layout_contract["contact_layer"]["values"]["website"] == "https://aurum.example"


def test_brand_palette_is_in_final_provider_prompt():
    ctx = payload()["context"]
    ctx = {
        **ctx,
        "brand": {
            **ctx["brand"],
            "profile": {
                **ctx.get("brand", {}).get("profile", {}),
                "palette": {
                    "primary": "#16254A",
                    "secondary": "#D5B16A",
                    "accent": "#F4F0E7",
                    "neutrals": ["#FFFFFF", "#1F2937"],
                },
            },
        },
    }
    response = compile_prompt(CompileRequest(**payload(context=ctx, options={"disable_dspy": True, "disable_prompt_auditor": True})))
    assert response.status in {"ready", "ready_with_warnings"}
    prompt = response.variants[0].render_package.provider_prompt
    assert "Brand color direction:" in prompt
    assert "#16254A" in prompt
    assert "#D5B16A" in prompt
    assert "#F4F0E7" in prompt
    assert "do not oversaturate or recolor the supplied logo" in prompt.lower()
