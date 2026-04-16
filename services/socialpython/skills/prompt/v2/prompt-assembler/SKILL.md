---
name: prompt-assembler
description: Assemble a compact seed prompt and final prompt from the chosen strategy, truth bundle, asset roles, and composition plan.
---

# Prompt Assembler

Use this skill after planning.

## Required outputs
- Compact seed prompt
- Compact final prompt
- Explicit single-image instruction

## Rules
- Use context internally; do not dump manifests into the prompt.
- Put subject, composition, lighting, and required text behavior first.
- Mention only the facts and asset roles the image model must honor.
- Keep logo and QR instructions short and exact.
- Do not make logo placement a headline design decision. If logo is enabled, describe it only as a small supplied footer/corner signature or omit it.
- Seed prompts should be looser than final prompts, but both must stay truthful.

## CRITICAL - Describe the IMAGE, not the LAYOUT
- Your prompts go to an IMAGE GENERATION MODEL (like FAL or DALL-E), NOT to a graphic designer
- NEVER describe layout structure like "header at top", "content area in middle", "footer at bottom"
- NEVER use words like: design, create a poster, layout, structure, zones, header, footer, strip, area
- Instead describe what the IMAGE LOOKS LIKE: what is shown in the scene, how it is lit, what mood it conveys
- Think: "What would a photographer or director capture?" not "What should a designer create?"

## Prompt Writing Pattern
For the final prompt, write as if describing a photograph/artwork to someone who cannot see it:
- Start with the MAIN SUBJECT and its VISIBLE CHARACTERISTICS
- Add the SETTING and BACKDROP
- Describe LIGHTING and MOOD
- Mention TEXT ELEMENTS only as they appear visually ("bold white text reading 'LAUNCH' at top")
- End with any negative constraints (what to avoid)

## Example GOOD prompts (for FAL/DALL-E style image gen):
✅ "A premium real estate construction progress shot showing a modern apartment tower mid-construction in Pune. The tower dominates the frame with scaffolding visible on upper floors, concrete facade in warm natural daylight. Clean brand name text 'PROJECT NAME' appears at top. Minimalist composition with 80% building, 20% sky. No logos, no people."
✅ "Create a wide-angle photograph of a luxury clubhouse interior with natural light streaming through floor-to-ceiling windows. Plush seating arrangement in foreground, modern architecture throughout. Text overlay 'AMENITY' in clean sans-serif at bottom left corner."
✅ "An aerial view of a residential complex showing lush landscaping surrounding modern low-rise buildings. Sunset lighting creates warm golden tones. Small brand logo watermark at bottom right. Realistic photography style, no illustrations."

## Example BAD prompts (NEVER write these):
❌ "Design a poster with header at top, content in middle, footer at bottom"
❌ "Create a social media graphic with brand strip at top and CTA at bottom"
❌ "Layout should have the property image as hero, logo in bottom corner, text overlays in designated safe zones"
❌ "The composition uses a header zone, content zone, and footer zone"

## Asset Usage Rules (CRITICAL)
- ALWAYS use only ONE hero image in the prompt. The Brief Analyst has already selected the best asset via get_assets_for_post_type.
- If the selected hero image is an amenity reference, it must match the selected amenity focus. Never use a park image for a pool prompt, a clubhouse image for a lounge prompt, or any other facility mismatch.
- The prompt should reference: "Use the supplied [amenity/project/interior] image as the hero reference."
- Do NOT mention multiple image files or reference "Image 1", "Image 2", "Image 3", etc.
- The logo (if enabled) can be mentioned as a secondary reference for brand identity only.
- A single secondary style/context reference may be used when it materially improves layout fidelity, but never narrate references as "Image 1", "Image 2", or filename lists.
- Never include uncontrolled supporting references, mood boards, or long reference lists in the prompt.
- If no suitable asset is available for the post type, say "no reference image available" and generate from the brief alone.

### Post type asset selection:
- amenity-spotlight: Use the amenity image as hero. Reference it as "the amenity reference image".
- construction-update: Use the construction progress image as hero. Reference it as "the project construction reference".
- project-launch: Use the project exterior/elevation as hero. Reference it as "the project reference".
- site-visit-invite: Use the project exterior as hero. Reference it as "the site reference".
- location-advantage: Use the aerial/street view as hero. Reference it as "the location reference".
- festive-greeting: Can be standalone (no hero image) or use an interior/generic reference as mood anchor.

## Construction update specific
- For construction updates with a project anchor, say: "Use the supplied project image as the identity reference."
- For construction updates, preserve tower silhouette, massing, facade rhythm, podium proportions, balcony language, and recognizable project identity.
- For construction updates, start from a property-first brief: "Create a premium full-bleed real-estate construction update image for [project name]."
- For construction updates, make the project/construction image dominate the frame and add only minimal brand-colored overlay elements: project name, one clean construction update headline, one short progress/status line, and optionally a slim footer/proof line.
- For construction updates, mention the saved brand palette explicitly and apply it to typography, overlay tint, divider lines, and small accents.
- For construction updates, request realistic daylight or clean overcast premium light by default. Do not default to orange sunset, fake glow, or oversaturated amber grading.
- If the brief includes a progress percentage or stage, say to visually suggest that approximate construction stage without inventing unsupported labels.
- Do not let construction-update prompts collapse into generic "premium architectural close-up" language.
- Do not use close-up/detail framing for construction updates unless explicitly requested.
- Do not use software UI, dashboard, app screen, card, chip, task board, browser, form field, or wireframe language.
