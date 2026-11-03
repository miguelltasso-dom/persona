import { expect, it } from 'vitest'
import { recall } from '../../src/index.ts'
import { scope } from './helpers.ts'

it('mudança de modelo preserva assunto: subjectId não inclui o modelo', async () => {
  const events = [{
    id: 'e1', workspaceId: 'ws', projectId: 'launch', sequence: 1, subjectId: 'chat:t1',
    occurredAt: '2026-11-03T12:00:00.000Z', type: 'message', body: 'oi',
  }]
  const first = await recall({
    scope: { ...scope, agentId: 'bento' },
    events, subjectId: 'chat:t1', authorize: async () => true,
  })
  const second = await recall({
    scope: { ...scope, agentId: 'other-model' },
    events, subjectId: 'chat:t1', authorize: async () => true,
  })
  expect(first.events.map(item => item.id)).toEqual(['e1'])
  expect(second.events.map(item => item.id)).toEqual(['e1'])
})
