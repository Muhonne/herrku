# herrku — System Spec

Self-hosted recipe service for a small private group (~15 accounts, ~300 recipes). Individual accounts, shared recipe library, structured ingredients, merged shopping list you can copy out.

Status: **agreed, buildable**. Decisions are final unless superseded by a dated note in §16. This document is the contract; an implementer should not need to invent behavior.

---

## 1. Summary

| Area | Decision |
|---|---|
| Language | TypeScript, strict, ESM |
| Runtime | Node 24 LTS |
| Backend | Fastify 5, REST + JSON under `/api` |
| Frontend | Vite + React 19 + TanStack Query + React Router + Tailwind, served by the same process |
| DB | SQLite (WAL) via `better-sqlite3`, queries via Kysely, plain SQL migrations |
| Validation | Zod schemas in `shared/`, used by both server and forms |
| Auth | Individual accounts, Argon2id, DB-backed sessions, single-use invite links |
| Storage | `/data` volume: `db.sqlite` + `uploads/` |
| Deploy | One Docker image, one port, migrations on boot, non-root |
| Visibility | Shared library: all signed-in users read everything; creator or admin edits |
| Search | Substring on a precomputed `search_text` (title + ingredient names), plus tag filter |
| Shopping list | Server-side merge by name+unit, servings scaling, plain-text clipboard output |
| API access | Session cookie for the SPA; personal bearer tokens (`hk_…`) for scripts and AI tools |

---

## 2. Goals, non-goals, definition of done

**Goals**

- Store, browse, search, and edit recipes with photos, tags, and structured ingredients.
- Onboard a friend in one step without email infrastructure.
- Produce a consolidated shopping list from selected recipes at a chosen scale.
- Deploy as a single container behind the operator's own reverse proxy.

**Non-goals (v1)**

URL/scraper import, meal planner, cookbooks/collections, multiple photos per recipe, unit conversion (cups ↔ grams), public/unauthenticated pages, self-service signup, email (SMTP), OIDC/SSO, i18n, JSON export, audit log, recipe scaling control on the detail page.

**v1 is done when** every one of these works against the built container:

1. Fresh volume + `ADMIN_USERNAME`/`ADMIN_PASSWORD` boots and the admin can sign in.
2. Admin creates an invite link; a new person accepts it, signs in, and sees the shared library.
3. That person creates a recipe with sections, tags, a parsed ingredient line, and a photo; it appears in search.
4. A second person can read it but cannot edit it; an admin can.
5. Selecting two recipes with different serving counts yields one merged, copyable list.
6. Disabling the second person kills their sessions immediately; the admin issues a set-password link and they recover.
7. `/api/health` is green, migrations ran, and a `SIGTERM` shuts the process down cleanly.

---

## 3. Repo layout and tooling

npm workspaces, one lockfile, no nested installs.

```
/
  package.json              # workspaces: shared, server, web
  package-lock.json
  tsconfig.base.json
  eslint.config.js
  vitest.config.ts
  playwright.config.ts
  shared/                   # @herrku/shared — zod schemas, parser, merge, formatting, unit tokens
  server/                   # @herrku/server — Fastify app, routes, db, migrations runner
  web/                      # @herrku/web — Vite + React
  migrations/               # 0001_init.sql, NNNN_description.sql
  scripts/seed.ts           # local + e2e seed data
  Dockerfile
  .dockerignore
  .github/workflows/ci.yml
  docs/SPEC.md
```

Scripts (root)

| Script | Behavior |
|---|---|
| `dev` | `concurrently` server (`tsx watch`) on :3000 + Vite on :5173 proxying `/api` |
| `build` | shared → server (`tsc`) → web (`vite build`) |
| `start` | `node server/dist/index.js` (serves API + `web/dist`) |
| `typecheck` | `tsc -b --noEmit` across workspaces |
| `lint` | ESLint |
| `test` | Vitest (unit + route) |
| `test:e2e` | Playwright against a seeded, built app |
| `migrate` | apply pending migrations and exit |
| `seed` | insert deterministic local/e2e data (never run at boot) |

Dependencies (pinned in the lockfile): `fastify`, `@fastify/cookie`, `@fastify/static`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/multipart`, `@fastify/compress`, `better-sqlite3`, `kysely`, `zod`, `@node-rs/argon2`, `sharp`, `pino`, `tsx` (dev), `vite`, `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `tailwindcss`, `vitest`, `@playwright/test`.

`@node-rs/argon2` and `sharp` are chosen for prebuilt binaries so the runtime image needs no compiler.

### Local dev workflow

- `npm run migrate && npm run seed` once, then `npm run dev`.
- Server env for dev: `DATA_DIR=./.data`, `PUBLIC_URL=http://localhost:5173`, `ALLOWED_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=false`, `NODE_ENV=development`.
- Vite proxies `/api` to `http://localhost:3000`, so the browser sees one origin; cookies work unchanged.
- Uploaded files live under `./.data/uploads` and are gitignored.

---

## 4. Users, roles, auth

### Roles

| Role | Capabilities |
|---|---|
| `member` | Read all recipes, create recipes, edit/delete own recipes, manage own sessions |
| `admin` | Everything a member can do, plus edit/delete any recipe, manage users and invites |

No other roles. No self-registration.

### Identifiers and credentials

