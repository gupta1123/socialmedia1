# Briefly Social

Brand-aware social creation lab for marketing teams. The stack is a `pnpm`-shaped monorepo with:

- `apps/web`: Next.js frontend for auth, brand setup, uploads, creative runs, and gallery.
- `apps/api`: Fastify API for auth-aware orchestration, Supabase access, Fal job submission, and Agno prompt compilation.
- `services/socialpython`: canonical Python runtime for prompt compilation and image-edit planning.
- `packages/contracts`: shared Zod schemas and TypeScript contracts.
- `supabase`: local database, auth, storage, and RLS policies.

## Local setup

1. Start Supabase:

```bash
supabase start
```

2. Copy env templates:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

3. Install dependencies with your preferred workspace manager.

Preferred:

```bash
pnpm install
```

If `pnpm` is not installed locally yet, `npm install` will also hydrate the workspace. The root `npm run ...` commands will try:

1. local/global `pnpm`
2. `corepack pnpm`
3. `npx pnpm@10.6.5`

so you do not need a global `pnpm` install just to start the apps.

4. Run the apps in separate terminals:

```bash
pnpm run dev:socialpython
pnpm run dev:api
pnpm run dev:web
```

## Agno prompt compiler

The backend supports two prompt compiler modes:

- `auto`: use Agno when Python dependencies and model credentials are present, otherwise fall back to a deterministic mock compiler.
- `agno`: require the Python Agno runner.
- `mock`: always use the deterministic compiler.

The active Python compiler lives in [services/socialpython](/Users/shilpakambale/Desktop/Projects/Mar-26/Social%20Media/services/socialpython). The API targets that service over HTTP by default and can spawn the same service-owned agents in worker mode when explicitly configured.

## Fal flow

The generation loop is:

1. Compile brand-aware prompt package.
2. Generate style seeds.
3. Select a seed or use uploaded references.
4. Generate finals.
5. Persist outputs into private Supabase storage.
6. Capture feedback.

## Notes

- Browser code never sees Fal credentials or Supabase service-role credentials.
- Every stored object path is prefixed with `workspace_id/brand_id/...`.
- The existing notebook export in the repo root was left untouched and is not used by the new stack.
- This repo uses a non-default local Supabase port range (`62021-62024`) to avoid conflicts with other local projects.
