import { expect, it } from 'vitest'
import {
  MAX_OPEN_PROPOSALS,
  clipProposalTitle,
  draftTaskProposals,
  freshStats,
  mayOfferProposal,
  planProposalCard,
  proposalExpired,
  proposalKey,
  proposalMinGapMs,
  proposalPlainText,
  proposalQuestion,
  proposalReason,
  proposalRequest,
  proposalsAllowedPerDay,
  recordProposalDecision,
  revertProposalDecline,
  snoozeActive,
  wantsWork,
  type ProposalLocale,
  type TaskFact,
} from '../src/index.ts'

const NOW = '2026-11-04T12:00:00.000Z'
const FACTS: Record<string, TaskFact> = {
  blocked: { kind: 'blocked', title: 'Cardápio de almoço', detail: 'Qual preço cobro pelo combo?', ticketId: 't1' },
  stale: { kind: 'stale', title: 'Relatório de sexta', ageDays: 3, ticketId: 't2' },
  deadline: { kind: 'deadline', title: 'Prestação de contas', detail: 'Vence na sexta.', whenLabel: 'sexta às 14h' },
  error: { kind: 'error', title: 'Envio de e-mails', detail: 'Falhou 3 vezes esta semana.' },
  goal: { kind: 'goal', title: 'Site no ar' },
}

it('the questions are the ones the Muse approved, in both languages, with typographic quotes', () => {
  expect(proposalQuestion(FACTS.blocked!, 'pt')).toBe('Posso destravar “Cardápio de almoço”?')
  expect(proposalQuestion(FACTS.stale!, 'pt')).toBe('Posso retomar “Relatório de sexta”?')
  expect(proposalQuestion(FACTS.deadline!, 'pt')).toBe('Posso adiantar “Prestação de contas”? Vence sexta às 14h.')
  expect(proposalQuestion(FACTS.error!, 'pt')).toBe('Posso resolver o erro que se repete em “Envio de e-mails”?')
  expect(proposalQuestion(FACTS.goal!, 'pt')).toBe('Posso dar o próximo passo em “Site no ar”?')
  expect(proposalQuestion(FACTS.blocked!, 'en')).toBe('Can I unblock “Cardápio de almoço”?')
  expect(proposalQuestion(FACTS.stale!, 'en')).toBe('Can I pick “Relatório de sexta” back up?')
  expect(proposalQuestion(FACTS.deadline!, 'en')).toBe('Can I get ahead on “Prestação de contas”? Due sexta às 14h.')
  expect(proposalQuestion(FACTS.error!, 'en')).toBe('Can I fix the error that keeps happening in “Envio de e-mails”?')
  expect(proposalQuestion(FACTS.goal!, 'en')).toBe('Can I take the next step on “Site no ar”?')
  // no due date known: no invented "Vence"
  expect(proposalQuestion({ kind: 'deadline', title: 'Contrato' }, 'pt')).toBe('Posso adiantar “Contrato”?')
})

it('titles are flattened and cut at 60 characters with an ellipsis', () => {
  expect(clipProposalTitle('  Relatório \n  de   sexta ')).toBe('Relatório de sexta')
  const long = clipProposalTitle(`Relatório ${'muito '.repeat(30)}longo`)
  expect(long.length).toBe(60)
  expect(long.endsWith('…')).toBe(true)
  expect(proposalQuestion({ kind: 'stale', title: 'x'.repeat(200), ageDays: 2 }, 'pt')).toContain(`${'x'.repeat(59)}…`)
})

it('the reason is one line and only fact: the blocking question, the days, the fact — never invented', () => {
  expect(proposalReason(FACTS.blocked!, 'pt')).toBe('Qual preço cobro pelo combo?')
  expect(proposalReason({ ...FACTS.blocked!, detail: 'p'.repeat(300) }, 'pt').length).toBe(90)
  expect(proposalReason(FACTS.stale!, 'pt')).toBe('Está parado há 3 dias.')
  expect(proposalReason({ ...FACTS.stale!, ageDays: 1 }, 'pt')).toBe('Está parado há 1 dia.')
  expect(proposalReason(FACTS.stale!, 'en')).toBe('It has been stuck for 3 days.')
  expect(proposalReason(FACTS.deadline!, 'pt')).toBe('Vence na sexta.')
  expect(proposalReason(FACTS.error!, 'pt')).toBe('Falhou 3 vezes esta semana.')
  expect(proposalReason(FACTS.goal!, 'pt')).toBe('O objetivo está aberto e nada está andando.')
})

