import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  applyWorkflowEdit,
  mayUpload,
  openSprint,
  workflowFromTemplate,
} from '@deepseek-ai/dsh-persona-core'
import {
  PERSONA_MIGRATIONS,
  PERSONA_SCHEMA_VERSION,
  ProductRepos,
  SqliteBoardRepos,
  openPersonaStore,
  openTempStore,
  type PersonaStore,
  type TempStore,
} from '../src/index.ts'

const stores: PersonaStore[] = []
const temps: TempStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function seed(store: PersonaStore): void {
  const product = new ProductRepos(store, () => '2026-11-03T15:00:00.000Z')
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
}

it('migrates v7 → v8 and keeps existing tickets', async () => {
  const v7 = PERSONA_MIGRATIONS.filter(item => item.version <= 7)
  const handle = await openTempStore({ migrations: v7 })
  temps.push(handle)
  seed(handle.store)
  handle.store.tx((db) => {
    db.prepare(`INSERT INTO engine_ticket
      (project_id, id, updated_at, stage, stage_action, ended, undelivered_len, assignment_state, body)
      VALUES (?, ?, ?, 'working', NULL, 0, 0, NULL, ?)`).run(
      'pp', 'tk-keep', '2026-11-03T15:00:00.000Z', '{"id":"tk-keep","title":"README"}',
    )
  })
  handle.store.close()
  const migrated = openPersonaStore({
    path: handle.path,
    backupDir: join(handle.dir, 'db', 'backups'),
  })
  temps.push({ store: migrated, dir: handle.dir, path: handle.path, dispose: async () => { migrated.close() } })
  expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
  const row = migrated.db.prepare('SELECT id, body FROM engine_ticket WHERE id = ?').get('tk-keep') as {
    id: string
    body: string
  }
  expect(row.id).toBe('tk-keep')
  expect(row.body).toContain('README')
  expect(new SqliteBoardRepos(migrated).get('pp')).toBeUndefined()
})

it('saves a template flow, edits without losing seats, and keeps campos', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const board = new SqliteBoardRepos(store)
  const flow = workflowFromTemplate('pp', 'software')
  board.save(flow)
  expect(board.get('pp')?.columns.map(column => column.id)).toEqual(flow.columns.map(column => column.id))
  board.save({
    projectId: 'pp', ticketId: 'tk-1', columnId: 'software-andamento', campos: { nota: 2 },
  })
  board.save({ projectId: 'pp', ticketId: 'tk-2', columnId: 'software-sprint' })
  const removed = 'software-sprint'
  const dest = 'software-backlog'
  const nextCols = flow.columns.filter(column => column.id !== removed)
  const edited = applyWorkflowEdit(flow, nextCols, flow.fields, board.list('pp'), { [removed]: dest })
  board.save(edited.workflow)
  for (const seat of edited.seats) board.save(seat)
  expect(board.get('pp')?.columns.some(column => column.id === removed)).toBe(false)
  expect(board.of('tk-1')?.columnId).toBe('software-andamento')
  expect(board.of('tk-1')?.campos).toEqual({ nota: 2 })
  expect(board.of('tk-2')?.columnId).toBe('software-backlog')
})

it('sprints persist, snapshot restores, and board envelopes are shareable (DM is not)', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const board = new SqliteBoardRepos(store)
  board.save(workflowFromTemplate('pp', 'simples'))
  board.saveSprint(openSprint({
    id: 'sp-1', projectId: 'pp', name: 'S1', objective: 'Entregar o quadro', ticketIds: ['tk-1'],
  }))
  board.save({ projectId: 'pp', ticketId: 'tk-1', columnId: 'simples-fazer', sprintId: 'sp-1' })
  const snap = board.snapshot('pp')
  expect(snap.sprints[0]?.ticketIds).toEqual(['tk-1'])
  const other = openPersonaStore({ path: ':memory:' })
  stores.push(other)
  seed(other)
  const copy = new SqliteBoardRepos(other)
  copy.restore('pp', snap)
  expect(copy.get('pp')?.template).toBe('simples')
  expect(copy.of('tk-1')?.sprintId).toBe('sp-1')
  expect(copy.listSprints('pp')[0]?.name).toBe('S1')
  copy.deleteSprint('sp-1')
  expect(copy.listSprints('pp')).toEqual([])
  expect(copy.of('tk-1')?.sprintId).toBeUndefined()
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'board:pp', seq: 1, idempotencyKey: 'b1',
    classification: 'project', at: '2026-11-03T15:00:00.000Z',
    payload: { clear: JSON.stringify(snap) },
  })).toBe(true)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'dm:secret', seq: 1, idempotencyKey: 'd1',
    classification: 'dm', at: '2026-11-03T15:00:00.000Z',
    payload: { clear: 'private' },
  })).toBe(false)
})

it('crash during save rolls back the previous flow', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const board = new SqliteBoardRepos(store, () => '2026-11-03T15:00:00.000Z')
  board.save(workflowFromTemplate('pp', 'simples'))
  let writes = 0
  const inner = store.tx.bind(store)
  store.tx = ((work) => {
    writes += 1
    if (writes === 1) throw new Error('boom')
    return inner(work)
  })
  expect(() => { board.save(workflowFromTemplate('pp', 'site')) }).toThrow('boom')
  store.tx = inner
  expect(board.get('pp')?.template).toBe('simples')
})
