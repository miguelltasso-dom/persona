/** Offline first-delivery permission regression; no CLI, login, or model calls. */
import type { Event, Runtime } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { firstDeliveryExecutionPrompt, firstDeliveryTask } from '@deepseek-ai/dsh-persona-engine'
import { expect, it } from 'vitest'
import { cliPolicyOf, createClaudeRunner, type RunEvent } from '../src/index.ts'

const BRIEF = 'Agência Ponto — estúdio de sites.\nCliente: Padaria Lua.\nObjetivo: divulgar o cardápio.'
const RESULT = '1. Agência Ponto.\n2. Estúdio de sites.\n3. Cliente: Padaria Lua.\n4. Objetivo: divulgar o cardápio.\n5. Prazo não informado.\nTarefa proposta: preparar texto do cardápio; dona: Coordenação; pronto quando revisado.'

async function replay(prompt: string): Promise<{ events: RunEvent[]; toolAttempts: string[]; inputs: string[] }> {
  const listeners = new Set<(event: Event) => void>()
  const toolAttempts: string[] = []
  const inputs: string[] = []
  const inner = scriptedRuntime({
    turn: (turn) => {
      inputs.push(turn.input)
      if (turn.input.includes(JSON.stringify(BRIEF)) && turn.input.includes('Não use ferramentas')) {
        turn.say(RESULT)
        return
      }
      // The historical DB lost the requested tool name. Read is a synthetic
      // representative of a vault lookup, not a recovered historical fact.
      toolAttempts.push('Read')
      const permission: Event = {
        kind: 'app_request', requestId: 'permission-1', type: 'can_use_tool',
        sessionId: 'scripted-first-delivery', agentPath: [], seq: 1, receivedAt: 0,
      }
      for (const listener of listeners) {
        listener(permission)
      }
    },
  })
  const runtime: Runtime = {
    ...inner,
    session: async (installation, options) => {
      const session = await inner.session(installation, options)
      return {
        ...session,
        events: (listener) => {
          listeners.add(listener)
          const off = session.events(listener)
          return () => { listeners.delete(listener); off() }
        },
      }
    },
  }
  const policy = cliPolicyOf('claude', {}, 'deny')
  expect(policy.permissionMode).toBe('deny')
  expect(policy.toolLevel).toBe('none')
  expect(policy.launchArgs).toEqual(expect.arrayContaining(['--permission-mode', 'dontAsk']))
  const runner = createClaudeRunner({ runtime, policy })
  const handle = await runner.start({
    ticketId: 'first-delivery', assignmentId: 'assignment', personaId: 'guia',
    cwd: '.', model: 'haiku', permissionMode: 'deny', prompt,
  })
  try {
    const events: RunEvent[] = []
    for await (const event of runner.stream(handle)) {
      events.push(event)
      if (event.type === 'ended') break
    }
    return { events, toolAttempts, inputs }
  } finally {
    await runner.cancel(handle)
    await runner.dispose?.()
  }
}

it('legacy clipped vault request ends blocked when the scripted CLI asks for a tool', async () => {
  const before = await replay('Resuma o Cofre de Agência Ponto em 5 pontos e proponha a primeira tarefa da semana.')
  expect(before.toolAttempts).toEqual(['Read'])
  expect(before.events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
  expect(before.events.some(event => event.type === 'delta')).toBe(false)
})

it('complete answer-only assignment delivers under the same deny policy without tool requests', async () => {
  const task = firstDeliveryTask({ companyBrief: BRIEF })
  expect(task.executionMode).toBe('answer-only')
  expect(task.permissionMode).toBe('deny')
  const after = await replay(task.assignment)
  expect(after.toolAttempts).toEqual([])
  expect(after.events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
  expect(after.events.filter(event => event.type === 'delta').map(event => event.text).join('')).toBe(RESULT)
})

it('delivers persona context and first-delivery assignment in one OAR turn without prompt injection', async () => {
  const task = firstDeliveryTask({ companyBrief: BRIEF, executorName: 'Guia' })
  const prompt = firstDeliveryExecutionPrompt({
    fields: {
      identity: { name: 'Guia', title: 'Coordenação' },
      personality: 'Calma.', instructions: 'Você é Guia. Trabalhe com clareza e objetividade.', functionLabel: 'Coordenação',
      vault: '', capabilities: 'Primeira entrega em texto. Sem ferramentas, shell ou arquivos. Execute a atribuição diretamente.',
    },
    assignment: task.assignment,
  })
  const run = await replay(prompt)
  expect(run.inputs).toHaveLength(1)
  expect(run.inputs[0]).toContain('Você é Guia. Trabalhe com clareza e objetividade.')
  expect(run.inputs[0]).toContain(task.assignment)
  expect(run.inputs[0]).toContain('Você executa a Tarefa autorizada.')
  expect(run.toolAttempts).toEqual([])
  expect(run.events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
  expect(run.events.filter(event => event.type === 'delta').map(event => event.text).join('')).toBe(RESULT)
})
