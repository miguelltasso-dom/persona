import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, it, vi } from 'vitest'
import { DeliveryCallBudget, firstDeliveryProof, type FirstDeliveryProofInput } from './first-delivery-proof.ts'
import type { MessageView } from '../src/types.ts'

it('counts inject and queue deliveries, excludes idempotent duplicates, and refuses a fourth call', async () => {
  const runner = createFakeRunner()
  const deliver = vi.spyOn(runner, 'deliver')
  const budget = new DeliveryCallBudget(async () => runner, 3)
  const wrapped = await budget.resolve()
  expect(wrapped).toBe(runner)
  await wrapped.ensureSession('s', '.', 'Smoke', 'worker')
  await wrapped.deliver('s', 'prompt', 'Rules', 'inject')
  await wrapped.deliver('s', 'task', 'Request', 'queue')
  await wrapped.deliver('s', 'task', 'Request', 'queue')
  await wrapped.deliver('s', 'answer', 'Answer', 'steer')
  expect(budget.calls.map(call => call.requestId)).toEqual(['prompt', 'task', 'answer'])
  await expect(wrapped.deliver('s', 'fourth', 'More', 'queue')).rejects.toThrow('first-delivery-call-budget-exhausted')
  expect(deliver).toHaveBeenCalledTimes(4)
  expect(budget.calls).toHaveLength(3)
})

it('shares the cap across personas and charges failed attempts before forwarding', async () => {
  const runner = createFakeRunner()
  const deliver = vi.spyOn(runner, 'deliver').mockRejectedValue(new Error('provider failed'))
  const budget = new DeliveryCallBudget(async () => runner, 1)
  const first = await budget.resolve()
  const second = await budget.resolve()
  await first.ensureSession('a', '.', 'Smoke', 'worker')
  await expect(first.deliver('a', 'one', 'Task', 'queue')).rejects.toThrow('provider failed')
  await expect(second.deliver('b', 'two', 'Task', 'queue')).rejects.toThrow('first-delivery-call-budget-exhausted')
  expect(deliver).toHaveBeenCalledTimes(1)
  await budget.cancelAll()
})

function message(id: string, body: string, source: 'runner' | 'host'): MessageView {
  return {
    id, body, source, streamId: 'channel:geral', seq: 1, actorId: 'worker', subjectId: 'first-delivery',
    occurredAt: '2026-11-04T12:00:00.000Z', type: source === 'runner' ? 'runner' : 'message',
    attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '',
  }
}

function delivered(): FirstDeliveryProofInput {
  return {
    elapsedMs: 5_000, deadlineMs: 120_000,
    milestone: {
      status: 'ready', eventId: 'first-delivery', ticketId: 't', title: 'Brief',
      personaId: 'worker', personaName: 'Guia', feedEventId: 'first-delivery-milestone',
    },
    tasks: [{ id: 't', projectId: 'p', title: 'Brief', stage: 'done', stageAction: '' }],
    events: [message('coord-t-done', 'Entregue.', 'runner'), message('first-delivery-milestone', 'Marco.', 'host')],
  }
}

it('accepts the actual worker reply even when it is short; artifact has no false budget or length failure', () => {
  const proof = firstDeliveryProof(delivered())
  expect(JSON.parse(JSON.stringify(proof))).toEqual({
    broke: [], runnerReply: 'Entregue.', runnerSource: 'runner', runnerId: 'coord-t-done',
  })
})

it('rejects a failed execution, unfinished board card, missing milestone, and unrelated runner replies', () => {
  const input = delivered()
  const proof = firstDeliveryProof({
    ...input, milestone: { ...input.milestone, status: 'failed', feedEventId: '' },
    tasks: input.tasks.map(task => ({ ...task, stage: 'blocked' })),
    events: [message('unrelated', 'Another reply', 'runner')],
  })
  expect(proof.broke).toEqual([
    'no-runner-delivery-on-geral', 'first-delivery-failed', 'ticket-not-done', 'milestone-not-unique',
  ])
})

it('reports the elapsed deadline independently of a valid delivery', () => {
  expect(firstDeliveryProof({ ...delivered(), elapsedMs: 120_001 }).broke)
    .toEqual(['ux-phase-a-exceeded-120001ms'])
})
