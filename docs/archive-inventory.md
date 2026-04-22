# Archive Inventory

This file records tracked code moved into `archive/legacy/` during runtime cleanup.

## Archive policy

- Archive first, delete later only after a full cleanup cycle.
- Archived code is reference-only. Active runtime code and docs must not depend on it.
- Local scratch files belong in `.local/`, not `archive/legacy/`.

## Archived items

Pending completion of the runtime cleanup implementation:

- `apps/api/agents/`
- `skills/prompt/v1/`
- `skills/prompt/v2/`
- `skills/image-edit/v1/`

Each item will be updated here with:

- original path
- archived path
- reason it was removed from the active runtime
- active replacement
