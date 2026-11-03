/** Print F3 pre-router before/after model-call counts. No real CLI. */
import { formatCoordEvalReport, runCoordEval } from '../src/bench/coord-eval.ts'

const report = await runCoordEval()
process.stdout.write(`${JSON.stringify(report.preRoute, null, 2)}\n`)
process.stdout.write(formatCoordEvalReport(report))
