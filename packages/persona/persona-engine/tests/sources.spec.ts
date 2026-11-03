import { expect, it } from 'vitest'
import { internalSourceScope } from '../src/index.ts'

it('listens to channel, dm, persona and routine on matching source and id', () => {
  expect(internalSourceScope('channel').scope({ source: 'channel', meta: { channelId: 'geral' } }))
    .toEqual({ listened: true, observed: true, row: 'geral' })
  expect(internalSourceScope('dm').scope({ source: 'dm', meta: { dmId: 'dm1' } }))
    .toEqual({ listened: true, observed: false, row: 'dm1' })
  expect(internalSourceScope('persona').scope({ source: 'persona', meta: { personaId: 'bento' } }))
    .toEqual({ listened: true, observed: false, row: 'bento' })
  expect(internalSourceScope('routine').scope({ source: 'routine', meta: { routineId: 'standup' } }))
    .toEqual({ listened: true, observed: false, row: 'standup' })
})

it('refuses a mismatched source or a missing scope id', () => {
  expect(internalSourceScope('routine').scope({ source: 'channel', meta: { routineId: 'standup' } }))
    .toEqual({ listened: false, reason: 'sourceMismatch' })
  expect(internalSourceScope('persona').scope({ source: 'persona', meta: {} }))
    .toEqual({ listened: false, reason: 'missingScope' })
})
