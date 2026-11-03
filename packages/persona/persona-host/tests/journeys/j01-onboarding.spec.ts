import { expect } from 'vitest'
import { SCOPE, openJourney, it } from './journey-host.ts'

it('J1 — pasta limpa: ninguém na equipe até o usuário contratar; 1ª mensagem ganha resposta', async () => {
  const h = openJourney()
  h.createWorkspace({ id: 'ws', name: 'Fresh', personalProjectId: 'pp' })
  expect(h.getOnboarding(SCOPE).firstUse).toBe(true)
  expect(h.listTeam(SCOPE).personas).toEqual([])
  const onb = await h.completeOnboarding({
    workspaceId: 'ws',
    personalProjectId: 'pp',
    displayName: 'Ana',
    team: [{
      name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
      instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
      runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true,
      systemRoles: ['coordination'],
    }],
    templateIds: [],
    runnerChoices: ['dsh'],
    cofreSeed: '',
  })
  expect(onb.completed).toBe(true)
  const names = h.listPersonas(SCOPE).map(item => item.name)
  expect(names).toEqual(['Guia'])
  expect(names.join(' ')).not.toMatch(/\bAtlas\b/)
  const guia = h.listPersonas(SCOPE)[0]!
  expect(guia.id).not.toBe('Guia')
  h.postMessage({
    id: 'm-hi', ...SCOPE, streamKind: 'channel', ownerId: 'geral',
    body: 'oi', actorId: 'owner', subjectId: 'm-hi', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush(SCOPE.projectId)
  const page = h.listMessages({
    ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 40,
  })
  expect(page.events.some(item => item.actorId === guia.id && item.body.length > 0)).toBe(true)
  expect(JSON.stringify(page.events)).not.toMatch(/\bAtlas\b/)
})
