# Social Python

Tracked Heroku deploy target and local source of truth for Python prompt compilation.

What it serves:
- `POST /api/compile-v2`
- `GET /api/health`

What it owns:
- prompt compilation only
- static skill pack under `services/socialpython/skills/prompt/v2`
- three-stage prompt pipeline: analyst -> crafter -> verifier

What it does not own:
- Supabase truth resolution
- project / brand selection
- job creation or provider submission

The API resolves business truth first, then sends a canonical compile payload to this service.

Local development:

```bash
pnpm run dev:socialpython
```

The API should target this service for prompt compile. Worker mode, when used, should still resolve agent files from this subtree.

Deploy flow from the monorepo:

```bash
git subtree push --prefix services/socialpython heroku-socialpython main
```

Suggested Heroku config:

```bash
heroku config:set OPENAI_API_KEY=... -a socialpython
heroku config:set SUPABASE_URL=https://<your-project>.supabase.co -a socialpython
heroku config:set SUPABASE_SERVICE_ROLE_KEY=... -a socialpython
heroku config:set AGNO_OPENAI_TIMEOUT_SEC=15 -a socialpython
heroku config:set AGNO_OPENAI_MAX_RETRIES=0 -a socialpython
heroku config:set CREATIVE_DIRECTOR_V2_TRANSPORT=server -a socialapp1
heroku config:set AGNO_AGENT_V2_SERVER_URL=https://<socialpython-app>.herokuapp.com/api/compile-v2 -a socialapp1
```

Notes:
- `socialpython` serves synchronous HTTP requests. On Heroku, retries inside the OpenAI client can push `/api/compile-v2` past the router's 30 second limit and surface as a `503` HTML application error upstream.
- Keep `AGNO_OPENAI_MAX_RETRIES=0` on `socialpython` unless you move compile execution off the Heroku request path.
- `socialpython` no longer reads Supabase directly for prompt compilation. It operates on the compile payload prepared by the API.
