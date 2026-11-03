import { expect, it } from 'vitest'
import { compileContext, purgeSource } from '../../src/index.ts'
import type { VaultRecord } from '../../src/index.ts'
import { record, scope } from './helpers.ts'

it('exclusão de fonte e caches: purgeSource revoga derivados; compileContext os ignora', async () => {
  const vault: VaultRecord = {
    id: 'v1',
    workspaceId: 'ws',
    kind: 'memory',
    body: 'from source',
    status: 'active',
    revision: 1,
    visibility: { kind: 'project', projectId: 'launch' },
    sourceIds: ['src-1'],
    authorId: 'miguel',
    createdAt: '2026-11-03T12:00:00.000Z',
  }
  const purged = purgeSource('src-1', [vault], [{
    id: 'm1', layer: 'episodic', body: 'cite src-1', score: 1, uses: 0, archived: false,
  }])
  expect(purged.records[0]?.status).toBe('revoked')
  expect(purged.memories[0]?.archived).toBe(true)
  const compiled = await compileContext({
    scope,
    snapshot: { revision: 's1', requiredIds: [], records: [record('v1', { status: 'revoked' }), record('ok')] },
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
  })
  expect(compiled.manifest.records.map(item => item.id)).toEqual(['ok'])
})
