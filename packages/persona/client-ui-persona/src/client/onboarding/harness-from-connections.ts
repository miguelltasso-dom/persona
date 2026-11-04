import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { runnerLabel } from '../team/engine-label.ts'
import type { HarnessRow } from './mock-data.ts'

const ONBOARDING_KINDS: readonly ConnectionView['kind'][] = ['claude', 'codex', 'cursor', 'opencode']

/**
 * Step 3 list: one row per provider. `ready` only when the host reports a logged-in seat; `checking` while the
 * host is still probing (never "Não detectada" before the probe finished). No cards yet = every row is checking.
 */
export function harnessRowsFromConnections(connections: readonly ConnectionView[]): HarnessRow[] {
  return ONBOARDING_KINDS.map((kind) => {
    const rows = connections.filter(row => row.kind === kind)
    const ready = rows.some(row => row.available && row.loggedIn && row.phase === 'ready')
    const checking = !ready && (rows.length === 0 || rows.some(row => row.phase === 'checking'))
    return { id: kind, label: runnerLabel(kind), ready, ...(checking ? { checking: true } : {}) }
  })
}

/** Rows to show before the first host answer: every provider is "being checked", none is claimed ready. */
export function checkingHarnessRows(): HarnessRow[] {
  return ONBOARDING_KINDS.map(kind => ({ id: kind, label: runnerLabel(kind), ready: false, checking: true }))
}
