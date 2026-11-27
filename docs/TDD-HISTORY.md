# TDD history

## Why this file exists

The application was first implemented in a working directory with no version
control, so the original red -> green runs were not preserved anywhere the
repository could show. Rather than assert the order, this history makes it
auditable: the finished tree was snapshotted, every implementation file was
removed, the complete test suite was committed and run (failing), and the
implementation was then restored in layers, each layer's tests run and
committed as green.

This is a **verified reconstruction**, not the original timestamps. The final
tree is identical to the pre-history snapshot; only `.gitignore` gained an
entry for `.commandcode/`.

## Recorded sequence

| Commit | Contents | Test evidence |
|---|---|---|
| `9ec653f` | Every test file, config and manifest. **No** `shared/src`, `server/src`, `web/src`, `migrations/` or deployment files. | `npx vitest run` -> **11/11 suites fail**, exit 1. `docs/tdd-history/00-tests-only-red.log`, re-verified at `05-verify-C0-red.log` |
| `671ec7a` | `shared/`: parser, units, merge, formatting, slugs, search text, Zod schemas | `npx vitest run shared` -> **151 passed**. Server suites still red (no server yet): **5 failed**. `01-shared-green.log`, `06-verify-C1.log` |
| `17ad543` | `server/` and `migrations/`: M0 migrations/health through M5 admin, including recipes, images and shopping | `npx vitest run` -> **227 passed**. `02-server-green.log`, `07-verify-C2-green.log` |
| `9acf18a` | `web/` SPA, seed and e2e scripts, Dockerfile, CI | `npm run build` exit 0; `npx playwright test` -> **3/3 passed**. `03-web-build.log`, `04-web-e2e-green.log` |
| HEAD | Documentation, audit tooling and the final gate | `npm run audit:tdd` -> **10/10 phases red->green**; `npm test` 227, `lint`, `typecheck`, `build`, Playwright 3/3. `08-audit-green.log`, `09-final-gate.log`, `10-final-e2e.log` |

Each log in `docs/tdd-history/` was produced by running the stated command
against the tree at that commit.

## Replay it yourself

```bash
# C0: tests exist, implementation does not
git worktree add /tmp/herrku-c0 9ec653f
ln -s "$PWD/node_modules" /tmp/herrku-c0/node_modules
(cd /tmp/herrku-c0 && npx vitest run)      # exit 1, 11 failed
git worktree remove --force /tmp/herrku-c0

# C1: shared implemented, server still absent
git worktree add /tmp/herrku-c1 671ec7a
ln -s "$PWD/node_modules" /tmp/herrku-c1/node_modules
(cd /tmp/herrku-c1 && npx vitest run shared)   # 151 passed
(cd /tmp/herrku-c1 && npx vitest run server)   # still red, 5 failed
git worktree remove --force /tmp/herrku-c1

# C2: all 227 unit/route tests green
git worktree add /tmp/herrku-c2 17ad543
ln -s "$PWD/node_modules" /tmp/herrku-c2/node_modules
(cd /tmp/herrku-c2 && npx vitest run)      # 227 passed
git worktree remove --force /tmp/herrku-c2
```

The symlink reuses the installed dependencies; it is untracked and never
committed.

## Per-phase behaviour audit

`npm run audit:tdd` (source in `scripts/tdd-audit.mjs`, results in
`docs/TDD.md`) goes further at HEAD: for each milestone it injects a defect,
proves the corresponding tests fail, restores, and proves they pass. Phase 00
of the audit also removes `shared/src` and confirms the suite is red, matching
commit `9ec653f`.

## Extension: personal API tokens

The post-v1 token work followed the same order:

| Commit | Contents | Verification |
|---|---|---|
| `9f00b4a` | token route tests, the migration expectation in the health test, and the Playwright token flow | red at that commit: `/api/tokens` returns 404 and the Account page has no token section |
| `ab3a247` | `api_tokens` migration, bearer resolution, token routes, Account UI, docs | 238 Vitest tests, 4 Playwright flows, `lint`/`typecheck`/`build` green; audit phase `09-api-tokens` red->green |

The mutation audit now covers 11 phases (`docs/TDD.md`, `docs/tdd-audit.json`).

## Limits

Order in a recorded history is not proof of the order in a deleted one. What the
repository now demonstrates is that the tests exist independently of the
implementation (C0 runs and fails with no source), that every layer was added
after its tests existed, and that the committed states were re-verified from
clean worktrees with the commands shown above.
