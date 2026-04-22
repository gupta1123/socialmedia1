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
| Root project import assets (`Luxovert.jpg`, `zillenia2.png`, `Aventis-View-05-Straight-View-scaled.jpg`, `zoy.jpg`) | `archive/legacy/root-assets/project-images/` | These were demo/import reference files kept in repo root even though they are not part of the runtime surface. | Seed/import scripts now read from `archive/legacy/root-assets/project-images/` |
| Root template import assets (`template1.png`, `template2.png`, `1280w-xF-qSTXV154.webp`, `1280w-6gGv9XdwLmg.jpg`) | `archive/legacy/root-assets/template-images/` | These were template/demo reference files used by one-off import scripts and did not belong in repo root. | Seed/import scripts now read from `archive/legacy/root-assets/template-images/` |
| Root generated sample outputs (`tmp-zoy-output.jpg`, `tmp-zoy-seed.jpg`) | `archive/legacy/root-assets/generated-samples/` | Historical generated outputs were being tracked in repo root. | New outputs go to `.local/root/generated/zoy-flow/` |
