/**
 * Colheita item 3, "sem pergunta boba" through the `persona_ask` TOOL (and the structured card): a question whose answer the host already has (the WhatsApp the request
 * carried, a file the owner attached, the company's records) is sent back to her ONCE with "Já está na conversa: …"; nothing is opened for the person. A real question
 * (a preference, a datum nobody gave) goes through exactly as before, and a repeat after being told goes through too (she may know better).
 */
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect } from 'vitest'
import { createAskTool } from '../src/persona-ask-tool.ts'
import type { KnownFacts } from '../src/turn-close.ts'
import { it } from './host-harness.ts'

const TICKET = { id: 't1', execution: { name: 'Nina' } } as unknown as Ticket
const KNOWN: KnownFacts = {
  ownerTexts: ['Oi! Sou a Rita da Padaria Lua, meu WhatsApp é (11) 98888-7777. Quero o cardápio novo.'],
  companyTexts: ['Contato: oi@padarialua.com.br'],
  files: ['inputs/logo.png', 'inputs/cardapio.pdf'],
}

function rig(known: KnownFacts | null = KNOWN) {
  const opened: unknown[] = []
  const tool = createAskTool({
    product: { getPersona: () => ({ id: 'nina', name: 'Nina', projectId: 'pp' }) } as never,
    screens: { get: () => undefined, put: () => undefined } as never,
    ticketOf: () => TICKET,
    asks: {
      ask: (input) => { opened.push(input.questions); return { ok: true, askId: 'a1' } as never },
      assume: () => ({ ok: true, message: 'ok' }),
    },
    ...(known === null ? {} : { known: () => known }),
  })
  const call = (question: string, run = 'a1', questions?: unknown) => tool({ run: { personaId: 'nina', ticketId: 't1', assignmentId: run }, question, ...(questions === undefined ? {} : { questions }) })
  return { call, opened }
}

describe('a question the host can answer does not reach the person', () => {
  it('the WhatsApp the request already carried: refused with "Já está na conversa: …", nothing opened', () => {
    const { call, opened } = rig()
    const said = call('Qual é o WhatsApp da padaria?')
    expect(said).toMatch(/^Já está na conversa: \(11\) 98888-7777\./u)
    expect(opened).toEqual([])
  })

  it('the file the owner attached and the company record answer too (where each one is said)', () => {
    expect(rig().call('Pode me enviar o logo da padaria?')).toMatch(/^Já está no rascunho: inputs\/logo\.png\./u)
    expect(rig().call('Qual é o e-mail de contato?')).toMatch(/^Já está no cadastro da empresa: oi@padarialua\.com\.br\./u)
  })

  it('the structured card is judged the same way (each question of the list)', () => {
    const { call, opened } = rig()
    const said = call('', 'a1', [{ question: 'Qual é o seu WhatsApp?', options: [{ id: 'a', label: 'Este' }] }])
    expect(said).toMatch(/Já está na conversa/u)
    expect(opened).toEqual([])
  })

  it('it is said ONCE: asked again (a new call or the same one retried), the question goes through to the person', () => {
    const { call, opened } = rig()
    expect(call('Qual é o WhatsApp da padaria?')).toMatch(/Já está/u)
    expect(call('Qual é o WhatsApp da padaria?')).toMatch(/Pergunta enviada à pessoa/u)
    expect(opened).toHaveLength(1)
  })

  it('a real question is untouched: a preference, a datum nobody gave, a host with no facts', () => {
    const { call, opened } = rig()
    expect(call('Qual logo você prefere, o escuro ou o claro?', 'a1')).toMatch(/Pergunta enviada/u)
    expect(call('Qual é o CNPJ da padaria?', 'a2')).toMatch(/Pergunta enviada/u)
    expect(opened).toHaveLength(2)
    expect(rig(null).call('Qual é o WhatsApp da padaria?')).toMatch(/Pergunta enviada/u)
  })
})
