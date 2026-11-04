/** Write OPT-8 and v1-close reports from the scripted gates (D-068: one faithful pipeline). */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatOpt8AcceptanceMarkdown } from '../src/token-measure.ts'
import { assertV1Close, formatV1CloseMarkdown } from '../src/v1-close.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const opt8 = resolve(root, 'persona-spec/reports/opt8-acceptance.md')
const v1 = resolve(root, 'persona-spec/reports/v1-close.md')
assertV1Close()
writeFileSync(opt8, formatOpt8AcceptanceMarkdown())
writeFileSync(v1, formatV1CloseMarkdown())
process.stdout.write(`wrote ${opt8}\n`)
process.stdout.write(`wrote ${v1}\n`)
