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

## Brand Colors & Typography (MANDATORY for ALL post types, with festive exception behavior)
- You MUST apply the brand palette (primary, secondary, accent, neutrals) to ALL visual elements: typography, overlay tints, divider lines, accent elements, graphic embellishments, and any symbolic/festive decorations.
- Typography must feel premium and cohesive with the image - the fonts should look like they belong in the scene, not pasted on top of it.
- Brand colors should guide the overall color grading and mood of the image so text and visuals feel unified.
- When specifying text elements, use the brand's font style to describe them (e.g., "bold Gotham sans-serif text" or "clean contemporary typography").
- For FESTIVE GREETINGS without text overlays: Incorporate brand colors into the festive imagery itself (e.g., diyas/flames in brand accent color, rangoli patterns using brand palette, festive decorations in brand colors, or overall color grading that reflects the brand palette).
- For ALL post types: The brand's imageTreatment (e.g., "warm natural light", "premium realism") should guide the photography style and lighting mood.
- FESTIVE GREETING EXCEPTION: The festival remains the hero. Brand influence should mostly show up as palette discipline, restraint, finish quality, spacing, and subtle sign-off treatment. Do not let brand typography or premium lifestyle styling turn the prompt into an interior scene, architectural still life, or project ad.
- FESTIVE GREETING EXCEPTION: Use 4-5 softened curated colors when the festival truth benefits from it. Do not collapse festive or patriotic posters into brand-only dual-tone unless the brief explicitly asks for a monochrome or two-tone route.

## Logo Integration (MANDATORY when logo is enabled)
- The brand logo must integrate SEAMLESSLY with the image - it should look like it belongs in the scene, NOT like a sticker or clip-art pasted on top.
- NEVER describe a white or solid-color background behind the logo - the logo must appear with transparency/knockout against the image.
- If the image has a light/white sky or background, use a version of the logo that has good contrast (e.g., dark logo on light areas, or light logo on dark areas).
- Position the logo subtly: small footer corner, bottom-right signature zone, or integrated into the design in a way that feels natural to the scene.
- The logo should enhance brand recognition without distracting from the main subject.
- Never say "logo on a white background" or "logo with white backing" - instead say the logo should be placed where it naturally contrasts with the image.

## CRITICAL - Describe the IMAGE, not the LAYOUT
- Your prompts go to an IMAGE GENERATION MODEL (like FAL or DALL-E), NOT to a graphic designer
- NEVER describe layout structure like "header at top", "content area in middle", "footer at bottom"
- NEVER use words like: design, create a poster, layout, structure, zones, header, footer, strip, area
- Instead describe what the IMAGE LOOKS LIKE: what is shown in the scene, how it is lit, what mood it conveys
- Think: "What would a photographer or director capture?" not "What should a designer create?"
- FESTIVE GREETING EXCEPTION: For `festival-post-playbook`, you may use poster-archetype language such as invitation-card composition, central icon poster, framed poster, greeting plaque, airy header space, or contained devotional graphic, because that route is intentionally poster-first rather than photography-first. Even then, keep the prompt concise and visual, not like designer instructions.
- FESTIVE GREETING EXCEPTION: Unless the brief explicitly asks for photography, do not use shot-language such as studio quality, shallow depth of field, top-down shot, wide-angle interior, prop styling, or cinematic still-life phrasing.
- FESTIVE GREETING EXCEPTION: Do not default to the same centered emblem/card on a dark solid background. Vary poster logic and allow asymmetry, bands, framing systems, and layered color-fields where appropriate.

## Prompt Writing Pattern
For the final prompt, write as if describing a photograph/artwork to someone who cannot see it:
- Start with the MAIN SUBJECT and its VISIBLE CHARACTERISTICS
- Add the SETTING and BACKDROP
- Describe LIGHTING and MOOD
- Mention TEXT ELEMENTS only as they appear visually ("bold white text reading 'LAUNCH' at top")
- End with any negative constraints (what to avoid)

## Example GOOD prompts (for FAL/DALL-E style image gen):
✅ "A premium real estate construction progress shot showing a modern apartment tower mid-construction in Pune. The tower dominates the frame with scaffolding visible on upper floors, concrete facade in warm natural daylight. Bold text 'CONSTRUCTION UPDATE' in clean sans-serif at top, with smaller support line 'Structures rising steadily' below it. Minimalist composition with 80% building, 20% sky. Small brand logo at bottom right."
✅ "Create a wide-angle photograph of a luxury clubhouse interior with natural light streaming through floor-to-ceiling windows. Plush seating arrangement in foreground, modern architecture throughout. Bold headline 'YOUR PRIVATE OASIS' in clean sans-serif at bottom, support line 'Swimming Pool | Clubhouse' below. Realistic photography style."
✅ "A festive Diwali poster featuring an elegant diya arrangement with warm golden light. Bold greeting text 'Happy Diwali' in refined sans-serif centered, with soft support line 'Festival of Lights' below. Premium muted color palette. Small brand logo watermark at bottom right."

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
- festive-greeting: Prefer standalone symbolic/illustrative poster logic by default. Do not default to an interior, architectural vignette, marble styling surface, or luxury lifestyle scene unless the brief explicitly asks for that direction.

## Construction update specific
- For construction updates with a project anchor, say: "Use the supplied project image as the identity reference."
- For construction updates, preserve tower silhouette, massing, facade rhythm, podium proportions, balcony language, and recognizable project identity.
- For construction updates, start from a property-first brief: "Create a premium full-bleed real-estate construction update image."
- **TEXT ON IMAGE IS MANDATORY - NEVER OMIT TEXT**
- **The image MUST have TWO separate text elements:**
  1. HEADLINE: Bold, large text at top or center. Examples: "CONSTRUCTION UPDATE" or "SITE PROGRESS" or "WORK IN PROGRESS" or "ON-SITE PROGRESS"
  2. SUPPORT LINE: Smaller text BELOW the headline. Examples: "Structures rising at Level 15" or "Modern living taking form" or "Progressing steadily towards your future home" or "Excellence under construction"
- **INCORRECT: "Bold white text reading 'Site Progress'"** - this is only ONE text element
- **CORRECT: "Bold white text 'SITE PROGRESS' at top, with smaller support line 'Modern living taking form' below"**
- The headline and support line must be described as SEPARATE text elements in the prompt
- For construction updates, mention the saved brand palette explicitly and apply it to typography, overlay tint, divider lines, and small accents.
- For construction updates, request realistic daylight or clean overcast premium light by default. Do not default to orange sunset, fake glow, or oversaturated amber grading.
- If the brief includes a progress percentage or stage, say to visually suggest that approximate construction stage without inventing unsupported labels.
- Do not let construction-update prompts collapse into generic "premium architectural close-up" language.
- Do not use close-up/detail framing for construction updates unless explicitly requested.
- Do not use software UI, dashboard, app screen, card, chip, task board, browser, form field, or wireframe language.
