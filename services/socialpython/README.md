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
heroku config:set CREATIVE_DIRECTOR_V2_TRANSPORT=server -a socialapp1
heroku config:set AGNO_AGENT_V2_SERVER_URL=https://<socialpython-app>.herokuapp.com/api/compile-v2 -a socialapp1
heroku config:set AI_EDIT_DIRECTOR_TRANSPORT=server -a socialapp1
heroku config:set AI_EDIT_DIRECTOR_SERVER_URL=https://<socialpython-app>.herokuapp.com/api/image-edit-plan -a socialapp1
```
