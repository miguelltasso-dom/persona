/**
 * OPT-10b: the criterion of the real `needed` round, written BEFORE any call (persona-spec/contracts/needed-real-round.md). The rule is pure and every
 * case below is decided here, so the data cannot bend it.
 */
import { describe, expect, it } from 'vitest'
import {
  NEEDED_CALL_CAP, NEEDED_CONTENT_TASKS, NEEDED_FLOOR_TOKENS, NEEDED_TASKS, NEEDED_TOLERANCE, NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS, answerSharesWord, assertNeededGuards, chooseNeededConnector, evaluateNeededRound, isContentTool, renderNeededReport,
  type NeededAttempt, type NeededCandidate, type NeededPlan, type NeededToolCall,
} from '../src/bench/needed-round.ts'

const PLAN: NeededPlan = { grantedServer: 'claude_ai_Google_Calendar', connectorTokens: 375 }
const LIMIT = Math.round(NEEDED_TOLERANCE * (NEEDED_FLOOR_TOKENS + NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS)) // a connector measured at +375 is bounded like the whole account

const read = (over: Partial<NeededToolCall> = {}): NeededToolCall => ({ server: 'claude_ai_Google_Calendar', tool: 'list_events', actionClass: 'read', denied: false, ok: true, ...over })
function attempt(over: Partial<NeededAttempt> = {}): NeededAttempt {
  return { attempt: 1, effectiveMode: 'needed', toolCalls: [read()], maxRequestInputTokens: 33_000, finalTextChars: 120, answerSharesWord: true, ...over }
}

describe('the pre-registered numbers', () => {
  it('are the ones the contract names', () => {
    expect(NEEDED_CALL_CAP).toBe(3)
    expect(NEEDED_FLOOR_TOKENS).toBe(31_414)
    expect(NEEDED_TOLERANCE).toBe(1.15)
    expect(NEEDED_WHOLE_ACCOUNT_EXTRA_TOKENS).toBe(2_875)
    expect(LIMIT).toBe(39_432) // 1.15 × (31,414 + 2,875)
  })
  it('every task is read-only and names the kind of connector', () => {
    for (const task of [...Object.values(NEEDED_TASKS), ...Object.values(NEEDED_CONTENT_TASKS)]) expect(task).toMatch(/^Use o conector de /u)
    expect([...Object.values(NEEDED_TASKS), ...Object.values(NEEDED_CONTENT_TASKS)].join(' ')).not.toMatch(/envie|mande|apague|pague|crie|escreva|responda ao/iu)
  })
  it('the DEFAULT tasks read no content and say so; only the fallback reads an item of the person\'s', () => {
    expect(NEEDED_TASKS.mail).toMatch(/rótulos/u)
    expect(NEEDED_TASKS.mail).toMatch(/Não leia nenhuma mensagem/u)
    expect(NEEDED_TASKS.calendar).toMatch(/agendas \(calendários\)/u)
    expect(NEEDED_TASKS.calendar).toMatch(/Não leia nenhum evento/u)
    // they ask for NAMES, so the answer can be checked against the result
    for (const task of Object.values(NEEDED_TASKS)) expect(task).toMatch(/cite o nome de até três/u)
    expect(NEEDED_CONTENT_TASKS.mail).toMatch(/assunto do último e-mail/u)
  })
})

describe('the bound on the largest request', () => {
  const attempts = [attempt({ maxRequestInputTokens: 38_000 })]
  it('a connector that reads +0 (deferred tool schemas) is bounded like the whole account, not like the floor alone', () => {
    expect(evaluateNeededRound({ ...PLAN, connectorTokens: 0 }, attempts)).toMatchObject({ maxInputAllowed: 39_432, verdict: 'pass' })
  })
  it('a connector that measured more than the whole account keeps its own larger cost', () => {
    expect(evaluateNeededRound({ ...PLAN, connectorTokens: 4_000 }, attempts).maxInputAllowed).toBe(Math.round(1.15 * (31_414 + 4_000)))
  })
  it('the native launch is far outside any of them', () => {
    expect(evaluateNeededRound({ ...PLAN, connectorTokens: 0 }, [attempt({ maxRequestInputTokens: 308_902 })]).verdict).toBe('fail')
  })
})

