import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Colheita §6, host side: a conversation turn (#geral/DM) leaves one activity row per tool it called, in the same book the Task turns
 * use — the client folds them into "N passos · tempo" (Quill's `TurnStepSummary`). A turn with no tool leaves nothing.
 */
const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

async function talk(h: PersonaHost, id: string): Promise<void> {
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento como está o pedido?', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
}

it('a conversation turn with three tools leaves one summary with three steps and their times', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Está quase pronto.'
  h.orchestration.liveToolSteps = [
    { tool: 'Read', at: '2026-11-03T15:00:01.000Z' },
    { tool: 'Bash', at: '2026-11-03T15:00:05.000Z' },
    { tool: 'Write', at: '2026-11-03T15:00:09.000Z' },
  ]
  await talk(h, 'm1')
  const groups = h.listTurnActivity({ ...scope, subjectId: 'm1' })
  expect(groups).toHaveLength(1)
  const items = groups[0]?.items ?? []
  // The fold orders by kind (the product's own rule), then by instant; the summary counts and times are what the client shows.
  expect(items.map(item => item.kind)).toEqual(['command', 'file', 'read'])
  expect(items.map(item => item.at)).toEqual(['2026-11-03T15:00:05.000Z', '2026-11-03T15:00:09.000Z', '2026-11-03T15:00:01.000Z'])
  expect(items.every(item => item.status === 'done')).toBe(true)
  expect(items.map(item => item.title)).toEqual(['Bash', 'Write', 'Read'])
})

it('a conversation turn with no tool leaves no summary', async () => {
  const h = host()
  seed(h)
  h.orchestration.liveText = 'Só respondendo.'
  await talk(h, 'm2')
  expect(h.listTurnActivity({ ...scope, subjectId: 'm2' })).toEqual([])
})
