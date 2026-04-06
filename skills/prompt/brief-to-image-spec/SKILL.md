---
name: brief-to-image-spec
description: Convert a social image brief into a structured visual specification with a clear objective, focal subject, hierarchy, and safe zones.
---

# Brief To Image Spec

Use this skill to translate a user brief into a visual production spec.

## Required Outputs
- Main visual objective
- Focal subject
- Message hierarchy
- Layout/safe-zone guidance
- Platform-native framing

## Rules
- The first decision is not style. It is what the image must communicate in one glance.
- The output should feel specific to the requested channel and format.
- Keep enough negative space for headline, subhead, or CTA placement when text may be added later.
- Prefer one primary idea over a cluttered collage.
- Treat explicit user brief directions such as sunset, night view, moody light, calm tone, aerial angle, close-up framing, minimal composition, or dramatic skyline as first-class controls, not optional adjectives.
- When the brief includes a concrete visual condition, carry it into the image spec directly instead of letting the default post-type recipe wash it out.
- If the selected post type is `project-launch` or `construction-update`, treat the real project image as the hero element whenever it is available and build the hierarchy around that image instead of generic architecture.
- For project-led real-estate posts, specify overlay treatment, headline zone, supporting panel/footer treatment, and one short negative prompt so the final image prompt is detailed enough for multimodal generation.
- If the selected post type is `amenity-spotlight`, lock the image to one amenity only. Use the amenity named in the brief when explicit; otherwise choose one from the project amenity pool and build the whole image around that one subject.