- `username`: 3–32 chars, `^[a-z0-9][a-z0-9_-]*$`, stored lowercased, unique case-insensitively. Immutable in v1.
- `displayName`: optional, 1–80 chars, defaults to `username`. Set only at account creation in v1; no edit endpoint.
- Password: minimum 12 characters, maximum 200 characters (and ≤ 1024 bytes). No composition rules. Argon2id `m=19456 KiB, t=2, p=1`; unknown usernames are verified against a fixed dummy hash so timing is comparable.
- Failed login returns `401 unauthorized` with a generic message.

### Bootstrap

On boot, if `users` is empty and both `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set, create the admin. If the table is empty and the vars are absent, log an error and keep serving (nobody can sign in until an admin exists). Never modify an existing user.

### Invite flow (account creation)

1. Admin opens `/admin/users`, clicks **Invite**, picks role (default `member`).
2. `POST /api/admin/invites` creates a row with a random 32-byte token, stores only `sha256(token)`, `expires_at = now + INVITE_TTL_HOURS`, and returns the full URL once.
3. UI shows `{PUBLIC_URL}/invite/{token}` with a copy button. The raw token is never retrievable again; to get a new link, revoke and create another.
4. Invitee opens the link; `GET /api/auth/invite/:token` returns `{ valid: true, purpose: "invite" }` or the generic failure.
5. `POST /api/auth/accept-invite { token, username, password, displayName? }` creates the user, marks the invite used, and returns `{ user }`. It does **not** auto-login.
6. Any missing, used, or expired token yields `400 invite_invalid` with the message "This invite is invalid or has expired." No user enumeration.

### Password recovery

No email. An admin issues a **set-password link**: same table, `purpose='reset'`, `user_id` set, TTL 1h. The invitee page shows the account's username and asks only for a new password. Accepting it sets the password, revokes **all** of that user's sessions, and marks the invite used. Members can change their own password at `/account` (`POST /api/auth/password`), which requires the current password and revokes every other session.

### Sessions

- Opaque 32-byte token; only `sha256(token)` is stored. The raw token exists solely in the cookie.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=true`. Name is `__Host-herrku_session` when secure, `herrku_session` otherwise (`__Host-` requires `Secure`).
- `POST /api/auth/login { username, password, staySignedIn? }`, where `staySignedIn` defaults to `true`:
  - DB `expires_at = now + SESSION_TTL_DAYS` in both cases.
  - `staySignedIn: true` → cookie gets `Max-Age = SESSION_TTL_DAYS × 86400`.
  - `staySignedIn: false` → cookie has no `Max-Age` (browser-session cookie); the DB row still expires per TTL.
- Sliding refresh: on an authenticated request, if `now - last_seen_at ≥ 1h`, update `last_seen_at` and `expires_at = now + TTL`, and re-send the cookie with its `Max-Age` (persistent sessions only). This caps writes at one per hour per session.
- Expired or unknown tokens → `401 unauthorized`, cookie cleared, row deleted.
- A session whose user is disabled is rejected and deleted.
- `DELETE /api/sessions` revokes all; `DELETE /api/sessions/:id` revokes one (own sessions only). The list marks the current session.

### Personal API tokens

- Created at `/account` or with `POST /api/tokens`. The secret is `hk_` followed by 43 base64url characters, returned **once**; only its sha256 is stored.
- Each token records a name, a display prefix (first 11 characters), `created_at`, `last_used_at` (written at most hourly) and an optional `expires_at`.
- Send `Authorization: Bearer <token>`. The token resolves to its owning user and inherits that user's role, including admin endpoints. There are no scopes in v1.
- Unknown, expired, or disabled-user tokens return `401 unauthorized`.
- Bearer requests **skip the cookie CSRF origin check**, because they carry no ambient credentials. Cookie requests still require a matching `Origin`.
- Revocation is a hard delete (`DELETE /api/tokens/:id`) and takes effect on the next request.
- Rate limiting keys bearer requests by a hash of the `Authorization` header, so each token gets its own budget.

### Rate limiting

In-memory (single process). Keyed by client IP, or by a hash of the `Authorization` header when a bearer token is used; when `TRUST_PROXY=true` the first hop of `X-Forwarded-For` is used.

- Login, invite validation, and accept-invite: 10 requests / 15 min per IP.
- Everything else: 100 requests / min per IP.
- Exceeding returns `429 rate_limited` with `Retry-After` in seconds.

---

## 5. Data model

Timestamps are ISO-8601 UTC strings (`new Date().toISOString()`), stored as `TEXT`, compared lexicographically. All FKs cascade on delete unless noted.

Migrations: `migrations/NNNN_description.sql`, applied in lexical order, each inside its own transaction, recorded in `schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`. No down migrations. A failed migration aborts boot with exit code 1.

Connection pragmas on every open: `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`, `temp_store=MEMORY`.

