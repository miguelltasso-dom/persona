export type ConnectionStatus = 'ready' | 'missing' | 'expired'

export interface ConnectionEntry {
  readonly id: string
  readonly name: string
  readonly status: ConnectionStatus
  readonly detail: string
}

export const MOCK_CONNECTIONS: readonly ConnectionEntry[] = [
  { id: 'c1', name: 'Claude Code', status: 'ready', detail: 'claude' },
  { id: 'c2', name: 'Codex', status: 'ready', detail: 'codex' },
  { id: 'c3', name: 'Cursor agent', status: 'expired', detail: 'cursor-agent' },
  { id: 'c4', name: 'OpenCode', status: 'missing', detail: 'opencode' },
]
