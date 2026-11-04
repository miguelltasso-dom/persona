/** Freeze persona-spec/baselines/token-faithful.json from the faithful scripted runner (OPT-2). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faithfulSnapshot } from '../src/bench/token-gate.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const dest = resolve(root, 'persona-spec/baselines/token-faithful.json')
mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, `${JSON.stringify(faithfulSnapshot(), null, 2)}\n`)
process.stdout.write(`wrote ${dest}\n`)
