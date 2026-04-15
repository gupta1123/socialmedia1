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
- Reject wrong project facts, wrong amenities, and wrong landmark leakage.
- Reject prompts where the logo becomes the main subject unless the brief explicitly requires that.
- Reject prompts that mention reference assets the bundle did not provide.
- Reject prompts that contradict the selected playbook.
- Reject prompts that use a different post-type playbook than the selected postTypeContract.
- Reject prompts where the chosen amenity image does not match the selected amenity focus, or where one amenity image is used to represent a different facility.
- For construction updates, reject generic architectural beauty shots unless they include a clear but minimal update/progress overlay.
- For construction updates, reject prompts where the building/property is not the dominant visual subject.
- For construction updates, reject software UI/dashboard/app-screen language, including cards, chips, task rows, browser chrome, form fields, or wireframe language.
- For construction updates, reject generic orange sunset/golden-hour styling unless explicitly requested or clearly aligned with the saved brand palette.
- For construction updates, reject invented dates, exact percentages, milestone claims, possession claims, prices, or RERA facts not present in the brief or project truth.
- For construction updates, allow generic visual construction cues such as organized scaffolding, unfinished facade areas, safety netting, tiny human scale, or distant site equipment only when they are used as plausible visual atmosphere and not as factual claims.
- Prefer a shorter verified prompt over a longer noisy prompt.
