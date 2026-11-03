import { expect, it } from 'vitest'
import { watchdogSignals, watchdogWarnings } from '../src/index.ts'

it('derives stalled, failing and unavailable signals from a snapshot', () => {
  const signals = watchdogSignals({
    stalledTicketIds: ['t1'],
    failingEffectKeys: ['launch:a1'],
    unavailableEvalIds: ['e9'],
  })
  expect(signals.map(item => item.kind)).toEqual(['ticket_stalled', 'effect_failing', 'eval_unavailable'])
  expect(signals[0]?.detail).toMatch(/parada/i)
})

it('collapses the same kind+subject into one warning', () => {
  const warnings = watchdogWarnings([
    { kind: 'ticket_stalled', subjectId: 't1', detail: 'first' },
    { kind: 'ticket_stalled', subjectId: 't1', detail: 'again' },
    { kind: 'ticket_stalled', subjectId: 't2', detail: 'other' },
  ])
  expect(warnings).toHaveLength(2)
  expect(warnings[0]).toMatchObject({ id: 'ticket_stalled:t1', detail: 'first' })
})
