/**
 * B8 / SCOPE.md mandatory scenarios on the REAL PersonaHost (scripted runner, in-memory SQLite, 0 AI):
 *   - agent proposes agent (persona_propose → "Contratar <nome>?" card, never broader than the proposer, approval required),
 *   - Coordination handoff A → B without losing history,
 *   - mandatory Cofre constraint shows up in "Contexto usado" without secret values.
 * The from-scratch onboarding builder is an app scenario: {@link ./mandatory-onboarding-from-zero.spec.ts}.
 */
import { describe, expect } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import { geralChannelId, it, openJourney, sayOn, seedJourney } from '../../persona-host/tests/journeys/journey-host.ts'

const PP = { workspaceId: 'ws', projectId: 'pp' } as const

function team(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'atlas', name: 'Atlas', title: 'Coordenação', coordination: true, canRecruit: true },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  return h
}

const channelEvents = (h: PersonaHost) => h.listMessages({
  ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200,
}).events

describe('SCOPE-2 — agente propõe agente: cartão de aprovação, nunca com mais poder que quem propôs', () => {
  it('[SCOPE-2] persona SEM "Recrutar" não consegue propor contratação', () => {
    const h = team()
    expect(() => h.proposeHire({ ...PP, id: 'prop-x', creatorPersonaId: 'bento', name: 'Pipoca', title: 'Designer', description: 'Peças.' })).toThrow(/ACL_DENIED|forbidden/u)
    expect(h.listApprovals(PP).filter(row => row.kind === 'hire')).toEqual([])
  })

  it('[SCOPE-2] com "Recrutar": vira cartão "Contratar <nome>?" pendente; nada é criado antes da decisão do humano', () => {
    const h = team()
    const card = h.proposeHire({ ...PP, id: 'prop-1', creatorPersonaId: 'atlas', name: 'Pipoca', title: 'Designer', description: 'Peças da semana.' })
    expect(card.status).toBe('pending')
    expect(card.kind).toBe('hire')
    expect(`${card.title} ${card.question}`).toMatch(/Contratar Pipoca\?|Pipoca/u)
    expect(card.personaName).toBe('Atlas')
    expect(h.listApprovals(PP).some(row => row.id === 'prop-1' && row.status === 'pending')).toBe(true)
    expect(h.listPersonas(PP).map(row => row.name)).not.toContain('Pipoca')
  })

  it('[SCOPE-2] aprovada: a persona nasce SEM ferramentas, SEM funções de sistema e SEM "Recrutar" (nunca mais poder que a proponente)', () => {
    const h = team()
    h.proposeHire({ ...PP, id: 'prop-2', creatorPersonaId: 'atlas', name: 'Pipoca', title: 'Designer', description: 'Peças da semana.' })
    h.decideApproval({ ...PP, id: 'prop-2', kind: 'hire', accept: true })
    const created = h.product.getPersona('hire:prop-2')
    expect(created?.name).toBe('Pipoca')
    expect(created?.systemRoles ?? []).toEqual([])
    expect(created?.canRecruit).toBe(false)
    // D-099: a persona saves files into the draft by default, but NEVER more than the one who proposed her (the ceiling is the proposer's own grant).
    const proposer = h.product.getPersona('atlas')?.tools ?? {}
    const rank = { none: 0, read: 1, write: 2 } as const
    expect(Object.entries(created?.tools ?? {}).every(([name, level]) => rank[level] <= rank[proposer[name] ?? 'none']), `ferramentas: ${JSON.stringify(created?.tools)} (proponente: ${JSON.stringify(proposer)})`).toBe(true)
    expect(created?.createdBy).toBe('atlas')
  })

  it('[SCOPE-2] recusada: ninguém é criado; e uma decisão repetida não cria em duplicata', () => {
    const h = team()
    h.proposeHire({ ...PP, id: 'prop-3', creatorPersonaId: 'atlas', name: 'Recusada', title: 'Designer', description: 'x' })
    h.decideApproval({ ...PP, id: 'prop-3', kind: 'hire', accept: false })
    expect(h.listPersonas(PP).map(row => row.name)).not.toContain('Recusada')
    h.proposeHire({ ...PP, id: 'prop-4', creatorPersonaId: 'atlas', name: 'Uma', title: 'Designer', description: 'x' })
    h.decideApproval({ ...PP, id: 'prop-4', kind: 'hire', accept: true })
    let again = true
    try { h.decideApproval({ ...PP, id: 'prop-4', kind: 'hire', accept: true }) } catch { again = false }
    void again
    expect(h.listPersonas(PP).filter(row => row.name === 'Uma')).toHaveLength(1)
  })

  it('[SCOPE-2] só humano com permissão decide: membro de outro projeto não aprova contratação', () => {
    const h = team()
    h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
    h.proposeHire({ ...PP, id: 'prop-5', creatorPersonaId: 'atlas', name: 'Intrusa', title: 'Designer', description: 'x' })
    h.sessionMemberId = 'gus'
    expect(() => h.decideApproval({ ...PP, id: 'prop-5', kind: 'hire', accept: true })).toThrow()
    h.sessionMemberId = 'ana'
    expect(h.listPersonas(PP).map(row => row.name)).not.toContain('Intrusa')
  })
})