```sql
users(
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- always stored lowercased
  display_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  disabled_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)

sessions(
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persistent INTEGER NOT NULL DEFAULT 1,  -- 1 when "stay signed in" was selected
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT
)
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

invites(
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- required when purpose='reset', NULL otherwise
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
)
CREATE INDEX invites_expiry_idx ON invites(expires_at);

api_tokens(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,           -- first 11 characters, for display only
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT
)
CREATE INDEX api_tokens_user_idx ON api_tokens(user_id);

recipes(
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  servings INTEGER CHECK (servings IS NULL OR (servings > 0 AND servings <= 1000)),
  prep_minutes INTEGER CHECK (prep_minutes IS NULL OR (prep_minutes >= 0 AND prep_minutes <= 10080)),
  cook_minutes INTEGER CHECK (cook_minutes IS NULL OR (cook_minutes >= 0 AND cook_minutes <= 10080)),
  source_url TEXT,
  notes TEXT,
  search_text TEXT NOT NULL DEFAULT '',   -- lowercased title + ingredient names + tags
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  image_path TEXT,
  image_thumb_path TEXT
)
CREATE INDEX recipes_updated_idx ON recipes(updated_at DESC);
CREATE INDEX recipes_created_by_idx ON recipes(created_by);

ingredients(
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  section TEXT,                 -- e.g. "For the sauce"; grouping only, ignored by merge
  quantity REAL,                -- NULL = unquantified ("salt to taste")
  quantity_max REAL,            -- set for ranges: 2-3 -> quantity=2, quantity_max=3
  unit TEXT,                    -- canonical token or NULL (countable items)
  name TEXT NOT NULL,
  note TEXT,                    -- "finely chopped"
  raw_text TEXT                 -- exactly what the user typed, or synthesized from fields
)
CREATE INDEX ingredients_recipe_idx ON ingredients(recipe_id, position);

steps(
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  section TEXT,
  text TEXT NOT NULL
)
CREATE INDEX steps_recipe_idx ON steps(recipe_id, position);

recipe_tags(
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,            -- NFC, trimmed, whitespace-collapsed, lowercased at write time
  PRIMARY KEY (recipe_id, tag)
)
CREATE INDEX recipe_tags_tag_idx ON recipe_tags(tag);
```

Rules

- **Slugs**: generated once at creation from the title — NFKD-normalize, strip combining marks, map `ß→ss, ø→o, đ→d, ł→l, æ→ae, œ→oe`, lowercase, replace runs of non-`[a-z0-9]` with `-`, trim dashes, max 60 chars, fallback `recipe`. Collisions get `-2`, `-3`, … **Slugs never change** when the title is edited (including `PUT`). Finnish titles keep their diacritics in the title while the slug is ASCII.
- Deleting a recipe hard-deletes its rows and best-effort deletes its image files.
- Tags: NFC-normalized, trimmed, internal whitespace collapsed, lowercased; 1–32 chars; ≤ 10 per recipe; deduped after normalization.
- `total_minutes` is computed (`prep + cook`, null if both null) and never stored.
- Ingredient `unit` must be a canonical token from §6 or `NULL`.
- `quantity_max ≥ quantity` when both are present.
- Positions are dense integers from 0, assigned from array order on every save.
- Sessions and invites are purged hourly by a timer: expired sessions, and invites that are expired or used more than 24h ago.
- User rows are never deleted; accounts are disabled instead (`created_by` uses `ON DELETE RESTRICT` accordingly).

---

## 6. Ingredient parsing

Entry is one free-text line per ingredient. The server parses it into structured fields; the client always shows the structured result in editable inputs. The parser is a convenience — the structured fields are the source of truth.

| Input | qty | qty_max | unit | name | note |
|---|---|---|---|---|---|
| `1 1/2 cups flour` | 1.5 | — | `cup` | flour | — |
| `2–3 cloves garlic, minced` | 2 | 3 | `clove` | garlic | minced |
| `½ tsp salt` | 0.5 | — | `tsp` | salt | — |
| `400 g canned tomatoes` | 400 | — | `g` | canned tomatoes | — |
| `2 eggs` | 2 | — | — | eggs | — |
| `salt to taste` | — | — | — | salt | to taste |
| `1 x 400g tin chickpeas` | 1 | — | `can` | chickpeas | 400 g |
| `2 × 400 g tins chopped tomatoes` | 2 | — | `can` | chopped tomatoes | 400 g |
| `1 (400 g) tin chickpeas` | 1 | — | `can` | chickpeas | 400 g |

Rules

- Leading quantity: decimal (`1.5`), simple fraction (`1/2`), mixed (`1 1/2`), unicode fraction (`½ ¼ ⅓ ⅔ ¾ ⅛ ⅜ ⅝ ⅞`), or a range using `-`, `–`, `—`, or `to` (`2-3`, `2 to 3`). Ranges set `quantity` and `quantity_max`.
- Optional connector `x`, `×`, or `*` between count and container (`1 x 400g tin …`).
- **Product size rule:** when a second quantity+unit pair appears before a container word (`can, jar, packet, tin, box, bottle, bag, carton, tub`), the leading count and container become `quantity`/`unit` and the inner size pair is preserved verbatim in `note`. Nothing is discarded.
- Trailing `, <note>` (or ` - <note>`) sets the note. `to taste`, `as needed`, `for garnish`, `for serving` with no leading quantity become the note with `quantity = NULL`.
- Unit matching is case-insensitive, plural-insensitive, and alias-aware for: `g, kg, mg, ml, l, cl, dl, tsp, tbsp, cup, oz, lb, piece, clove, slice, sprig, pinch, dash, bunch, handful, can, jar, packet, sheet, stalk`. Aliases include `tablespoon(s)→tbsp`, `teaspoon(s)→tsp`, `gram(s)→g`, `kilogram(s)→kg`, `millilitre(s)/milliliter(s)→ml`, `litre(s)/liter(s)→l`, `tin→can`, `pkg→packet`, `stick(s)→piece`, `head(s)→piece`.
- Unrecognized units are never guessed; the token stays in `name` and `unit` is `NULL`.
- Names are NFC-normalized, trimmed, and whitespace-collapsed. Nothing else is stripped (`tomato` ≠ `tomatoes`).
- The parser must never throw. Unparseable input yields `{ quantity: null, quantityMax: null, unit: null, name: <whole trimmed input>, note: null }`.
- Tested with a ≥ 40-case table including empty string, only a note, `1/0`, negative numbers, `2-3-4`, mixed unicode, and very long lines.

