import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import type { ConnectionEntry, ConnectionResolveErrorCode, ConnectionStatus } from '../../connections/mock-data.ts'
import { runnerLabel } from '../../team/engine-label.ts'

const LOGIN_COMMANDS: Record<string, string> = {
  claude: 'claude login',
  codex: 'codex login',
  opencode: 'opencode auth login',
  cursor: 'cursor-agent login',
}

function narrowErrorCode(code: string | undefined): ConnectionResolveErrorCode | undefined {
  if (code === 'cli_not_found' || code === 'not_logged_in' || code === 'quota_exhausted') return code
  return undefined
}

function statusFor(row: ConnectionView): ConnectionStatus {
  // Item 13: o que ainda está sendo conferido (ou que não deu para conferir) nunca vira "Não conectada".
  if (row.phase === 'checking' && row.error === undefined) return (row as { readonly unconfirmed?: boolean }).unconfirmed === true ? 'unconfirmed' : 'checking'
  const code = row.error?.code
  if (!row.available || code === 'cli_not_found') return 'missing'
  if (code === 'quota_exhausted') return 'expired'
  if (!row.loggedIn || code === 'not_logged_in') return 'expired'
  return 'ready'
}

function copyCommandFor(row: ConnectionView): string | undefined {
  if (row.phase === 'checking' && row.error === undefined) return undefined // ainda conferindo: não oferece o comando de login (seria acusar um logout que ninguém confirmou); um erro explícito da CLI é resposta
  if (row.error?.code !== 'not_logged_in' && row.loggedIn) return undefined
  const fromMessage = row.error?.message.match(/`([^`]+)`/u)?.[1]
  if (fromMessage !== undefined) return fromMessage
  return LOGIN_COMMANDS[row.kind]
}

function rowRank(row: ConnectionView): number {
  if (row.phase === 'checking') return 0
  if (statusFor(row) === 'ready') return 3
  if (statusFor(row) === 'expired') return 2
  return 1
}

/** One card per CLI kind (host may repeat ids while probing). */
function dedupeConnectionRows(rows: readonly ConnectionView[]): ConnectionView[] {
  const byId = new Map<string, ConnectionView>()
  for (const row of rows) {
    const prev = byId.get(row.id)
    if (prev === undefined || rowRank(row) > rowRank(prev)) {
      byId.set(row.id, row)
    }
  }
  const byKind = new Map<string, ConnectionView>()
  for (const row of byId.values()) {
    const prev = byKind.get(row.kind)
    if (prev === undefined || rowRank(row) > rowRank(prev)) {
      byKind.set(row.kind, row)
    }
  }
  return [...byKind.values()]
}

/** Host connection probe → Connections UI rows. */
export function connectionsToEntries(rows: readonly ConnectionView[]): ConnectionEntry[] {
  return dedupeConnectionRows(rows).map((row) => {
    const status = statusFor(row)
    const errorCode = narrowErrorCode(row.error?.code)
    const detail = row.error?.message ?? (status === 'ready' ? '' : row.loginHint)
    const copyCommand = copyCommandFor(row)
    return {
      id: row.id,
      name: runnerLabel(row.kind),
      kind: row.kind,
      status,
      detail,
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(copyCommand === undefined ? {} : { copyCommand }),
    }
  })
}
