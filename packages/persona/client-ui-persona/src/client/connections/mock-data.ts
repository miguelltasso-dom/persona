export type ConnectionStatus = 'ready' | 'missing' | 'expired'

export type ConnectionResolveErrorCode = 'cli_not_found' | 'not_logged_in' | 'quota_exhausted'

export interface ConnectionEntry {
  readonly id: string
  readonly name: string
  readonly status: ConnectionStatus
  /** User-visible detail (probe message or login hint). */
  readonly detail: string
  readonly kind: string
  readonly errorCode?: ConnectionResolveErrorCode
  /** Terminal command to copy when login is required (never a token). */
  readonly copyCommand?: string
}

export const MOCK_CONNECTIONS: readonly ConnectionEntry[] = [
  { id: 'claude', name: 'Claude Code', status: 'ready', detail: '', kind: 'claude' },
  {
    id: 'codex',
    name: 'Codex',
    status: 'ready',
    detail: '',
    kind: 'codex',
  },
  {
    id: 'cursor',
    name: 'Cursor agent',
    status: 'expired',
    detail: 'CLI cursor não está logada. Abra o terminal e rode cursor-agent login',
    kind: 'cursor',
    errorCode: 'not_logged_in',
    copyCommand: 'cursor-agent login',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    status: 'missing',
    detail: 'CLI opencode não encontrada neste computador.',
    kind: 'opencode',
    errorCode: 'cli_not_found',
  },
]
