import { expect, it } from 'vitest'
import { KvTrailStore, LeadTrail, TRAIL_KEYS_MAX, TRAIL_KIND, TRAIL_LINES_MAX, type TrailKv } from '../src/lead-trail.ts'

/** C3/C7 + E10: the trail lives in the screens KV, so a host closed in the middle of a cycle and reopened on the SAME file keeps its lines, its dedupe keys and its counters. */
function kv(): { store: TrailKv; docs: Map<string, unknown> } {
  const docs = new Map<string, unknown>()
  return { docs, store: { get: <T>(p: string, k: string, i: string) => docs.get(`${p}/${k}/${i}`) as T | undefined, put: (p: string, k: string, i: string, v: unknown) => { docs.set(`${p}/${k}/${i}`, v) } } }
}
const at = () => '2026-11-12T12:00:00.000Z'

it('a trail written by one host is read by the NEXT one on the same file: lines, a hold already written (the key) and the counters survive a restart', () => {
  const { store, docs } = kv()
  const first = new LeadTrail(new KvTrailStore(store), at)
  first.cycle('pp')
  expect(first.record({ kind: 'lead:hold', projectId: 'pp', detail: 'Janela de silêncio.', key: 'gate:quiet:2026-11-12' })).toBe(true)
  first.record({ kind: 'lead:pull', projectId: 'pp', ticketId: 't1', personaId: 'bia', detail: 'Puxei «A» e entreguei a Bia: o cartão já era dela.' })
  const second = new LeadTrail(new KvTrailStore(store), at) // the host restarted
  expect(second.record({ kind: 'lead:hold', projectId: 'pp', detail: 'Janela de silêncio.', key: 'gate:quiet:2026-11-12' })).toBe(false) // already written: not written again
  expect(second.list('pp', 10).map(row => row.kind)).toEqual(['lead:pull', 'lead:hold'])
  expect(second.stats('pp')).toMatchObject({ cycles: 1, actions: { 'lead:hold': 1, 'lead:pull': 1 }, refusals: 0 })
  expect(docs.has(`pp/${TRAIL_KIND}/ring`)).toBe(true)
})

it('projects never share a trail: lines, keys and counters are per project', () => {
  const { store } = kv()
  const trail = new LeadTrail(new KvTrailStore(store), at)
  trail.record({ kind: 'lead:hold', projectId: 'A', detail: 'x', key: 'k' })
  expect(trail.record({ kind: 'lead:hold', projectId: 'B', detail: 'x', key: 'k' })).toBe(true) // the same key in another project is a different line
  expect(trail.list('A', 10)).toHaveLength(1)
  expect(trail.list('B', 10)).toHaveLength(1)
  expect(trail.stats('A').actions).toEqual({ 'lead:hold': 1 })
})

it('the ring is capped: the newest lines and keys are kept, the counters stay whole', () => {
  const { store } = kv()
  const trail = new LeadTrail(new KvTrailStore(store), at)
  for (let index = 0; index < TRAIL_LINES_MAX + 25; index += 1) trail.record({ kind: 'lead:chase', projectId: 'pp', detail: `linha ${String(index)}`, key: `k${String(index)}` })
  expect(trail.list('pp', 500)).toHaveLength(TRAIL_LINES_MAX) // list() itself never returns more than the ring
  expect(trail.list('pp', 1)[0]?.detail).toBe(`linha ${String(TRAIL_LINES_MAX + 24)}`) // the newest first
  expect(trail.stats('pp').actions['lead:chase']).toBe(TRAIL_LINES_MAX + 25)
  expect(TRAIL_KEYS_MAX).toBeGreaterThanOrEqual(TRAIL_LINES_MAX)
})
