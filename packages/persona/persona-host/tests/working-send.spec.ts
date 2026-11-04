import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'fox', name: 'Raposa', title: 'Executora',
    description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'fox', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
}

it('queues, edits, flushes working messages; /lado stays off-thread', () => {
  const h = host()
  seed(h)
  const queued = h.enqueueWorkingMessage({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral', text: 'depois',
  })
  expect(queued.text).toBe('depois')
  expect(h.listWorkingQueue({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral',
  })).toHaveLength(1)
  h.editQueuedMessage({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral',
    id: queued.id, text: 'agora sim',
  })
  expect(h.listWorkingQueue({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral',
  })[0]?.text).toBe('agora sim')
  const flushed = h.flushWorkingQueue({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral',
  })
  expect(flushed).toHaveLength(1)
  expect(h.listWorkingQueue({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral',
  })).toEqual([])
  const aside = h.openAsideAsk({
    workspaceId: 'ws', projectId: 'pp', personaId: 'fox', subjectId: 'geral', question: 'quanto falta?',
  })
  expect(aside.onThread).toBe(false)
})

it('listTurnActivity folds events; empty is not 0% success; failure is not done', () => {
  const h = host()
  seed(h)
  expect(h.listTurnActivity({
    workspaceId: 'ws', projectId: 'pp', subjectId: 'geral',
  })).toEqual([])
  h.recordTurnActivity({
    workspaceId: 'ws', projectId: 'pp', id: 'e1', personaId: 'fox', subjectId: 'geral',
    kind: 'command', title: 'git status', status: 'done',
  })
  h.recordTurnActivity({
    workspaceId: 'ws', projectId: 'pp', id: 'e2', personaId: 'fox', subjectId: 'geral',
    kind: 'file', title: 'README', status: 'failed',
  })
  h.recordTurnActivity({
    workspaceId: 'ws', projectId: 'pp', id: 'e3', personaId: 'fox', subjectId: 'geral',
    kind: 'read', title: 'docs', status: 'waiting',
  })
  const folds = h.listTurnActivity({
    workspaceId: 'ws', projectId: 'pp', subjectId: 'geral', personaId: 'fox',
  })
  expect(folds).toHaveLength(1)
  const fold = folds[0]
  expect(fold?.failedCount).toBe(1)
  expect(fold?.unfinished).toBe(true)
  expect(fold?.shownKinds).toEqual(['command'])
})
