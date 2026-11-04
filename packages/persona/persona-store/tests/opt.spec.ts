import { expect, it } from 'vitest'
import { OptRepos } from '../src/opt/repos.ts'
import { withTempStore } from '../src/test-helpers.ts'

it('stores subject summary, batch cursor, and limit pool', async () => {
  await withTempStore(async (store) => {
    const opt = new OptRepos(store, () => '2026-11-04T03:00:00.000Z')
    const summary = opt.putSummary({
      topicId: 'channel:geral:t0',
      workspaceId: 'ws',
      projectId: 'pp',
      summary: 'Nunca enviar senha.',
      lastSeq: 6,
      messageCount: 6,
    })
    expect(opt.getSummary('channel:geral:t0')).toEqual(summary)
    opt.putCursor('librarian', 'pp', '2026-11-04T03:00:00.000Z', 3)
    expect(opt.getCursor('librarian', 'pp')?.lastSeq).toBe(3)
    opt.putPool('pp', 'claude', { provider: 'claude', accounts: [{ key: 'claude:a@x' }] })
    expect(opt.listPools('pp')).toHaveLength(1)
    expect(opt.listPools('pp', 'codex')).toHaveLength(0)
  })
})
