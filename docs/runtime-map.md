# Runtime Map

This repo has three active runtime surfaces. `services/socialpython` is the single source of truth for Python compile and image-edit planning.

## Active entrypoints

| Surface | Local command | Deploy target | Source of truth |
| --- | --- | --- | --- |
| Frontend | `pnpm run dev:web` | Netlify | `apps/web` |
| API | `pnpm run dev:api` | Heroku `socialapp1` | `apps/api` |
| Python compile / image-edit planner | `pnpm run dev:socialpython` | Heroku subtree `services/socialpython` | `services/socialpython` |

## Ownership rules

- `apps/web` owns Studio and all browser-side compile/generation orchestration.
- `apps/api` owns authenticated HTTP APIs, persistence, generation jobs, and transport to Python compile/edit planning.
- `services/socialpython` owns:
  - `POST /api/compile-v2`
  - `POST /api/image-edit-plan`
  - `GET /api/health`
  - prompt skills under `services/socialpython/skills`
  - Python agents under `services/socialpython/agents`

## Legacy and local-only areas

- `archive/legacy/`: tracked code kept for reference after runtime removal.
- `.local/`: gitignored scratch space for ad hoc payloads, notebooks, temp outputs, manual debug artifacts, and retired local experiments.
- `.local/root/playgrounds/`: preserved local-only experiments. Not part of the official runtime.

## Compile flow

1. Studio submits a brief to `apps/api`.
2. `apps/api` compiles prompts through `services/socialpython` using server transport or, if explicitly configured, worker transport against the same `services/socialpython` agent files.
3. `apps/api` persists prompt packages and submits image generation jobs.
4. Providers generate images; `apps/api` owns polling and job finalization.

## Edit-planning flow

1. Studio sends an edit request to `apps/api`.
2. `apps/api` asks `services/socialpython` for a mask-aware edit plan.
3. `apps/api` submits the chosen model/provider edit job.

## Non-goals

- `apps/api/agents` is not an active runtime tree after cleanup.
- Root `skills/` is not an active runtime tree after cleanup.
- `/api/creative/compile` remains only as a deprecated compatibility alias to the V2 compile flow.
