---
name: briefly-social-qa
description: Final QA skill covering business-job fit, style-family fidelity, lever coherence, asset grounding, hierarchy, external-input handling, and anti-repetition checks.
metadata:
  version: "5.1.0"
  tags: ["real-estate", "social-media", "qa", "style-fidelity", "asset-truth", "hierarchy"]
---

# Briefly Social QA

Use this skill for final critique before output.

## Part A — Job / Style Separation Check
Always ask:
1. Is the communication job clear?
2. Is the style family clear?
3. Are they correctly matched?
4. Is the result repeating a default layout instead of using the chosen style system?

A post may be correct in post type and still fail because the style behavior is stale, generic, or mismatched.

## Part B — Copy / Visual Hierarchy

### Headline Guidance
- one_statement: 2-6 words, poster-like, visually dominant
- proposition_first: one big idea + one short support line
- scarcity_first: one scarcity claim dominates, no feature-list clutter
- emotional_headline_first: softer, slightly longer, calmer imagery
- philosophy_first: headline + short paragraph, needs breathing room
- quote_first: quote is the hero, not the building

### Density
- ultra_lean: brand + statement + optional small footer
- lean: brand + project + headline + one support
- medium: + configuration/location/contact
- heavy / regulation_heavy: structured footer, subordinate to main headline

### Footer Rules
Footer supports, never dominates.
RERA/contact/QR must stay subordinate unless brief demands compliance emphasis.

### Placement
- side-crop posters need a designed copy field, not random empty sky
- monolith posters need headline/tower separation
- inset-card posters need clear outer structure
- dusk posters need lighter, calmer copy behavior
- finished posters must integrate text into composition rather than leaving generic room for later text

## Part C — Asset Grounding

### Core Rules
1. Never invent filenames.
2. Never use an unavailable asset as if it exists.
3. Prefer one strong primary anchor over many weak anchors.
4. Preserve actual architecture, amenity design, construction state, and site context.
5. If style family requires different asset behavior than available, change style family first.
6. If delivery_mode is finished_poster, do not fall back to scenic hero-image logic.

### External Input Checks
1. If a reference image exists, the project must remain recognisable relative to that image.
2. Safe improvements are allowed: crop, angle refinement, realism polish, hierarchy, atmosphere.
3. Unsafe changes are not allowed: altered facade identity, altered tower count, altered construction stage, invented amenity geometry.
4. If a template image exists, check that it shaped style only, not identity.
5. If a logo image exists, check that the logo is treated as exact, not stylized or rewritten.

### Asset Tiers
- T1: exact project anchor
- T2: same-project support
- T3: same-brand contextual
- T4: symbolic/graphic-led
- T5: forbidden substitute

### Post-Type Asset Rules
- project_launch: prefer T1; use T2 or T4 only when strategy allows
- construction_update: require T1 real progress
- festival_post: T4 symbolic often strongest
- testimonial: authentic support or T4 editorial background
- ad: strongest desirability from T1/T2
- site_visit_invite: require real credibility if visit is implied
- amenity_spotlight: exact amenity first

### Fallback Logic
- no strong launch hero → shift style family before inventing detail
- weak side-crop asset → centered_monolith or cutout_object treatment
- truthful asset visually weak → improve through crop, hierarchy, mood, and device; never through invention

## Part D — Style Family Fidelity
Check whether the final prompt visibly behaves like the selected style family.

Examples:
- soft_editorial_cutout should show a cutout/object behavior plus calm field plus graphic softness
- centered_monolith should show central icon presence and sparse hierarchy
- scarcity_panel should show a claim block and strong exclusivity structure
- watermark_catalog should feel like a catalog page, not an ad panel
- swiss_grid_premium should show alignment discipline, not blob-led softness

Revise if the style family is only named but not manifested.

## Part E — Quality Critic

Critique in this order:

### 1) Business Job
Is the job obvious at a glance?

### 2) Hero
Is there a clear hero?
Is it actually dominant?

### 3) Hierarchy
What is read first / second / third?
Is text architecture suited to payload?

### 4) Style Coherence
Do hero, layout, graphic layer, type voice, mood, and density feel like one family?

### 5) Freshness
Does the prompt avoid default repeated patterns?
Would it produce something distinct from recent outputs?

### 6) Market Fit
Too editorial for the developer?
Too builder-ish for boutique?
Too experimental for weak assets?

### 7) Truth
Project still recognisable?
Any false completion, false amenity, or false scale implied?

## Revision Triggers
Revise if:
- no singular dominant idea
- belongs to any random project
- genericized architecture
- copy too long for chosen structure
- repetitive composition
- brochure / flyer / Canva feel
- premium only in words, not in structure
- result feels like a plain hero image with normal text
- composition has no real poster logic
- text appears simply placed onto a render
- there is no meaningful graphic or editorial design layer
- output feels like a base visual rather than a finished asset
- chosen style family is not visibly executed
- template image is likely to override project identity
- logo could be distorted or rewritten

## Final Approval Standard
Approve only if:
- clear
- on-strategy
- recognisable
- style-distinct
- immediately usable
- unmistakably poster-grade rather than base-visual-grade
