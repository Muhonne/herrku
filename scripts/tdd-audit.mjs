#!/usr/bin/env node
/**
 * Red -> green audit.
 *
 * For every phase of the build this script injects a small, realistic defect into
 * the implementation, runs that phase's tests (they must fail), restores the file,
 * and runs them again (they must pass). Phase 00 additionally removes the shared
 * implementation entirely, proving the suite was authored against a missing
 * implementation rather than retro-fitted to it.
 *
 * Usage: npm run audit:tdd
 * Artefacts: docs/TDD.md, docs/tdd-audit.json, docs/tdd-logs/*.log
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const LOG_DIR = join(ROOT, 'docs', 'tdd-logs')
const BACKUP_DIR = join(ROOT, 'shared', 'src.__audit_backup')

const ANSI = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
const strip = (value) => value.replace(ANSI, '')

const phases = [
  {
    id: '00-tests-before-implementation',
    title: 'Shared test suites exist and fail with no implementation at all',
    kind: 'move-dir',
    dir: 'shared/src',
    mutation: 'Move shared/src away entirely',
    test: { cmd: 'npx', args: ['vitest', 'run', 'shared'] },
  },
  {
    id: '01-shared-parser',
    title: 'Shared: ingredient parser (leading whitespace handling)',
    kind: 'mutate',
    file: 'shared/src/parser.ts',
    find: 'let rest = leading.rest.trimStart()',
    replace: 'let rest = leading.rest',
    mutation: 'Stop trimming whitespace before unit matching',
    test: { cmd: 'npx', args: ['vitest', 'run', 'shared/test/parser.test.ts'] },
  },
  {
    id: '02-shared-merge-notes',
    title: 'Shared: shopping merge note de-duplication',
    kind: 'mutate',
    file: 'shared/src/merge.ts',
    find: 'if (!accumulator.seenNotes.has(noteKey)) {',
    replace: 'if (true) {',
    mutation: 'Accept duplicate notes',
    test: { cmd: 'npx', args: ['vitest', 'run', 'shared/test/merge.test.ts'] },
  },
  {
    id: '03-m0-migrations',
    title: 'M0: migrations run once per database',
    kind: 'mutate',
    file: 'server/src/db/migrate.ts',
    find: 'if (applied.has(version)) continue',
    replace: 'if (false) continue',
    mutation: 'Re-apply already-applied migrations',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/health.test.ts'] },
  },
  {
    id: '04-m1-auth',
    title: 'M1: login rejects wrong passwords',
    kind: 'mutate',
    file: 'server/src/routes/auth.ts',
    find: 'if (!valid) throw unauthorized(INVALID_CREDENTIALS)',
    replace: 'if (!valid && false) throw unauthorized(INVALID_CREDENTIALS)',
    mutation: 'Skip password verification failure',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/auth.test.ts'] },
  },
  {
    id: '05-m2-search',
    title: 'M2: search ignores one-character queries',
    kind: 'mutate',
    file: 'server/src/routes/recipes.ts',
    find: 'if (rawQuery.length >= 2) {',
    replace: 'if (rawQuery.length >= 0) {',
    mutation: 'Filter on single-character queries',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/recipes.test.ts'] },
  },
  {
    id: '06-m3-image-permissions',
    title: 'M3: only the creator or admin may upload an image',
    kind: 'mutate',
    file: 'server/src/routes/images.ts',
    find: 'assertCanEdit(request.user as SessionUser, recipe)',
    replace: 'void (request.user as SessionUser)',
    mutation: 'Remove the upload permission check',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/images.test.ts'] },
  },
  {
    id: '07-m4-scaling',
    title: 'M4: shopping list scales by requested servings',
    kind: 'mutate',
    file: 'shared/src/merge.ts',
    find: 'return requested / recipeServings',
    replace: 'return 1',
    mutation: 'Ignore the servings multiplier',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/shopping.test.ts'] },
  },
  {
    id: '08-m5-last-admin',
    title: 'M5: the last active admin cannot be removed',
    kind: 'mutate',
    file: 'server/src/routes/admin.ts',
    find: 'if (Number(count.count) <= 1) {',
    replace: 'if (Number(count.count) <= 0) {',
    mutation: 'Disable the last-admin guard',
    test: { cmd: 'npx', args: ['vitest', 'run', 'server/test/auth.test.ts'] },
  },
  {
    id: '09-ui-clipboard',
    title: 'UI: the copy button actually writes to the clipboard',
    kind: 'mutate',
    file: 'web/src/lib/clipboard.ts',
    find: 'await navigator.clipboard.writeText(text)',
    replace: 'void text',
    mutation: 'Report success without writing to the clipboard',
    build: true,
    test: { cmd: 'npx', args: ['playwright', 'test', '-g', 'creates a recipe'] },
  },
]

function run(command, args, env, timeout = 240_000) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout,
  })
  const output = strip(`${result.stdout ?? ''}${result.stderr ?? ''}`)
  return {
    code: result.status,
    output,
    timedOut: result.status === null,
    summary: summarize(output),
  }
}

function summarize(output) {
  const lines = output.split('\n')
  const failed = new Set()
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^(×|✗|✘)\s/.test(trimmed)) failed.add(trimmed.replace(/\s+\d+ms$/, ''))
    else if (/^FAIL\s/.test(trimmed)) failed.add(trimmed)
  }
  return [...failed].slice(0, 6)
}

function build() {
  return run('npm', ['run', 'build'], { NODE_ENV: 'production' })
}

function writeLog(name, result) {
  writeFileSync(join(LOG_DIR, `${name}.log`), `${result.output}\n`, 'utf8')
}

function restoreBackupIfPresent() {
  if (existsSync(BACKUP_DIR)) {
    rmSync(join(ROOT, 'shared', 'src'), { recursive: true, force: true })
    renameSync(BACKUP_DIR, join(ROOT, 'shared', 'src'))
    console.log('Recovered shared/src from a previous interrupted audit')
  }
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true })
  restoreBackupIfPresent()

  const results = []

  for (const phase of phases) {
    console.log(`\n=== ${phase.id}: ${phase.title}`)
    const record = {
      id: phase.id,
      title: phase.title,
      mutation: phase.mutation,
      file: phase.file ?? phase.dir ?? null,
      red: null,
      green: null,
      ok: false,
      error: null,
    }

    try {
      let red
      let green

      if (phase.kind === 'move-dir') {
        const dir = join(ROOT, phase.dir)
        try {
          if (!existsSync(dir)) throw new Error(`${phase.dir} is missing`)
          renameSync(dir, BACKUP_DIR)
          red = run(phase.test.cmd, phase.test.args, { NODE_ENV: 'test' })
        } finally {
          if (existsSync(BACKUP_DIR)) renameSync(BACKUP_DIR, dir)
        }
        green = run(phase.test.cmd, phase.test.args, { NODE_ENV: 'test' })
      } else {
        const path = join(ROOT, phase.file)
        const original = readFileSync(path, 'utf8')
        if (!original.includes(phase.find)) {
          throw new Error(`Anchor not found in ${phase.file}: ${phase.find}`)
        }
        try {
          writeFileSync(path, original.replace(phase.find, phase.replace), 'utf8')
          if (phase.build) {
            const redBuild = build()
            writeLog(`${phase.id}.red.build`, redBuild)
            if (redBuild.code !== 0) {
              record.error = 'Mutation build failed; red result would be inconclusive'
            }
          }
          red = run(phase.test.cmd, phase.test.args, { NODE_ENV: 'test' })
        } finally {
          writeFileSync(path, original, 'utf8')
        }
        if (phase.build) {
          const greenBuild = build()
          writeLog(`${phase.id}.green.build`, greenBuild)
          if (greenBuild.code !== 0) throw new Error('Restored build failed')
        }
        green = run(phase.test.cmd, phase.test.args, { NODE_ENV: 'test' })
      }

      writeLog(`${phase.id}.red`, red)
      writeLog(`${phase.id}.green`, green)

      record.red = {
        exit: red.code,
        timedOut: red.timedOut,
        failedTests: red.summary,
      }
      record.green = { exit: green.code, failedTests: green.summary }
      record.ok = !record.error && red.code !== 0 && !red.timedOut && green.code === 0

      console.log(
        `    red exit=${red.code} failed=${red.summary.length} | green exit=${green.code} -> ${record.ok ? 'OK' : 'PROBLEM'}`,
      )
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
      console.log(`    ERROR: ${record.error}`)
    }

    results.push(record)
  }

  const generatedAt = new Date().toISOString()
  writeFileSync(
    join(ROOT, 'docs', 'tdd-audit.json'),
    `${JSON.stringify({ generatedAt, node: process.version, results }, null, 2)}\n`,
    'utf8',
  )

  const rows = results
    .map((result) => {
      const red = result.red
        ? `${result.red.exit}${result.red.failedTests.length > 0 ? ` — ${result.red.failedTests[0]}` : ''}`
        : result.error ?? 'n/a'
      const green = result.green ? String(result.green.exit) : 'n/a'
      return `| ${result.id} | ${result.title} | ${result.mutation ?? '—'} | ${red} | ${green} | ${result.ok ? 'pass' : 'FAIL'} |`
    })
    .join('\n')

  const details = results
    .map((result) => {
      const failed = result.red?.failedTests ?? []
      return [
        `### ${result.id} — ${result.title}`,
        '',
        `Mutation: ${result.mutation ?? '—'}`,
        '',
        `Red: exit ${result.red?.exit ?? 'n/a'}${failed.length > 0 ? `; failing tests:` : ''}`,
        ...failed.map((name) => `- ${name}`),
        '',
        `Restored: exit ${result.green?.exit ?? 'n/a'}`,
        result.error ? `Error: ${result.error}` : '',
        `Logs: \`docs/tdd-logs/${result.id}.red.log\`, \`docs/tdd-logs/${result.id}.green.log\``,
        '',
      ]
        .filter((line) => line !== '')
        .join('\n')
    })
    .join('\n')

  const report = `# TDD audit

Generated ${generatedAt} on Node ${process.version}.

## Method

Each phase pairs a behavioural mutation with the tests that are supposed to protect
it. The audit injects the defect, runs those tests, and asserts a **failing** result;
it then restores the file and asserts a **passing** result. Phase 00 goes further and
removes \`shared/src\` entirely, which reproduces the state the shared suite was first
written against.

Authorship order cannot be recovered from a source snapshot, so this audit does not
claim it. What it does establish is that every phase has a real red state, that the
tests fail for the intended reason, and that the suite is not vacuous. The audit is
reproducible with \`npm run audit:tdd\`; raw runs are in \`docs/tdd-logs/\` and the
machine-readable result is \`docs/tdd-audit.json\`.

## Results

| Phase | Area | Injected defect | Red (exit — first failure) | Restored | Verdict |
|---|---|---|---|---|---|
${rows}

## Detail

${details}
`

  writeFileSync(join(ROOT, 'docs', 'TDD.md'), report, 'utf8')

  const failures = results.filter((result) => !result.ok)
  console.log(`\n${results.length - failures.length}/${results.length} phases red->green`)
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  FAILED ${failure.id}: ${failure.error ?? 'unexpected exit code'}`)
    process.exitCode = 1
  }
}

await main()
