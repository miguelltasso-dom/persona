import { expect, it } from 'vitest'
import { compileContext, contradicts } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('decisões contraditórias: mesmo factKey com corpos diferentes bloqueia; aging marca negação', async () => {
  expect(contradicts('ship on friday', 'do not ship on friday')).toBe(true)
  await expect(compileContext({
    scope,
    snapshot: {
      revision: 's1',
      requiredIds: ['a', 'b'],
      records: [
        record('a', { kind: 'decision', factKey: 'ship', body: 'ship friday' }),
        record('b', { kind: 'decision', factKey: 'ship', body: 'do not ship' }),
      ],
    },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
  })).rejects.toMatchObject({ code: 'CONTEXT_CONFLICT' })
})
