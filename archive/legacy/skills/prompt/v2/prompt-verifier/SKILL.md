---
name: prompt-verifier
description: Verify that the assembled prompt matches truth, asset roles, and post intent while staying concise, scene-first, and free of compiler/meta leakage.
---

# Prompt Verifier

Use this skill last.

## Checkpoints
- Correct project, amenity, or intentionally project-free route
- Correct post-type strategy
- Style-family fidelity and poster readiness
- Variation distinctiveness when more than one route is returned
- No unsupported claims
- No conflicting asset roles
- No composition contradictions
- No compiler/meta leakage

## Rules
- Resolve conflicts in this order: exact asset contract, exact required text, compliance and factual bans, selected playbook, project or festival truth, brand hard rules, brand soft preferences, variation styling.
- Reject prompts that let soft brand styling override hard truth.
- Reject prompts that say “premium”, “editorial”, “iconic”, or “emotional” without translating those into concrete composition, reserve, atmosphere, or graphic-field behavior.
- Reject wrong project facts, wrong amenities, wrong landmarks, and wrong stage cues.
- Reject prompts that mention a logo, QR, brand mark, monogram, or signature asset when no exact asset is supplied.
- Reject prompts that place the logo on a hard white or solid backing card, badge, chip, pill, banner, floating tile, or sticker-like plate.
- Reject prompts that use font-family names or palette hex values as visible prompt text.
- Reject prompts that leak raw `style_family`, modifier, or lever-key language into the final prompt.
- Reject prompts that mention raw asset IDs, filenames, reference lists, “Image 1 / Image 2”, truth-bundle language, playbook names, or other compiler-internal phrasing.
- Reject prompts that are mostly layout scaffolding and too weak on subject, scene, and preserved truth.
- Reject prompts that behave like raw hero-image briefs when the route clearly needs a finished poster or finished social creative.
- Reject prompts that invent slogans or long support lines when no exact text or factual cue supports them.
- Reject multi-variation sets that collapse into the same family, crop logic, and text-reserve behavior under different wording.
- For text-bearing posts, allow a reserved readable area instead of forcing fully written copy when exact wording is not supplied.
- Prefer a shorter verified prompt over a longer noisy prompt.

## Post-type checks
- `project-launch`: reject bland architecture descriptions that lose launch energy, drift into generic skyline fantasy, or claim an iconic/editorial route while still reading like the same generic tower-leftover-space poster.
- `construction-update`: reject generic beauty shots, completed launch-state buildings, unsupported percentages or milestone claims, and generic stock construction sites that no longer preserve the same project identity.
- `amenity-spotlight`: reject prompts where the selected amenity is not the dominant subject or where another facility stands in for the chosen amenity.
- `site-visit-invite`: reject event-flyer behavior, fake crowds, invented schedules, or invitation routes that stop feeling project-led.
- `location-advantage`: reject map-screenshot logic, dense travel-time lists, or invented connectivity claims.
- `testimonial`: reject fake review badges, platform UI, long fabricated quotes, or overpowering background imagery.
- `festival-post-playbook`: reject project-ad drift unless the brief explicitly requests project linkage.

## Must not leak
- Dashboard/UI language
- Template-editor phrasing
- Contact-sheet or multi-poster wording
- Asset-id or filename references
