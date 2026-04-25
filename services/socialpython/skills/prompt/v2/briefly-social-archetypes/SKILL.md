---
name: briefly-social-archetypes
description: Style-first system for Briefly Social. Defines style primitives, style families, modifiers, compatibility rules, and anti-repetition rules.
metadata:
  version: "5.1.0"
  tags: ["real-estate", "social-media", "style-system", "archetypes", "design-levers"]
---

# Briefly Social Style System

Use this skill after the communication job is clear.

## Core Principle
A post type is not a design style.
Choose style based on:
- communication job
- asset fit
- payload fit
- market tone
- desired distinctiveness

For ad posts, keep the same style-family system but also resolve:
- commercial_hook
- visual_mechanism

These should refine the poster route, not replace it with a separate ad template system.

## Style Primitives / Levers

### hero_presentation
How the visual subject appears.
Examples:
- single_tower
- villa
- township_overview
- facade_crop
- cutout_object
- monolith_icon
- entrance_arrival
- framed_image_card
- candid_presence
- amenity_hero
- symbolic_centerpiece

### layout_geometry
How the poster is structurally arranged.
Examples:
- centered_symmetry
- left_copy_right_hero
- right_copy_left_hero
- claim_panel_side_crop
- inset_card
- billboard_headline_sky
- footer_strip
- open_editorial_field
- framed_catalog
- split_panel
- lower_hero_upper_copy
- swiss_grid
- documentary_crop_overlay
- balanced_card_layout

### graphic_layer
What design layer supports the poster.
Examples:
- none
- organic_shape
- geometric_blocks
- line_art_watermark
- brand_watermark
- thin_frame
- translucent_panel
- proposition_box
- image_card
- architectural_tracing
- soft_gradient_field
- paper_depth
- divider_lines

### type_voice
How the typography should feel.
Examples:
- modern_sans
- premium_serif
- serif_sans_mix
- condensed_statement
- swiss_clean
- builder_readable
- fashion_editorial
- quiet_premium

### text_architecture
How the copy is organized.
Examples:
- slogan_first
- proposition_first
- scarcity_first
- emotional_headline_first
- philosophy_first
- address_first
- configuration_first
- quote_first
- footer_heavy
- one_statement

### mood_mode
Examples:
- crisp_daylight
- pale_editorial_daylight
- soft_morning
- golden_hour_optimism
- dusk_luxury
- twilight_calm
- ivory_studio_neutral
- warm_muted_premium
- cool_sustainable_daylight

### density
Examples:
- ultra_lean
- lean
- medium
- heavy
- regulation_heavy

### brand_visibility
Examples:
- whisper
- elegant_signature
- visible_brand_led
- campaign_dominant
- logo_forward
- developer_explicit

## Style Families

### soft_editorial_cutout
- best_for: approachable premium launch, builder-friendly premium, amenity-led clean statements
- default levers:
  - hero_presentation: cutout_object
  - layout_geometry: open_editorial_field
  - graphic_layer: organic_shape or line_art_watermark
  - type_voice: serif_sans_mix or quiet_premium
  - text_architecture: slogan_first or proposition_first
  - mood_mode: warm_muted_premium or pale_editorial_daylight
  - density: lean or medium
  - brand_visibility: elegant_signature

### centered_monolith
- best_for: one iconic tower, strong single-hero presence
- default levers:
  - hero_presentation: monolith_icon
  - layout_geometry: centered_symmetry
  - graphic_layer: geometric_blocks or none
  - type_voice: premium_serif or serif_sans_mix
  - text_architecture: proposition_first or scarcity_first
  - mood_mode: ivory_studio_neutral or pale_editorial_daylight
  - density: ultra_lean or lean
  - brand_visibility: visible_brand_led

### scarcity_panel
- best_for: exclusivity, limited inventory, ad-grade clarity
- default levers:
  - hero_presentation: single_tower
  - layout_geometry: claim_panel_side_crop
  - graphic_layer: proposition_box or geometric_blocks
  - type_voice: modern_sans or condensed_statement
  - text_architecture: scarcity_first
  - mood_mode: crisp_daylight or ivory_studio_neutral
  - density: lean or medium
  - brand_visibility: campaign_dominant

### side_crop_premium_tower
- best_for: strong architecture, readable launch/ad hybrid
- default levers:
  - hero_presentation: single_tower or facade_crop
  - layout_geometry: left_copy_right_hero or right_copy_left_hero
  - graphic_layer: none or thin_frame or translucent_panel
  - type_voice: modern_sans or serif_sans_mix
  - text_architecture: slogan_first or proposition_first
  - mood_mode: crisp_daylight, golden_hour_optimism, or dusk_luxury
  - density: lean or medium
  - brand_visibility: visible_brand_led

