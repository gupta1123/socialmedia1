---
name: brief-interpreter
description: Turn a raw create brief into a compact image contract covering objective, audience, tone, copy controls, preservation level, asset needs, and only the truth that materially affects the image.
---

# Brief Interpreter

Use this skill first.

This is an analyst-stage skill. It should create the working brief contract, not rewrite the final prompt.

## Required outputs
- Objective in one sentence
- Audience signal
- Tone and urgency
- Copy contract: exact text, optional text, or no text
- Preservation level: project truth, logo, QR, or project-free
- Asset needs

## Rules
- Reduce the brief to what the image must communicate at a glance.
- Treat explicit user instructions about mood, framing, lighting, crop, or subject emphasis as first-class controls.
- Separate hard requirements from soft preferences.
- Fold in only the project, festival, template, or brand facts that materially affect image truth for this brief.
- Ignore unrelated amenities, landmarks, lifecycle facts, and copy claims that do not help the selected post type.
- If the brief is festive and no project is selected, keep the image project-free by default.
- If exact text is provided, preserve it exactly.
- If the brief does not require in-image text, prefer reserved safe space over forcing typography.
- If an exact asset contract or selected playbook already exists, respect it. Do not reopen those decisions.
