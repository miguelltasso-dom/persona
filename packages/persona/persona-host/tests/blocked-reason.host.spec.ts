/**
 * Keel 12/11 (follow-up of the Muse ticket): the HOST sends why a card in Bloqueado stopped, so the card says "Parado" + one plain line ("Falta o login do Mercado Pago") instead of only "Parado".
 * Additive: `TaskView.blockedReason`, derived from what the host ALREADY keeps when a ticket stops (the worker's blocked report, or the code of a failed run). Plain words only: no id, no path, no address,
 * no stack, no marker; a technical text is dropped (the card then says only "Parado"). RED first.
 */
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it } from 'vitest'
import { blockedReasonOf, plainReason } from '../src/blocked-reason.ts'
import { SCOPE, it as hostIt, openJourney, seedJourney } from './journeys/journey-host.ts'

const AT = '2026-11-12T10:00:00.000Z'

function ticket(report: { state: 'blocked' | 'failed' | 'waiting' | 'ready'; summary: string } | undefined, extra: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1', title: 'Pagar o fornecedor', decisionId: 'd', mandate: { goal: 'x', constraints: [], doneWhen: [] }, channels: [],
    assignments: [{ id: 't1-a1', state: 'ended', createdAt: AT, startedAt: AT, endedAt: AT, ...(report === undefined ? {} : { report: { ...report, at: AT } }) }],
    inputs: [], undelivered: [], createdAt: AT, updatedAt: AT, origin: { triggerId: 'u1', triggerIds: ['u1'] },
    execution: { name: 'Nina', directory: '.', assignment: 'Pague' },
    ...extra,
  } as unknown as Ticket
}

const none = { get: () => undefined }

describe('plainReason: one plain line, or nothing', () => {
  it('keeps a plain sentence, trims it and takes the first line only', () => {
    expect(plainReason('Falta o login do Mercado Pago')).toBe('Falta o login do Mercado Pago')
    expect(plainReason('  Falta o login do Mercado Pago.  \nDetalhes: tentei três vezes')).toBe('Falta o login do Mercado Pago.')
  })

  it('clips a long line at a word, never mid-word, to 120 characters', () => {
    const long = `Preciso que você me diga ${'qual é a conta do fornecedor '.repeat(8)}`
    const out = plainReason(long) ?? ''
    expect(out.length).toBeLessThanOrEqual(121)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/\s…$/u)
  })

  it.each([
    'Erro ao ler C:\\Users\\ana\\pedido.xlsx',
    'Falha em /home/ana/projeto/arquivo.txt',
    'Abri https://portal.exemplo.com.br/login e travou',
    'Request 3f2a9c1e-77aa-4c1d-9b0e-5a5a5a5a5a5a falhou',
    'Error: ECONNRESET at Socket.onread (node:net:1:1)',
    '{"code":"E42","message":"x"}',
    'Veja [[run-error:{"code":"not_logged_in"}]]',
    'Rode `pnpm install` primeiro',
    'ticket t-8f2a1c9d3e4b5a6f falhou',
    '   ',
    '',
  ])('a technical or empty text is dropped: %j', (text) => {
    expect(plainReason(text)).toBeUndefined()
  })
})

describe('blockedReasonOf: only for a card that stopped, and only what the host already keeps', () => {
  it('a blocked report says why, in the worker\'s plain words', () => {
    expect(blockedReasonOf(ticket({ state: 'blocked', summary: 'Falta o login do Mercado Pago' }), 'blocked', none)).toBe('Falta o login do Mercado Pago')
  })

  it('a failed run says it in words from its code (the host never sends the code or the error text)', () => {
    const events = { get: (id: string) => (id === 'coord-t1-done' ? { body: 'Não deu. [[run-error:{"code":"not_logged_in","provider":"claude"}]]' } : undefined) }
    const reason = blockedReasonOf(ticket({ state: 'failed', summary: 'engine exited 1' }), 'failed', events)
    expect(reason).toBe('O Claude não está conectado neste computador')
    expect(reason).not.toMatch(/not_logged_in|run-error|provider|\bclaude\b/u) // the human name "Claude" is fine; the code, the marker and the raw engine id are not
  })

  it('a failed run with no code and a technical summary says nothing (the card says only "Parado")', () => {
    expect(blockedReasonOf(ticket({ state: 'failed', summary: 'Error: spawn ENOENT at C:\\bin\\claude.exe' }), 'failed', none)).toBeUndefined()
  })

  it('a card that waits for the OWNER (answer, delivery, review, retry) carries no reason: the amber chip says it', () => {
    for (const action of ['answer', 'delivery', 'review', 'retry', 'waiting', '']) {
      expect(blockedReasonOf(ticket({ state: 'blocked', summary: 'Falta o login do Mercado Pago' }), action, none), action).toBeUndefined()
    }
  })

  it('no report, or a report of another state, says nothing', () => {
    expect(blockedReasonOf(ticket(undefined), 'blocked', none)).toBeUndefined()
    expect(blockedReasonOf(ticket({ state: 'ready', summary: 'Pronto' }), 'blocked', none)).toBeUndefined()
  })
})

hostIt('listTasks sends blockedReason for a stopped card, only when there is one, and never for a private DM Task', () => {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket({ state: 'blocked', summary: 'Falta o login do Mercado Pago' }))
  rt.repo.tickets.save(ticket({ state: 'blocked', summary: 'Error: ECONNRESET at C:\\x\\y.js' }, { id: 't2', title: 'Outro', assignments: [{ id: 't2-a1', state: 'ended', createdAt: AT, startedAt: AT, endedAt: AT, report: { state: 'blocked', summary: 'Error: ECONNRESET at C:\\x\\y.js', at: AT } }] as never }))
  const rows = h.listTasks(SCOPE)
  const first = rows.find(row => row.id === 't1')
  expect(first).toMatchObject({ stage: 'blocked', blockedReason: 'Falta o login do Mercado Pago' })
  const second = rows.find(row => row.id === 't2')
  expect(second?.stage).toBe('blocked')
  expect(second).not.toHaveProperty('blockedReason') // a technical text is dropped: the field is absent, not empty
})

hostIt('a card that is not stopped never carries a reason, even if its last report was blocked long ago', () => {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket({ state: 'blocked', summary: 'Falta o login do Mercado Pago' }, { ended: { at: AT, outcome: 'completed' } } as never))
  expect(h.listTasks(SCOPE).find(row => row.id === 't1')).not.toHaveProperty('blockedReason')
})