### philosophy_open_field
- best_for: worldview-led copy, sustainability, design intelligence
- default levers:
  - hero_presentation: architecture_with_environment
  - layout_geometry: open_editorial_field
  - graphic_layer: architectural_tracing or soft_gradient_field
  - type_voice: premium_serif or fashion_editorial
  - text_architecture: philosophy_first
  - mood_mode: pale_editorial_daylight or cool_sustainable_daylight
  - density: lean
  - brand_visibility: whisper or elegant_signature

### dusk_emotional_crop
- best_for: mood-led premium launch, poetic premium, aspirational evening emotion
- default levers:
  - hero_presentation: tower_with_dusk
  - layout_geometry: left_copy_right_hero or right_copy_left_hero
  - graphic_layer: soft_gradient_field or thin_frame
  - type_voice: premium_serif or serif_sans_mix
  - text_architecture: emotional_headline_first
  - mood_mode: dusk_luxury or twilight_calm
  - density: lean
  - brand_visibility: elegant_signature

### clear_sky_statement
- best_for: sharp, readable, in-feed direct launch ads
- default levers:
  - hero_presentation: tower_with_sky
  - layout_geometry: billboard_headline_sky
  - graphic_layer: none or thin_frame
  - type_voice: modern_sans or condensed_statement
  - text_architecture: proposition_first
  - mood_mode: crisp_daylight or golden_hour_optimism
  - density: lean or medium
  - brand_visibility: visible_brand_led

### footer_builder_campaign
- best_for: market-facing builder creatives, heavier payload, practical shareable campaigns
- default levers:
  - hero_presentation: single_tower or entrance_arrival
  - layout_geometry: footer_strip or lower_hero_upper_copy
  - graphic_layer: color_band or divider_lines
  - type_voice: builder_readable or modern_sans
  - text_architecture: proposition_first or footer_heavy
  - mood_mode: crisp_daylight or golden_hour_optimism
  - density: medium or heavy
  - brand_visibility: developer_explicit

### white_space_editorial_statement
- best_for: restrained premium, boutique luxury, concept-led minimalism
- default levers:
  - hero_presentation: cutout_object or monolith_icon
  - layout_geometry: open_editorial_field or centered_symmetry
  - graphic_layer: thin_frame or architectural_tracing or none
  - type_voice: premium_serif or swiss_clean
  - text_architecture: one_statement or address_first
  - mood_mode: ivory_studio_neutral or pale_editorial_daylight
  - density: ultra_lean
  - brand_visibility: whisper or elegant_signature

### masterplan_scale_reveal
- best_for: township scale, masterplan-led launches where scale is truly the message
- default levers:
  - hero_presentation: township_overview or aerial_masterplan
  - layout_geometry: balanced_card_layout or framed_catalog
  - graphic_layer: translucent_panel or thin_frame
  - type_voice: modern_sans or builder_readable
  - text_architecture: proposition_first
  - mood_mode: golden_hour_optimism or crisp_daylight
  - density: medium
  - brand_visibility: visible_brand_led

### documentary_presence
- best_for: site visits, construction updates, candid credibility
- default levers:
  - hero_presentation: candid_presence
  - layout_geometry: documentary_crop_overlay
  - graphic_layer: translucent_panel or divider_lines
  - type_voice: builder_readable or modern_sans
  - text_architecture: proposition_first
  - mood_mode: crisp_daylight or warm_muted_premium
  - density: medium
  - brand_visibility: developer_explicit

### quote_led_editorial
- best_for: testimonial, trust, quote-first social proof
- default levers:
  - hero_presentation: framed_image_card or architecture_with_environment
  - layout_geometry: balanced_card_layout or open_editorial_field
  - graphic_layer: thin_frame or image_card
  - type_voice: premium_serif or quiet_premium
  - text_architecture: quote_first
  - mood_mode: warm_muted_premium
  - density: lean or medium
  - brand_visibility: elegant_signature

### symbolic_festive_field
- best_for: festival posts where symbolism is stronger than property display
- default levers:
  - hero_presentation: symbolic_centerpiece
  - layout_geometry: centered_symmetry or open_editorial_field
  - graphic_layer: soft_gradient_field or architectural_tracing
  - type_voice: premium_serif or quiet_premium
  - text_architecture: one_statement
  - mood_mode: warm_muted_premium or twilight_calm
  - density: ultra_lean or lean
  - brand_visibility: elegant_signature