it('every request is work: it becomes a Ticket, in both languages', () => {
  for (const locale of ['pt', 'en'] as const satisfies readonly ProposalLocale[]) {
    for (const [kind, fact] of Object.entries(FACTS)) {
      const request = proposalRequest(fact, locale)
      expect(wantsWork(request), `${locale}/${kind}: ${request}`).toBe(true)
      expect(request).toContain('“')
    }
  }
})

it('drafts: the same thing observed again is silenced; another open Ticket covering it drops it; the fact\'s own Ticket does not', () => {
  const base = { facts: [FACTS.stale!, FACTS.blocked!], locale: 'pt' as const }
  // the stale Ticket itself is "existing work" — that is exactly what the proposal is about, so it must NOT cancel it
  const own = draftTaskProposals({ ...base, existing: [{ title: 'Relatório de sexta', ticketId: 't2' }, { title: 'Cardápio de almoço', ticketId: 't1' }] })
  expect(own.map(row => row.kind)).toEqual(['stale', 'blocked'])
  // a DIFFERENT open Ticket with the same subject already covers it
  const covered = draftTaskProposals({ ...base, existing: [{ title: 'Relatório de sexta', ticketId: 'other' }] })
  expect(covered.map(row => row.kind)).toEqual(['blocked'])
  // open or recently declined keys stay silent
  const silenced = draftTaskProposals({ ...base, existing: [], silencedKeys: new Set([proposalKey(FACTS.blocked!)]) })
  expect(silenced.map(row => row.kind)).toEqual(['stale'])
  expect(proposalKey(FACTS.stale!)).toBe(proposalKey({ kind: 'stale', title: '  RELATÓRIO de sexta ' }))
})

it('drafts: empty titles and near-identical questions never reach the person; the vacuous generic gap does not exist', () => {
  const drafts = draftTaskProposals({
    facts: [
      { kind: 'stale', title: '   ', ageDays: 5 },
      { kind: 'stale', title: 'Relatório de sexta', ageDays: 3 },
      { kind: 'stale', title: 'Relatório de sexta!', ageDays: 4 },
      FACTS.goal!,
    ],
    existing: [],
    locale: 'pt',
  })
  expect(drafts.map(row => row.question)).toEqual(['Posso retomar “Relatório de sexta”?', 'Posso dar o próximo passo em “Site no ar”?'])
  for (const row of drafts) {
    expect(row.question.trim()).not.toBe('')
    expect(row.reason.trim()).not.toBe('')
    expect(row.question).not.toMatch(/Revisar o projeto e propor/)
  }
})

it('the acceptance rate moves with the answers (4 samples), a decline can be reopened, and the frequency follows without ever reaching zero', () => {
  let stats = freshStats()
  expect(stats).toEqual({ accepted: 0, declined: 0, rate: 0.5 })
  stats = recordProposalDecision(stats, true)
  expect(stats).toMatchObject({ accepted: 1, declined: 0, rate: 0.625 })
  const beforeDecline = stats
  stats = recordProposalDecision(stats, false)
  expect(stats).toMatchObject({ accepted: 1, declined: 1 })
  expect(stats.rate).toBeCloseTo(0.46875)
  expect(revertProposalDecline(stats, beforeDecline)).toEqual({ accepted: 1, declined: 0, rate: 0.625 })
  for (let i = 0; i < 6; i += 1) stats = recordProposalDecision(stats, false)
  expect(stats.rate).toBeLessThan(0.25)

  expect(proposalsAllowedPerDay(3, 0.9)).toBe(3)
  expect(proposalsAllowedPerDay(3, 0.5)).toBe(3)
  expect(proposalsAllowedPerDay(3, 0.3)).toBe(1)
  expect(proposalsAllowedPerDay(4, 0.3)).toBe(2)
  expect(proposalsAllowedPerDay(3, 0)).toBe(1)
  expect(proposalsAllowedPerDay(0, 1)).toBe(1)
  expect(proposalMinGapMs(0.6)).toBe(0)
  expect(proposalMinGapMs(0.25)).toBe(0)
  expect(proposalMinGapMs(0)).toBe(2 * 86_400_000)
  expect(proposalMinGapMs(0.2)).toBe(Math.round(86_400_000 * 1.8))
})

