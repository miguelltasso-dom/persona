import { describe, expect, it } from 'vitest'
import { isAlwaysOnAttention, isAlwaysOnResolved, runningAssignmentCount } from '../src/always-on-ipc.ts'

describe('always-on IPC wire', () => {
  it('accepts a needs-you payload and rejects a network-looking object', () => {
    expect(isAlwaysOnAttention({
      id: 'a1', kind: 'needs-you', title: 'Nina', ticketId: 't-1', at: '2026-11-03T15:00:00Z',
    })).toBe(true)
    expect(isAlwaysOnAttention({ id: '', kind: 'needs-you', title: 'x', ticketId: 't', at: 't' })).toBe(false)
    expect(isAlwaysOnAttention({ href: 'https://example.com' })).toBe(false)
  })

  it('accepts a finite non-negative assignment count', () => {
    expect(runningAssignmentCount(2)).toBe(2)
    expect(runningAssignmentCount(-1)).toBeUndefined()
    expect(runningAssignmentCount('2')).toBeUndefined()
  })

  it('validates new task events and resolution frames', () => {
    const event = { id: 'a', kind: 'question', title: 'Tarefa', ticketId: 't-1', at: 'now', personaName: 'Bia', question: 'Qual?' }
    expect(isAlwaysOnAttention(event)).toBe(true)
    expect(isAlwaysOnAttention({ ...event, avatarId: 9 })).toBe(false)
    expect(isAlwaysOnAttention({ ...event, ticketId: '../escape' })).toBe(false)
    expect(isAlwaysOnAttention({ ...event, kind: 'progress' })).toBe(false)
    expect(isAlwaysOnResolved({ kind: 'resolved', eventIds: ['a'] })).toBe(true)
    expect(isAlwaysOnResolved({ kind: 'resolved', eventIds: [1] })).toBe(false)
  })
})