describe('the guard', () => {
  const ok = { PERSONA_NEEDED_REAL: '1', PERSONA_REAL_E2E: '1', PERSONA_LOCK: 'real', PERSONA_CLI_ENV: 'needed', PERSONA_REAL_TURN_CAP: '3', PERSONA_REAL_TURN_LEDGER: 'C:/x/ledger.json' }
  it('passes only with every condition', () => {
    expect(assertNeededGuards(ok)).toEqual({ cap: 3, ledger: 'C:/x/ledger.json' })
    expect(assertNeededGuards({ ...ok, PERSONA_REAL_TURN_CAP: '1', PERSONA_REAL_TURN_LEDGER: '/tmp/l.json' }).cap).toBe(1)
  })
  it.each([
    ['not the round', { PERSONA_NEEDED_REAL: undefined }],
    ['no E2E switch', { PERSONA_REAL_E2E: undefined }],
    ['outside the real lock', { PERSONA_LOCK: 'check' }],
    ['another mode', { PERSONA_CLI_ENV: 'answer-only' }],
    ['no limiter', { PERSONA_REAL_TURN_CAP: undefined }],
    ['a limiter over the ceiling', { PERSONA_REAL_TURN_CAP: '4' }],
    ['a limiter that is not a number', { PERSONA_REAL_TURN_CAP: '3x' }],
    ['no ledger', { PERSONA_REAL_TURN_LEDGER: undefined }],
    ['a relative ledger', { PERSONA_REAL_TURN_LEDGER: 'ledger.json' }],
  ] as const)('refuses: %s', (_name, change) => {
    expect(() => assertNeededGuards({ ...ok, ...change })).toThrow()
  })
})

describe('the connector: connected, readable, measured, and the cheapest', () => {
  const c = (id: string, kind: NeededCandidate['kind'], connected: boolean, costTokens?: number, safeReadTool = true): NeededCandidate => ({ id, kind, connected, safeReadTool, ...(costTokens === undefined ? {} : { costTokens }) })
  it('picks the cheapest connected readable one and gives its task (the one that reads no content)', () => {
    const choice = chooseNeededConnector([c('a', 'calendar', true, 445), c('b', 'mail', true, 375), c('c', 'other', true, 100), c('d', 'mail', false, 50)])
    expect(choice).toMatchObject({ chosen: { id: 'b' }, task: NEEDED_TASKS.mail, readsContent: false })
  })
  it('a connector with a safe read tool beats a cheaper one that has none; the content fallback only when NONE has one, and it says so', () => {
    const safe = chooseNeededConnector([c('a', 'mail', true, 0, false), c('b', 'calendar', true, 900, true)])
    expect(safe).toMatchObject({ chosen: { id: 'b' }, task: NEEDED_TASKS.calendar, readsContent: false })
    const fallback = chooseNeededConnector([c('a', 'mail', true, 0, false), c('b', 'calendar', true, 900, false)])
    expect(fallback).toMatchObject({ chosen: { id: 'a' }, task: NEEDED_CONTENT_TASKS.mail, readsContent: true })
  })
  it('a tie goes to the calendar, then to the id', () => {
    expect(chooseNeededConnector([c('z', 'mail', true, 400), c('y', 'calendar', true, 400)]).chosen?.id).toBe('y')
    expect(chooseNeededConnector([c('b', 'calendar', true, 400), c('a', 'calendar', true, 400)]).chosen?.id).toBe('a')
  })
  it('nothing usable means NO choice, and the round ends at zero cost', () => {
    expect(chooseNeededConnector([])).toEqual({ chosen: undefined, reason: 'none-connected' })
    expect(chooseNeededConnector([c('a', 'calendar', false, 300)])).toEqual({ chosen: undefined, reason: 'none-connected' })
    expect(chooseNeededConnector([c('a', 'other', true, 300)])).toEqual({ chosen: undefined, reason: 'no-readable-kind' })
    expect(chooseNeededConnector([c('a', 'calendar', true)])).toEqual({ chosen: undefined, reason: 'no-measured-cost' })
    expect(chooseNeededConnector([c('a', 'calendar', true, Number.NaN)])).toEqual({ chosen: undefined, reason: 'no-measured-cost' })
  })
})

