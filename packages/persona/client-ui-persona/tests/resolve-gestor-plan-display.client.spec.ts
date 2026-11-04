import { describe, expect, it } from 'vitest'
import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import { resolveGestorPlanForMessage } from '../src/client/chat/resolve-gestor-plan-display.ts'

function plan(id: string, status: string, extra: Partial<GestorPlanView> = {}): GestorPlanView {
  return {
    id,
    workspaceId: 'ws',
    gestorId: 'atlas',
    action: 'assemble',
    scopeKey: 'ws',
    summary: 'Plano',
    reason: 'r',
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

describe('resolveGestorPlanForMessage', () => {
  it('shows adjusting when a peer Gestor commented on this plan', () => {
    const original = plan('plan-a', 'proposed')
    const byId = {
      'plan-a': original,
      'plan-b': plan('plan-b', 'commented', { commentOnId: 'plan-a' }),
    }
    const resolved = resolveGestorPlanForMessage(original, byId, {})
    expect(resolved?.status).toBe('commented')
  })

  it('shows adjusting while human feedback is in flight', () => {
    const original = plan('plan-a', 'proposed')
    const resolved = resolveGestorPlanForMessage(original, { 'plan-a': original }, { 'plan-a': true })
    expect(resolved?.status).toBe('commented')
  })

  it('leaves applied plans unchanged', () => {
    const applied = plan('plan-a', 'applied')
    expect(resolveGestorPlanForMessage(applied, { 'plan-a': applied }, {})?.status).toBe('applied')
  })
})
