---
name: project-truth-synthesizer
description: Reduce project truth to only the facts, visual cues, and approved claims relevant to the selected post type and brief.
---

# Project Truth Synthesizer

Use this skill only when project truth exists.

## Required outputs
- Relevant project facts
- Relevant visual cues
- Approved claims worth preserving
- Facts that must not appear

## Rules
- Filter aggressively. Do not dump full project profiles into prompts.
- Keep only facts that help the selected post type.
- Do not leak unrelated amenities, landmarks, or lifecycle facts into the prompt.
- Preserve project identity when a real project anchor asset exists.
- If the brief is not project-led, keep project facts secondary or omit them.

