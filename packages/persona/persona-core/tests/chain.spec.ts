import { expect, it } from 'vitest'
import { inlineRef, recallChain, spillId, spillPointer } from '../src/index.ts'
import type { ContextScope, RecallNode } from '../src/index.ts'

const scope: ContextScope = {
  workspaceId: 'ws',
  projectId: 'launch',
  agentId: 'coord',
  actorId: 'miguel',
  audienceId: 'geral',
  policyRevision: '1',
}

const node = (id: string, neighbors: string[], body = `${id}-body`): RecallNode => ({
  id,
  summary: `${id} summary`,
  body,
  neighborIds: neighbors,
})

it('inlines id, summary and neighbors and spills the body behind a pointer', () => {
  const item = node('t1', ['m1', 'd1'], 'long body')
  expect(inlineRef(item)).toEqual({ id: 't1', summary: 't1 summary', neighbors: ['m1', 'd1'] })
  expect(spillPointer('t1')).toBe('persona-spill:t1')
  expect(spillId(spillPointer('t1'))).toBe('t1')
  expect(spillId('plain')).toBeUndefined()
})

it('walks the neighbor chain and re-checks authorize on every hop', async () => {
  const nodes = new Map([
    ['a', node('a', ['b'])],
    ['b', node('b', ['c'])],
    ['c', node('c', [])],
  ])
  const hops = await recallChain({
    startId: 'a',
    scope,
    load: id => nodes.get(id),
    authorize: async item => item.id !== 'c',
    maxHops: 8,
  })
  expect(hops.map(item => item.id)).toEqual(['a', 'b'])
})

it('cancels the chain when the start hop is denied or missing', async () => {
  await expect(recallChain({
    startId: 'gone',
    scope,
    load: () => undefined,
    authorize: async () => true,
    maxHops: 4,
  })).rejects.toMatchObject({ code: 'INVALID_RECALL' })
  await expect(recallChain({
    startId: 'a',
    scope,
    load: () => node('a', []),
    authorize: async () => false,
    maxHops: 4,
  })).rejects.toMatchObject({ code: 'REQUIRED_CONTEXT_UNAVAILABLE' })
})
