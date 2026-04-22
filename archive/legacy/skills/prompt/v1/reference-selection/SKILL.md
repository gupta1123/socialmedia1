---
name: reference-selection
description: Decide whether uploaded references, generated style seeds, or both should anchor the final generation request.
---

# Reference Selection

Use this skill before final image generation.

## Reference Priority
1. Selected generated style seed
2. Uploaded brand references tied to the brief
3. Existing brand logo/product assets

## Rules
- Use exactly one primary template/source anchor and no more than two supporting references.
- Finals should not be generated without at least one reference path.
- If uploaded references are stylistically inconsistent, extract common traits rather than copying every detail.
- Generated seeds are preferred for overall art direction; uploaded references are preferred for brand truth.
- For `project-launch` and `construction-update`, prefer the actual project building / construction image as the supporting reference before generic inspiration. Those post types should stay truth-led and project-image-led.
- Exception: `festive-greeting` should not require uploaded references by default. Prefer prompt-led style seeds first, and only use project or brand imagery if the brief explicitly asks for a project-linked festive post.
