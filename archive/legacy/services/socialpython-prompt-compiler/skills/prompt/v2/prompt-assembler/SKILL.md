---
name: prompt-assembler
description: Assemble a compact scene-first final prompt from the chosen strategy, truth bundle, and asset roles without leaking internal compiler language.
---

# Prompt Assembler

Use this skill after planning.

## Required outputs
- Compact final prompt
- Explicit single-image instruction

## Rules
- Write for the image model, not for the compiler.
- Use context internally; do not dump manifests, tool outputs, playbook names, asset IDs, filenames, or reference lists into the final prompt.
- Resolve conflicts in this order: exact asset contract, exact required text, compliance and factual bans, selected playbook, project or festival truth, brand hard rules, brand soft preferences, variation styling.
- Lead with subject truth and scene logic before text treatment.
- If `style-taxonomy` has been loaded, translate the selected family and lever bundle into concrete visual behavior: hero scale, crop balance, reserve area, graphic field, density, and sign-off treatment.
- Mention only the facts the image model must honor.
- Prefer plain visual language over design-tool jargon.
- Brand guidance should shape finish, restraint, and overlay taste. It should not drown the prompt in palette codes or font-family metadata.
- If no exact text is supplied, prefer a reserved readable area or a short neutral label over invented slogan-writing.
- Keep logo and QR instructions short, exact, and secondary.
- Mention logo usage only when an exact logo asset is present and enabled.
- Mention QR usage only when an exact QR asset is present and enabled.
- If no suitable reference exists, write a truthful generation route from the brief and known project/festival truth. Do not say “no reference image available” in the final prompt.
- For text-bearing social posts, aim for a finished poster route when the brief or post type implies it. Do not stop at a raw hero-image brief with vague empty-space language.

## Prompt writing pattern
Write the final prompt in this order:
- Output type, campaign intent, and poster mode
- Hero subject and preserved identity truth
- Scene/framing/environmental logic
- Poster archetype / graphic field / readable reserve behavior when materially useful
- Text behavior only if needed
- Finish quality, light, and restrained brand influence
- Negative constraints

## Text behavior
- Preserve exact user-provided text exactly.
- If exact text is not provided, keep text guidance minimal.
- Describe one reserved readable region when that helps generation.
- Do not force a headline-plus-support-line pair unless the brief or truth clearly requires it.
- Never use font-family names such as Gotham, Gotham Book, or Gotham Bold as visible text.

## Logo and QR handling
- Treat logo and QR as exact supplied assets only.
- Keep them as small embedded sign-off elements unless the brief explicitly makes them prominent.
- Preserve transparent edges and proportions where relevant.
- Never invent a white backing plate, sticker treatment, substitute mark, or separate logo card behind the asset.

## Post-type reminders
- `construction-update`: make it explicit that the same recognizable project is shown in a believable progress stage. Translate any supplied progress cue into visible construction-state logic rather than abstract slogan copy.
- `amenity-spotlight`: keep the named amenity as the hero. Any project context stays secondary and must never replace or contradict the amenity focus.
- `site-visit-invite`: make the invitation feel real through arrival, access, and trust, not event-flyer language.
- `location-advantage`: communicate place through one disciplined context cue, not infographic mapping.
- `testimonial`: keep the backdrop quiet; do not turn the prompt into a quote-widget spec.

## Must not leak
- “Use the supplied image (Asset ID: …)”
- “Image 1 / Image 2”
- Tool names or playbook names
- Raw `style_family` or lever-key dumps
- Hex-code dumps
- Wireframe or dashboard language
