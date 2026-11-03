import { afterEach, expect, it } from 'vitest'
import { ProductRepos, ProactivityRepos, openPersonaStore, openTempStore, type TempStore } from '../src/index.ts'

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

async function setup(): Promise<ProactivityRepos> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return new ProactivityRepos(handle.store, now)
}

it('defaults autonomy to propose with a daily proposal budget', async () => {
  const repos = await setup()
  const row = repos.getAutonomy('pp', 'p1')
  expect(row.mode).toBe('propose')
  expect(row.proposalBudget).toBe(3)
  expect(row.tokenBudget).toBe(50_000)
})

it('persists autonomy and visit across reopen', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  new ProductRepos(handle.store, now).createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const repos = new ProactivityRepos(handle.store, now)
  repos.setAutonomy({
    projectId: 'pp', personaId: 'p1', mode: 'act', proposalBudget: 7, tokenBudget: 9, executionBudget: 2,
    silenceStart: '22:00', silenceEnd: '08:00',
  })
  repos.markVisit('pp', '2026-11-03T10:00:00.000Z')
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  temps.push({ store: again, dir: '', path: handle.path, dispose: async () => { again.close() } })
  const r2 = new ProactivityRepos(again, now)
  expect(r2.getAutonomy('pp', 'p1')).toMatchObject({
    mode: 'act', proposalBudget: 7, silenceStart: '22:00', silenceEnd: '08:00',
  })
  expect(r2.lastVisit('pp')).toBe('2026-11-03T10:00:00.000Z')
})

it('counts proposals and lists fires after a cursor', async () => {
  const repos = await setup()
  repos.recordFire({
    projectId: 'pp', id: 'f1', personaId: 'p1', source: 'event', kind: 'initiative',
    at: '2026-11-03T11:00:00.000Z', title: 'PR aberto', ticketId: 't1',
  })
  repos.recordFire({
    projectId: 'pp', id: 'f2', personaId: 'p1', source: 'routine', kind: 'initiative',
    at: '2026-11-03T12:00:00.000Z', title: 'Revisar',
  })
  repos.addProposal('pp', 'p1', '2026-11-03')
  repos.addProposal('pp', 'p1', '2026-11-03')
  expect(repos.proposalsToday('pp', 'p1', '2026-11-03')).toBe(2)
  expect(repos.firesSince('pp', '2026-11-03T11:00:00.000Z').map(item => item.id)).toEqual(['f2'])
})

it('keeps Vigia audit newest-after-cursor and ignores duplicate ids', async () => {
  const repos = await setup()
  repos.recordAudit({
    projectId: 'pp', id: 'ticket_stalled:t1', at: '2026-11-03T11:00:00.000Z',
    kind: 'ticket_stalled', subjectId: 't1', detail: 'stalled',
  })
  repos.recordAudit({
    projectId: 'pp', id: 'ticket_stalled:t1', at: '2026-11-03T11:05:00.000Z',
    kind: 'ticket_stalled', subjectId: 't1', detail: 'again',
  })
  expect(repos.auditsSince('pp', '1970-01-01T00:00:00.000Z')).toHaveLength(1)
  expect(repos.auditsSince('pp', '2026-11-03T11:00:00.000Z')).toEqual([])
})
