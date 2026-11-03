import { formatSoakReport, openMemorySoak, runSoak } from '../src/index.ts'

const report = runSoak(openMemorySoak)
process.stdout.write(formatSoakReport(report))
process.stdout.write(`${JSON.stringify({
  eventsPerDay: report.eventsPerDay,
  tokensPerDay: report.tokensPerDay,
  sizeStart: report.sizeStart,
  sizeEnd: report.sizeEnd,
  sizePeakLive: report.sizePeakLive,
  ticketsCreated: report.ticketsCreated,
  triggersProcessed: report.triggersProcessed,
  triggersDuplicated: report.triggersDuplicated,
  proposalIntervalStart: report.proposalIntervalStart,
  proposalIntervalEnd: report.proposalIntervalEnd,
  hostRestarts: report.hostRestarts,
  clockJumps: report.clockJumps,
}, null, 2)}\n`)
