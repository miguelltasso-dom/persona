import { expect, it } from 'vitest'
import { can, compileContext } from '../../src/index.ts'
import { member, record, scope } from './helpers.ts'

it('leitura entre projetos: can() e compileContext recusam o outro projectId', async () => {
  expect(can(member, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'ops' })).toBe(false)
  expect(can(member, 'read', { type: 'ticket', workspaceId: 'ws', projectId: 'launch' })).toBe(true)
  const compiled = await compileContext({
    scope,
    snapshot: { revision: 's1', requiredIds: [], records: [record('ok'), record('x', { projectId: 'ops' })] },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
  })
  expect(compiled.manifest.records.map(item => item.id)).toEqual(['ok'])
})