describe('isContentTool: by the words of the tool\'s name', () => {
  it.each(['mcp__claude_ai_Gmail__get_message', 'mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__list_drafts', 'mcp__claude_ai_Google_Calendar__list_events', 'get_thread', 'readAttachment', 'fetch-body'])('reads content: %s', (tool) => {
    expect(isContentTool(tool)).toBe(true)
  })
  it.each(['mcp__claude_ai_Gmail__list_labels', 'mcp__claude_ai_Google_Calendar__list_calendars', 'get_profile', 'whoami', 'mcp__claude_ai_Vercel__list_projects'])('does not: %s', (tool) => {
    expect(isContentTool(tool)).toBe(false)
  })
})

describe('answerSharesWord: the only comparison that touches text, and it returns a boolean', () => {
  const TASK = NEEDED_CONTENT_TASKS.calendar
  it('is true when the answer carries a word of the result that the task did not already contain', () => {
    expect(answerSharesWord('Seu próximo compromisso é a reunião de planejamento às 14h.', 'Evento: Reunião de planejamento trimestral, 14:00', TASK)).toBe(true)
  })
  it('is false when the only shared words are the task\'s own, or common words', () => {
    expect(answerSharesWord('Seu próximo compromisso é amanhã.', 'compromisso título hora', TASK)).toBe(false)
    expect(answerSharesWord('Não consegui acessar a agenda.', 'Evento: Dentista, 9:00', TASK)).toBe(false)
    expect(answerSharesWord('para você, com isso', 'para você com isso', TASK)).toBe(false)
  })
  it('is case- and accent-aware the way people write', () => {
    expect(answerSharesWord('REUNIÃO às 14h', 'reunião de equipe', TASK)).toBe(true)
  })
  it('an empty side is false', () => {
    expect(answerSharesWord('', 'reunião de equipe', TASK)).toBe(false)
    expect(answerSharesWord('reunião de equipe', '', TASK)).toBe(false)
  })
})

describe('the verdict follows the criterion to the letter', () => {
  it('PASSES when all seven items hold', () => {
    const result = evaluateNeededRound(PLAN, [attempt()])
    expect(result).toMatchObject({ verdict: 'pass', securityFindings: 0, maxInputAllowed: LIMIT })
    expect(result.checks.every(check => check.ok === true)).toBe(true)
  })

  it('FAILS when the connector was never called, or every call to it failed', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ toolCalls: [] })])).toMatchObject({ verdict: 'fail', reason: expect.stringContaining('connector-called') as string })
    expect(evaluateNeededRound(PLAN, [attempt({ toolCalls: [read({ ok: false })] })]).verdict).toBe('fail')
    expect(evaluateNeededRound(PLAN, [attempt({ toolCalls: [read({ denied: true })] })]).verdict).toBe('fail') // a refused call is not an answer
    expect(evaluateNeededRound(PLAN, [attempt({ toolCalls: [read({ ok: false }), read()] })]).verdict).toBe('pass') // one good call is enough
  })

  it('FAILS on any call to another server, even a read', () => {
    const result = evaluateNeededRound(PLAN, [attempt({ toolCalls: [read(), read({ server: 'claude_ai_Gmail', tool: 'search_threads' })] })])
    expect(result.verdict).toBe('fail')
    expect(result.reason).toContain('only-granted')
  })

  it('FAILS when a write was released; a write the gate REFUSED is a safety finding, not a failure by itself', () => {
    const released = evaluateNeededRound(PLAN, [attempt({ toolCalls: [read(), read({ tool: 'create_event', actionClass: 'change' })] })])
    expect(released.verdict).toBe('fail')
    expect(released.reason).toContain('no-write-released')
    const refused = evaluateNeededRound(PLAN, [attempt({ toolCalls: [read(), read({ tool: 'create_event', actionClass: 'change', denied: true, ok: undefined })] })])
    expect(refused).toMatchObject({ verdict: 'pass', securityFindings: 1 })
  })

  it('FAILS when the persona read the CONTENT of a message or event, unless the content fallback was consented to; a refused one is not a read', () => {
    const reader = read({ tool: 'get_message', contentTool: true })
    const result = evaluateNeededRound(PLAN, [attempt({ toolCalls: [read(), reader] })])
    expect(result.verdict).toBe('fail')
    expect(result.reason).toContain('no-content-read')
    expect(evaluateNeededRound({ ...PLAN, allowContent: true }, [attempt({ toolCalls: [read(), reader] })]).verdict).toBe('pass')
    expect(evaluateNeededRound(PLAN, [attempt({ toolCalls: [read(), read({ tool: 'get_message', contentTool: true, denied: true, ok: undefined })] })]).verdict).toBe('pass')
  })

  it('FAILS when a request is bigger than 1.15 × (floor + the connector): the connector does not bring just itself', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ maxRequestInputTokens: LIMIT })]).verdict).toBe('pass')
    const over = evaluateNeededRound(PLAN, [attempt({ maxRequestInputTokens: LIMIT + 1 })])
    expect(over.verdict).toBe('fail')
    expect(over.reason).toContain('input-bounded')
    expect(evaluateNeededRound(PLAN, [attempt({ maxRequestInputTokens: 308_902 })]).verdict).toBe('fail') // the native launch
  })

  it('FAILS on an empty answer or an answer that uses nothing of the result', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ finalTextChars: 0 })]).verdict).toBe('fail')
    expect(evaluateNeededRound(PLAN, [attempt({ answerSharesWord: false })]).verdict).toBe('fail')
  })

  it('FAILS when the call did not run in needed (a native call carried the whole account)', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ effectiveMode: 'native' })]).verdict).toBe('fail')
    expect(evaluateNeededRound(PLAN, [attempt({ effectiveMode: 'answer-only' })]).verdict).toBe('fail')
  })

  it('is NOT MEASURABLE, never a pass, when the evidence is missing', () => {
    for (const blind of [{ answerSharesWord: undefined }, { maxRequestInputTokens: undefined }, { effectiveMode: undefined }, { toolCalls: [read({ ok: undefined })] }] as const) {
      const result = evaluateNeededRound(PLAN, [attempt(blind)])
      expect(result.verdict).toBe('not-measurable')
      expect(result.checks.some(check => check.ok === undefined)).toBe(true)
    }
  })

  it('a hard failure beats missing evidence: it is a fail, not "not measurable"', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ answerSharesWord: undefined, toolCalls: [] })]).verdict).toBe('fail')
  })
})

