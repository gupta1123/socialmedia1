---
name: style-taxonomy
description: Choose one named style family plus lever defaults and modifiers so creative routes stay distinct, premium, and reusable instead of collapsing into generic luxury layouts.
---

# Style Taxonomy

Use this skill after brief interpretation and playbook selection, before composition planning.

## Required outputs
- One `style_family`
- Zero to two `style_modifiers`
- One lever bundle:
  - `hero_presentation`
  - `layout_geometry`
  - `graphic_layer`
  - `type_voice`
  - `text_architecture`
  - `mood`
  - `density`
  - `brand_visibility`
- One anti-pattern warning for the chosen route

## Core rules
- Choose exactly one base family. Do not invent a new family every run.
- Use modifiers to tune the family, not to replace it.
- Keep the family compatible with post type, asset truth, and brief controls.
- Translate the family into concrete image behavior: crop, scale, reserve area, layering, atmosphere, and finish.
- Do not let every premium route collapse into the same tower-plus-empty-space formula.
- Do not let every emotional route collapse into blue-hour luxury drift.
- If a family cannot be supported truthfully by the available asset or brief, choose a simpler compatible family instead.
- The final prompt may express the family through visual language; do not dump raw internal taxonomy labels unless a short family phrase materially helps generation.

## Style levers
- `hero_presentation`: monolith tower, cutout object, embedded building, amenity full-frame, quote-led quiet support, symbolic festive focal, documentary site read
- `layout_geometry`: asymmetrical editorial, centered monolith, lower-third anchor, vertical split, disciplined grid, invitation-card field, corridor/context frame
- `graphic_layer`: clean field, tonal bands, restrained blocks, atmospheric depth, symbolic ornament, documentary minimal, civic/context cue
- `type_voice`: sharp premium sans, serif-sans editorial, restrained announcement, trust-led editorial, festive calligraphic restraint
- `text_architecture`: reserve-only, slogan-first, address-first, scarcity-first, status-led, invitation-led, quote-led, footer-heavy
- `mood`: calm premium, iconic assertive, dusk emotive, daylight crisp, trust documentary, warm festive, urban contextual
- `density`: minimal, balanced premium, dense but ordered, restrained compliance
- `brand_visibility`: elegant signature, footer sign-off, quiet brand block, integrated premium footer, omitted when unsupported

## Named style families

### `iconic_monolith`
- Best for: launch, late-stage project reveal, scarcity-led premium campaigns
- Defaults:
  - `hero_presentation`: monolith tower
  - `layout_geometry`: centered monolith or tall side-weighted composition
  - `graphic_layer`: clean sky plus restrained base context
  - `type_voice`: sharp premium sans
  - `text_architecture`: slogan-first or scarcity-first
  - `mood`: iconic assertive
  - `density`: balanced premium
  - `brand_visibility`: elegant signature
- Avoid: township collage, tiny building scale, decorative clutter

### `soft_editorial_cutout`
- Best for: launch, amenity, testimonial, cleaner premium announcements
- Defaults:
  - `hero_presentation`: cutout object or isolated anchored subject
  - `layout_geometry`: asymmetrical editorial
  - `graphic_layer`: pale field plus subtle tonal support
  - `type_voice`: serif-sans editorial
  - `text_architecture`: slogan-first or reserve-only
  - `mood`: calm premium
  - `density`: minimal to balanced
  - `brand_visibility`: quiet brand block or footer sign-off
- Avoid: dead white emptiness with no structure, fake luxury props

### `dusk_emotive_reveal`
- Best for: launch, site visit, water amenity, premium hero moments
- Defaults:
  - `hero_presentation`: embedded building or environment-led reveal
  - `layout_geometry`: asymmetrical reveal frame
  - `graphic_layer`: atmospheric depth and warm window contrast
  - `type_voice`: sharp premium sans
  - `text_architecture`: slogan-first or invitation-led
  - `mood`: dusk emotive
  - `density`: balanced premium
  - `brand_visibility`: elegant signature
- Avoid: fake glowing luxury fantasy, neon blue/purple drift

### `swiss_grid_premium`
- Best for: location advantage, construction announcements, testimonial, launch with harder hierarchy
- Defaults:
  - `hero_presentation`: embedded subject with disciplined crop
  - `layout_geometry`: disciplined grid
  - `graphic_layer`: tonal bands or structured blocks
  - `type_voice`: restrained announcement
  - `text_architecture`: address-first, status-led, or footer-heavy
  - `mood`: daylight crisp or urban contextual
  - `density`: dense but ordered
  - `brand_visibility`: integrated premium footer
- Avoid: dashboard UI language, route-card clutter, infographic sprawl

