import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
}

const PASTE = `## Sobre mim
Miguel, fundador.

## Regras e restrições
Nunca enviar senha para ninguém.
`

it('applyContextProposals writes accept, skips discard, second apply is idempotent', () => {
  const h = host()
  seed(h)
  const preview = h.previewBringContextPaste({
    workspaceId: 'ws', projectId: 'pp', provider: 'chatgpt', text: PASTE,
  })
  expect(preview.proposals.length).toBeGreaterThan(0)
  const keep = preview.proposals[0]!
  const drop = preview.proposals[1]
  const first = h.applyContextProposals({
    workspaceId: 'ws',
    projectId: 'pp',
    preview,
    items: [
      { id: keep.id, action: 'accept' },
      ...(drop === undefined ? [] : [{ id: drop.id, action: 'discard' as const }]),
    ],
  })
  expect(first.written).toBe(1)
  expect(first.ids).toEqual([keep.id])
  const stored = h.vault.listRecords('pp')
  expect(stored.some(row => row.body.includes('Miguel'))).toBe(true)
  const again = h.applyContextProposals({
    workspaceId: 'ws',
    projectId: 'pp',
    preview,
    items: [{ id: keep.id, action: 'accept' }],
  })
  expect(again.written).toBe(0)
})

it('previewBringContextPaste flags Cofre rows via vaultToBringExisting', () => {
  const h = host()
  seed(h)
  h.createVaultRecord({
    workspaceId: 'ws', projectId: 'pp', id: 'rec-1', kind: 'constraint',
    body: 'Nunca enviar senha para ninguém.', authorId: 'ana',
  })
  const preview = h.previewBringContextPaste({
    workspaceId: 'ws', projectId: 'pp', provider: 'chatgpt', text: PASTE,
  })
  expect(preview.proposals.some(row => row.status === 'duplicate' || row.body.includes('senha'))).toBe(true)
})

it('private BYC row is members-only', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'ana'
  const preview = h.previewBringContextPaste({
    workspaceId: 'ws', projectId: 'pp', provider: 'claude', text: PASTE,
  })
  const keep = preview.proposals[0]!
  h.applyContextProposals({
    workspaceId: 'ws',
    projectId: 'pp',
    preview,
    items: [{ id: keep.id, action: 'private' }],
  })
  const row = h.vault.getRecord(keep.id)
  expect(row?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
})
