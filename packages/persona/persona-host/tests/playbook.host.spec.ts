/**
 * Item 16, second slice: what a persona learns about how she works stays QUIET, and becomes ONE offer only after it was proved:
 * three accepted deliveries of the same kind of work, on at least two different days → "Bia aprendeu “…” (usado 3×). Virar skill?".
 * Nothing is a memory the team reads; nothing calls a model.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { learnFromAcceptedReview, learnFromRequestedChanges, type FeedbackWireDeps } from '../src/feedback-wire.ts'
import { listPlaybook, notePlaybookAdjustment, notePlaybookWin, sameWork, type PlaybookDeps } from '../src/playbook.ts'
import { forgetPlaybookNote, playbookViews } from '../src/playbook-view.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'bia', name: 'Bia', title: 'Redação',
    description: 'Escreve.', personality: 'Calma.', instructions: 'Escreva.',
    avatarKind: 'gallery', avatarRef: 'bia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

/** A playbook whose clock the test moves. */
function deps(h: PersonaHost, clock: { at: string }): PlaybookDeps {
  return { screens: h.screens, now: () => clock.at }
}

const win = (ticketId: string, title = 'Cartaz da promoção de pão de queijo') => ({
  ...SCOPE, personaId: 'bia', personaName: 'Bia', ticketId, title, request: `Faça o ${title.toLowerCase()} com o preço novo.`,
})

describe('sameWork', () => {
  it('reads two titles as the same kind of work by their words', () => {
    expect(sameWork('Cartaz da promoção de pão de queijo', 'Cartaz promoção pão de queijo sábado')).toBe(true)
    expect(sameWork('Cartaz da promoção de pão de queijo', 'Resposta ao cliente sobre entrega')).toBe(false)
    expect(sameWork('', 'Cartaz')).toBe(false)
  })
})

it('an accepted delivery is noted QUIETLY: no memory for the team, no card, no offer yet', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  const first = notePlaybookWin(deps(h, clock), win('t1'))
  expect(first).toMatchObject({ offered: false, note: { personaId: 'bia', title: 'Cartaz da promoção de pão de queijo', uses: [{ ticketId: 't1', day: '2026-11-10' }] } })
  notePlaybookWin(deps(h, clock), win('t2'))
  expect(listPlaybook(h.screens.screens, 'pp', 'bia')).toHaveLength(1)
  expect(h.vault.listRecords('pp')).toHaveLength(0) // nothing the team reads
  expect(h.screens.listApprovals('pp').filter(card => card.kind === 'skill')).toHaveLength(0)
})

it('three uses on ONE day make no offer; the third on a second day makes ONE: the card asks "Virar skill?" with the count', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookWin(deps(h, clock), win('t1'))
  notePlaybookWin(deps(h, clock), win('t2'))
  expect(notePlaybookWin(deps(h, clock), win('t3'))?.offered).toBe(false) // three, but all on the same day
  expect(h.screens.listApprovals('pp').filter(card => card.kind === 'skill')).toHaveLength(0)

  clock.at = '2026-11-11T09:00:00.000Z'
  const fourth = notePlaybookWin(deps(h, clock), win('t4'))
  expect(fourth?.offered).toBe(true)
  const cards = h.screens.listApprovals('pp').filter(card => card.kind === 'skill')
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({
    title: 'Bia aprendeu: Cartaz da promoção de pão de queijo',
    question: 'Usado 4 vezes em 2 dias.',
    status: 'pending', personaId: 'bia', personaName: 'Bia',
  })
  expect(cards[0]?.title).not.toMatch(/×|\ba Bia\b/u) // words, not "4×"; no article for a persona
  // a later win never offers it again
  clock.at = '2026-11-12T09:00:00.000Z'
  expect(notePlaybookWin(deps(h, clock), win('t5'))?.offered).toBe(false)
  expect(h.screens.listApprovals('pp').filter(card => card.kind === 'skill')).toHaveLength(1)
})

it('one click on "Virar skill?" turns the candidate on (and the skill carries what the owner asked for)', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookAdjustment(deps(h, clock), { projectId: 'pp', personaId: 'bia', title: 'Cartaz da promoção de pão de queijo', feedback: 'Preço maior, sem ponto de exclamação' })
  notePlaybookWin(deps(h, clock), win('t1'))
  notePlaybookWin(deps(h, clock), win('t2'))
  clock.at = '2026-11-11T09:00:00.000Z'
  const result = notePlaybookWin(deps(h, clock), win('t3'))
  expect(result?.offered).toBe(true)
  const offered = result!.note.offered!
  const candidate = h.screens.getSkillRecord('pp', offered.skillId)
  expect(candidate).toMatchObject({ enabled: false, origin: 'learned', personaId: 'bia' })
  expect(candidate?.body).toContain('Cartaz da promoção de pão de queijo')
  expect(candidate?.body).toContain('O dono costuma pedir: Preço maior, sem ponto de exclamação')

  const decided = h.screens.decide({ ...SCOPE, id: offered.approvalId, kind: 'skill', accept: true })
  expect(decided).toMatchObject({ status: 'approved', question: expect.stringMatching(/^Usado \d+ vezes em 2 dias\.$/u) as string })
  expect(h.screens.getSkillRecord('pp', offered.skillId)?.enabled).toBe(true)
})

