---
name: post-type-selection
description: Interpret the selected real-estate post type and convert it into layout, CTA, and content constraints.
---

# Post Type Selection

Use this skill whenever a post type is provided.

## Principles
- Do not treat all posts as generic announcements.
- The chosen post type defines the creative job to be done.
- The post type provides the frame, but the user's brief still controls the specific scene, lighting, mood, and framing unless that would break compliance or factual accuracy.

## Mapping Guidance
- `project-launch`: premium reveal, property-image / facade-led hero, strong name presence, sparse supporting copy, building image stays dominant.
- `amenity-spotlight`: spotlight one amenity at a time. If the brief explicitly names an amenity, use that one; otherwise choose one from the project's amenity pool and keep the whole creative focused on that single amenity.
- `location-advantage`: directional information, connectivity, context.
- `site-visit-invite`: direct CTA, booking-safe zones, urgency without cheapness, and a project-image-led invite composition so the real property carries trust.
- `construction-update`: trust, realism, milestone clarity, project-image-led progress poster, premium metric band or progress panel, no generic stock construction collage.
- `testimonial`: quote readability, attribution hierarchy, warmth.
- `festive-greeting`: premium greeting-poster composition with culturally specific cues, sparse text, generous negative space, and no default project-ad clutter.

## Output Expectations
- Carry post type into prompt summary.
- Respect configured safe-zone guidance and required brief fields.
- Align CTA energy with the post type rather than using one generic sales tone.
- For `project-launch` and `construction-update`, write detailed image-spec prompts with explicit hero-image treatment, layout hierarchy, overlay guidance, supporting panel/footer treatment, and a short negative prompt.
- For `project-launch` and `construction-update`, vary the composition family across briefs. Do not reuse one canned sample layout or identical copy skeleton every time.
- For `amenity-spotlight`, never turn the output into a many-amenity collage unless the brief explicitly asks for that. One image should usually equal one amenity.
- For `site-visit-invite`, preserve a clean protected CTA zone and keep the building image as the main trust anchor.
