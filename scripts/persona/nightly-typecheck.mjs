#!/usr/bin/env node
// Informative full-monorepo typecheck for persona-dev (Keel; D-060). Does NOT block publishing.
// Runs `pnpm run typecheck` in the current checkout (use it in the clean worktree) and writes persona-spec/reports/typecheck-full.md.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NL = String.fromCharCode(10)
const result = spawnSync('pnpm', ['run', 'typecheck'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, shell: process.platform === 'win32' })
const text = `${result.stdout}${result.stderr}`
const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const errors = text.split(NL).filter((line) => /error TS|TypertAnalysisError/.test(line))
const byPackage = new Map()
for (const line of errors) {
  const owner = /(packages\/[^/\s]+\/[^/\s(]+|apps\/[^/\s(]+)/u.exec(line)?.[1] ?? 'other'
  byPackage.set(owner, (byPackage.get(owner) ?? 0) + 1)
}
const lines = [
  '# Typecheck completo do monorepo (informativo, não bloqueia a persona-dev)',
  '',
  `Commit ${commit} em ${new Date().toISOString()} — ${result.status === 0 ? 'VERDE' : `VERMELHO (${errors.length} erros)`}.`,
  '',
  ...[...byPackage.entries()].sort((a, b) => b[1] - a[1]).map(([owner, count]) => `- ${owner}: ${count}`),
  '',
  ...errors.slice(0, 40).map((line) => `    ${line.trim().slice(0, 220)}`),
]
mkdirSync(join(root, 'persona-spec', 'reports'), { recursive: true })
writeFileSync(join(root, 'persona-spec', 'reports', 'typecheck-full.md'), lines.join(NL) + NL)
console.log(`typecheck-full: ${result.status === 0 ? 'green' : `red (${errors.length} errors)`} -> persona-spec/reports/typecheck-full.md`)
process.exit(0)
