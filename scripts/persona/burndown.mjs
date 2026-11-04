#!/usr/bin/env node
// Persona burn-down (Keel, D-066): counts the task rows of persona-spec/PLAN.md by status and prints one Status line.
// Usage: node scripts/persona/burndown.mjs [--json]
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NL = String.fromCharCode(10)
const counts = { done: 0, doing: 0, todo: 0, blocked: 0 }
for (const line of readFileSync(join(root, 'persona-spec', 'PLAN.md'), 'utf8').split(NL)) {
  if (!/^\| *[A-Z][A-Za-z0-9]*(?:-[A-Z0-9]+)*-?\d+[a-z]?[ ]*\|/u.test(line) || !line.trimEnd().endsWith('|')) continue
  const cells = line.trimEnd().split('|')
  if (cells.length !== 8) continue // task tables have 6 columns
  const status = cells[cells.length - 2].trim().toLowerCase().replace(/^\*\*/u, '')
  const key = status.startsWith('done') ? 'done' : status.startsWith('doing') ? 'doing' : status.startsWith('todo') ? 'todo' : status.startsWith('blocked') ? 'blocked' : undefined
  if (key !== undefined) counts[key] += 1
}
if (process.argv.includes('--json')) console.log(JSON.stringify(counts))
else console.log(`burn-down: done ${counts.done} / doing ${counts.doing} / todo ${counts.todo}${counts.blocked > 0 ? ` / blocked ${counts.blocked}` : ''}`)
