/**
 * The owner's register (item 4): said in plain words in the conversation, kept per project, read without a model call.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { styleRequestOf } from '../src/speech-style.ts'
import { bindHostFile, it } from './host-harness.ts'

describe('styleRequestOf', () => {
  it('reads the plain ways an owner asks for each register', () => {
    for (const text of ['fala mais simples', 'Pode falar mais simples, por favor?', 'sem jargão, tá?', 'explica em português simples', 'fala como gente', 'em linguagem simples']) {
      expect(styleRequestOf(text), text).toBe('simple')
    }
    for (const text of ['pode ser técnico', 'Pode ser mais técnico?', 'quero os detalhes técnicos', 'fale técnico comigo', 'modo técnico', 'pode usar termos técnicos']) {
      expect(styleRequestOf(text), text).toBe('technical')
    }
  })

  it('leaves a work request, a contradiction and a long message alone', () => {
    expect(styleRequestOf('Faça um relatório técnico das vendas')).toBeUndefined()
    expect(styleRequestOf('quero um texto simples para o cartaz')).toBeUndefined()
    expect(styleRequestOf('fala mais simples ou pode ser técnico?')).toBeUndefined()
    expect(styleRequestOf('Qual o horário de abertura?')).toBeUndefined()
    expect(styleRequestOf(`pode ser técnico ${'x '.repeat(100)}`)).toBeUndefined()
    expect(styleRequestOf('')).toBeUndefined()
  })
})

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
}

function say(h: PersonaHost, id: string, body: string): void {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: CLOCK })
}

async function settle(h: PersonaHost): Promise<void> {
  await h.orchestration.flush('pp')
  await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
  await h.orchestration.flush('pp')
}

function replyTo(h: PersonaHost, id: string): string | undefined {
  const events = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
  return events.find(item => item.id === `coord-${id}-reply`)?.body
}

it('the register is simple until the owner says otherwise, and the choice is kept for the project', async () => {
  const h = host()
  seed(h)
  expect(h.orchestration.speechStyleOf('pp')).toBe('simple')
  h.orchestration.liveText = 'Claro, falo o detalhe técnico: o horário está em C:\\Users\\ana\\horario.json.'
  say(h, 's1', 'pode ser técnico')
  await settle(h)
  expect(h.orchestration.speechStyleOf('pp')).toBe('technical')
  // the very answer to that line already speaks the new way
  expect(replyTo(h, 's1')).not.toContain('<details')
  expect(replyTo(h, 's1')).toContain('C:\\Users\\ana\\horario.json')

  h.orchestration.liveText = 'Combinado. Abrimos às 7h. O arquivo é C:\\Users\\ana\\horario.json.'
  say(h, 's2', 'Qual o horário de abertura?')
  await settle(h)
  expect(replyTo(h, 's2')).toContain('C:\\Users\\ana\\horario.json') // still technical on the next question

  h.orchestration.liveText = 'Certo, mais simples agora.'
  say(h, 's3', 'fala mais simples')
  await settle(h)
  expect(h.orchestration.speechStyleOf('pp')).toBe('simple')

  h.orchestration.liveText = 'Abrimos às 7h. O arquivo é C:\\Users\\ana\\horario.json.'
  say(h, 's4', 'E o horário de sábado?')
  await settle(h)
  expect(replyTo(h, 's4')).toMatch(/^Abrimos às 7h\.\n\n<details>/u)
})
