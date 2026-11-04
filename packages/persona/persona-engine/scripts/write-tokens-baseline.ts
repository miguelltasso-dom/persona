/** Write persona-spec/reports/tokens-baseline.md from the scripted OPT-1 suite. */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatTokensBaselineMarkdown } from '../src/token-measure.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const dest = resolve(root, 'persona-spec/reports/tokens-baseline.md')
writeFileSync(dest, formatTokensBaselineMarkdown())
process.stdout.write(`wrote ${dest}\n`)
