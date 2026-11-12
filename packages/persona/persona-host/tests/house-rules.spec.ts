/**
 * HONEST-1 (Atlas 11/11), block 1: the contract of the "Regras da casa" and the "Janela de silêncio" screens. The host only OFFERS what it
 * obeys: a closed list of rule kinds (`getRuleKinds`), a `kind` + `enforced` on every saved rule, and — for each rule and each window — how
 * many times it really applied (`applied`: total, last 7 days, last time, what), so the screen can say "Barrou 2 gastos esta semana".
 * A rule that is only text (no `kind`) is `enforced: false`: the screen must not promise anything about it.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const NOW = '2026-11-11T15:00:00.000Z'
const { host } = bindHostFile(NOW)
const scope = { workspaceId: 'ws', projectId: 'pp' }
const day = (n: number): string => new Date(Date.parse(NOW) - n * 86_400_000).toISOString()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
}

const rule = (extra: Record<string, unknown> = {}) => ({ ...scope, id: 'r1', gateText: 'Nunca pagar sem mim.', assessmentText: '', logOnly: false, speculativeEnabled: false, ...extra })

it('getRuleKinds is a CLOSED list: only what the host obeys, each with who enforces it', () => {
  const h = host()
  seed(h)
  const contract = h.getRuleKinds(scope)
  expect(contract.kinds.map(item => item.kind)).toEqual(['never-spend', 'never-send', 'never-publish', 'never-delete', 'never-hire'])
  expect(Object.fromEntries(contract.kinds.map(item => [item.kind, item.enforcedBy]))).toEqual({
    'never-spend': 'gate', 'never-send': 'gate', 'never-publish': 'gate', 'never-delete': 'gate', 'never-hire': 'harness',
  })
  // The quiet window is not a rule kind: it is its own screen, and the host says exactly what it holds and what it does not.
  expect(contract.quietWindow).toEqual({ enforced: true, holds: ['initiative', 'routine', 'plan', 'proposal', 'brief'], directRequestsAnswered: true })
})

it('a rule with a kind is enforced and says so; a rule that is only text is NOT enforced (no promise)', () => {
  const h = host()
  seed(h)
  const locked = h.putTriageRule(rule({ kind: 'never-spend' }))
  expect(locked).toMatchObject({ id: 'r1', kind: 'never-spend', enforced: true, applied: { total: 0, thisWeek: 0 } })
  const text = h.putTriageRule(rule({ id: 'r2', gateText: 'Só admin.' }))
  expect(text.enforced).toBe(false)
  expect(text).not.toHaveProperty('kind')
  // The order of the list is the store's, not part of this contract.
  expect(h.listTriageRules(scope).map(item => [item.id, item.enforced, item.kind]).sort()).toEqual([['r1', true, 'never-spend'], ['r2', false, undefined]])
})

it('a kind the host does not know is refused, never stored as if it were obeyed', () => {
  const h = host()
  seed(h)
  expect(() => h.putTriageRule(rule({ kind: 'never-breathe' }))).toThrow(/rule-kind/u)
  expect(h.listTriageRules(scope)).toEqual([])
})

it('a saved quiet window is enforced and starts with nothing applied', () => {
  const h = host()
  seed(h)
  h.putQuietWindow({ ...scope, id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })
  expect(h.listQuietWindows(scope)).toEqual([{ id: 'q1', label: 'Noite', start: '20:00', end: '08:00', enforced: true, applied: { total: 0, thisWeek: 0 } }])
})

it('applied counts the real applications: total, this week, the last time and what', () => {
  const h = host()
  seed(h)
  h.putTriageRule(rule({ kind: 'never-spend' }))
  const rules = h.screens.houseRules
  rules.record('pp', 'r1', day(10), 'pagar pelo Gmail')
  rules.record('pp', 'r1', day(3), 'pagar pelo Gmail')
  rules.record('pp', 'r1', day(1), 'pagar fatura')
  const view = h.listTriageRules(scope)[0]!
  expect(view.applied).toEqual({ total: 3, thisWeek: 2, lastAt: day(1), lastWhat: 'pagar fatura' })
})

it('the same application is counted once (idempotent on its own id) and the history stays bounded', () => {
  const h = host()
  seed(h)
  h.putTriageRule(rule({ kind: 'never-send' }))
  const rules = h.screens.houseRules
  rules.record('pp', 'r1', day(1), 'enviar e-mail', 'call-1')
  rules.record('pp', 'r1', day(1), 'enviar e-mail', 'call-1')
  expect(h.listTriageRules(scope)[0]!.applied).toMatchObject({ total: 1, thisWeek: 1 })
  for (let index = 0; index < 400; index += 1) rules.record('pp', 'r1', new Date(Date.parse(NOW) - index * 60_000).toISOString(), 'enviar e-mail', `bulk-${String(index)}`)
  const applied = h.listTriageRules(scope)[0]!.applied!
  expect(applied.total).toBe(401) // the total never forgets
  expect(applied.thisWeek).toBeLessThanOrEqual(200) // the recent list is capped
})

it('deleting a rule forgets what it applied: a new rule with the same id starts at zero', () => {
  const h = host()
  seed(h)
  h.putTriageRule(rule({ kind: 'never-delete' }))
  h.screens.houseRules.record('pp', 'r1', day(1), 'apagar arquivos')
  h.deleteTriageRule({ ...scope, id: 'r1' })
  h.putTriageRule(rule({ kind: 'never-delete' }))
  expect(h.listTriageRules(scope)[0]!.applied).toEqual({ total: 0, thisWeek: 0 })
})

it('a window counts its own holds, and the window id and a rule id never mix', () => {
  const h = host()
  seed(h)
  h.putQuietWindow({ ...scope, id: 'r1', label: 'Noite', start: '20:00', end: '08:00' })
  h.putTriageRule(rule({ kind: 'never-spend' }))
  h.screens.houseRules.record('pp', 'quiet:r1', day(1), 'iniciativa de Nina')
  expect(h.listQuietWindows(scope)[0]!.applied).toMatchObject({ total: 1, thisWeek: 1, lastWhat: 'iniciativa de Nina' })
  expect(h.listTriageRules(scope)[0]!.applied).toEqual({ total: 0, thisWeek: 0 })
})