### `organic_shape_launch`
- Best for: softer launch posters, family-led premium housing, select amenities
- Defaults:
  - `hero_presentation`: anchored subject with soft surrounding field
  - `layout_geometry`: asymmetrical editorial with curved support zones
  - `graphic_layer`: restrained organic blocks or tonal surfaces
  - `type_voice`: serif-sans editorial
  - `text_architecture`: slogan-first
  - `mood`: warm calm
  - `density`: balanced premium
  - `brand_visibility`: footer sign-off
- Avoid: childish blobs, pastel lifestyle fluff, brochure sweetness

### `documentary_progress`
- Best for: construction update and factual milestone communication
- Defaults:
  - `hero_presentation`: documentary site read
  - `layout_geometry`: full-building progress frame or podium-progress frame
  - `graphic_layer`: documentary minimal
  - `type_voice`: restrained announcement
  - `text_architecture`: status-led or reserve-only
  - `mood`: trust documentary
  - `density`: balanced premium
  - `brand_visibility`: quiet sign-off
- Avoid: launch-beauty-shot gloss, heavy machinery spectacle, cinematic orange grading

### `landmark_context_frame`
- Best for: location advantage and project-plus-context communication
- Defaults:
  - `hero_presentation`: embedded project with one place cue
  - `layout_geometry`: corridor/context frame
  - `graphic_layer`: civic/context cue
  - `type_voice`: restrained announcement
  - `text_architecture`: address-first or reserve-only
  - `mood`: urban contextual
  - `density`: balanced premium
  - `brand_visibility`: quiet brand block
- Avoid: maps, pins, travel-time clutter, fake landmarks

### `invitation_arrival`
- Best for: site visit and welcome-led project invitation
- Defaults:
  - `hero_presentation`: approach, entrance, or frontage-led reveal
  - `layout_geometry`: lower-third anchor or arrival-led frame
  - `graphic_layer`: atmospheric depth with clear foreground access cue
  - `type_voice`: sharp premium sans
  - `text_architecture`: invitation-led
  - `mood`: calm premium or dusk emotive
  - `density`: balanced premium
  - `brand_visibility`: elegant signature
- Avoid: event-flyer energy, crowds, balloons, discount styling

### `quote_editorial_trust`
- Best for: testimonial and trust-led communication
- Defaults:
  - `hero_presentation`: quiet architectural or portrait-support backdrop
  - `layout_geometry`: editorial text-led balance
  - `graphic_layer`: clean field plus subtle framing
  - `type_voice`: trust-led editorial
  - `text_architecture`: quote-led or reserve-only
  - `mood`: calm premium
  - `density`: minimal
  - `brand_visibility`: restrained footer sign-off
- Avoid: fake review UI, loud background imagery, sales brochure clutter

### `festive_symbolic_poster`
- Best for: festive greetings and project-free symbolic routes
- Defaults:
  - `hero_presentation`: symbolic festive focal
  - `layout_geometry`: invitation-card field or emblem-led poster
  - `graphic_layer`: symbolic ornament
  - `type_voice`: festive calligraphic restraint
  - `text_architecture`: reserve-only or blessing-first
  - `mood`: warm festive
  - `density`: balanced premium
  - `brand_visibility`: quiet brand sign-off
- Avoid: property-ad takeover, repetitive dark metallic formula, architecture drift

## Modifiers
- `scarcity`: tightens hierarchy, stronger headline force, clearer premium urgency
- `boutique_luxury`: lowers noise, refines materials, increases restraint
- `calm_minimal`: removes unnecessary support elements and text load
- `family_warmth`: softens atmosphere without turning generic lifestyle
- `trust_documentary`: strips hype and increases factual realism
- `civic_context`: increases place-legibility for location-led posts
- `qr_ready`: preserves disciplined footer/compliance space
- `dusk`: shifts atmosphere toward blue-hour warmth when truthful
- `daylight`: sharpens realism and legibility
- `ornamented_festive`: allows richer festival decoration while keeping containment

## Compatibility defaults
- `project-launch`: prefer `iconic_monolith`, `dusk_emotive_reveal`, `soft_editorial_cutout`, or `organic_shape_launch`
- `construction-update`: prefer `documentary_progress` or `swiss_grid_premium`
- `amenity-spotlight`: prefer `soft_editorial_cutout`, `organic_shape_launch`, or `dusk_emotive_reveal` when the amenity supports it
- `site-visit-invite`: prefer `invitation_arrival` or `dusk_emotive_reveal`
- `location-advantage`: prefer `landmark_context_frame` or `swiss_grid_premium`
- `testimonial`: prefer `quote_editorial_trust` or `soft_editorial_cutout`
- `festival-post-playbook`: prefer `festive_symbolic_poster`

## Must not leak
- Raw lever keys dumped into the final prompt
- A new ad hoc style family invented every run
- The same composition recycled under different adjectives
- Premium-by-sunset defaulting
- Brochure clutter passed off as style variation
