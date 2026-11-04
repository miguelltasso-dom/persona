/** W3 (Tally): the short worker report is plumbed through the OAR session but OFF unless a host asks for it. */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { expect, it } from 'vitest'
import { WORKER_LEAN_REPORT_RULE } from '@deepseek-ai/dsh-persona-engine/src/prompts/templates.ts'
import {
  cliPolicyOf, createClaudeRunner, createOarSessionRunner, executorPrompt, prefixOwnerNorms,
} from '../src/index.ts'

async function workerInput(leanReport?: boolean): Promise<string> {
  const requests: string[] = []
  const runtime = scriptedRuntime({ turn: (turn) => {
    requests.push(turn.input)
    turn.say('feito')
  } })
  const turn = createClaudeRunner({ runtime, policy: cliPolicyOf('claude', {}, 'allow-once') })
  const runner = createOarSessionRunner({
    turn, personaId: 'nina', personaName: 'Nina', personaTitle: 'Padeira-chefe', purpose: 'task',
    model: 'default', permissionMode: 'allow-once', ...(leanReport === undefined ? {} : { leanReport }),
  })
  try {
    await runner.ensureSession('worker-t1', '.', 'Montar cardápio', 'worker')
    await runner.deliver('worker-t1', 'launch:a1', 'Monte o cardápio de sábado.', 'queue')
    return requests[0] ?? ''
  } finally {
    await turn.dispose?.()
  }
}

it('the worker prompt has no short-report rule by default', async () => {
  const input = await workerInput()
  expect(input).toContain('Normas de dono')
  expect(input).not.toContain(WORKER_LEAN_REPORT_RULE)
  expect(await workerInput(false)).not.toContain(WORKER_LEAN_REPORT_RULE)
})

it('a host that opts in gets the rule before the assignment, once', async () => {
  const input = await workerInput(true)
  expect(input).toContain(WORKER_LEAN_REPORT_RULE)
  expect(input.indexOf(WORKER_LEAN_REPORT_RULE)).toBeLessThan(input.indexOf('Monte o cardápio de sábado.'))
  expect(input.split(WORKER_LEAN_REPORT_RULE)).toHaveLength(2)
})

it('executorPrompt and prefixOwnerNorms keep today\'s text unless asked', () => {
  const persona = { id: 'nina', name: 'Nina', title: 'Padeira-chefe' }
  expect(executorPrompt(persona)).toBe(executorPrompt(persona, {}))
  expect(executorPrompt(persona)).not.toContain(WORKER_LEAN_REPORT_RULE)
  expect(executorPrompt(persona, { leanReport: true })).toContain(WORKER_LEAN_REPORT_RULE)
  expect(prefixOwnerNorms('X', persona, { leanReport: true })).toContain(WORKER_LEAN_REPORT_RULE)
  expect(prefixOwnerNorms('X', persona).endsWith('\n\nX')).toBe(true)
})