it('the attention budget: open cap, per-day allowance shrunk by a low acceptance, and the gap a low acceptance asks for', () => {
  const welcome = { accepted: 3, declined: 0, rate: 0.8 }
  const unwelcome = { accepted: 0, declined: 5, rate: 0.1 }
  const ok = { basePerDay: 2, stats: welcome, offeredToday: 0, openInProject: 0, now: NOW }
  expect(mayOfferProposal(ok)).toEqual({ allowed: true })
  expect(mayOfferProposal({ ...ok, offeredToday: 2 })).toEqual({ allowed: false, why: 'budget' })
  expect(mayOfferProposal({ ...ok, openInProject: MAX_OPEN_PROPOSALS })).toEqual({ allowed: false, why: 'open-cap' })
  expect(mayOfferProposal({ ...ok, openInProject: MAX_OPEN_PROPOSALS - 1 })).toEqual({ allowed: true })
  // unwelcome proposals: at most 1 a day, and not more often than every 24h × (2 − rate)
  expect(mayOfferProposal({ ...ok, stats: unwelcome, offeredToday: 1 })).toEqual({ allowed: false, why: 'budget' })
  const recent = new Date(Date.parse(NOW) - 30 * 3_600_000).toISOString()
  const old = new Date(Date.parse(NOW) - 50 * 3_600_000).toISOString()
  expect(mayOfferProposal({ ...ok, stats: unwelcome, lastOfferedAt: recent })).toEqual({ allowed: false, why: 'gap' })
  expect(mayOfferProposal({ ...ok, stats: unwelcome, lastOfferedAt: old })).toEqual({ allowed: true })
  // welcome proposals have no gap
  expect(mayOfferProposal({ ...ok, lastOfferedAt: NOW })).toEqual({ allowed: true })
})

it('one proposal is a single card; two or three are ONE digest; never more than three; none is nothing', () => {
  expect(planProposalCard([])).toBeUndefined()
  expect(planProposalCard(['a'])).toEqual({ kind: 'single', items: ['a'] })
  expect(planProposalCard(['a', 'b'])).toEqual({ kind: 'digest', items: ['a', 'b'] })
  expect(planProposalCard(['a', 'b', 'c', 'd', 'e'])).toEqual({ kind: 'digest', items: ['a', 'b', 'c'] })
})

it('an unanswered proposal expires in 3 days; "Agora não" silences for 7', () => {
  const day = 86_400_000
  const at = (days: number): string => new Date(Date.parse(NOW) + days * day).toISOString()
  expect(proposalExpired(NOW, at(2.9))).toBe(false)
  expect(proposalExpired(NOW, at(3))).toBe(true)
  expect(snoozeActive(NOW, at(6.9))).toBe(true)
  expect(snoozeActive(NOW, at(7))).toBe(false)
})

it('the plain sentence a client without the card shows, in both languages', () => {
  const one = { personaName: 'Nina', question: 'Posso retomar “Relatório de sexta”?', reason: 'Está parado há 3 dias.' }
  expect(proposalPlainText({ kind: 'single', items: [one] }, 'pt')).toBe('Nina sugeriu: Posso retomar “Relatório de sexta”? (Está parado há 3 dias.)')
  expect(proposalPlainText({ kind: 'single', items: [{ ...one, question: 'Can I pick “Relatório de sexta” back up?', reason: 'It has been stuck for 3 days.' }] }, 'en'))
    .toBe('Nina suggested: Can I pick “Relatório de sexta” back up? (It has been stuck for 3 days.)')
  expect(proposalPlainText({ kind: 'digest', items: [one, one, one] }, 'pt')).toBe('A equipe tem 3 sugestões para você. Abra a Persona para responder.')
  expect(proposalPlainText({ kind: 'digest', items: [one, one] }, 'en')).toBe('The team has 2 suggestions for you. Open Persona to reply.')
})
