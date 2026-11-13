/** Host regression: private DM text in playbook notes, skill offers, and skills stays visible only to DM participants. */
import { describe, expect } from 'vitest'
import { learnFromAcceptedReview, learnFromRequestedChanges } from '../src/feedback-wire.ts'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const P = { workspaceId: 'ws', projectId: 'sh' } as const
const DM_MARK = 'FESTA-SURPRESA-JOAO-4821'
const ADJUST_MARK = 'preço de atacado só para a Dona Marta'
const CHANNEL_MARK = 'Cartaz da promoção de pão de queijo'

function rig() {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'owner' }) // a 2nd person who can read the project: the rule is about WHO is in the DM
  h.createDm({ id: 'dm-ana', ...P, participantA: 'ana', participantB: 'bia' })
  h.createDm({ id: 'dm-gus', ...P, participantA: 'gus', participantB: 'bia' })
  const note = (id: string, title: string, request: string, dms: readonly string[], adjustments: readonly string[] = []) => h.screens.screens.put('sh', 'playbook_note', id, {
    id, personaId: 'bia', title, request, createdAt: CLOCK, uses: [{ ticketId: `t-${id}`, day: '2026-11-10', at: CLOCK }], adjustments, dms,
  })
  note('n-channel', CHANNEL_MARK, 'Faça o cartaz com o preço novo.', []) // learned in the team channel: everybody's
  note('n-gus', `Plano da ${DM_MARK}`, `Monte o plano da ${DM_MARK} sem avisar ninguém.`, ['dm-gus'], [ADJUST_MARK]) // learned in GUS's private DM with Bia
  note('n-ana', 'Resposta ao cliente sobre a entrega', 'Responda a cliente Marta sobre a entrega de sábado.', ['dm-ana']) // learned in ANA's private DM with Bia
  return h
}
const titles = (h: ReturnType<typeof rig>, member: string): string[] => { h.sessionMemberId = member; return h.listPlaybook({ ...P, personaId: 'bia' }).map(row => row.title) }
const everything = (value: unknown): string => JSON.stringify(value)

describe('Playbook: o que veio de uma DM privada é de quem é da DM', () => {
  it('controle: cada um lê o do canal e o da PRÓPRIA DM', () => {
    const h = rig()
    expect(titles(h, 'ana')).toEqual(expect.arrayContaining([CHANNEL_MARK, 'Resposta ao cliente sobre a entrega']))
    expect(titles(h, 'gus')).toEqual(expect.arrayContaining([CHANNEL_MARK, `Plano da ${DM_MARK}`]))
  })

  it('a) listPlaybook: Ana NÃO lê o título nem os ajustes da nota nascida na DM do Gus (nem o dono do espaço); o Gus não lê a da Ana', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    const forAna = h.listPlaybook({ ...P, personaId: 'bia' })
    expect(everything(forAna)).not.toContain(DM_MARK)
    expect(everything(forAna)).not.toContain(ADJUST_MARK)
    h.sessionMemberId = 'gus'
    expect(everything(h.listPlaybook({ ...P, personaId: 'bia' }))).not.toContain('Resposta ao cliente sobre a entrega')
    // and with no persona filter (the screen can ask for every persona)
    h.sessionMemberId = 'ana'
    expect(everything(h.listPlaybook({ ...P }))).not.toContain(DM_MARK)
  })

  it('b) forgetPlaybook por id: Ana não apaga a nota do Gus (e a resposta não confirma que ela existia)', () => {
    const h = rig()
    h.sessionMemberId = 'ana'
    let answer: unknown
    try { answer = h.forgetPlaybook({ ...P, id: 'n-gus' }) } catch { answer = 'refused' }
    expect(answer).not.toBe(true)
    h.sessionMemberId = 'gus'
    expect(titles(h, 'gus')).toContain(`Plano da ${DM_MARK}`) // the note is still there
    expect(h.forgetPlaybook({ ...P, id: 'n-gus' })).toBe(true) // and the one who is in the DM can forget it
    expect(titles(h, 'gus')).not.toContain(`Plano da ${DM_MARK}`)
  })

  it('c) a oferta e a skill candidata nascidas da DM do Gus não aparecem para a Ana (corpo da skill, título da oferta)', () => {
    const h = rig()
    h.screens.putCandidateSkill({ projectId: 'sh', personaId: 'bia', id: 'learned-n-gus', name: `Plano da ${DM_MARK}`, body: `Quando pedirem algo como “Plano da ${DM_MARK}”, faça como nas 3 entregas.\nExemplo do pedido: Monte o plano da ${DM_MARK} sem avisar ninguém.\nO dono costuma pedir: ${ADJUST_MARK}`, origin: 'learned' })
    h.screens.proposeSkill({ ...P, id: 'skill-offer-n-gus', skillId: 'learned-n-gus', title: `Bia aprendeu: Plano da ${DM_MARK}`, creatorPersonaId: 'bia', question: 'Usado 3 vezes em 2 dias.' })
    h.sessionMemberId = 'ana'
    expect(everything(h.listSkills({ ...P }))).not.toContain(DM_MARK)
    expect(everything(h.listApprovals({ ...P }))).not.toContain(DM_MARK)
    h.sessionMemberId = 'gus' // the one who is in the DM still sees it
    expect(everything(h.listSkills({ ...P }))).toContain(DM_MARK)
    expect(everything(h.listApprovals({ ...P }))).toContain(DM_MARK)
  })

  it('a nota de um canal e a skill/oferta que nasceram dela continuam de todos (a máscara só toca o que veio de DM)', () => {
    const h = rig()
    h.screens.putCandidateSkill({ projectId: 'sh', personaId: 'bia', id: 'learned-n-channel', name: CHANNEL_MARK, body: 'Exemplo do pedido: Faça o cartaz com o preço novo.', origin: 'learned' })
    h.screens.proposeSkill({ ...P, id: 'skill-offer-n-channel', skillId: 'learned-n-channel', title: `Bia aprendeu: ${CHANNEL_MARK}`, creatorPersonaId: 'bia', question: 'Usado 3 vezes em 2 dias.' })
    h.sessionMemberId = 'ana'
    expect(everything(h.listSkills({ ...P }))).toContain(CHANNEL_MARK)
    expect(everything(h.listApprovals({ ...P }))).toContain(CHANNEL_MARK)
  })
})

