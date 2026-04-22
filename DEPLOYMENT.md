# Deployment Guide

This document covers the current deployment flow for Briefly Social.

## Current production endpoints

- Frontend: `https://brieflysocial.netlify.app`
- Backend: `https://socialapp1-c83bcf63dc0d.herokuapp.com`
- Heroku app git remote: `https://git.heroku.com/socialapp1.git`
- GitHub repo: `https://github.com/gupta1123/socialmedia1.git`

## Repo structure

- `apps/web`: Next.js frontend
- `apps/api`: Fastify backend
- `services/socialpython`: Python compile and image-edit planning service
- `packages/contracts`: shared schemas
- `supabase`: database migrations

## Local development

Start the local stack:

```bash
supabase start
pnpm run dev:socialpython
pnpm run dev:api
pnpm run dev:web
```

Important:

- local Supabase Postgres password: `postgres`
- local API default port: `4000`
- local web default port: `3000`

## Backend deployment: Heroku

### 1. Required backend env vars

Use [apps/api/.env.example](/Users/shilpakambale/Desktop/Projects/Mar-26/Social%20Media/apps/api/.env.example) as the source of truth.

Minimum required:

```env
PORT=4000
API_ORIGIN=https://brieflysocial.netlify.app
API_ORIGINS=https://brieflysocial.netlify.app
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
SUPABASE_STORAGE_BUCKET=creative-assets
CREATIVE_DIRECTOR_V2_MODE=auto
CREATIVE_DIRECTOR_V2_TRANSPORT=server
AI_EDIT_DIRECTOR_MODE=auto
AI_EDIT_DIRECTOR_TRANSPORT=server
AGNO_PYTHON_BIN=python3
AGNO_AGENT_V2_SCRIPT=../../services/socialpython/agents/creative_director_notebook.py
AI_EDIT_DIRECTOR_SCRIPT=../../services/socialpython/agents/ai_edit_director.py
AGNO_AGENT_V2_SERVER_URL=http://127.0.0.1:8787/api/compile-v2
AI_EDIT_DIRECTOR_SERVER_URL=http://127.0.0.1:8787/api/image-edit-plan
AGNO_AGENT_V2_SERVER_TIMEOUT_SEC=180
AI_EDIT_DIRECTOR_SERVER_TIMEOUT_SEC=60
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Run the official local Python service with `pnpm run dev:socialpython`. `local-playgrounds/` is no longer an official runtime path. Use worker transport only when you intentionally want the API to spawn the canonical `services/socialpython` agent scripts directly.

Image provider, choose one:

Fal:

```env
IMAGE_GENERATION_PROVIDER=fal
FAL_KEY=...
FAL_WEBHOOK_URL=https://socialapp1-c83bcf63dc0d.herokuapp.com/api/fal/webhooks
FAL_STYLE_SEED_MODEL=fal-ai/nano-banana-pro
FAL_FINAL_MODEL=fal-ai/nano-banana-pro/edit
```

OpenRouter:

```env
IMAGE_GENERATION_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_STYLE_SEED_MODEL=google/gemini-3-pro-image-preview
OPENROUTER_FINAL_MODEL=google/gemini-3-pro-image-preview
OPENROUTER_HTTP_REFERER=https://brieflysocial.netlify.app
OPENROUTER_X_TITLE=Briefly Social
```

### 2. Deploy command

Push `main` to Heroku:

```bash
git push heroku main
```

### 3. Heroku build behavior

Heroku uses:

- [Procfile](/Users/shilpakambale/Desktop/Projects/Mar-26/Social%20Media/Procfile)
- root `heroku-postbuild` from [package.json](/Users/shilpakambale/Desktop/Projects/Mar-26/Social%20Media/package.json)

Current runtime command:

```bash
web: pnpm --filter @image-lab/api start
```

### 4. Common backend deployment failures

#### Wrong runtime entrypoint

Symptom:

- Heroku crash on `dist/apps/api/src/index.js`

Fix:

- ensure `apps/api/package.json` start points to `dist/index.js`

#### Missing Supabase env vars

Symptom:

- boot crash with missing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`

Fix:

- set all required hosted Supabase values on Heroku

#### Invalid frontend origin

Symptom:

- CORS failure from Netlify

Fix:

- `API_ORIGIN=https://brieflysocial.netlify.app`
- or use `API_ORIGINS` for multiple allowed frontend hosts

#### Python / Agno runtime not available

Symptom:

- `spawn python3 ENOENT`

Fix:

- install Python support in the runtime or point the API at a reachable `services/socialpython` deployment

#### OpenAI structured output schema failure

Symptom:

- `Invalid schema for response_format 'PromptPackageOutput'`

Fix:

- do not use strict `output_schema=PromptPackageOutput` in the shared worker path
- keep JSON output instructions and validate after parsing

## Frontend deployment: GitHub + Netlify

### 1. Required frontend env vars

Use [apps/web/.env.example](/Users/shilpakambale/Desktop/Projects/Mar-26/Social%20Media/apps/web/.env.example).

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_API_URL=https://socialapp1-c83bcf63dc0d.herokuapp.com
```

Important:

- do not use `https://socialapp1.herokuapp.com`
- the valid backend host is `https://socialapp1-c83bcf63dc0d.herokuapp.com`

### 2. Push to GitHub

Remote:

```bash
git remote -v
```

Expected `origin`:

```text
https://github.com/gupta1123/socialmedia1.git
```

Push:

```bash
git push origin main
```

### 3. GitHub auth note

If push fails with:

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

then this machine is not authenticated for GitHub HTTPS.

Fix one of:

- authenticate GitHub on this machine
- switch `origin` to an SSH remote
- use a token-enabled HTTPS remote

### 4. Netlify

Netlify should build from the GitHub repo and use:

- frontend site: `https://brieflysocial.netlify.app`
- backend API: `https://socialapp1-c83bcf63dc0d.herokuapp.com`

## Supabase hosted deployment

### 1. Schema

Push migrations:

```bash
supabase db push
```

### 2. Data

For hosted import, use the safe import approach instead of raw `current_data.sql`.

### 3. Storage

Database restore alone is not enough.

Also copy storage objects:

- project images
- template previews
- generated assets

## Deployment checklist

Backend:

1. confirm Heroku env vars
2. `git push heroku main`
3. verify `/health`
4. test auth
5. test `/api/creative/compile`
6. test one style-seed generation

Frontend:

1. confirm Netlify env vars
2. push `main` to GitHub
3. wait for Netlify deploy
4. test login
5. test Create flow against production API

## Known current state

- Heroku backend is live at `v32`
- latest backend deploy commit was `13bbc60`
- local frontend commit exists but GitHub push may still require machine auth