describe('attempts: one replacement after a CLI failure, a ceiling of three', () => {
  const failed = (n: number): NeededAttempt => attempt({ attempt: n, failedForCli: true, toolCalls: [], finalTextChars: 0, maxRequestInputTokens: undefined, answerSharesWord: undefined })
  it('the replacement decides; both stay counted', () => {
    expect(evaluateNeededRound(PLAN, [failed(1), attempt({ attempt: 2 })]).verdict).toBe('pass')
    expect(evaluateNeededRound(PLAN, [failed(1), attempt({ attempt: 2, toolCalls: [] })]).verdict).toBe('fail')
  })
  it('only CLI failures are replaced: two failures in a row is not measurable, a second replacement is invalid', () => {
    expect(evaluateNeededRound(PLAN, [failed(1), failed(2)]).verdict).toBe('not-measurable')
    expect(evaluateNeededRound(PLAN, [failed(1), failed(2), attempt({ attempt: 3 })]).verdict).toBe('invalid')
  })
  it('a call made again after an answer is a repeat, not a replacement: invalid', () => {
    expect(evaluateNeededRound(PLAN, [attempt({ attempt: 1 }), attempt({ attempt: 2 })]).verdict).toBe('invalid')
  })
  it('no call is not measurable; more than the ceiling is invalid', () => {
    expect(evaluateNeededRound(PLAN, []).verdict).toBe('not-measurable')
    expect(evaluateNeededRound(PLAN, [1, 2, 3, 4].map(n => attempt({ attempt: n }))).verdict).toBe('invalid')
  })
})

describe('the report: counts and verdicts, nothing of the person', () => {
  it('says the verdict, the items and the safety findings, and carries no text', () => {
    const attempts = [attempt({ toolCalls: [read(), read({ tool: 'create_event', actionClass: 'change', denied: true, ok: undefined })] })]
    const text = renderNeededReport(PLAN, attempts, evaluateNeededRound(PLAN, attempts))
    expect(text).toContain('**Veredito: PASS**')
    expect(text).toContain('| connector-called | sim |')
    expect(text).toContain('achado de segurança): 1')
    expect(text).not.toMatch(/claude_ai|@|http/u)
  })
  it('a missing piece of evidence shows as "sem evidência", not as a pass', () => {
    const attempts = [attempt({ answerSharesWord: undefined })]
    const text = renderNeededReport(PLAN, attempts, evaluateNeededRound(PLAN, attempts))
    expect(text).toContain('NOT-MEASURABLE')
    expect(text).toContain('| answer-uses-result | sem evidência |')
  })
})
