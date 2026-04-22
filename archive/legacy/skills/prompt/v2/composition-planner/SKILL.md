---
name: composition-planner
description: "Plan the image structure with scene-first logic: subject dominance, framing, context, and only the text reserve or sign-off treatment the image actually needs."
---

# Composition Planner

Use this skill before prompt assembly.

## Required outputs
- Hero subject hierarchy
- Framing and vantage choice
- Environmental/context logic
- Style-family translation into composition behavior
- Negative-space or text-reserve plan only when needed
- Logo / QR edge treatment only when exact assets are enabled

## Rules
- Start with the scene, not the layout.
- One image, one dominant subject, one coherent composition.
- The hero subject must stay unmistakable at thumbnail size.
- If `style-taxonomy` has been loaded, honor the chosen `hero_presentation`, `layout_geometry`, `graphic_layer`, `density`, and `brand_visibility`.
- Use one clear poster archetype per route. Do not mix editorial cutout logic, monolith-tower logic, and grid-announcement logic in the same frame.
- Prefer natural negative space already present in the scene over invented graphic boxes.
- Describe camera bias, crop, depth, and environmental context only when they materially affect the generated image.
- If text is needed, reserve one clean readable region. Do not design a full template system.
- Structured poster geometry is allowed when the chosen family needs it: tonal bands, disciplined footer zones, quiet blocks, or invitation-card containment. Keep it visual, not UI-like.
- Do not let every project-led route default to tower-right plus blank-left. Let the chosen family actually change the balance of the frame.
- If logo or QR is needed, integrate it into an existing quiet edge, footer, or tonal sign-off zone. Never float it inside a white card, chip, pill, badge, banner, or sticker-like block.
- Avoid layout-editor language such as grid, module, panel stack, browser chrome, dashboard card, or wireframe region.

## Post-type defaults
- `project-launch`: let the building lead. Use a confident reveal frame with breathable headline space, not brochure density.
- `construction-update`: use medium-wide or full-building framing so both progress cues and project identity are legible. Favor near full-bleed property imagery with one restrained update zone.
- `amenity-spotlight`: keep the named amenity dominant. Any building or township context must stay secondary and quiet.
- `site-visit-invite`: favor arrival, entry, approach, or welcoming project-led framing rather than event-flyer staging.
- `location-advantage`: use one project/context image and one disciplined place cue rather than infographic mapping.
- `testimonial`: keep the background quiet and supporting. Do not let decorative imagery compete with the quote or reserved quote area.
- `festival-post-playbook`: vary the poster archetype. Do not collapse every route into a centered emblem on a dark field.

## Must not leak
- Generic poster-template scaffolding
- Multi-card overlays
- Dashboard sections or app-like panels
- Dense infographic structure
- Safe-zone language that overwhelms subject description
