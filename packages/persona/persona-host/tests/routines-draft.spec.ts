import { parsePersonaSpec } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seeded(): PersonaHost {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return h
}

it('schedules a routine without duplicating and pauseTeam cancels it', () => {
  const h = seeded()
  expect(h.createRoutine({
    workspaceId: 'ws',
    projectId: 'pp',
    id: 'r1',
    name: 'Standup',
    rrule: 'FREQ=DAILY',
    timeZone: 'UTC',
    catchUp: 'run_all',
    silenceStart: '',
    silenceEnd: '',
  }).name).toBe('Standup')
  const first = h.scheduleRoutine({
    workspaceId: 'ws', projectId: 'pp', id: 'r1', runId: 'run-a', scheduledFor: '2026-11-03T11:00:00.000Z',
  })
  const again = h.scheduleRoutine({
    workspaceId: 'ws', projectId: 'pp', id: 'r1', runId: 'run-b', scheduledFor: '2026-11-03T11:00:00.000Z',
  })
  expect(again.id).toBe(first.id)
  h.pauseTeam({ workspaceId: 'ws', projectId: 'pp' })
  expect(h.listRoutines({ workspaceId: 'ws', projectId: 'pp' })[0]?.paused).toBe(true)
})

it('retries a failed run', () => {
  const h = seeded()
  h.createRoutine({
    workspaceId: 'ws',
    projectId: 'pp',
    id: 'r1',
    name: 'Standup',
    rrule: 'FREQ=DAILY',
    timeZone: 'UTC',
    catchUp: 'run_all',
    silenceStart: '',
    silenceEnd: '',
  })
  h.scheduleRoutine({
    workspaceId: 'ws', projectId: 'pp', id: 'r1', runId: 'run-1', scheduledFor: '2020-01-01T00:00:00.000Z',
  })
  expect(h.claimRoutines({
    workspaceId: 'ws', projectId: 'pp', leaseUntil: '2026-11-03T12:05:00.000Z',
  }).map(item => item.id)).toEqual(['run-1'])
  h.routines.fail('run-1')
  expect(h.retryRoutine({ workspaceId: 'ws', projectId: 'pp', runId: 'run-1' }).status).toBe('pending')
})

it('draftPersona and draftTeam are valid Forge specs without a coordinator', async () => {
  const h = seeded()
  const draft = await h.draftPersona({
    workspaceId: 'ws', projectId: 'pp', description: 'Bento\nImplementa com prova.', createdBy: 'ana',
  })
  expect(draft.name).toBe('Bento')
  expect(draft.systemRoles).toEqual([])
  expect(draft.runnerKind).toBe('dsh')
  parsePersonaSpec({
    name: draft.name,
    avatar: { kind: draft.avatarKind, ref: draft.avatarRef },
    title: draft.title,
    description: draft.description,
    personality: draft.personality,
    instructions: draft.instructions,
    runner: { kind: 'dsh', model: draft.runnerModel },
    tools: {},
    skills: [],
    limits: {},
    systemRoles: [...draft.systemRoles],
    canRecruit: draft.canRecruit,
  })
  const team = await h.draftTeam({
    workspaceId: 'ws', projectId: 'pp', description: 'Nina\n\nSol',
  })
  expect(team.map(item => item.name)).toEqual(['Nina', 'Sol'])
  expect(team.every(item => item.systemRoles.length === 0)).toBe(true)
})
