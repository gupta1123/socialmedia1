---
name: prompt-assembler
description: Assemble a compact final prompt from the chosen strategy, truth bundle, asset roles, and composition plan.
---

# Prompt Assembler

Use this skill after planning.

## Required outputs
- Compact final prompt
- Explicit single-image instruction

## Rules
- Use context internally; do not dump manifests into the prompt.
- Resolve conflicts in this order: exact asset contract, exact required text, compliance and factual bans, selected playbook, project or festival truth, brand hard rules, brand soft preferences, variation styling.
- Put subject, composition, spatial hierarchy, lighting, and required text behavior first.
- Mention only the facts and asset roles the image model must honor.
- Keep logo and QR instructions short and exact.
- Do not make logo placement a headline design decision. If logo is enabled, describe it only as a small supplied footer/corner signature or omit it.
- If logo is enabled, treat it as an integrated sign-off, not a pasted-on element.
- Mention logo usage only when an exact supplied logo asset is present. If no exact logo asset is present, do not describe, reserve, or invent any logo, brand mark, monogram, emblem, or branding signature.
- If a logo is included, prefer transparent-edge placement directly on the composition or within a subtle tonal footer/signature band that already belongs to the poster.
- Never ask for a hard white or solid rectangular card, badge, chip, pill, banner, floating tile, backing plate, or sticker behind the logo.
- If clean contrast is not possible, prefer a quiet local contrast zone or clean omission over a forced container.
- Spatial hierarchy and concise poster-spec language are allowed when they materially affect generation quality: headline region, support-line region, CTA-safe reserve, footer or signature treatment, and negative-space planning.
- Do not write like a design tool or template editor. Avoid grid instructions, multi-column UI language, dashboard cards, chips, browser chrome, form fields, or wireframe phrasing.
- Keep brand treatment disciplined. Use brand palette, typography mood, and image treatment as creative controls, not as an excuse to override the brief or selected playbook.
- Treat font family names as styling metadata only. Never use a font name such as Gotham, Gotham Book, or Gotham Bold as visible headline/support text.
- For `festival-post-playbook`, let the festival remain the hero. Brand guidance should act mainly as finish quality, palette discipline, typography control, and subtle sign-off treatment.
- For `construction-update-playbook`, treat the supplied project image as identity truth. Preserve the same building identity, but if the brief asks for progress, describe that same building as a believable under-construction version instead of keeping a finished launch-state appearance.

## Prompt Writing Pattern
Write the final prompt in this order:
- Output type and campaign intent
- Hero subject and any required preserved reference truth
- Spatial hierarchy and text behavior
- Lighting, mood, finish quality, and brand treatment
- Negative constraints

For text-bearing prompts:
- Describe the visible text hierarchy and where readable space is reserved.
- Preserve exact user-provided text exactly.
- If text is not required, prefer clean negative space over forced typography.

For construction-update prompts:
- Make it explicit that the same recognizable project is being shown in a requested construction/progress stage.
- If the brief includes a progress cue such as 50%, convert that into believable visual state language instead of generic finished-building language.
- Prefer project-identity-preserving progress cues over generic construction-stock cues.

For logo and QR handling:
- Treat logo and QR as exact supplied assets only.
- If the exact logo asset is not supplied, omit logo instructions entirely and do not reserve a fake logo/signature zone.
- Keep logo treatment subtle and embedded in the overall poster finish unless the brief explicitly makes it prominent.
- Preserve the exact logo asset proportions and transparent edges where available.
- Never invent a white backing plate, sticker treatment, substitute mark, or separate logo card behind the asset.
- Avoid footer/logo treatments that read like UI tiles, chips, pills, badges, or pasted labels.

## Asset Usage Rules (CRITICAL)
- ALWAYS use only ONE hero image in the prompt. The Brief Analyst has already selected the best asset via get_assets_for_post_type.
- If the selected hero image is an amenity reference, it must match the selected amenity focus. Never use a park image for a pool prompt, a clubhouse image for a lounge prompt, or any other facility mismatch.
- The prompt should reference: "Use the supplied [amenity/project/interior] image as the hero reference."
- Do NOT mention multiple image files or reference "Image 1", "Image 2", "Image 3", etc.
- The logo (if enabled) can be mentioned as a secondary reference for brand identity only.
- A single secondary style/context reference may be used when it materially improves the final image, but never narrate references as "Image 1", "Image 2", or filename lists.
- Never include uncontrolled supporting references, mood boards, or long reference lists in the prompt.
- If no suitable asset is available for the post type, say "no reference image available" and generate from the brief alone.
