/**
 * The estimate and the host agree: for each line, `estimateAsk` says how many model calls and what kind (Ticket or
 * conversation) and the host then does exactly that (D-073/D-075). The estimate is only worth showing if this holds.
 */
import { estimateAsk } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

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
  h.createPersona({
    ...SCOPE, id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
}

function meter(h: PersonaHost): { deliveries: number } {
  const count = { deliveries: 0 }
  h.orchestration.runnerFactory = async () => {
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            count.deliveries += 1
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return count
}

const LINES: readonly string[] = [
  'Qual o horário do standup?',
  'O que você pode fazer por mim hoje?',
  'Monte o cardápio da semana com preços',
  'Pesquise 3 concorrentes e compare preços.',
  'Revise o último código e aponte riscos.',
  'valeu!',
  'ok',
  'valeu! agora monta o resumo da semana',
  'oi, tudo bem?',
]

it('the estimate gives the number of model calls and the lane the host really takes, line by line', async () => {
  const h = host()
  seed(h)
  const count = meter(h)
  let tickets = 0
  for (const [index, texto] of LINES.entries()) {
    const channel = `c${String(index)}`
    h.createChannel({ id: channel, ...SCOPE, name: channel, topic: '' })
    const estimate = estimateAsk({
      texto, motor: { cli: 'claude', connected: true },
      persona: { id: 'atlas', name: 'Atlas', title: 'Coordenação', personality: 'Calmo.', instructions: 'Despache.' },
    })
    const before = count.deliveries
    h.postMessage({ id: `l${String(index)}`, ...SCOPE, streamKind: 'channel', ownerId: channel, body: texto, actorId: 'ana', subjectId: `s${String(index)}`, occurredAt: CLOCK })
    await h.orchestration.flush('pp')
    const now = h.listTasks(SCOPE).length
    expect(count.deliveries - before, `${texto}: chamadas`).toBe(estimate.chamadas?.max)
    expect(now - tickets, `${texto}: Ticket`).toBe(estimate.tipo === 'trabalho' ? 1 : 0)
    tickets = now
  }
  expect(tickets).toBeGreaterThanOrEqual(3)
}, 120_000)

it('an "ok" that answers a question the persona left open: the estimate says one call, and the host makes it', async () => {
  const h = host()
  seed(h)
  const count = meter(h)
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.events.append({
    id: 'asks', ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'Posso começar o cardápio de sábado?', actorId: 'atlas', subjectId: 's', occurredAt: CLOCK,
  })
  const estimate = estimateAsk({ texto: 'ok', motor: { cli: 'claude', connected: true }, contexto: { pendenteDaPersona: true } })
  h.postMessage({ id: 'yes', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'ok', actorId: 'ana', subjectId: 's2', occurredAt: CLOCK })
  await h.orchestration.flush('pp')
  expect(estimate.chamadas).toEqual({ min: 1, max: 1 })
  expect(count.deliveries).toBe(1)
})
