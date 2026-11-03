import { expect, it } from 'vitest'
import type { StartTurnInput } from '../src/contract.ts'
import { createOarSessionRunner } from '../src/oar/session.ts'

function capturingTurn(sink: { prompt: string }) {
  return {
    capabilities: () => ({ mcpTools: 'unavailable' as const, resume: false }),
    start: async (input: StartTurnInput) => {
      sink.prompt = input.prompt
      return {
        runId: 'r1',
        sessionId: 's1',
        ticketId: input.ticketId,
        assignmentId: input.assignmentId,
        personaId: input.personaId,
        cwd: input.cwd,
        model: input.model,
      }
    },
    stream: async function* () {
      yield { type: 'ended' as const, at: 't', report: { state: 'ready' as const, summary: 'ok' } }
    },
    cancel: async () => undefined,
  }
}

it('talk purpose delivers the prompt as-is without Executora wrap', async () => {
  const sink = { prompt: '' }
  const runner = createOarSessionRunner({
    turn: capturingTurn(sink) as never,
    personaId: 'onb-1',
    personaName: 'Guia',
    personaTitle: 'Coordenação',
    purpose: 'talk',
    model: 'haiku',
    permissionMode: 'deny',
  })
  await runner.ensureSession('talk-1', '.', 'Guia', 'coordinator')
  await runner.deliver('talk-1', 'talk:1', 'Você é Guia, Coordenação.', 'queue')
  expect(sink.prompt).toBe('Você é Guia, Coordenação.')
  expect(sink.prompt).not.toMatch(/Executora|onb-1|Tarefa autorizada/)
})

it('task worker still prefixes owner norms using display name', async () => {
  const sink = { prompt: '' }
  const runner = createOarSessionRunner({
    turn: capturingTurn(sink) as never,
    personaId: 'onb-1',
    personaName: 'Guia',
    personaTitle: 'Engenharia',
    purpose: 'task',
    model: 'haiku',
    permissionMode: 'allow-once',
  })
  await runner.ensureSession('worker-t1', '.', 'Tarefa', 'worker')
  await runner.deliver('worker-t1', 'launch:1', 'Escreva o README', 'queue')
  expect(sink.prompt).toContain('Você é Guia, Engenharia')
  expect(sink.prompt).toContain('Você executa a Tarefa autorizada')
  expect(sink.prompt).toContain('Escreva o README')
  expect(sink.prompt).not.toContain('onb-1')
  expect(sink.prompt).not.toMatch(/\bExecutora\b/)
})
