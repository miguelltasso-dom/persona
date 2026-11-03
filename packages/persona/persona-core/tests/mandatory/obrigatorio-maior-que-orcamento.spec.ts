import { expect, it } from 'vitest'
import { compileContext } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('obrigatório > orçamento: REQUIRED_CONTEXT_OVERFLOW sem omitir o fato', async () => {
  await expect(compileContext({
    scope,
    snapshot: {
      revision: 's1',
      requiredIds: ['rule'],
      records: [record('rule', { kind: 'decision', body: 'Long rule '.repeat(80) })],
    },
    budgetTokens: 40,
    countTokens: text => text.length,
    authorize: async () => true,
  })).rejects.toMatchObject({ code: 'REQUIRED_CONTEXT_OVERFLOW' })
})