it('two conversations count like two days: three uses in ONE day but two conversations make the offer, worded "em 2 conversas"', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookWin(deps(h, clock), { ...win('t1'), conversation: 'assunto-a' })
  notePlaybookWin(deps(h, clock), { ...win('t2'), conversation: 'assunto-a' })
  expect(notePlaybookWin(deps(h, clock), { ...win('t3'), conversation: 'assunto-a' })?.offered).toBe(false) // one day, one conversation
  const fourth = notePlaybookWin(deps(h, clock), { ...win('t4'), conversation: 'assunto-b' })
  expect(fourth?.offered).toBe(true)
  expect(h.screens.listApprovals('pp').find(card => card.kind === 'skill')?.question).toBe('Usado 4 vezes em 2 conversas.')
})

it('"Agora não" keeps the note and offers again only after three MORE uses, as a new card; the first one stays turned down', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookWin(deps(h, clock), win('t1'))
  notePlaybookWin(deps(h, clock), win('t2'))
  clock.at = '2026-11-11T09:00:00.000Z'
  const first = notePlaybookWin(deps(h, clock), win('t3'))!.note.offered!
  h.screens.decide({ ...SCOPE, id: first.approvalId, kind: 'skill', accept: false })
  expect(h.screens.getSkillRecord('pp', first.skillId)?.enabled).toBe(false)
  expect(listPlaybook(h.screens.screens, 'pp', 'bia')[0]?.declined).toMatchObject({ uses: 3 })

  // two more uses: not enough; the third one after "Agora não": the new offer
  clock.at = '2026-11-12T09:00:00.000Z'
  expect(notePlaybookWin(deps(h, clock), win('t4'))?.offered).toBe(false)
  expect(notePlaybookWin(deps(h, clock), win('t5'))?.offered).toBe(false)
  const again = notePlaybookWin(deps(h, clock), win('t6'))
  expect(again?.offered).toBe(true)
  expect(again?.note.offered?.approvalId).toBe(`${first.approvalId}-2`)
  expect(again?.note.declined).toBeUndefined()
  const pending = h.screens.listApprovals('pp').filter(card => card.kind === 'skill' && card.status === 'pending')
  expect(pending.map(card => card.id)).toEqual([`${first.approvalId}-2`])
  // declining again waits for three more again
  h.screens.decide({ ...SCOPE, id: `${first.approvalId}-2`, kind: 'skill', accept: false })
  expect(notePlaybookWin(deps(h, clock), win('t7'))?.offered).toBe(false)
})

it('the tab reads each note as a stage: Aprendendo · N de 3, waiting for another day, Pronto para virar skill (offered), Já é skill', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookWin(deps(h, clock), win('a1', 'Resposta ao cliente sobre a entrega'))
  for (const id of ['b1', 'b2', 'b3']) notePlaybookWin(deps(h, clock), win(id, 'Legenda do post de sexta'))
  const stages = (): Record<string, string> => Object.fromEntries(playbookViews(h.screens, 'pp', 'bia').map(view => [view.title, `${view.stage} ${String(view.progress)}/${String(view.goal)}`]))
  expect(stages()).toEqual({ 'Resposta ao cliente sobre a entrega': 'learning 1/3', 'Legenda do post de sexta': 'ready 3/3' }) // three uses, one day: waits
  clock.at = '2026-11-11T09:00:00.000Z'
  const offered = notePlaybookWin(deps(h, clock), win('b4', 'Legenda do post de sexta'))!.note.offered!
  expect(playbookViews(h.screens, 'pp', 'bia').find(view => view.title.startsWith('Legenda'))).toMatchObject({ stage: 'offered', uses: 4, approvalId: offered.approvalId })
  h.screens.decide({ ...SCOPE, id: offered.approvalId, kind: 'skill', accept: true })
  expect(playbookViews(h.screens, 'pp', 'bia').find(view => view.title.startsWith('Legenda'))?.stage).toBe('skill')
  // newest use first
  expect(playbookViews(h.screens, 'pp', 'bia').map(view => view.title)[0]).toBe('Legenda do post de sexta')
  // "Esquecer": the note goes, the skill made from it stays
  expect(forgetPlaybookNote(h.screens, 'pp', offered.skillId.replace('learned-', ''))).toBe(true)
  expect(playbookViews(h.screens, 'pp', 'bia').map(view => view.title)).toEqual(['Resposta ao cliente sobre a entrega'])
  expect(h.screens.getSkillRecord('pp', offered.skillId)?.enabled).toBe(true)
  expect(forgetPlaybookNote(h.screens, 'pp', 'nope')).toBe(false)
})

