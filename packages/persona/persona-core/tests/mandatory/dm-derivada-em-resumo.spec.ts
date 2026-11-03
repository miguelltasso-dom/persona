import { expect, it } from 'vitest'
import { compileContext } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('DM derivada em resumo: summary que cita a DM some com ela', async () => {
  const compiled = await compileContext({
    scope: { ...scope, audienceId: 'channel-launch' },
    snapshot: {
      revision: 's1',
      requiredIds: [],
      records: [
        record('dm', { body: 'segredo da dm' }),
        record('summary', { body: 'resumo', sourceIds: ['dm'] }),
        record('ok'),
      ],
    },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async item => item.id !== 'dm',
  })
  expect(compiled.manifest.records.map(item => item.id)).toEqual(['ok'])
})
