# Social Python

Tracked Heroku deploy target for the Python prompt-planning service.

What it serves:
- `POST /api/compile-v2`
- `POST /api/image-edit-plan`
- `GET /api/health`

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
heroku config:set AI_EDIT_DIRECTOR_TRANSPORT=server -a socialapp1
heroku config:set AI_EDIT_DIRECTOR_SERVER_URL=https://<socialpython-app>.herokuapp.com/api/image-edit-plan -a socialapp1
```

Notes:
- `socialpython` serves synchronous HTTP requests. On Heroku, retries inside the OpenAI client can push `/api/compile-v2` past the router's 30 second limit and surface as a `503` HTML application error upstream.
- Keep `AGNO_OPENAI_MAX_RETRIES=0` on `socialpython` unless you move compile execution off the Heroku request path.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must also be present on `socialpython` because the amenity/image lookup tools read directly from Supabase.
