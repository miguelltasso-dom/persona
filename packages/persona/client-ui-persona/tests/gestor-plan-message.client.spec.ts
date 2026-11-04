import { describe, expect, it } from 'vitest'
import { gestorPlanMarker, parseGestorPlanId } from '../src/client/chat/gestor-plan-message.ts'

describe('gestor-plan message marker', () => {
  it('parses plan id and strips the marker from visible body', () => {
    const parsed = parseGestorPlanId('Vou contratar Pipoca.\n\n[[gestor-plan:plan-1]]')
    expect(parsed).toEqual({ planId: 'plan-1', visibleBody: 'Vou contratar Pipoca.' })
  })

  it('round-trips marker helper', () => {
    expect(parseGestorPlanId(`Oi${gestorPlanMarker('abc')}`)?.planId).toBe('abc')
  })
})
