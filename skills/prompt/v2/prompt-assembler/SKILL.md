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
