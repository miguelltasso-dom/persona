import type { VaultRecord } from '@deepseek-ai/dsh-persona-core'

export type MemoryOrigin = 'conversation' | 'vault' | 'import'

/** Where a memory the owner asked for came from: the owner's own words (harvest item 16). */
export interface MemoryOwnerSource {
  readonly quote: string
  readonly by: string
  /** It was the person looking at the list who said it ("Você disse…"). */
  readonly mine: boolean
  readonly at: string
  readonly where: 'channel' | 'dm'
  /** The channel's name ("geral") when said in a channel; empty in a DM. */
  readonly place: string
}

export interface MemoryRow extends VaultRecord {
  readonly uiOrigin: MemoryOrigin
  readonly pendingApproval: boolean
  /** The owner asked the team to remember it: the proof, word for word. */
  readonly ownerSource?: MemoryOwnerSource | undefined
  /** A rule the owner dictated (mandatory context in every turn). */
  readonly ownerRule?: boolean | undefined
  /** The persona a DM memory was said to. Her name only: no copy takes an article for a persona (the product keeps no gender). */
  readonly ownerTo?: { readonly name: string } | undefined
}

export const MOCK_MEMORY_ROWS: readonly MemoryRow[] = [
  {
    id: 'mem-1',
    workspaceId: 'ws-demo',
    kind: 'memory',
    body: 'Miguel prefere revisões de copy às terças de manhã.',
    status: 'active',
    sourceIds: ['evt-12'],
    authorId: 'persona-atlas',
    visibility: { kind: 'workspace' },
    createdAt: '2026-11-02T09:00:00Z',
    revision: 2,
    uiOrigin: 'conversation',
    pendingApproval: false,
  },
  {
    id: 'mem-2',
    workspaceId: 'ws-demo',
    kind: 'memory',
    body: 'Cliente X não quer menção a concorrentes Y/Z.',
    status: 'active',
    sourceIds: ['vault-9'],
    authorId: 'member-miguel',
    visibility: { kind: 'project', projectId: 'proj-site' },
    createdAt: '2026-11-01T15:00:00Z',
    revision: 1,
    uiOrigin: 'vault',
    pendingApproval: true,
  },
]
