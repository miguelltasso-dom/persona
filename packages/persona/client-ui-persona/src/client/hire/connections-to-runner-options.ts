import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import type { RunnerOptionUi } from '../persona-editor/PersonaEditor.tsx'

const LABELS: Record<ConnectionView['kind'], string> = {
  dsh: 'Persona (motor próprio)',
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor agent',
  opencode: 'OpenCode',
}

/** Static Rivet bench hints until host exposes per-connection laziness read-model. */
const STATIC_HINTS: Readonly<Record<string, Pick<RunnerOptionUi, 'speed' | 'grade' | 'recommended'>>> = {
  dsh: { speed: 'fast', grade: 'fair', recommended: true },
  'oar:claude': { speed: 'medium', grade: 'fair' },
  'oar:codex': { speed: 'medium', grade: 'fair' },
  'oar:cursor': { speed: 'medium', grade: 'weak' },
  'oar:opencode': { speed: 'slow', grade: 'weak' },
}

function harnessId(row: ConnectionView): string {
  if (row.kind === 'dsh') return 'dsh'
  return `oar:${row.kind}`
}

/**
 * `connected` is true while `phase === 'checking'` so the UI does not flash "desconectado".
 * @param row - Host probe row.
 */
export function connectionRunnerConnected(row: ConnectionView): boolean {
  if (row.phase === 'checking') return true
  if (!row.available || row.error?.code === 'cli_not_found') return false
  if (row.error?.code === 'quota_exhausted') return false
  return row.loggedIn && row.error?.code !== 'not_logged_in'
}

/** Host `listConnections` → persona editor runner radios. */
export function connectionsToRunnerOptions(rows: readonly ConnectionView[]): RunnerOptionUi[] {
  const order: ConnectionView['kind'][] = ['dsh', 'claude', 'codex', 'cursor', 'opencode']
  const byKind = new Map(rows.map(row => [row.kind, row]))
  return order.flatMap((kind) => {
    const row = byKind.get(kind)
    if (row === undefined) return []
    const id = harnessId(row)
    const hints = STATIC_HINTS[id] ?? {}
    return [{
      id,
      label: LABELS[kind],
      connected: connectionRunnerConnected(row),
      ...hints,
    }]
  })
}
