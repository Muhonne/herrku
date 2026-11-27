# TDD audit

Generated 2026-11-27T17:11:15.980Z on Node v26.13.0.

## Method

Each phase pairs a behavioural mutation with the tests that are supposed to protect
it. The audit injects the defect, runs those tests, and asserts a **failing** result;
it then restores the file and asserts a **passing** result. Phase 00 goes further and
removes `shared/src` entirely, which reproduces the state the shared suite was first
written against.

Authorship order cannot be recovered from a source snapshot, so this audit does not
claim it. What it does establish is that every phase has a real red state, that the
tests fail for the intended reason, and that the suite is not vacuous. The audit is
reproducible with `npm run audit:tdd`; raw runs are in `docs/tdd-logs/` and the
machine-readable result is `docs/tdd-audit.json`.

## Results

| Phase | Area | Injected defect | Red (exit — first failure) | Restored | Verdict |
|---|---|---|---|---|---|
| 00-tests-before-implementation | Shared test suites exist and fail with no implementation at all | Move shared/src away entirely | 1 — FAIL  shared/test/format.test.ts [ shared/test/format.test.ts ] | 0 | pass |
| 01-shared-parser | Shared: ingredient parser (leading whitespace handling) | Stop trimming whitespace before unit matching | 1 — × parseIngredient > parses "1 1/2 cups flour" | 0 | pass |
| 02-shared-merge-notes | Shared: shopping merge note de-duplication | Accept duplicate notes | 1 — × mergeShoppingList > dedupes notes case-insensitively and keeps the first spelling | 0 | pass |
| 03-m0-migrations | M0: migrations run once per database | Re-apply already-applied migrations | 1 — × migrations > is idempotent across boots on the same data dir | 0 | pass |
| 04-m1-auth | M1: login rejects wrong passwords | Skip password verification failure | 1 — × login > returns the same generic error for a wrong password and an unknown user | 0 | pass |
| 05-m2-search | M2: search ignores one-character queries | Filter on single-character queries | 1 — × search > ignores queries shorter than two characters | 0 | pass |
| 06-m3-image-permissions | M3: only the creator or admin may upload an image | Remove the upload permission check | 1 — × image upload > forbids a non-owner member from uploading | 0 | pass |
| 07-m4-scaling | M4: shopping list scales by requested servings | Ignore the servings multiplier | 1 — × POST /api/shopping-list > merges, scales and renders a plain-text list | 0 | pass |
| 08-m5-last-admin | M5: the last active admin cannot be removed | Disable the last-admin guard | 1 — × disabled accounts > refuses to disable the last admin | 0 | pass |
| 09-api-tokens | Personal API tokens: expiry is enforced | Accept expired bearer tokens | 1 — × api tokens > rejects unknown, revoked and expired tokens | 0 | pass |
| 10-ui-clipboard | UI: the copy button actually writes to the clipboard | Report success without writing to the clipboard | 1 — ✘  1 [chromium] › e2e/app.spec.ts:11:1 › creates a recipe, finds it by search, and copies a shopping list (799ms) | 0 | pass |

## Detail

