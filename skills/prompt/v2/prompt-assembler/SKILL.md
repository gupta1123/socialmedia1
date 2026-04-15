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

## Asset Usage Rules (CRITICAL)
- ALWAYS use only ONE hero image in the prompt. The Brief Analyst has already selected the best asset via get_assets_for_post_type.
- If the selected hero image is an amenity reference, it must match the selected amenity focus. Never use a park image for a pool prompt, a clubhouse image for a lounge prompt, or any other facility mismatch.
- The prompt should reference: "Use the supplied [amenity/project/interior] image as the hero reference."
- Do NOT mention multiple image files or reference "Image 1", "Image 2", "Image 3", etc.
- The logo (if enabled) can be mentioned as a secondary reference for brand identity only.
- Never include supporting references, mood boards, or additional reference images in the prompt.
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
