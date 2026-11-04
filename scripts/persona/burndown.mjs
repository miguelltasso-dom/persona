#!/usr/bin/env node
// Persona burn-down (Keel, D-066): counts the task rows of persona-spec/PLAN.md by status and prints one Status line.
// Usage: node scripts/persona/burndown.mjs [--json] [--wip]   (--wip: open (`doing`) items per owner; > 2 is over the D-076 limit)
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const NL = String.fromCharCode(10)
const counts = { done: 0, review: 0, doing: 0, todo: 0, blocked: 0 }
const wip = new Map()
const KNOWN = ['Forge', 'Anvil', 'Rivet', 'Prism', 'Lumen', 'Muse', 'Probe', 'Gauge', 'Tally', 'Quill', 'Brush', 'Flint', 'Ember', 'Bolt']
for (const line of readFileSync(join(root, 'persona-spec', 'PLAN.md'), 'utf8').split(NL)) {
  if (!/^\| *[A-Z][A-Za-z0-9]*(?:-[A-Z0-9]+)*-?\d+[a-z]?[ ]*\|/u.test(line) || !line.trimEnd().endsWith('|')) continue
  const cells = line.trimEnd().split('|')
  if (cells.length !== 8) continue // task tables have 6 columns
  const status = cells[cells.length - 2].trim().toLowerCase().replace(/^\*\*/u, '')
  const key = status.startsWith('done') ? 'done' : status.startsWith('review') ? 'review' : status.startsWith('doing') ? 'doing' : status.startsWith('todo') ? 'todo' : status.startsWith('blocked') ? 'blocked' : undefined
  if (key !== undefined) counts[key] += 1
  if (key === 'doing') {
    const owner = cells[cells.length - 5] ?? ''
    // `Gauge (era Probe)` -> the current owner is the first name; `Forge + Anvil` -> both carry the item
    const current = owner.replace(/\(era [^)]*\)/gu, '')
    for (const name of KNOWN) if (new RegExp(`\\b${name}\\b`, 'u').test(current)) wip.set(name, [...(wip.get(name) ?? []), cells[1].trim()])
  }
}
if (process.argv.includes('--wip')) {
  const rows = [...wip.entries()].sort((a, b) => b[1].length - a[1].length)
  console.log(rows.map(([name, items]) => `${name} ${items.length}${items.length > 2 ? '!' : ''} (${items.slice(0, 6).join(', ')}${items.length > 6 ? ', …' : ''})`).join(' · '))
} else if (process.argv.includes('--json')) console.log(JSON.stringify(counts))
else console.log(`burn-down: done ${counts.done} / aceite ${counts.review} / doing ${counts.doing} / todo ${counts.todo}${counts.blocked > 0 ? ` / blocked ${counts.blocked}` : ''}`)
