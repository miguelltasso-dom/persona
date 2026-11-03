import { expect, it } from 'vitest'
import { harness, trigger } from './harness.ts'

it('1 Eval por Thread: triggers que chegam durante a Eval ficam no buffer', () => {
  const h = harness()
  h.engine.receive(trigger('1'))
  h.pump()
  h.engine.receive(trigger('2'))
  h.engine.receive(trigger('3'))
  h.pump()
  expect(h.requests).toHaveLength(1)
  expect(h.repo.threads.get('chat:t1')?.pending).toEqual(['2', '3'])
  expect(h.repo.threads.get('chat:t1')?.evaluating).toBeDefined()
})
