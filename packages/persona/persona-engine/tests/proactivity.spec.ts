import { expect, it } from 'vitest'
import { applyProactivity } from '../src/index.ts'

it('skips a disabled or off rule', () => {
  expect(applyProactivity({ id: 'r1', enabled: false, mode: 'auto' }, 'open')).toEqual({ kind: 'skip' })
  expect(applyProactivity({ id: 'r1', enabled: true, mode: 'off' }, 'open')).toEqual({ kind: 'skip' })
})

it('records an observation without running', () => {
  expect(applyProactivity({ id: 'r1', enabled: true, mode: 'observe' }, 'open ticket')).toEqual({
    kind: 'observe', action: { ruleId: 'r1', would: 'open ticket' },
  })
})

it('runs only when the rule is auto and enabled', () => {
  expect(applyProactivity({ id: 'r1', enabled: true, mode: 'auto' }, 'open ticket')).toEqual({
    kind: 'run', action: 'open ticket',
  })
})
