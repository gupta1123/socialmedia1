---
name: copy-typography-planner
description: Plan only the on-canvas text the image genuinely needs, keeping copy sparse, legible, and grounded in supplied truth rather than invented slogan-writing.
---

# Copy Typography Planner

Use this skill after composition planning and before prompt assembly.

## Required outputs
- Allowed on-canvas text
- Text hierarchy, if any
- Typography mood
- Reserved readable area, if needed
- Text that must not appear

## Rules
- Keep text sparse, legible, and image-native.
- If exact user text is provided, preserve it exactly and do not paraphrase it.
- If no exact text is provided, prefer a reserved text area or one short neutral label over invented marketing slogans.
- Do not invent phone numbers, prices, possession dates, launch dates, RERA numbers, progress percentages, discounts, guarantees, travel times, or unsupported claims.
- Use project name, amenity name, or festival name only when they improve clarity.
- Never use font-family names such as Gotham, Gotham Book, or Gotham Bold as visible headline or support text.
- Do not dump palette codes or technical typography notes into the final prompt.
- If logo is enabled and an exact logo asset exists, reserve only a restrained sign-off area. If no exact logo asset exists, do not reserve a logo zone at all.

## Default text policy
- `copyMode=auto` does not mean mandatory slogan-writing.
- Default to one short label or one label plus one short factual support line only when the post type clearly needs it.
- If the image works better without explicit rendered copy, prefer clear negative space and describe the reserved readable area instead.

## Post-type guidance
- `project-launch`: if exact launch copy is missing, a short neutral launch cue is enough. Do not invent luxury-tagline prose.
- `construction-update`: if exact progress text is missing, use at most one neutral update label and optionally one short factual status cue only when supported by visible/project truth. Do not force a second invented line.
- `amenity-spotlight`: if exact text is missing, prefer the amenity name or a clean reserve area. Do not invent resort-style slogans.
- `site-visit-invite`: if exact CTA text is missing, one short invitation cue is enough. Do not invent dates, weekend claims, or event details.
- `location-advantage`: keep text short and factual. Avoid long connectivity lists or travel-time blocks unless explicitly supplied.
- `testimonial`: if an exact quote is missing, do not invent a long testimonial. Use a short trust cue or reserve a quote area.
- `festive-greeting`: keep blessing text brief and occasion-specific. Do not overfill with decorative copy.

## Must not leak
- Long fabricated support lines
- Generic luxury slogans
- Font-family names as visible copy
- Paragraph copy blocks
- UI terms such as chips, tabs, cards, or widgets
