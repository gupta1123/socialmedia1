# Archive Inventory

This file records tracked code moved into `archive/legacy/` during runtime cleanup.

## Archive policy

- Archive first, delete later only after a full cleanup cycle.
- Archived code is reference-only. Active runtime code and docs must not depend on it.
- Local scratch files belong in `.local/`, not `archive/legacy/`.

## Archived items

| Original path | Archived path | Reason | Active replacement |
| --- | --- | --- | --- |
| `apps/api/agents/` | `archive/legacy/apps/api/agents/` | API-local Python agents duplicated the deployed `services/socialpython` runtime and created ambiguous worker ownership. | `services/socialpython/agents/` |
| `skills/prompt/v1/` | `archive/legacy/skills/prompt/v1/` | V1 prompt skills are no longer part of the active compile path. | `services/socialpython/skills/prompt/v2/` |
| `skills/prompt/v2/` | `archive/legacy/skills/prompt/v2/` | Root prompt skills were a mirror of the service-owned runtime tree and caused drift. | `services/socialpython/skills/prompt/v2/` |
| `skills/image-edit/v1/` | `archive/legacy/skills/image-edit/v1/` | Root image-edit skills duplicated the service-owned runtime tree. | `services/socialpython/skills/image-edit/v1/` |
