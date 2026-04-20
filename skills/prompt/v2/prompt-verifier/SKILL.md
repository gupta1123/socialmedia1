---
name: prompt-verifier
description: Verify that the assembled prompt matches project truth, post intent, asset roles, compliance, and composition coherence before output.
---

# Prompt Verifier

Use this skill last.

## Checkpoints
- Correct project or intentionally project-free
- Correct post type strategy
- No unsupported claims
- No conflicting asset roles
- No composition contradictions
- No multi-poster or contact-sheet language

## Rules
- Resolve conflicts in this order: exact asset contract, exact required text, compliance and factual bans, selected playbook, project or festival truth, brand hard rules, brand soft preferences, variation styling.
- Reject prompts that violate that precedence order or let soft brand styling override hard truth.
- Reject wrong project facts, wrong amenities, and wrong landmark leakage.
- Reject prompts where the logo becomes the main subject unless the brief explicitly requires that.
- Reject prompts that mention a logo, brand mark, monogram, emblem, or brand-signature asset when no exact logo asset is supplied.
- Reject prompts that place the logo on a hard white or solid backing card, badge, chip, pill, banner, floating tile, or sticker-like plate.
- Reject prompts that describe the logo as a pasted footer card instead of an integrated signature/sign-off treatment.
- Reject prompts that mention reference assets the bundle did not provide.
- Reject prompts that use a font family name such as Gotham, Gotham Book, or Gotham Bold as literal visible headline/support text instead of as typography styling.
- Reject prompts that contradict the selected playbook.
- Reject prompts that use a different post-type playbook than the selected postTypeContract.
- Reject prompts where the chosen amenity image does not match the selected amenity focus, or where one amenity image is used to represent a different facility.
- Reject prompts that are so generic they do not describe a finished poster structure.
- Reject prompts for text-bearing post types that do not provide a clear text hierarchy and a readable reserved text region.
- Reject prompts that over-describe copy but under-specify subject dominance, spatial hierarchy, and image structure.
- Reject prompts that slip into UI, template-editor, dashboard, multi-column, or wireframe language.
- For construction updates, reject generic architectural beauty shots unless they include a clear but minimal update/progress overlay.
- For construction updates, reject prompts where the building/property is not the dominant visual subject.
- For construction updates, reject prompts that preserve a completed-looking or launch-like building state when the brief asks for visible progress.
- For construction updates, reject prompts that fail to say the supplied project image is identity truth while the brief controls the construction stage.
- For construction updates, reject prompts that drift into a generic construction site which no longer preserves the recognizable supplied project silhouette, massing, and facade character.
- For construction updates, when the brief provides a stage cue such as 50%, reject prompts that ignore that cue or fail to translate it into believable visible progress logic.
- For construction updates, reject software UI/dashboard/app-screen language, including cards, chips, task rows, browser chrome, form fields, or wireframe language.
- For construction updates, reject generic orange sunset/golden-hour styling unless explicitly requested or clearly aligned with the saved brand palette.
- For construction updates, reject invented dates, exact percentages, milestone claims, possession claims, prices, or RERA facts not present in the brief or project truth.
- For construction updates, allow generic visual construction cues such as organized scaffolding, unfinished facade areas, safety netting, tiny human scale, or distant site equipment only when they are used as plausible visual atmosphere and not as factual claims.
- Prefer a shorter verified prompt over a longer noisy prompt.
