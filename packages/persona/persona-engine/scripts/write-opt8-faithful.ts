/** Write persona-spec/reports/opt8-faithful.md from the faithful runner (OPT-8, Tally). */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatOpt8FaithfulMarkdown } from '../src/bench/opt8-faithful.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const dest = resolve(root, 'persona-spec/reports/opt8-faithful.md')
writeFileSync(dest, formatOpt8FaithfulMarkdown())
process.stdout.write(`wrote ${dest}\n`)
