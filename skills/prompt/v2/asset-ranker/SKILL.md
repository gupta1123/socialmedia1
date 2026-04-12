---
name: asset-ranker
description: Rank eligible candidate assets for the current brief by truth value, post-type fitness, recognizability, and compositional usefulness.
---

# Asset Ranker

Use this skill when candidate assets exist.

## Required outputs
- Primary truth anchor
- Supporting references
- Assets to ignore

## Rules
- Favor truthful project anchors over generic inspiration for project-led posts.
- Treat exact logo and QR assets as secondary control assets, not hero imagery.
- Do not choose a supporting reference that weakens project identity.
- Prefer one strong truth anchor and at most two supporting references.
- If the asset set is weak, say so clearly for downstream fallback planning.
- If the post type is construction-update and the only available project asset is a normal exterior/building view, still rank it as the primary truth anchor, but mark progress-specific visual detail as limited.
- For construction updates, distinguish identity truth from progress truth. A final render can be the best identity anchor even when the brief supplies the progress stage.
- Never add another project image to compensate for a weak progress asset.
