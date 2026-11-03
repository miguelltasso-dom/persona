import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatContextBenchReport, runContextBench } from '../src/context/bench.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const samples = await runContextBench([1_000, 10_000, 100_000], 1)
const report = formatContextBenchReport(samples)
writeFileSync(resolve(root, 'persona-spec/reports/bench-context.md'), report)
process.stdout.write(report)
