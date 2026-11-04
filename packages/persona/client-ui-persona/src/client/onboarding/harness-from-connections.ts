import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { runnerLabel } from '../team/engine-label.ts'
import type { HarnessRow } from './mock-data.ts'

const ONBOARDING_KINDS: readonly ConnectionView['kind'][] = ['claude', 'codex', 'cursor', 'opencode']

/** Step 3 list: one row per provider, ready when host reports a logged-in seat. */
export function harnessRowsFromConnections(connections: readonly ConnectionView[]): HarnessRow[] {
  return ONBOARDING_KINDS.map((kind) => {
    const rows = connections.filter(row => row.kind === kind)
    const ready = rows.some(row => row.available && row.loggedIn && row.phase === 'ready')
    return { id: kind, label: runnerLabel(kind), ready }
  })
}
