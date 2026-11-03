import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import type { ConnectionEntry, ConnectionResolveErrorCode, ConnectionStatus } from '../../connections/mock-data.ts'

const KIND_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor agent',
  opencode: 'OpenCode',
  dsh: 'DSH',
}

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
  const code = row.error?.code
  if (!row.available || code === 'cli_not_found') return 'missing'
  if (code === 'quota_exhausted') return 'expired'
  if (!row.loggedIn || code === 'not_logged_in') return 'expired'
  return 'ready'
}

function copyCommandFor(row: ConnectionView): string | undefined {
  if (row.error?.code !== 'not_logged_in' && row.loggedIn) return undefined
  const fromMessage = row.error?.message.match(/`([^`]+)`/u)?.[1]
  if (fromMessage !== undefined) return fromMessage
  return LOGIN_COMMANDS[row.kind]
}

/** Host connection probe → Connections UI rows. */
export function connectionsToEntries(rows: readonly ConnectionView[]): ConnectionEntry[] {
  return rows.map((row) => {
    const status = statusFor(row)
    const errorCode = narrowErrorCode(row.error?.code)
    const detail = row.error?.message ?? (status === 'ready' ? '' : row.loginHint)
    const copyCommand = copyCommandFor(row)
    return {
      id: row.id,
      name: KIND_LABELS[row.kind] ?? row.kind,
      kind: row.kind,
      status,
      detail,
      ...(errorCode === undefined ? {} : { errorCode }),
      ...(copyCommand === undefined ? {} : { copyCommand }),
    }
  })
}
