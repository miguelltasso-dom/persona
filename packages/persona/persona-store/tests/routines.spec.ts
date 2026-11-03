import { afterEach, expect, it } from 'vitest'
import { ProductRepos, RoutineRepos, StoreError, type TempStore, openTempStore } from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T12:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<RoutineRepos> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return new RoutineRepos(handle.store, now)
}

function add(routines: RoutineRepos, overrides: Partial<Parameters<RoutineRepos['create']>[0]> = {}) {
  return routines.create({
    id: 'r1',
    workspaceId: 'ws',
    projectId: 'pp',
    name: 'Standup',
    rrule: 'FREQ=DAILY',
    timeZone: 'UTC',
    catchUp: 'run_all',
    ...overrides,
  })
}

it('creates and lists routines newest first', async () => {
  const routines = await setup()
  add(routines, { id: 'r1', name: 'A' })
  add(routines, { id: 'r2', name: 'B' })
  expect(routines.list('pp').map(item => item.id)).toEqual(['r2', 'r1'])
})

it('refuses a second run for the same scheduled_for and keeps the first row', async () => {
  const routines = await setup()
  add(routines)
  const first = routines.schedule({ id: 'run-a', routineId: 'r1', scheduledFor: '2026-11-03T12:00:00.000Z' })
  const again = routines.schedule({ id: 'run-b', routineId: 'r1', scheduledFor: '2026-11-03T12:00:00.000Z' })
  expect(again.id).toBe(first.id)
  expect(routines.listRuns('r1')).toHaveLength(1)
})

it('does not claim a future run against a fake clock', async () => {
  const routines = await setup()
  add(routines)
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-04T12:00:00.000Z' })
  expect(routines.claimDue('pp', '2026-11-03T12:05:00.000Z')).toEqual([])
})

it('leases a due run and completes it', async () => {
  const routines = await setup()
  add(routines)
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  const claimed = routines.claimDue('pp', '2026-11-03T12:05:00.000Z')
  expect(claimed.map(item => item.id)).toEqual(['run-1'])
  expect(claimed[0]?.status).toBe('leased')
  routines.complete('run-1')
  expect(routines.getRun('run-1')?.status).toBe('done')
})

it('pauseTeam cancels pending and leased runs', async () => {
  const routines = await setup()
  add(routines)
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  routines.claimDue('pp', '2026-11-03T12:05:00.000Z')
  routines.schedule({ id: 'run-2', routineId: 'r1', scheduledFor: '2026-11-03T11:30:00.000Z' })
  routines.pauseTeam('pp')
  expect(routines.get('r1')?.paused).toBe(true)
  expect(routines.getRun('run-1')?.status).toBe('cancelled')
  expect(routines.getRun('run-2')?.status).toBe('cancelled')
})

it('retries a failed run without duplicating the scheduled_for', async () => {
  const routines = await setup()
  add(routines)
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  routines.claimDue('pp', '2026-11-03T12:05:00.000Z')
  routines.fail('run-1')
  expect(routines.getRun('run-1')?.attempt).toBe(1)
  const again = routines.retry('run-1')
  expect(again.status).toBe('pending')
  expect(routines.listRuns('r1')).toHaveLength(1)
})

it('run_once catch-up leases only the latest overdue run', async () => {
  const routines = await setup()
  add(routines, { catchUp: 'run_once' })
  routines.schedule({ id: 'old', routineId: 'r1', scheduledFor: '2026-11-03T10:00:00.000Z' })
  routines.schedule({ id: 'new', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  expect(routines.claimDue('pp', '2026-11-03T12:05:00.000Z').map(item => item.id)).toEqual(['new'])
  expect(routines.getRun('old')?.status).toBe('cancelled')
})

it('skip catch-up cancels overdue runs', async () => {
  const routines = await setup()
  add(routines, { catchUp: 'skip' })
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  expect(routines.claimDue('pp', '2026-11-03T12:05:00.000Z')).toEqual([])
  expect(routines.getRun('run-1')?.status).toBe('cancelled')
})

it('does not claim during a silence window', async () => {
  const routines = await setup()
  add(routines, { silenceStart: '12:00', silenceEnd: '13:00' })
  routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  expect(routines.claimDue('pp', '2026-11-03T12:05:00.000Z')).toEqual([])
  expect(routines.getRun('run-1')?.status).toBe('pending')
})

it('refuses to schedule on a paused routine', async () => {
  const routines = await setup()
  add(routines)
  routines.setPaused('r1', true)
  expect(() => {
    routines.schedule({ id: 'run-1', routineId: 'r1', scheduledFor: '2026-11-03T11:00:00.000Z' })
  }).toThrow(StoreError)
})
