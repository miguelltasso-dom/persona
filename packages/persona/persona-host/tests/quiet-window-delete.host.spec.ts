/**
 * Prism's request (12/11): the "Janela de silêncio" editor needs a way to turn a window OFF without a control that has no way back. `deleteQuietWindow` removes the window
 * (the host stops obeying it at once), says whether it existed, keeps the history of what it held back, and `putQuietWindow` with the same fields puts it back ("Desfazer").
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const NOW = '2026-11-11T15:00:00.000Z'
const { host } = bindHostFile(NOW)
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
}

it('deleting a window turns it off: it leaves the list and the host no longer holds anything back for it', () => {
  const h = host()
  seed(h)
  const all = { ...scope, id: 'q-always', label: 'O dia todo', start: '00:00', end: '23:59' }
  h.putQuietWindow(all)
  expect(h.screens.houseRules.quietNow('pp', NOW)).toBeDefined() // on: the window covers the whole day
  expect(h.deleteQuietWindow({ ...scope, id: 'q-always' })).toBe(true)
  expect(h.listQuietWindows(scope)).toEqual([])
  expect(h.screens.houseRules.quietNow('pp', NOW)).toBeUndefined() // off: nothing is held back any more
})

it('says whether the window existed (an unknown id, or one already deleted, is false and harmless) and touches no other window', () => {
  const h = host()
  seed(h)
  h.putQuietWindow({ ...scope, id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })
  h.putQuietWindow({ ...scope, id: 'q2', label: 'Almoço', start: '12:00', end: '13:00' })
  expect(h.deleteQuietWindow({ ...scope, id: 'nao-existe' })).toBe(false)
  expect(h.deleteQuietWindow({ ...scope, id: 'q1' })).toBe(true)
  expect(h.deleteQuietWindow({ ...scope, id: 'q1' })).toBe(false)
  expect(h.listQuietWindows(scope).map(row => row.id)).toEqual(['q2'])
})

it('"Desfazer": the same fields put back give the same window, and what it held back before is still in the book', () => {
  const h = host()
  seed(h)
  const night = { ...scope, id: 'q1', label: 'Noite', start: '20:00', end: '08:00' }
  h.putQuietWindow(night)
  h.screens.houseRules.record('pp', 'quiet:q1', '2026-11-10T22:00:00.000Z', 'iniciativa de Nina')
  expect(h.deleteQuietWindow({ ...scope, id: 'q1' })).toBe(true)
  h.putQuietWindow(night)
  expect(h.listQuietWindows(scope)).toEqual([expect.objectContaining({ id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })])
  expect(h.listQuietWindows(scope)[0]?.applied).toMatchObject({ total: 1, lastWhat: 'iniciativa de Nina' })
})

it('is scoped to the project: a window of another project is not touched', () => {
  const h = host()
  seed(h)
  h.createProject({ id: 'p2', workspaceId: 'ws', name: 'Outro', description: '' })
  h.putQuietWindow({ ...scope, id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })
  h.putQuietWindow({ workspaceId: 'ws', projectId: 'p2', id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })
  expect(h.deleteQuietWindow({ ...scope, id: 'q1' })).toBe(true)
  expect(h.listQuietWindows({ workspaceId: 'ws', projectId: 'p2' }).map(row => row.id)).toEqual(['q1'])
})
