/**
 * TEAM-10 (D-090 acceptance b) — the pure verdict over a real round's transcript. Synthetic transcripts: no app, no model.
 */
import { describe, expect, it } from 'vitest'
import type { LedgerEvidence } from '../src/ledger-evidence.ts'
import { describeBehaviors, evaluateTeamRound } from '../src/team-round-verdict.ts'
import type { TeamTranscript, TranscriptLine, TranscriptNote } from '../src/team-transcript.ts'

const EXPECT = { ceilingTurns: 6, minPersonas: 2, requireImage: true } as const

function line(id: string, who: string, text: string, attachments: string[] = []): TranscriptLine {
  return { at: `2026-11-05T10:00:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type: 'message', who, text, attachments, leaks: [] }
}

function ledger(rows: Array<{ engine?: string; input?: number; output?: number; origin?: string }>): LedgerEvidence {
  const raw = rows.map((row, index) => ({
    id: `l${String(index)}`, persona_id: 'p', engine: row.engine ?? 'claude', kind: 'execution', input_tokens: row.input ?? 9000, output_tokens: row.output ?? 300,
    cache_read_tokens: 0, cache_write_tokens: 0, origin: row.origin ?? 'measured', ticket_id: null, at: '2026-11-05T10:00:00.000Z',
  }))
  return {
    dbPath: 'x', rawRows: raw, turns: raw.length,
    rows: raw.map(row => ({ kind: 'execution', engine: row.engine, origin: row.origin, inputTokens: row.input_tokens, outputTokens: row.output_tokens, cacheReadTokens: 0, cacheWriteTokens: 0, ticketId: null, at: row.at, envMode: 'answer-only' })),
    inputTokens: raw.reduce((sum, row) => sum + row.input_tokens, 0), outputTokens: raw.reduce((sum, row) => sum + row.output_tokens, 0),
    cacheReadTokens: 0, cacheWriteTokens: 0, allMeasured: raw.every(row => row.origin === 'measured'),
  }
}

const GOOD_LINES = [
  line('1', 'Miguel', 'Preciso de um cartaz da promoção do pão de queijo.'),
  line('2', 'Bia', 'Texto do cartaz pronto. Passei para o Téo fazer a arte.'),
  line('3', 'Téo', 'Aqui está a arte. Pedido de opinião: o que acham?', ['cartaz.png']),
  line('4', 'Atlas', 'A imagem tem um círculo vermelho sobre fundo azul e uma faixa amarela embaixo. Sugiro mais contraste no texto.'),
  line('5', 'Bia', 'Gostei.'),
]

const NOTE: TranscriptNote = {
  id: 'h1', from: 'Bia', to: 'Téo', title: 'Arte do cartaz', kind: 'next', status: 'delivered', askedAt: '', done: ['Texto do cartaz pronto'], needed: ['A imagem'], files: [], decisions: [],
  colleagueReceived: true, colleagueTicketId: 't2', via: 'model',
}

function transcript(overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return { lines: GOOD_LINES, tickets: [], ledger: ledger([{}, {}, {}]), names: {}, personas: ['Bia', 'Téo', 'Atlas'], leaks: [], ignoredTypes: {}, notes: [NOTE], reviews: [], asks: [], splitTasks: 0, splitAssignments: [], reviewAssignments: [], ...overrides }
}

describe('evaluateTeamRound', () => {
  it('passes a real round: measured ledger within the ceiling, 3 personas, a handoff, the image seen and described, no leak', () => {
    const verdict = evaluateTeamRound(transcript(), EXPECT)
    expect(verdict.problems).toEqual([])
    expect(verdict.passed).toBe(true)
    expect(verdict.facts).toMatchObject({ turns: 3, speakingPersonas: ['Bia', 'Téo', 'Atlas'], handoffLines: 1, imageLineId: '3' })
    expect(verdict.facts.opinionsAboutImage[0]!.who).toBe('Atlas')
  })

  it('fails closed on the ledger: missing, empty, estimated, above the ceiling, or carrying the fake runner fingerprint', () => {
    expect(evaluateTeamRound(transcript({ ledger: undefined }), EXPECT).problems.join()).toMatch(/no turn_ledger/u)
    expect(evaluateTeamRound(transcript({ ledger: ledger([]) }), EXPECT).problems.join()).toMatch(/holds no turn/u)
    expect(evaluateTeamRound(transcript({ ledger: ledger([{ origin: 'estimate' }]) }), EXPECT).problems.join()).toMatch(/not fully measured/u)
    expect(evaluateTeamRound(transcript({ ledger: ledger(Array.from({ length: 7 }, () => ({}))) }), EXPECT).problems.join()).toMatch(/7 paid turns, above the approved ceiling of 6/u)
    expect(evaluateTeamRound(transcript({ ledger: ledger([{ engine: 'dsh', input: 1, output: 1 }]) }), EXPECT).problems.join()).toMatch(/FAKE runner signature/u)
  })

  it('needs a team (2+ personas), a visible handoff, and the image reaching the others', () => {
    const solo = evaluateTeamRound(transcript({ lines: [GOOD_LINES[0]!, GOOD_LINES[1]!], personas: ['Bia'] }), EXPECT)
    expect(solo.problems.join('\n')).toMatch(/only 1 persona\(s\) spoke/u)
    const noHandoff = evaluateTeamRound(transcript({ lines: GOOD_LINES.map(item => (item.id === '2' ? line('2', 'Bia', 'Texto do cartaz pronto.') : item)) }), EXPECT)
    expect(noHandoff.problems.join('\n')).toMatch(/no visible handoff line/u)
    const noImage = evaluateTeamRound(transcript({ lines: GOOD_LINES.map(item => ({ ...item, attachments: [] })) }), EXPECT)
    expect(noImage.problems.join('\n')).toMatch(/image never reached the team/u)
  })

  it('a typed handoff event counts as the visible handoff (whoever the line is attributed to), and the final phrases are recognized', () => {
    const typed = transcript({ lines: GOOD_LINES.map(item => (item.id === '2' ? { ...line('2', 'Bia', 'Bia e Téo trabalharam juntos no cartaz.'), type: 'handoff' } : item)) })
    expect(evaluateTeamRound(typed, EXPECT).facts.handoffLines).toBe(1)
    for (const phrase of ['Bia passou para Téo: Cartaz', 'Bia pediu ajuda a Téo: Cartaz', 'Téo entregou para Bia: Cartaz', 'Bia retomou “Cartaz” com a entrega de Téo']) {
      const words = transcript({ lines: GOOD_LINES.map(item => (item.id === '2' ? line('2', 'Bia', phrase) : item)) })
      expect(evaluateTeamRound(words, EXPECT).facts.handoffLines, phrase).toBe(1)
    }
  })

  it('positive proof of the handoff: a bilhete must exist and have reached the Ticket of the colleague', () => {
    expect(evaluateTeamRound(transcript({ notes: [] }), EXPECT).problems.join('\n')).toMatch(/no bilhete was recorded/u)
    const lost = evaluateTeamRound(transcript({ notes: [{ ...NOTE, colleagueReceived: false, colleagueTicketId: null }] }), EXPECT)
    expect(lost.problems.join('\n')).toMatch(/colleague never received the bilhete of "Arte do cartaz" \(Bia → Téo\)/u)
  })

  it('a generic "ótimo!" is not proof the image was seen; the author of the image does not count as an opinion', () => {
    const generic = evaluateTeamRound(transcript({ lines: GOOD_LINES.map(item => (item.id === '4' ? line('4', 'Atlas', 'Ótimo trabalho, parabéns!') : item)) }), EXPECT)
    expect(generic.problems.join('\n')).toMatch(/at least two things it really shows/u)
    const selfOnly = evaluateTeamRound(transcript({ lines: GOOD_LINES.map(item => (item.id === '4' ? line('4', 'Téo', 'Fiz um círculo vermelho sobre fundo azul.') : item)) }), EXPECT)
    expect(selfOnly.problems.join('\n')).toMatch(/at least two things it really shows/u)
  })

  it('D-097: a team that did not collaborate is a FINDING about the team, not a harness error — and a broken run is the other way round', () => {
    const quiet = evaluateTeamRound(transcript({ notes: [], lines: [line('1', 'Miguel', 'Faz um cartaz da promoção.', ['foto.png']), line('2', 'Bia', 'Aqui vai o texto do cartaz.', []), line('3', 'Téo', 'A imagem tem um círculo vermelho sobre fundo azul e uma faixa amarela.', [])] }), EXPECT)
    expect(quiet.passed).toBe(false)
    expect(quiet.outcome).toBe('did-not-collaborate')
    expect(quiet.harnessProblems).toEqual([])
    expect(quiet.findings.join('\n')).toMatch(/não colaborou: nobody passed work forward, asked a colleague for help or opened a round of opinion/u)
    expect(quiet.behaviors).toEqual({ passedForward: 0, askedHelp: 0, opinionLines: 0, reviews: 0, seals: 0 })

    const good = evaluateTeamRound(transcript({ reviews: [{ taskId: 't', status: 'closed', reviewer: 'Atlas', author: 'Bia', returns: 0, sealed: true, summary: 'ok', failure: null }] }), EXPECT)
    expect(good.outcome).toBe('passed')
    expect(good.behaviors).toMatchObject({ passedForward: 1, askedHelp: 0, reviews: 1, seals: 1 })

    // the fake signature, a bilhete that never reached the colleague and an image that never reached the thread are defects of the run/product, whatever the model did
    expect(evaluateTeamRound(transcript({ ledger: ledger([{ engine: 'dsh', input: 1, output: 1 }]) }), EXPECT).outcome).toBe('harness-problem')
    expect(evaluateTeamRound(transcript({ notes: [{ ...NOTE, colleagueReceived: false, colleagueTicketId: null }] }), EXPECT).outcome).toBe('harness-problem')
    expect(evaluateTeamRound(transcript({ lines: GOOD_LINES.map(item => ({ ...item, attachments: [] })) }), EXPECT).outcome).toBe('harness-problem')
  })

  it('a help request counts as collaboration, and a persona that reviews her own work is not a review', () => {
    const asked = evaluateTeamRound(transcript({ notes: [{ ...NOTE, kind: 'help' }], reviews: [{ taskId: 't', status: 'closed', reviewer: 'Bia', author: 'Bia', returns: 0, sealed: false, summary: '', failure: null }] }), EXPECT)
    expect(asked.behaviors).toMatchObject({ passedForward: 0, askedHelp: 1, reviews: 0 })
    expect(asked.findings.join('\n')).not.toMatch(/não colaborou/u)
  })

  it('describeBehaviors says which of the six behaviors happened and by WHICH road — the host\'s plan and review policy, or the model\'s own choice of a team tool', () => {
    const review = { taskId: 't', status: 'closed', reviewer: 'Atlas', author: 'Bia', returns: 0, summary: '', failure: null }
    // the shape attempt 3 may take: the host split the request, each part ran, the reviewer sealed both — and the model chose nothing
    const hostOnly = describeBehaviors(transcript({ notes: [], splitTasks: 2, reviews: [{ ...review, sealed: true }, { ...review, author: 'Téo', sealed: true }] }), { day: { outcome: 'posted' }, turnsBefore: 4, turnsAfter: 4 })
    expect(hostOnly.map(item => [item.n, item.occurred])).toEqual([[0, true], [1, false], [2, false], [3, false], [4, false], [5, true], [6, true]])
    expect(hostOnly[0]).toMatchObject({ count: 2, via: 'plano do host' })
    expect(hostOnly[5]).toMatchObject({ count: 2, via: 'plano/regra do host (revisão por política): 2 revisão(ões), 2 selo(s)' })
    expect(hostOnly[6]).toMatchObject({ via: 'host (cartão do dia, 0 turno)' })
    // the model chose: a pass_forward and a help by tool, plus a host-made one (a call id the host prefixes) — each counted on its road
    const chosen = describeBehaviors(transcript({ notes: [NOTE, { ...NOTE, id: 'h2', kind: 'help', via: 'model' }, { ...NOTE, id: 'h3', kind: 'next', via: 'host' }] }), { day: { outcome: 'already' }, turnsBefore: 3, turnsAfter: 5 })
    expect(chosen[1]).toMatchObject({ occurred: true, count: 3, via: 'escolha do modelo 2 · plano/regra do host 1' })
    expect(chosen[2]).toMatchObject({ count: 2, via: 'escolha do modelo 1 · plano/regra do host 1' })
    expect(chosen[3]).toMatchObject({ count: 1, via: 'escolha do modelo 1 · plano/regra do host 0' })
    expect(chosen[6]!.occurred, 'a morning card that booked paid turns is not "free"').toBe(false)
    expect(describeBehaviors(transcript({ notes: [] }))[6]!.occurred, 'no reading of the morning card, no claim').toBe(false)
  })

  it('a SEALED peer review counts as collaboration (the same reading as the observer with --any); a seal by the author herself is not a peer review', () => {
    const lines = [line('1', 'Miguel', 'Faz o cartaz.', ['foto.png']), line('2', 'Bia', 'Aqui o texto.'), line('3', 'Téo', 'A imagem tem um círculo vermelho sobre fundo azul e uma faixa amarela.')]
    const review = { taskId: 't', status: 'closed', reviewer: 'Atlas', author: 'Bia', returns: 0, summary: '', failure: null }
    const sealed = evaluateTeamRound(transcript({ notes: [], lines, reviews: [{ ...review, sealed: true }] }), EXPECT)
    expect(sealed.behaviors).toMatchObject({ reviews: 1, seals: 1 })
    expect(sealed.findings.join('\n')).not.toMatch(/não colaborou/u)
    const self = evaluateTeamRound(transcript({ notes: [], lines, reviews: [{ ...review, reviewer: 'Bia', sealed: true }] }), EXPECT)
    expect(self.behaviors).toMatchObject({ reviews: 0, seals: 0 })
    expect(self.findings.join('\n')).toMatch(/não colaborou: nobody passed work forward, asked a colleague for help or opened a round of opinion \(and no peer review sealed any work\)/u)
  })

  it('a team that ASKS the person (persona_ask) is doing the right thing: a note, never a product failure — and the verdict says whether the harness answered', () => {
    const asks = [{ id: 'ask-card:1', askId: '1', ticketId: 't1', who: 'Téo', question: 'Qual é a promoção?', options: ['Desconto em %'], step: { index: 1, total: 4 } }]
    const stopped = evaluateTeamRound(transcript({ notes: [], asks }), EXPECT)
    expect(stopped.outcome).toBe('did-not-collaborate')
    expect(stopped.harnessProblems).toEqual([])
    expect(stopped.facts).toMatchObject({ askedPerson: 1, answeredByHarness: 0 })
    expect(stopped.notes.join('\n')).toMatch(/RIGHT behavior for a request without facts/u)
    expect(stopped.notes.join('\n')).toMatch(/nobody answered the question/u)
    const answered = evaluateTeamRound(transcript({ asks }), { ...EXPECT, answeredAsks: 1 })
    expect(answered.outcome).toBe('passed')
    expect(answered.facts).toMatchObject({ askedPerson: 1, answeredByHarness: 1 })
    expect(answered.notes.join('\n')).toMatch(/the harness answered 1 for her/u)
    expect(evaluateTeamRound(transcript(), EXPECT).notes).toEqual([])
  })

  it('a review that could not read the author\'s work ("turn ended") or whose engine failed is a defect of the run, not "did not collaborate"', () => {
    const review = { taskId: 't', status: 'closed', reviewer: 'Atlas', author: 'Bia', returns: 0, sealed: false, summary: '' }
    const unreadable = evaluateTeamRound(transcript({ reviews: [{ ...review, failure: 'unreadable' }] }), EXPECT)
    expect(unreadable.outcome).toBe('harness-problem')
    expect(unreadable.harnessProblems.join('\n')).toMatch(/could not read it .*turn ended/u)
    expect(evaluateTeamRound(transcript({ reviews: [{ ...review, failure: 'engine' }] }), EXPECT).harnessProblems.join('\n')).toMatch(/failed in the reviewer's engine/u)
    expect(evaluateTeamRound(transcript({ reviews: [{ ...review, failure: null }] }), EXPECT).outcome).toBe('passed')
  })

  it('reports leaks and engine errors visible in the thread', () => {
    const verdict = evaluateTeamRound(transcript({
      lines: [...GOOD_LINES, line('6', 'Téo', '⚠ (erro do motor de Téo — Claude: engine_unavailable)')],
      leaks: ['m9: internal prompt: Não use ferramentas'],
    }), EXPECT)
    expect(verdict.passed).toBe(false)
    expect(verdict.problems.join('\n')).toMatch(/engine error visible in the thread \(6\)/u)
    expect(verdict.problems.join('\n')).toMatch(/LEAK-1: m9/u)
  })
})