### Quantity display

`formatQuantity(value)` used by both the recipe page and the shopping list:

- `null` → no number.
- Integer within 0.01 → integer (`2`).
- Nearest common fraction (denominator 2, 3, 4, or 8) within 0.01 → mixed fraction with glyphs (`2½`, `⅓`).
- Otherwise round to 2 decimals and trim trailing zeros.
- Ranges render `min–max` (en dash) only when the values differ.

Unit display: canonical singular token; pluralized with `-s`/`-es` (matching the token's normal plural) when the rendered quantity is not exactly 1. Display forms are `g, kg, mg, ml, l, cl, dl, tsp, tbsp, cup(s), oz, lb, piece(s), clove(s), slice(s), sprig(s), pinch(es), dash(es), bunch(es), handful(s), can(s), jar(s), packet(s), sheet(s), stalk(s)`.

---

## 7. Shopping list

Stateless; nothing is persisted. Session required.

`POST /api/shopping-list`

```json
{ "items": [ { "recipeId": 12, "servings": 6 }, { "recipeId": 44, "servings": 2 } ] }
```

- Empty `items` → `400 validation_failed`.
- Unknown `recipeId` → `404 not_found`.
- `servings` optional integer 1..1000; omitted → use the recipe's servings.

Response

```json
{
  "text": "2 cups flour\n3 cloves garlic (minced)\n1 tsp salt\nsalt (to taste)\n400 g canned tomatoes\n",
  "lines": [
    { "name": "canned tomatoes", "unit": "g", "quantity": 400, "quantityMax": null, "notes": [] }
  ]
}
```

`text` is built from `lines` and is exactly what the copy button places on the clipboard: one line per merged item, `\n` after every line including the last, no bullets, no headers, no recipe names.

Algorithm

1. Multiplier per recipe = `requestedServings / recipe.servings`; `1` when either is missing.
2. Scale `quantity` and `quantity_max` by the multiplier; keep full precision internally, round only at render.
3. Merge key = `nfc(lower(collapseWs(name)))` + `\u0000` + (`unit ?? ''`).
4. Sum quantities within a key. Ranges add min-to-min and max-to-max (`2–3` + `1–2` → `3–5`). If any merged entry is unquantified, the merged line is unquantified.
5. **No unit conversion.** The same name in different units stays on separate lines.
6. Notes: NFC, trimmed, case-insensitively deduped, joined with `, ` and rendered in parentheses after the name.
7. Sort lines by `name` using `localeCompare` with the `fi` collation, then by `unit` (nulls last). Sorting is deterministic and independent of selection order.
8. Ingredients inside a `section` are merged normally; sections are not represented in the output.

---

## 8. Search and browse

`GET /api/recipes?q=&tag=&sort=&page=&pageSize=`

- **`q`**: lowercased in JS, then `LIKE '%' || ? || '%' ESCAPE '\'` against `recipes.search_text`, with `\`, `%`, and `_` escaped. Trimmed; fewer than 2 characters is ignored rather than rejected.
- `recipes.search_text` is recomputed on every create/update as: `nfc(title) + "\n" + ingredients.map(name) + "\n" + tags`, whitespace-collapsed and `.toLowerCase()`.
  **Why a column:** SQLite's `LIKE` and `COLLATE NOCASE` are ASCII-only, so `pähkinä` would not match `Pähkinä` in a query. Lowercasing in JS and matching a lowercased column makes Finnish search work. Descriptions and step text are *not* searched in v1.
- **`tag`**: exact match on `recipe_tags.tag` against the JS-lowercased value; repeating the parameter ANDs tags.
- **`sort`**: `recent` (default, `updated_at DESC`) or `title` (`title COLLATE NOCASE ASC` — ordering of non-ASCII titles is approximate and acceptable).
- **Pagination**: `pageSize` default 50, max 100; `page` default 1; response `{ items, page, pageSize, total }` where `total` is the full filtered count.
- List item shape: `{ id, slug, title, description, tags, servings, totalMinutes, hasImage, thumbUrl, updatedAt }`. Lists never include ingredients or steps. `thumbUrl` is `/api/recipes/{slug}/image?variant=thumb` when `hasImage`, else `null`.
- FTS5 is deferred until > 1000 recipes.

---

## 9. API

All routes under `/api` require a session except those marked *public*. JSON in/out, camelCase keys, integer ids, ISO timestamps.

Error envelope, always:

```json
{ "error": { "code": "validation_failed", "message": "…", "details": [{ "path": "ingredients[2].quantity", "message": "…" }] } }
```

`details` is present only for `validation_failed`.

| Status | Code | When |
|---|---|---|
| 400 | `validation_failed` | Zod failure, empty shopping selection |
| 400 | `invite_invalid` | invite missing, used, or expired |
| 401 | `unauthorized` | no/expired session; failed login |
| 403 | `forbidden` | role or ownership check failed |
| 403 | `csrf_failed` | origin check failed |
| 404 | `not_found` | unknown slug, id, or route under `/api` |
| 409 | `username_taken` | accept-invite with an existing username |
| 409 | `last_admin` | would disable/demote the only active admin |
| 413 | `payload_too_large` | body or image over limit |
| 415 | `unsupported_media_type` | image magic bytes not JPEG/PNG/WebP |
| 429 | `rate_limited` | with `Retry-After` header |
| 500 | `internal_error` | unhandled; message is generic |
| 503 | `not_configured` | invite/reset link requested without `PUBLIC_URL` |

### Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | *public*; `{username,password,staySignedIn?}` → `{user}` + cookie |
| POST | `/api/auth/logout` | deletes session row, clears cookie |
| GET | `/api/auth/me` | `{user}` |
| POST | `/api/auth/password` | `{currentPassword,newPassword}`; revokes other sessions |
| GET | `/api/auth/invite/:token` | *public*; `{valid,purpose,username?}` (`username` only for `purpose='reset'`) |
| POST | `/api/auth/accept-invite` | *public*; `{token,username?,password,displayName?}` → `{user}`; `username` required for `purpose='invite'`, ignored for `reset` |
| GET | `/api/sessions` | own sessions: `{id,createdAt,lastSeenAt,userAgent,ip,current}` |
| DELETE | `/api/sessions/:id` | own session only |
| DELETE | `/api/sessions` | revoke all own sessions |

Every route also accepts `Authorization: Bearer <token>` in place of the session cookie.

Tokens

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tokens` | own tokens: `{id,name,prefix,createdAt,lastUsedAt,expiresAt}` |
| POST | `/api/tokens` | `{name, expiresInDays?}` → 201 `{secret, token}`; `secret` is shown once |
| DELETE | `/api/tokens/:id` | own token only; 204; `404` otherwise |

`user` = `{ id, username, displayName, role }`.

### Recipes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/recipes` | list/search, §8 |
| POST | `/api/recipes` | create; returns full document, 201 |
| GET | `/api/recipes/:slug` | full document |
| PUT | `/api/recipes/:slug` | full replace; creator or admin |
| DELETE | `/api/recipes/:slug` | creator or admin; 204 |
| POST | `/api/recipes/:slug/image` | multipart field `file`; creator or admin; replaces existing |
| DELETE | `/api/recipes/:slug/image` | creator or admin; 204, idempotent |
| GET | `/api/recipes/:slug/image?variant=thumb\|full` | session required; default `full` |
| GET | `/api/tags` | `[{tag,count}]`, sorted by tag |

### Write contract

Request body (create and replace):

```json
{
  "title": "Pähkinäleipä",
  "description": "Quick weekday loaf",
  "servings": 8,
  "prepMinutes": 15,
  "cookMinutes": 45,
  "sourceUrl": null,
  "notes": "Freezes well.",
  "tags": ["bread", "finnish"],
  "ingredients": [
    { "section": null, "rawText": "1 1/2 cups flour",
      "quantity": 1.5, "quantityMax": null, "unit": "cup", "name": "flour", "note": null },
    { "section": "For the topping", "rawText": "2-3 cloves garlic, minced",
      "quantity": 2, "quantityMax": 3, "unit": "clove", "name": "garlic", "note": "minced" }
  ],
  "steps": [
    { "section": null, "text": "Mix everything." },
    { "section": "For the topping", "text": "Scatter the garlic over the dough." }
  ]
}
```

Limits, enforced by Zod:

| Field | Rule |
|---|---|
| `title` | required, trimmed, 1–200 chars |
| `description` | ≤ 2000 chars, nullable |
| `servings` | integer 1–1000, nullable |
| `prepMinutes`, `cookMinutes` | integer 0–10080, nullable |
| `sourceUrl` | nullable; if set, `http:`/`https:` URL ≤ 500 chars |
| `notes` | ≤ 10000 chars, nullable |
| `tags` | ≤ 10 items, each 1–32 chars after normalization |
| `ingredients` | ≤ 200 items |
| `ingredients[].section` | ≤ 80 chars, nullable |
| `ingredients[].name` | required unless parsable `rawText` is supplied, 1–200 chars |
| `ingredients[].quantity`, `quantityMax` | ≥ 0 and ≤ 1 000 000 |
| `ingredients[].unit` | canonical token or null |
| `ingredients[].note` | ≤ 200 chars, nullable |
| `ingredients[].rawText` | ≤ 500 chars, nullable |
| `steps` | ≤ 100 items, each `text` 1–5000 chars, `section` ≤ 80 |
| `quantityMax` | ≥ `quantity` when both present |

Semantics

- If `name` is missing or empty and `rawText` is present, the server parses `rawText` and uses that result. If structured fields are present, they win; `rawText` is stored verbatim when supplied, otherwise synthesized from the structured fields.
- `PUT` replaces everything: omitted optional fields become `NULL`, and `tags`/`ingredients`/`steps` are deleted and reinserted from array order inside one transaction. Positions are the array indices.
- Concurrency is **last-write-wins** in v1; no `ETag`/`If-Match`.
- `created_by` is never changed by `PUT`. `created_at` is preserved; `updated_at` is set to now.
- Response document adds `id`, `slug`, `createdBy {id,displayName}`, `createdAt`, `updatedAt`, and `image {fullUrl,thumbUrl}|null`.

Authorization: every mutating recipe route requires `recipe.created_by === session.user.id || session.user.role === 'admin'`, else `403 forbidden`. Reads are shared across all sessions; unknown slugs are `404`.

### Shopping

| Method | Path | Notes |
|---|---|---|
| POST | `/api/shopping-list` | §7 |

### Admin (role `admin` only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users` | `[{id,username,displayName,role,disabled,createdAt,lastLoginAt}]` |
| PATCH | `/api/admin/users/:id` | `{role?,disabled?}`; refuses disabling/demoting self; refuses removing the last active admin (`409 last_admin`) |
| POST | `/api/admin/users/:id/reset` | creates a 1h reset link, revokes all target sessions, returns `{url,expiresAt}` |
| POST | `/api/admin/invites` | `{role}` → `{id,url,expiresAt}`; `503` if `PUBLIC_URL` unset |
| GET | `/api/admin/invites` | pending only: `[{id,role,createdAt,expiresAt,createdBy}]` — no tokens |
| DELETE | `/api/admin/invites/:id` | revoke; 204 |

### Health

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | *public*; `{ok,version,db:"ok"}`; 503 with `{ok:false,db:"error"}` if `SELECT 1` fails |

`version` comes from the root `package.json`.

---

## 10. UI

SPA routes. `/api` is never shadowed; any other GET falls back to `index.html`.

- `/login` — username, password, "Stay signed in" (checked by default), inline error on 401.
- `/invite/:token` — validates on load; invalid tokens show the generic message and no form. For `invite`: username, display name, password. For `reset`: shows the username and asks only for a new password. On success, redirect to `/login` with "Password set — sign in."
- `/recipes` — search input (debounced 250 ms), tag chips, sort toggle, responsive card grid with thumb or placeholder, empty state ("No recipes match" + clear-filters), "New recipe".
- `/recipes/new`, `/recipes/:slug/edit` — one form: title, description, tags (chip input with suggestions from `/api/tags`), servings, prep/cook, source URL, notes, image dropzone (preview + remove), ingredient editor (rows with parsed `quantity / unit / name / note` fields plus an optional section heading per group), step editor. Typing a raw line and blurring fills the structured fields locally using the shared parser; every field stays editable. One `PUT` on save; `400`/`404` details map onto fields.
- `/recipes/:slug` — hero image, title, description, times/servings, tags, grouped ingredients at stored servings (no scaling control in v1), numbered steps, notes, source link. Edit/delete shown only when permitted.
- `/shopping-list` — searchable multi-select of recipes; each selection has a servings input prefilled with the recipe's servings; preview pane renders `text`; **Copy** button. Selection state lives in the URL query string so a refresh keeps it.
- `/account` — change password; session list with user agent, IP, last seen, current marker; revoke one / sign out everywhere.
- `/admin/users` — user table (role, status, last login), Invite dialog (role, copy link, expiry), pending invites with revoke, disable/enable, role toggle, issue reset link. Last-admin violations surface the server's `409`.

Conventions

- No optimistic updates; submit buttons disable while in flight; success feedback is a toast.
- Global `401` handler redirects to `/login?next=<path>`; `/login` honors `next`.
- Destructive actions confirm inline (not `window.confirm`).
- All inputs have labels; focus is visible; the invite/password dialogs trap focus and close on `Escape`; color contrast meets WCAG AA on the default theme.
- Clipboard: try `navigator.clipboard.writeText`. On failure (non-secure context, e.g. plain-HTTP LAN), select the preview `<textarea>` and use `document.execCommand('copy')`; if that also fails, show "Copy failed — select the text and copy manually."
- Failed list/detail loads show a retry button; loading states use skeletons, not spinners over content.

---

## 11. Images

- One optional image per recipe. `multipart/form-data`, field `file`, max `MAX_UPLOAD_MB` (default 5 MB); `413 payload_too_large` above it.
- Accept JPEG/PNG/WebP only, verified by magic bytes and decoded by `sharp`; declared content type and extension are ignored. Anything else → `415 unsupported_media_type`.
- Processing: auto-rotate from EXIF, strip all metadata, re-encode WebP q≈82, long edge ≤ 1600 (`full`) and ≤ 400 (`thumb`). Animated inputs are flattened to the first frame.
- Write atomically: encode to temp files in the same directory, then rename. Store at `/data/uploads/{recipeId}/{sha256-8}.webp` and `-thumb.webp`; `image_path`/`image_thumb_path` hold paths relative to `DATA_DIR`. Replacing or deleting removes the previous files.
- Boot-time orphan cleanup: delete files under `uploads/` that no recipe row references. Never delete files referenced by a row.
- Served only via `GET /api/recipes/:slug/image` with `Cache-Control: private, max-age=86400, immutable` and `X-Content-Type-Options: nosniff`. `uploads/` is never statically mounted.
- Uploads require `Content-Length` under the cap and are streamed to a temp file, never fully buffered.

---

## 12. Runtime and deployment

Single image, single port, single process. Operator owns TLS, proxying, and backups.

- Base `node:24-bookworm-slim`; multi-stage: builder installs dev deps and builds shared → server → web, runtime stage installs production deps only (`npm ci --omit=dev`) and copies `server/dist`, `web/dist`, `shared` runtime files, `migrations/`.
- Runs as non-root `node` (uid 10001), `tini` as PID 1, `EXPOSE 3000`.
- Boot order: check `DATA_DIR` writable → open DB with pragmas → apply migrations (transaction per file) → start cleanup timer → seed admin if applicable → listen. Any failure exits non-zero with a clear log line.
- Static serving: hashed assets under `/assets` get `Cache-Control: public, max-age=31536000, immutable`; `index.html` gets `no-cache`. Brotli/gzip via `@fastify/compress`.
- JSON bodies limited to 512 KB; multipart limited to one file and the configured image cap.
- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting, drain in-flight requests (10 s), close the DB, clear timers, exit 0.
- `HEALTHCHECK` runs `node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
- `/data` contains `db.sqlite`, `-wal`, `-shm`, and `uploads/`; created with mode 0700 if missing.

### Environment

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `production` in image | `production` requires `PUBLIC_URL` |
| `PORT` | `3000` | listen port |
| `DATA_DIR` | `/data` | DB + uploads |
| `PUBLIC_URL` | — | absolute base for invite links; **required** in production |
| `ALLOWED_ORIGINS` | value of `PUBLIC_URL` | comma-separated origins accepted for CSRF checks |
| `COOKIE_SECURE` | `true` | `false` only for plain-HTTP LAN/dev |
| `TRUST_PROXY` | `false` | trust `X-Forwarded-*`; set when behind a proxy |
| `SESSION_TTL_DAYS` | `30` | sliding session lifetime |
| `INVITE_TTL_HOURS` | `168` | invite lifetime (reset links are always 1h) |
| `MAX_UPLOAD_MB` | `5` | image cap |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | first-boot admin only |
| `LOG_LEVEL` | `info` | pino level |

`PUBLIC_URL` handling is explicit, never inferred: production boot fails if it is unset or not an absolute `http(s)` URL; in development it may be `http://localhost:5173`; creating an invite returns `503 not_configured` if it is empty at runtime.

### Ops notes (operator's responsibility, not in the repo)

- Terminate TLS at the proxy; set `TRUST_PROXY=true`, `COOKIE_SECURE=true`, `PUBLIC_URL=https://…`; add HSTS at the proxy. Do not publish port 3000 directly.
- Backups: `sqlite3 /data/db.sqlite ".backup '/backup/db-$(date +%F).sqlite'"` plus a tar of `/data/uploads`; nightly, offsite. Never `cp` a live WAL database; use `.backup` or stop the container.
- Verify a restore at least once: boot the image against a restored volume.

---

## 13. Security posture

Internet-reachable by design, so this is v1 scope.

- Argon2id and dummy-hash timing as specified in §4.
- Sessions: token only in the cookie, hashed at rest; revoked on password change (others), admin reset (all), disable (all).
- **CSRF**: `SameSite=Lax` plus an origin check on every non-`GET`/`HEAD` `/api` request. Read `Origin`; if absent, use `Referer`; if neither is present → `403 csrf_failed`. Compare normalized `scheme://host[:port]` against `ALLOWED_ORIGINS` (comma-split of `PUBLIC_URL` by default). This applies to multipart uploads too.
- **Bearer tokens** bypass the CSRF check by design; they must still be valid, unexpired, and owned by an enabled user. Tokens are hashed at rest, shown once, and revocable.
- Rate limits per §4, returning `Retry-After`.
- `@fastify/helmet` in production: `contentSecurityPolicy` with `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`. CSP is disabled in development because Vite requires inline bootstrap code.
- No inline `<style>` elements or `style=` attributes in the SPA (use Tailwind classes) so the CSP holds.
- No user enumeration: identical responses for unknown usernames and wrong passwords; invite failures are generic.
- Disabled accounts are rejected at session lookup and their sessions are deleted at disable time.
- Body limits: 512 KB JSON, 5 MB image; unknown `/api` routes return the JSON error envelope with 404.
- Logs: pino JSON, request id, method, path, status, duration. Redact `password`, `token`, `cookie`, `authorization`, and invite tokens. Never log request bodies.
- Server errors return `internal_error` with a generic message; details go to logs only.

---

## 14. Testing

- **Unit (Vitest, `shared/`):** parser table ≥ 40 cases (including every row in §6 and the malformed cases), product-size rule, `formatQuantity` (integers, glyphs, tolerance boundaries, ranges), unit pluralization, merge algorithm (ranges, mixed units, null quantities, note dedupe, sort stability, scale rounding), slug generation (Finnish diacritics, collisions, empty title), `search_text` builder.
- **Route (Vitest + `fastify.inject`, temp `DATA_DIR` per file):** bootstrap admin, login success/failure, session sliding and expiry, cookie flags, invite create/validate/accept/reuse/expiry, reset flow, password change revocation, CSRF (missing Origin, wrong Origin, allowed Origin), rate limiter (429 + `Retry-After`), permission matrix (anonymous / member / creator / other member / admin across read, update, delete, image), recipe validation limits, slug stability across title change, search escaping and non-ASCII matching, tag AND filtering, pagination bounds, shopping-list errors, upload magic-byte and size rejection, last-admin guard, disable killing sessions.
- **E2E (Playwright, `npm run build && npm run seed:e2e`, app on :3111):** the seven flows in §2; clipboard via `context.grantPermissions(['clipboard-read','clipboard-write'])`; a second case asserting the manual-copy fallback with `navigator.clipboard` stubbed unavailable.
- **Seed data:** two users (`admin`/`member` with fixed test-only passwords), three recipes across two tags, one with an image fixture. `seed:e2e` refuses to run when `NODE_ENV=production`.
- **CI:** `npm ci` → `typecheck` → `lint` → `test` → `build` → `docker build` → run image with a temp volume → wait for `/api/health` → `test:e2e`. Fail on any non-zero exit.

---

## 15. Milestones and acceptance criteria

Each milestone is done when its criteria pass in CI and against the built image.

**M0 — Skeleton**
- Build succeeds; container boots on an empty volume; migrations applied; `/api/health` returns `{ok:true}`.
- SPA shell renders at `/` and deep links fall back to `index.html`.
- CI pipeline green.

**M1 — Auth**
- First boot with env vars creates exactly one admin; second boot changes nothing.
- Login sets a correctly flagged cookie; `staySignedIn` toggles persistence; `/api/auth/me` returns the user; logout clears both.
- Invite: create → validate → accept → login works; reuse, expiry, and unknown tokens all return `400 invite_invalid`.
- Password change revokes other sessions but not the current one.
- Cross-origin POST returns `403 csrf_failed`; 11th login attempt in 15 min returns `429`.

**M2 — Recipes**
- Full CRUD with sections, tags, ranges, and unquantified lines; PUT is a full replace.
- Slug is stable across title edits.
- Search matches a Finnish title case-insensitively and an ingredient name; tag filter ANDs.
- Permission matrix: other members get `403` on edit/delete; admin succeeds.

**M3 — Images**
- 4 MB JPEG → 200 with `full` and `thumb` WebP on disk and served with private caching.
- 6 MB file → `413`; `.txt` named `.jpg` → `415`; unauthenticated image GET → `401`.
- Replacing an image removes the old files; deleting the recipe leaves no orphans after boot cleanup.

**M4 — Shopping list**
- Parser and merge test tables green.
- Two recipes at different servings produce the expected `text` byte-for-byte.
- Empty selection → `400`; unknown recipe → `404`.
- Copy works in a secure context and the fallback works in a plain-HTTP context.

**M5 — Admin**
- Invite, revoke, disable, re-enable, role change, and reset link all work end-to-end.
- Disabling a user kills their live session on the next request.
- The only admin cannot be disabled or demoted, by self or others.

**M6 — Ship**
- Helmet headers present in production; CSP blocks an injected inline script.
- No credentials, tokens, or request bodies appear in logs.
- All seven §2 flows pass E2E against the built image.

---

## 16. Decision log

Resolved during spec interview (2026-11-27):

- Stack: TypeScript / Node 24, Fastify + React SPA, SQLite/WAL with Kysely and plain SQL migrations.
- Auth: individual accounts (not a shared household login, not OIDC).
- Accounts created only by admin via single-use invite links; no SMTP; admin-issued set-password links for recovery.
- Visibility: shared library, `created_by` ownership, creator-or-admin writes.
- Ingredients structured `{quantity, quantity_max, unit, name, note}` with a forgiving parser and a structured editor.
- Quantities numeric with range support; unquantified lines merge by name only.
- Optional component groups on ingredients and steps; groups are ignored by the merge.
- Photos: optional, single hero image, upload, local volume, sharp re-encode.
- Shopping list: stateless merge of selected recipes, servings scaling, plain-text output, no unit conversion.
- Search: substring on title + ingredient names, tag filter; FTS5 deferred.
- Sessions: DB-backed, 30-day sliding, revocable.
- Admin surface: in-app `/admin/users` page.
- Deploy: one image, one port, single-process; operator supplies proxy/TLS/backups.
- Exposure is public, therefore TLS, secure cookies, CSRF checks, and rate limits are in v1.

Clarifications added on the readiness review (same date):

- Removed `must_change_password`; invitees and reset flows set their own passwords, so the flag had no writer.
- `quantity_max` carries ranges end-to-end; nothing is collapsed.
- Product sizes (`1 x 400g tin …`) are preserved in `note` instead of being dropped.
- `PUBLIC_URL` is required in production; `ALLOWED_ORIGINS` makes the CSRF check configurable per environment; invite creation fails loudly without it.
- "Stay signed in" affects cookie persistence only; the DB session is always 30-day sliding.
- Merged totals render with a 0.01 fraction tolerance.
- Slugs transliterate diacritics (including Finnish `ä/ö`) and never change.
- Search runs against a precomputed lowercase `search_text` because SQLite's `LIKE`/`NOCASE` are ASCII-only.
- Recipe write contract, validation limits, error-code table, repo layout, dev workflow, and per-milestone acceptance criteria are now specified.

## 17. Implementation notes (as built)

- Sessions carry a `persistent` flag so sliding expiry re-issues `Max-Age` only for "stay signed in" sessions.
- HSTS is not set by the app (the proxy owns it), and `upgrade-insecure-requests` is omitted from the CSP so the documented `COOKIE_SECURE=false` plain-HTTP LAN mode works.
- Hot read paths (session lookup, recipe search, tag aggregation) use `better-sqlite3` prepared statements; writes go through Kysely. Both share one connection and the same pragmas.
- The SPA chunk is a single ~121 KB gzipped bundle because it shares the Zod schemas with the server; code-splitting is a later optimization, not a correctness issue.
- `npm run test:e2e` builds first; the E2E webServer seeds a disposable `.e2e-data` directory and serves on port 3111.
- Node 24 is the image base; development was verified on Node 26.
- `npm run seed` is a local tool: it refuses `--e2e` under `NODE_ENV=production` and otherwise forces development mode.
- Personal API tokens (`migrations/0002_api_tokens.sql`) were added after v1: bearer resolution runs before the CSRF check, expiry and disabled-user state are checked per request, and the rate-limit key is a hash of the `Authorization` header.

## 18. Deferred (not open, just later)

URL import (schema.org/Recipe JSON-LD), SQLite FTS5 search, unit conversion, meal planning, collections/cookbooks, multiple photos, public read-only pages, OIDC, i18n, recipe JSON export, image CDN/object storage, display-name editing, recipe duplication.
