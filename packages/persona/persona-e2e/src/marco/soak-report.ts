/**
 * Marco DOGFOOD (M7): the report of the night (.md for people, .json for Probe and the audit).
 * Leak photos are taken once per simulated hour; the thresholds are MEASURED by the first run and frozen by the second.
 */
import { createHash } from 'node:crypto'
import type { Violation } from './invariants.ts'

/** One hourly photo of what could leak. */
export interface LeakPhoto {
  readonly hour: number
  /** `process.getActiveResourcesInfo().length`. */
  readonly resources: number
  /** Listeners on the host's event emitters and streams, as the driver counts them. */
  readonly listeners: number
  /** Bytes of the database file plus its WAL. */
  readonly dbBytes: number
  /** Rows of the events and outbox tables. */
  readonly rows: number
  /** `process.memoryUsage().heapUsed` after `gc()` (0 when `--expose-gc` is off). */
  readonly heapBytes: number
  /** Real-time soak only (Probe): resident memory of the host process tree. Absent in the accelerated in-process soak. */
  readonly rssBytes?: number
  /** Real-time soak only (Probe): live child processes of the host. */
  readonly children?: number
}

/** The schema name both soaks write (`schema` of the .json), so a reader can tell a stale file from a current one. */
export const SOAK_REPORT_SCHEMA = 'marco-soak/1'

/** Everything the report says. */
export interface SoakReport {
  /** Always {@link SOAK_REPORT_SCHEMA}. */
  readonly schema: typeof SOAK_REPORT_SCHEMA
  /** `accelerated` (Gauge: in-process, fake clock) or `realtime` (Probe: host as a real process). */
  readonly mode: 'accelerated' | 'realtime'
  readonly seed: number
  readonly simulatedHours: number
  readonly steps: number
  readonly stepMinutes: number
  readonly boards: readonly { readonly projectId: string; readonly todo: number; readonly doing: number; readonly review: number; readonly needsYou: number; readonly done: number }[]
  readonly turnsByProject: Readonly<Record<string, number>>
  readonly nudges: number
  readonly summaries: number
  readonly approvalsPending: number
  readonly injected: readonly { readonly atHour: number; readonly name: string; readonly outcome: string }[]
  readonly photos: readonly LeakPhoto[]
  readonly violations: readonly Violation[]
  /** Every host action of the night, in order, as the trace shows it (for the determinism hash). */
  readonly trace: readonly string[]
}

/** Same seed, same night: this hash of the trace must repeat. */
export function traceHash(trace: readonly string[]): string {
  return createHash('sha256').update(trace.join('\n')).digest('hex').slice(0, 16)
}

/**
 * Growth after the warm-up: the last photo against the photo at `warmHour`, per field.
 * A steady night grows little after the warm-up; a leak keeps growing.
 */
export function growthAfter(photos: readonly LeakPhoto[], warmHour: number): { resources: number; listeners: number; dbBytes: number; rows: number; heapBytes: number } | undefined {
  const warm = photos.find(photo => photo.hour >= warmHour)
  const last = photos[photos.length - 1]
  if (warm === undefined || last === undefined || warm === last) return undefined
  return { resources: last.resources - warm.resources, listeners: last.listeners - warm.listeners, dbBytes: last.dbBytes - warm.dbBytes, rows: last.rows - warm.rows, heapBytes: last.heapBytes - warm.heapBytes }
}

/** The people-readable report. */
export function renderSoakReport(report: SoakReport, at: string, options: { readonly warmHour?: number } = {}): string {
  const lines: string[] = []
  lines.push(report.mode === 'accelerated' ? `# Soak da noite, relógio acelerado (Gauge, ${at})` : `# Soak em tempo real, host como processo (Probe, ${at})`, '')
  lines.push(`Semente ${report.seed}; ${String(Math.round(report.simulatedHours * 100) / 100)} h ${report.mode === 'accelerated' ? 'simuladas' : 'em tempo real'} em ${report.steps} passos de ${report.stepMinutes} min; hash do rastro ${traceHash(report.trace)}.`)
  lines.push('', `Veredito: ${report.violations.length === 0 ? 'PASSOU (0 invariantes quebradas)' : `FALHOU (${report.violations.length} invariantes quebradas)`}`, '')
  lines.push('| projeto | fila | fazendo | revisão | espera você | feito | turnos |', '|---|---|---|---|---|---|---|')
  for (const board of report.boards) lines.push(`| ${board.projectId} | ${board.todo} | ${board.doing} | ${board.review} | ${board.needsYou} | ${board.done} | ${report.turnsByProject[board.projectId] ?? '-'} |`)
  const totalTurns = report.turnsByProject['*']
  if (totalTurns !== undefined) lines.push('', `Turnos no total (sem divisão por projeto): ${totalTurns}.`)
  lines.push('', `Cobranças ${report.nudges}; resumos ${report.summaries}; aprovações paradas ${report.approvalsPending}.`, '')
  lines.push('## O que foi injetado na noite', '')
  for (const item of report.injected) lines.push(`- ${String(item.atHour).padStart(2, '0')} h: ${item.name} -> ${item.outcome}`)
  const hasProcess = report.photos.some(photo => photo.rssBytes !== undefined || photo.children !== undefined)
  lines.push('', '## Fotos por hora (vazamento)', '', `| h | recursos | listeners | banco (bytes) | linhas | heap (bytes) |${hasProcess ? ' RSS (bytes) | filhos |' : ''}`, `|---|---|---|---|---|---|${hasProcess ? '---|---|' : ''}`)
  for (const photo of report.photos) lines.push(`| ${photo.hour} | ${photo.resources} | ${photo.listeners} | ${photo.dbBytes} | ${photo.rows} | ${photo.heapBytes} |${hasProcess ? ` ${photo.rssBytes ?? '-'} | ${photo.children ?? '-'} |` : ''}`)
  const warmHour = options.warmHour ?? 4
  const growth = growthAfter(report.photos, warmHour)
  if (growth !== undefined) lines.push('', `Crescimento depois de ${warmHour} h: recursos ${growth.resources}, listeners ${growth.listeners}, banco ${growth.dbBytes} bytes, linhas ${growth.rows}, heap ${growth.heapBytes} bytes.`)
  if (report.violations.length > 0) {
    lines.push('', '## Invariantes quebradas', '')
    for (const item of report.violations.slice(0, 40)) lines.push(`- ${item.invariant} ${item.projectId} passo ${item.step} (${item.simulated}): ${item.detail}`)
  }
  return `${lines.join('\n')}\n`
}
