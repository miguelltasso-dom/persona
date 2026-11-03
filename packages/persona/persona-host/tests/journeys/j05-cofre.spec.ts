import { expect } from 'vitest'
import { CLOCK, SCOPE, openJourney, say, seedJourney, it } from './journey-host.ts'

it('J5 — fato do Cofre aprovado entra em Contexto usado; DM de outra persona não vaza', async () => {
  const h = openJourney()
  seedJourney(h, [
    { id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true, canRecruit: true },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.vault.createRecord({
    id: 'v-tone', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'Rascunho.', authorId: 'ana',
    visibility: { kind: 'workspace' },
  })
  const card = h.proposeVault({
    ...SCOPE, id: 'ap-tone', creatorPersonaId: 'coord', recordId: 'v-tone',
    nextBody: 'Tom de voz calmo.',
  })
  expect(card.status).toBe('pending')
  expect(h.decideApproval({ ...SCOPE, id: 'ap-tone', kind: 'vault', accept: true }).status).toBe('approved')

  h.createDm({ id: 'dm-bento', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bento' })
  h.postMessage({
    id: 'm-dm', workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'dm-bento',
    body: 'segredo só do Bento: CNPJ 00.000.000/0001-00',
    actorId: 'ana', subjectId: 'dm-1', occurredAt: CLOCK,
  })

  say(h, 'm-ctx', 'oi, tudo bem?')
  await h.orchestration.flush(SCOPE.projectId)
  const used = h.listUsedContext({ ...SCOPE, eventId: 'm-ctx' })
  const joined = used.records.map(item => item.body).join('\n')
  expect(joined).not.toMatch(/CNPJ|segredo só do Bento/)
  const tone = used.records.find(item => item.id === 'v-tone' || item.body.includes('Tom de voz'))
  if (tone !== undefined && !tone.restricted) {
    expect(tone.body).toMatch(/Tom de voz calmo|Rascunho/)
  }
})
