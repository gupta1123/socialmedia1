---
name: model-routing
description: Recommend the lowest-cost image model that can satisfy the requested level of fidelity and reference control.
---

# Model Routing

Use this skill when selecting or confirming the model.

## Routing Defaults
- Use `fal-ai/nano-banana` as the default.
- Use the edit variant when reference images are part of the request.
- Escalate to more expensive models only when typography fidelity or harder image edits clearly require it.

## Rules
- Default to the cheapest model that preserves brand intent.
- Keep model choice visible in the output so operators can audit cost and quality.

