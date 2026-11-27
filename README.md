# herrku

A self-hosted recipe shelf for a small private group: individual accounts, a shared recipe library, structured ingredients, and a merged shopping list you can copy out. One container, one port, SQLite on a volume.

The contract is [docs/SPEC.md](docs/SPEC.md). This file is the operator's quickstart.

## Quickstart (development)

```bash
npm install --include=dev
npm run migrate
npm run seed
npm run dev
```

Open <http://localhost:5173> and sign in with `admin` / `admin-password-123` (seeded, local only). A second seeded account, `friend` / `member-password-1`, is useful for checking permissions.

If npm blocks native install scripts on your machine, run `npm rebuild better-sqlite3 sharp esbuild`.

## Tests

```bash
npm test            # 251 unit + route tests (Vitest)
npm run typecheck
npm run lint
npm run test:e2e    # builds, seeds .e2e-data, runs Playwright on :3111
npm run audit:tdd   # red->green mutation audit; writes docs/TDD.md and docs/tdd-logs/
```

## API tokens for scripts and AI tools

Create a token at **/account → API tokens** (shown once), then call the API directly:

```bash
curl -H "Authorization: Bearer hk_..." https://recipes.example/api/recipes?q=soup

curl -X POST -H "Authorization: Bearer hk_..." -H 'content-type: application/json' \
  -d '{"title":"Weeknight Pasta","ingredients":[{"rawText":"2 cups flour"}],"steps":[{"text":"Cook."}]}' \
  https://recipes.example/api/recipes
```

Bearer requests need no cookies and no `Origin` header, which is what makes them usable from CLIs, agents, and MCP servers. A token inherits its owner's role; revoke it from the same page.

## MCP server

`mcp/` is a thin stdio MCP server over the same REST API. Tools: `search_recipes`, `get_recipe`, `create_recipe`, `update_recipe`, `list_tags`, `build_shopping_list`. It authenticates with a personal API token, so create a dedicated one per client and revoke it when you are done.

```bash
npm run build
HERRKU_URL=https://recipes.example HERRKU_TOKEN=hk_... node mcp/dist/index.js
```

Client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "herrku": {
      "command": "node",
      "args": ["/absolute/path/to/herrku/mcp/dist/index.js"],
      "env": {
        "HERRKU_URL": "https://recipes.example",
        "HERRKU_TOKEN": "hk_..."
      }
    }
  }
}
```

`npm run smoke:mcp` runs a full create → search → shopping-list → update → cleanup round-trip against a running instance (`HERRKU_URL`, defaults to `http://localhost:5173`).

## Production

```bash
npm run build
NODE_ENV=production \
PUBLIC_URL=https://recipes.example \
DATA_DIR=/data \
ADMIN_USERNAME=admin \
ADMIN_PASSWORD='at-least-12-characters' \
node server/dist/index.js
```

Or build and run the image:

```bash
docker build -t herrku .
docker run -d --name herrku -p 3000:3000 \
  -v herrku-data:/data \
  -e PUBLIC_URL=https://recipes.example \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='at-least-12-characters' \
  herrku
```

The container serves the API and the SPA on port 3000. Terminate TLS in front of it (Caddy, nginx, Traefik) and keep `TRUST_PROXY=true`, `COOKIE_SECURE=true`, `PUBLIC_URL` set to the public origin. Do not publish 3000 directly to the internet.

### Environment

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` outside the image | `production` requires `PUBLIC_URL` |
| `PORT` | `3000` | listen port |
| `DATA_DIR` | `/data` | SQLite database and uploaded images |
| `PUBLIC_URL` | — | absolute public origin; required in production |
| `ALLOWED_ORIGINS` | `PUBLIC_URL` | comma-separated origins accepted for CSRF checks |
| `COOKIE_SECURE` | `true` | set `false` only for plain-HTTP LAN/dev |
| `TRUST_PROXY` | `false` | trust `X-Forwarded-*`; enable behind a proxy |
| `SESSION_TTL_DAYS` | `30` | sliding session lifetime |
| `INVITE_TTL_HOURS` | `168` | invite lifetime (reset links are always 1 hour) |
| `MAX_UPLOAD_MB` | `5` | image upload cap |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | first-boot admin only |
| `LOG_LEVEL` | `info` | pino level |

### Backups

```bash
sqlite3 /data/db.sqlite ".backup '/backup/db-$(date +%F).sqlite'"
tar -czf "/backup/uploads-$(date +%F).tar.gz" -C /data uploads
```

Never `cp` a live WAL database. Schedule it nightly, ship offsite, and test a restore once.

## Layout

```
shared/   zod schemas, ingredient parser, shopping merge, formatting, slugs
server/   Fastify app, migrations runner, auth, recipes, images, admin
web/      React SPA served by the same process
migrations/  ordered SQL, applied on boot
e2e/      Playwright specs
```