### organic_shape_launch
- best_for: approachable premium, family aspirational, builder-friendly distinctiveness
- default levers:
  - hero_presentation: cutout_object or midrise_block
  - layout_geometry: lower_hero_upper_copy or split_panel
  - graphic_layer: organic_shape
  - type_voice: modern_sans or serif_sans_mix
  - text_architecture: slogan_first or proposition_first
  - mood_mode: warm_muted_premium or soft_morning
  - density: medium
  - brand_visibility: visible_brand_led

### watermark_catalog
- best_for: catalog-like premium, villas, quiet luxury, interior/villa image-card
- default levers:
  - hero_presentation: framed_image_card
  - layout_geometry: framed_catalog
  - graphic_layer: brand_watermark or image_card
  - type_voice: premium_serif
  - text_architecture: emotional_headline_first or address_first
  - mood_mode: ivory_studio_neutral or warm_muted_premium
  - density: lean
  - brand_visibility: whisper

### inset_image_card
- best_for: catalog page treatment, villa or amenity posters, soft premium
- default levers:
  - hero_presentation: framed_image_card
  - layout_geometry: inset_card
  - graphic_layer: image_card or thin_frame
  - type_voice: quiet_premium or premium_serif
  - text_architecture: emotional_headline_first
  - mood_mode: warm_muted_premium
  - density: lean
  - brand_visibility: elegant_signature

### swiss_grid_premium
- best_for: sharp modern premium, disciplined address-led or proposition-led communication
- default levers:
  - hero_presentation: monolith_icon or facade_crop
  - layout_geometry: swiss_grid
  - graphic_layer: thin_frame or geometric_blocks
  - type_voice: swiss_clean
  - text_architecture: address_first or proposition_first
  - mood_mode: ivory_studio_neutral
  - density: ultra_lean or lean
  - brand_visibility: visible_brand_led

### ultra_minimal_address
- best_for: boutique luxury, address prestige, one-line statement
- default levers:
  - hero_presentation: cutout_object or monolith_icon
  - layout_geometry: centered_symmetry or open_editorial_field
  - graphic_layer: none or thin_frame
  - type_voice: premium_serif
  - text_architecture: address_first or one_statement
  - mood_mode: ivory_studio_neutral
  - density: ultra_lean
  - brand_visibility: whisper

## Style Modifiers
Use 0-2 modifiers only. They adapt the base style without changing the underlying family.
Examples:
- scarcity
- dusk
- festive
- qr_ready
- compliance_footer
- family_tone
- eco_tone
- urban_tone
- boutique_luxury
- campaign_dramatic
- calm_editorial
- ad_performance
- poetic
- address_prestige

## Compatibility Rules

### Core
1. Style family must fit the asset, not just the mood.
2. text_architecture must support the persuasion mode.
3. graphic_layer must not overpower the hero.
4. density must fit the payload.
5. Do not pick a style family only because it looks nice; pick it because it suits the job and asset.
6. For ads, choose the commercial hook first, then choose the style family that carries it cleanly.

### External Input Rules
1. If a reference image exists, first decide what the strongest hero actually is before choosing style family.
2. If a reference image contains many buildings, do not assume all of them should stay equally important.
3. Template image may guide composition, graphic layer, and finish, but never identity.
4. Logo image affects brand visibility and placement discipline, not hero selection.
5. If template cue and reference truth conflict, reference truth wins.

### Strong Fits
- single_tower → centered_monolith, side_crop_premium_tower, scarcity_panel, clear_sky_statement, dusk_emotional_crop, swiss_grid_premium
- villa → watermark_catalog, inset_image_card, white_space_editorial_statement
- township_overview → masterplan_scale_reveal
- candid_presence → documentary_presence
- amenity_hero → soft_editorial_cutout, inset_image_card, watermark_catalog
- symbolic_centerpiece → symbolic_festive_field

### Weak / Invalid Fits
- township_overview + centered_monolith
- township_overview + scarcity_panel
- testimonial + giant launch slogan behavior
- site_visit_invite + monolithic luxury tower treatment
- construction_update + dusk fantasy polish
- villa + one_tower claim
- heavy regulatory payload + ultra_minimal_address unless a compliance footer is explicitly added
- any finished poster + plain scenic render logic

## Anti-Repetition Rules
Revise if:
- outputs look swappable across projects
- only color changes but structure stays the same
- every launch uses right tower + left text
- every premium poster is white background + centered tower
- every ad becomes scarcity-led
- style family is chosen but not visibly expressed in the final prompt