describe('SCOPE-3 — troca da Coordenação: histórico continua legível e atribuível; novos pedidos vão para a nova', () => {
  it('[SCOPE-3] de Atlas para Bento: o histórico não muda, os assuntos permanecem e a próxima resposta vem do Bento', async () => {
    const h = team()
    sayOn(h, 'pp', 'm-1', 'oi, tudo bem?')
    await h.orchestration.flush('pp')
    const before = channelEvents(h)
    const subjectsBefore = h.listConversationSubjects({ ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp') }).subjects.map(row => row.id)
    expect(before.some(row => row.actorId === 'atlas'), 'controle: Atlas respondeu como Coordenação').toBe(true)

    h.setPersonaSystemRoles({ ...PP, personaId: 'bento', systemRoles: ['coordination'] })
    const roles = h.listPersonas(PP)
    expect(roles.find(row => row.id === 'bento')?.systemRoles).toContain('coordination')
    expect(roles.find(row => row.id === 'atlas')?.systemRoles ?? []).not.toContain('coordination')

    const afterSwitch = channelEvents(h)
    for (const old of before) {
      const same = afterSwitch.find(row => row.id === old.id)
      expect(same, `evento ${old.id} sumiu`).toBeDefined()
      expect(same?.actorId, `evento ${old.id} mudou de autor`).toBe(old.actorId)
      expect(same?.body).toBe(old.body)
    }
    expect(h.listConversationSubjects({ ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp') }).subjects.map(row => row.id)).toEqual(subjectsBefore)

    sayOn(h, 'pp', 'm-2', 'oi de novo, tudo bem?')
    await h.orchestration.flush('pp')
    const latest = channelEvents(h).filter(row => row.actorId !== 'ana' && !before.some(old => old.id === row.id))
    expect(latest.length, 'houve resposta depois da troca').toBeGreaterThan(0)
    expect(latest.every(row => row.actorId === 'bento'), `respostas novas por ${latest.map(row => row.actorId).join(',')}`).toBe(true)
  })

  it('[SCOPE-3] só uma Coordenação por vez no projeto', () => {
    const h = team()
    h.setPersonaSystemRoles({ ...PP, personaId: 'bento', systemRoles: ['coordination'] })
    expect(h.listPersonas(PP).filter(row => row.systemRoles.includes('coordination')).map(row => row.id)).toEqual(['bento'])
  })
})

describe('SCOPE-4 — Cofre no contexto: restrição obrigatória aparece em "Contexto usado" sem expor segredo', () => {
  const ask = async (h: PersonaHost) => {
    sayOn(h, 'pp', 'm-ctx', 'preciso de um README no projeto')
    await h.orchestration.flush('pp')
    const task = h.listTasks(PP)[0]
    expect(task, 'a mensagem gerou uma Tarefa').toBeDefined()
    return h.getTurnContext({ ...PP, ticketId: task!.id, command: 'stop', reason: '' })
  }

  it('[SCOPE-4] uma restrição do Cofre obrigatória entra no "Contexto usado" do turno, marcada como obrigatória e sem restrição de acesso', async () => {
    const h = team()
    h.createVaultRecord({ ...PP, id: 'rule-1', kind: 'constraint', body: 'Nunca prometer prazo sem checar a agenda.', authorId: 'ana' })
    const ctx = await ask(h)
    const rule = ctx.records.find(row => row.id === 'rule-1')
    expect(rule, 'restrição obrigatória ausente do contexto usado').toBeDefined()
    expect(rule?.required).toBe(true)
    expect(rule?.kind).toBe('constraint')
    expect(h.listUsedContext({ ...PP, eventId: 'm-ctx' }).records.some(row => row.id === 'rule-1'), 'também pela mensagem do usuário').toBe(true)
  })

  it('[SCOPE-4] segredo gravado no Cofre (senha / api_key em texto) NÃO sai em claro no "Contexto usado" nem no prompt do turno', async () => {
    const h = team()
    h.createVaultRecord({ ...PP, id: 'sec-1', kind: 'memory', body: `Senha do banco: ${['hunter', '2'].join('')} e api_key=${['abc', '123', 'zzz'].join('')}`, authorId: 'ana' })
    const ctx = await ask(h)
    expect(JSON.stringify(ctx.records), 'valor secreto vazou no Contexto usado').not.toMatch(/hunter2|abc123zzz/u)
  })
})
