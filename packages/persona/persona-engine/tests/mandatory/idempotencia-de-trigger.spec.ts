import { expect, it } from 'vitest'
import { harness, trigger } from './harness.ts'

it('idempotência de Trigger: o mesmo id é stored uma vez e depois duplicate', () => {
  const h = harness()
  expect(h.engine.receive(trigger('1'))).toBe('stored')
  expect(h.engine.receive(trigger('1'))).toBe('duplicate')
  expect(h.repo.threads.get('chat:t1')?.pending).toEqual(['1'])
})