describe('o fluxo real: uma Tarefa nascida de uma DM deixa uma nota que é da DM (observado VERMELHO em 12/11 16:42 antes do conserto)', () => {
  const SECRET = 'FESTA-SURPRESA-MARIA-5512'
  const ADJUST = 'MAIS-AZUL-NO-CARTAO-7733'

  it('o dono aplica a entrega e pede uma mudança: a nota guarda a DM; Gus (fora dela) não lê o título nem o ajuste, a Ana lê', async () => {
    const h = openJourney()
    seedJourney(h)
    seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
    h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
    h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
    h.teamworkEnabled = true
    h.postMessage({ id: 'req', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: `preciso de um plano da ${SECRET}, só entre nós dois`, actorId: 'ana', subjectId: 'req', occurredAt: CLOCK })
    for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
    const rt = h.orchestration.runtime('sh')
    const task = rt.repo.tickets.list().find(row => row.origin.triggerId === 'req') ?? rt.repo.tickets.list()[0]!
    const deps = { screens: h.screens, product: h.product, orchestration: h.orchestration }
    expect(learnFromAcceptedReview(deps, { workspaceId: 'ws', projectId: 'sh', ticketId: task.id }), 'a Tarefa tem executora que o playbook sabe nomear').toBeDefined()
    learnFromRequestedChanges(deps, { projectId: 'sh', ticketId: task.id, feedback: ADJUST })
    expect(h.screens.screens.list<{ dms?: string[] }>('sh', 'playbook_note').map(note => note.dms)).toEqual([['dm-guia']])
    h.sessionMemberId = 'ana'
    expect(everything(h.listPlaybook({ ...P })), 'a participante lê as próprias notas').toContain(SECRET)
    expect(everything(h.listPlaybook({ ...P }))).toContain(ADJUST)
    h.sessionMemberId = 'gus'
    expect(everything(h.listPlaybook({ ...P })), 'Gus (fora da DM): as palavras da Tarefa').not.toContain(SECRET)
    expect(everything(h.listPlaybook({ ...P })), 'Gus (fora da DM): o que o dono pediu para mudar').not.toContain(ADJUST)
  })
})