it('the same delivery twice counts once; a similar title joins the same note; a different kind of work starts its own', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  notePlaybookWin(deps(h, clock), win('t1'))
  notePlaybookWin(deps(h, clock), win('t1'))
  notePlaybookWin(deps(h, clock), win('t2', 'Cartaz promoção pão de queijo sábado'))
  notePlaybookWin(deps(h, clock), win('t3', 'Resposta ao cliente sobre a entrega'))
  const notes = listPlaybook(h.screens.screens, 'pp', 'bia')
  expect(notes).toHaveLength(2)
  expect(notes.find(note => note.title.startsWith('Cartaz'))?.uses.map(use => use.ticketId)).toEqual(['t1', 't2'])
  expect(notes.find(note => note.title.startsWith('Resposta'))?.uses).toHaveLength(1)
})

it('what the owner asks to change is noted (deduped, the last five), and is never an offer by itself', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  for (const feedback of ['um', 'dois', 'três', 'três', 'quatro', 'cinco', 'seis']) {
    notePlaybookAdjustment(deps(h, clock), { projectId: 'pp', personaId: 'bia', title: 'Cartaz da promoção', feedback })
  }
  const note = listPlaybook(h.screens.screens, 'pp', 'bia')[0]!
  expect(note.adjustments).toEqual(['dois', 'três', 'quatro', 'cinco', 'seis'])
  expect(note.uses).toHaveLength(0)
  expect(h.screens.listApprovals('pp').filter(card => card.kind === 'skill')).toHaveLength(0)
})

it('the review wire reads the Task (title, who did it, what it asked), never its id, and a Task it does not know is ignored', () => {
  const h = host()
  seed(h)
  const tickets = new Map([['t1', { title: 'Cartaz da promoção de pão de queijo', execution: { name: 'Bia', assignment: 'Faça o cartaz com o preço novo.' } }]])
  const wire = {
    screens: h.screens, product: h.product,
    // `conversationOfTicket`: where the Task was asked (D-119: a Task born in a DM is that DM's); a channel here
    orchestration: { runtime: () => ({ repo: { tickets: { get: (id: string) => tickets.get(id) } } }), conversationOfTicket: () => ({ streamKind: 'channel', ownerId: 'geral', topicId: '', subjectId: '' }), now: () => '2026-11-10T10:00:00.000Z', localOffsetMinutes: () => 0 },
  } as unknown as FeedbackWireDeps
  expect(learnFromAcceptedReview(wire, { ...SCOPE, ticketId: 't1' })?.note).toMatchObject({ title: 'Cartaz da promoção de pão de queijo', request: 'Faça o cartaz com o preço novo.' })
  learnFromRequestedChanges(wire, { projectId: 'pp', ticketId: 't1', feedback: 'Mais curto' })
  expect(listPlaybook(h.screens.screens, 'pp')[0]).toMatchObject({ personaId: 'bia', adjustments: ['Mais curto'] })
  expect(learnFromAcceptedReview(wire, { ...SCOPE, ticketId: 'nope' })).toBeUndefined()
  expect(h.vault.listRecords('pp')).toHaveLength(0)
})

it('the old technical receipt ("Revisão aceita: <ticket>") is not a memory in Memória any more', () => {
  const h = host()
  seed(h)
  h.vault.createRecord({ id: 'mem-fb-t9', ...SCOPE, kind: 'memory', body: 'Revisão aceita: t9. t9', authorId: 'review', visibility: { kind: 'workspace' } })
  h.vault.createRecord({ id: 'real-1', ...SCOPE, kind: 'memory', body: 'A padaria abre às 7h.', authorId: 'ana', visibility: { kind: 'workspace' } })
  expect(h.listMemory(SCOPE).map(row => row.body)).toEqual(['A padaria abre às 7h.'])
})

it('Carbon P2-03c: a "day" is the owner\'s LOCAL day, not the UTC one: three uses on one evening (UTC-3) are ONE day, and the offer waits for a second local day', () => {
  const h = host()
  seed(h)
  const clock = { at: '2026-11-10T23:30:00.000Z' } // 20:30 on the 10th in São Paulo
  const local: PlaybookDeps = { ...deps(h, clock), offsetMinutes: () => -180 }
  notePlaybookWin(local, win('t1'))
  clock.at = '2026-11-11T01:30:00.000Z' // 22:30 on the 10th: already the 11th in UTC
  notePlaybookWin(local, win('t2'))
  clock.at = '2026-11-11T02:30:00.000Z' // 23:30 on the 10th
  expect(notePlaybookWin(local, win('t3'))?.offered).toBe(false) // one local day: the proof needs two
  expect(listPlaybook(h.screens.screens, 'pp', 'bia')[0]?.uses.map(use => use.day)).toEqual(['2026-11-10', '2026-11-10', '2026-11-10'])
  clock.at = '2026-11-11T12:00:00.000Z' // the 11th at 09:00: a second local day
  expect(notePlaybookWin(local, win('t4'))?.offered).toBe(true)
})
