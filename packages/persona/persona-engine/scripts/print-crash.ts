import { formatCrashReport, runCrashSweep } from '../src/index.ts'

const report = runCrashSweep()
process.stdout.write(formatCrashReport(report))
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
