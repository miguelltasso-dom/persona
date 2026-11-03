import { expect, it } from 'vitest'
import { compileContext } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('alteração simultânea de tarefa: compileContext congela o snapshot; mutação posterior não entra', async () => {
  const records = [record('a', { body: 'one' })]
  const pending = compileContext({
    scope,
    snapshot: { revision: 's1', requiredIds: [], records },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => {
      records[0]!.body = 'two'
      return true
    },
  })
  const compiled = await pending
  expect(compiled.text).toContain('one')
  expect(compiled.text).not.toContain('two')
})
