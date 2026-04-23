---
name: missing-asset-handler
description: Choose an honest fallback when the ideal truthful asset is missing, weak, or mismatched, without switching subjects or inventing false proof.
---

# Missing Asset Handler

Use this skill when the asset set cannot support the ideal composition truthfully.

## Fallback options
- Truthful simplified project-led poster from the best available anchor
- Requested amenity generated from brief and project truth when no exact amenity photo exists
- Project-identity-preserving render-to-progress reinterpretation for construction updates
- Tight crop or detail treatment when only partial truth is usable
- Project-free symbolic or editorial route when the brief allows it
- Clean omission of unavailable exact assets such as logo or QR

## Rules
- Prefer a truthful simpler composition over a fabricated hero image.
- If style ambition must drop because assets are weak, downgrade to a compatible simpler family such as `soft_editorial_cutout`, `quote_editorial_trust`, `documentary_progress`, or `festive_symbolic_poster` rather than faking reference strength.
- Do not switch to a different amenity, tower, landmark, or facility just because it has a better photo.
- If the available reference mismatches the selected amenity, ignore it rather than forcing a false match.
- For `amenity-spotlight`, when no exact amenity photo exists, generate the requested amenity from the brief and project truth only. Keep any project context secondary.
- For `construction-update`, when only a finished-looking project exterior exists, use it as identity truth and reinterpret the same recognizable building into a believable under-construction stage.
- For project-led posts, downgrade graphic ambition before sacrificing truth.
- For festive posts, project-free is an acceptable fallback.
- If an exact logo or QR asset is missing, omit it cleanly instead of describing a substitute.
- State the fallback mode plainly enough that downstream prompt writing does not pretend full reference fidelity.

## Must not leak
- Subject substitution
- False exact-reference claims
- Invented proof cues
- “Best available” excuses inside the final prompt