### 00-tests-before-implementation — Shared test suites exist and fail with no implementation at all
Mutation: Move shared/src away entirely
Red: exit 1; failing tests:
- FAIL  shared/test/format.test.ts [ shared/test/format.test.ts ]
- FAIL  shared/test/merge.test.ts [ shared/test/merge.test.ts ]
- FAIL  shared/test/parser.test.ts [ shared/test/parser.test.ts ]
- FAIL  shared/test/search-text.test.ts [ shared/test/search-text.test.ts ]
- FAIL  shared/test/slug.test.ts [ shared/test/slug.test.ts ]
- FAIL  shared/test/units.test.ts [ shared/test/units.test.ts ]
Restored: exit 0
Logs: `docs/tdd-logs/00-tests-before-implementation.red.log`, `docs/tdd-logs/00-tests-before-implementation.green.log`
### 01-shared-parser — Shared: ingredient parser (leading whitespace handling)
Mutation: Stop trimming whitespace before unit matching
Red: exit 1; failing tests:
- × parseIngredient > parses "1 1/2 cups flour"
- × parseIngredient > parses "½ tsp salt"
- × parseIngredient > parses "1/2 cup milk"
- × parseIngredient > parses "1½ tbsp sugar"
- FAIL  shared/test/parser.test.ts > parseIngredient > parses "1 1/2 cups flour"
- FAIL  shared/test/parser.test.ts > parseIngredient > parses "1½ tbsp sugar"
Restored: exit 0
Logs: `docs/tdd-logs/01-shared-parser.red.log`, `docs/tdd-logs/01-shared-parser.green.log`
### 02-shared-merge-notes — Shared: shopping merge note de-duplication
Mutation: Accept duplicate notes
Red: exit 1; failing tests:
- × mergeShoppingList > dedupes notes case-insensitively and keeps the first spelling
- FAIL  shared/test/merge.test.ts > mergeShoppingList > dedupes notes case-insensitively and keeps the first spelling
Restored: exit 0
Logs: `docs/tdd-logs/02-shared-merge-notes.red.log`, `docs/tdd-logs/02-shared-merge-notes.green.log`
### 03-m0-migrations — M0: migrations run once per database
Mutation: Re-apply already-applied migrations
Red: exit 1; failing tests:
- × migrations > is idempotent across boots on the same data dir
- FAIL  server/test/health.test.ts > migrations > is idempotent across boots on the same data dir
Restored: exit 0
Logs: `docs/tdd-logs/03-m0-migrations.red.log`, `docs/tdd-logs/03-m0-migrations.green.log`
### 04-m1-auth — M1: login rejects wrong passwords
Mutation: Skip password verification failure
Red: exit 1; failing tests:
- × login > returns the same generic error for a wrong password and an unknown user
- × rate limiting > returns 429 with Retry-After after too many login attempts
- FAIL  server/test/auth.test.ts > login > returns the same generic error for a wrong password and an unknown user
- FAIL  server/test/auth.test.ts > rate limiting > returns 429 with Retry-After after too many login attempts
Restored: exit 0
Logs: `docs/tdd-logs/04-m1-auth.red.log`, `docs/tdd-logs/04-m1-auth.green.log`
### 05-m2-search — M2: search ignores one-character queries
Mutation: Filter on single-character queries
Red: exit 1; failing tests:
- × search > ignores queries shorter than two characters
- FAIL  server/test/recipes.test.ts > search > ignores queries shorter than two characters
Restored: exit 0
Logs: `docs/tdd-logs/05-m2-search.red.log`, `docs/tdd-logs/05-m2-search.green.log`
### 06-m3-image-permissions — M3: only the creator or admin may upload an image
Mutation: Remove the upload permission check
Red: exit 1; failing tests:
- × image upload > forbids a non-owner member from uploading
- FAIL  server/test/images.test.ts > image upload > forbids a non-owner member from uploading
Restored: exit 0
Logs: `docs/tdd-logs/06-m3-image-permissions.red.log`, `docs/tdd-logs/06-m3-image-permissions.green.log`
### 07-m4-scaling — M4: shopping list scales by requested servings
Mutation: Ignore the servings multiplier
Red: exit 1; failing tests:
- × POST /api/shopping-list > merges, scales and renders a plain-text list
- FAIL  server/test/shopping.test.ts > POST /api/shopping-list > merges, scales and renders a plain-text list
Restored: exit 0
Logs: `docs/tdd-logs/07-m4-scaling.red.log`, `docs/tdd-logs/07-m4-scaling.green.log`
### 08-m5-last-admin — M5: the last active admin cannot be removed
Mutation: Disable the last-admin guard
Red: exit 1; failing tests:
- × disabled accounts > refuses to disable the last admin
- FAIL  server/test/auth.test.ts > disabled accounts > refuses to disable the last admin
Restored: exit 0
Logs: `docs/tdd-logs/08-m5-last-admin.red.log`, `docs/tdd-logs/08-m5-last-admin.green.log`
### 09-api-tokens — Personal API tokens: expiry is enforced
Mutation: Accept expired bearer tokens
Red: exit 1; failing tests:
- × api tokens > rejects unknown, revoked and expired tokens
- FAIL  server/test/tokens.test.ts > api tokens > rejects unknown, revoked and expired tokens
Restored: exit 0
Logs: `docs/tdd-logs/09-api-tokens.red.log`, `docs/tdd-logs/09-api-tokens.green.log`
### 10-ui-clipboard — UI: the copy button actually writes to the clipboard
Mutation: Report success without writing to the clipboard
Red: exit 1; failing tests:
- ✘  1 [chromium] › e2e/app.spec.ts:11:1 › creates a recipe, finds it by search, and copies a shopping list (799ms)
Restored: exit 0
Logs: `docs/tdd-logs/10-ui-clipboard.red.log`, `docs/tdd-logs/10-ui-clipboard.green.log`
