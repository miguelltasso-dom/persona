import { expect, it } from 'vitest'
import { compileContext } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('agente diferente: memória de outro agentId não entra no contexto', async () => {
  const compiled = await compileContext({
    scope,
    snapshot: {
      revision: 's1',
      requiredIds: [],
      records: [record('mine', { agentId: 'bento' }), record('theirs', { agentId: 'nina' })],
    },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
  })
  expect(compiled.manifest.records.map(item => item.id)).toEqual(['mine'])
})
