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

it('a reused preview id with different content rejects the whole batch instead of silently skipping a row', () => {
  const h = host()
  seed(h)
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  const first = h.previewBringContextPaste({ ...scope, provider: 'chatgpt', text: '## Sobre mim\nO catálogo usa fotos claras.' })
  const original = first.proposals[0]
  if (original === undefined) throw new Error('missing-original')
  h.applyContextProposals({ ...scope, preview: first, items: [{ id: original.id, action: 'accept' }] })
  const next = h.previewBringContextPaste({ ...scope, provider: 'claude', text: '## Sobre mim\nO atendimento termina às dezoito horas.' })
  const row = next.proposals[0]
  if (row === undefined) throw new Error('missing-next')
  const stale = { ...next, proposals: [{ ...row, id: 'fresh-row' }, { ...row, id: original.id }] }
  expect(() => h.applyContextProposals({ ...scope, preview: stale,
    items: [{ id: 'fresh-row', action: 'accept' }, { id: original.id, action: 'accept' }] }))
    .toThrow(expect.objectContaining({ code: 'conflict' }))
  expect(h.vault.getRecord('fresh-row')).toBeUndefined()
  expect(h.vault.getRecord(original.id)?.body).toContain('O catálogo usa fotos claras.')
  expect(h.vault.listRecords(scope.projectId)).toHaveLength(1)
})

it('two normal paste previews preserve different rules sharing the same prefix', () => {
  const h = host()
  seed(h)
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  const bodies = [
    'Regra X nunca enviar proposta comercial sem revisão do jurídico do cliente Alfa.',
    'Regra X nunca enviar proposta comercial sem revisão do jurídico do cliente Beta.',
  ]
  const ids: string[] = []
  for (const [index, body] of bodies.entries()) {
    const preview = h.previewBringContextPaste({ ...scope, provider: index === 0 ? 'chatgpt' : 'claude',
      text: `## Regras e restrições\n- ${body}` })
    expect(preview.proposals).toHaveLength(1)
    const proposal = preview.proposals[0]!
    expect(proposal.status).toBe('ready')
    expect(proposal.body).toBe(body)
    const result = h.applyContextProposals({ ...scope, preview, items: [{ id: proposal.id, action: 'accept' }] })
    expect(result.written).toBe(1)
    expect(result.ids).toEqual([proposal.id])
    ids.push(proposal.id)
  }
  expect(new Set(ids).size).toBe(2)
  const records = h.vault.listRecords(scope.projectId)
  expect(records).toHaveLength(2)
  for (const body of bodies) expect(records.filter(record => record.body.includes(body))).toHaveLength(1)
  const replay = h.previewBringContextPaste({ ...scope, provider: 'claude',
    text: `## Regras e restrições\n- ${bodies[0]}` })
  expect(replay.proposals).toHaveLength(1)
  expect(replay.proposals[0]?.status).toBe('duplicate')
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
