import { describe, expect, it, vi } from 'vitest'
import { DesktopNotifications, inQuietWindow, policyFromAutonomy, type DesktopAttentionPolicy } from '../src/notifications.ts'
import { personaTaskHref } from '../src/deep-link.ts'

function policy(partial: Partial<DesktopAttentionPolicy> = {}): DesktopAttentionPolicy {
  return { delivery: 'ping', proposalBudget: 3, quietStart: '22:00', quietEnd: '07:00', ...partial }
}

function clock(iso: string) {
  return { now: () => new Date(iso) }
}

function harness(partial: Partial<DesktopAttentionPolicy> = {}, iso = '2026-11-03T15:00:00', focused = false) {
  const shown: Array<{ title: string; body: string; href: string; tag: string }> = []
  const open = vi.fn()
  const notifications = new DesktopNotifications({
    policy: () => policy(partial),
    clock: clock(iso),
    localeId: () => 'pt',
    isAppFocused: () => focused,
    notify: {
      show: (payload: { title: string; body: string; href: string; tag: string }) => {
        shown.push(payload)
        return { onClick: (href: string) => { open(href) } }
      },
    },
    open,
  })
  return { notifications, shown, open }
}

describe('desktop notifications', () => {
  it('suppresses native notifications while the visible app is focused', () => {
    const f = harness({}, '2026-11-03T15:00:00', true)
    f.notifications.ingest({ id: 'a', kind: 'failed', title: 'Erro', ticketId: 't-1', at: '2026-11-03T15:00:00Z' })
    f.notifications.flush()
    expect(f.shown).toEqual([])
  })

  it('deduplicates events and removes resolved items from the waiting summary', () => {
    const f = harness({ delivery: 'summary' })
    const event = { id: 'a', kind: 'done' as const, title: 'Pronto', ticketId: 't-1', at: '2026-11-03T15:00:00Z' }
    f.notifications.ingest(event)
    f.notifications.ingest(event)
    f.notifications.resolve(['a'])
    f.notifications.flush()
    expect(f.shown).toEqual([])
  })

  it('sends exactly one grouped notification after quiet hours', () => {
    let now = new Date('2026-11-03T23:30:00')
    const shown: Array<{ title: string; body: string }> = []
    const notifications = new DesktopNotifications({
      policy: () => policy(),
      localeId: () => 'pt', clock: { now: () => now }, isAppFocused: () => false,
      notify: { show: (payload) => { shown.push(payload); return {} } }, open: () => {},
    })
    notifications.ingest({ id: 'a', kind: 'question', title: 'Tarefa', ticketId: 't-1', at: 'now' })
    notifications.ingest({ id: 'b', kind: 'done', title: 'Entrega', ticketId: 't-2', at: 'now' })
    notifications.flushQuietHours()
    expect(shown).toEqual([])
    now = new Date('2026-11-04T07:01:00')
    notifications.flushQuietHours()
    notifications.flushQuietHours()
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ title: 'Enquanto você estava fora', body: '1 coisa espera você · 1 entrega' })
  })

  it('notifies a failed task even after the delivery budget is exhausted', () => {
    const f = harness({ proposalBudget: 1 })
    f.notifications.ingest({ id: 'a', kind: 'done', title: 'Pronto', ticketId: 't-1', at: '2026-11-03T15:00:00Z' })
    f.notifications.ingest({ id: 'b', kind: 'done', title: 'Outro', ticketId: 't-2', at: '2026-11-03T15:00:00Z' })
    f.notifications.ingest({ id: 'c', kind: 'failed', title: 'Erro', ticketId: 't-3', at: '2026-11-03T15:00:00Z' })
    expect(f.shown).toHaveLength(2)
    f.notifications.flush()
    expect(f.shown).toHaveLength(3)
  })

  it('uses the persona name and a localized failure instead of the code', () => {
    const f = harness()
    f.notifications.ingest({ id: 'a', kind: 'failed', title: 'Cardápio', personaName: 'Bia',
      code: 'provider_unreachable', ticketId: 't-1', at: 'now' })
    expect(f.shown[0]).toMatchObject({ title: 'Bia não conseguiu terminar', body: 'Não consegui falar com o serviço de IA agora.' })
  })

  it('stays silent inside the quiet window and flushes a group after', () => {
    const f = harness({}, '2026-11-03T23:30:00')
    f.notifications.ingest({ id: '1', kind: 'needs-you', title: 'Nina precisa', ticketId: 't-1', at: '2026-11-03T23:30:00Z' })
    f.notifications.ingest({ id: '2', kind: 'review', title: 'Revisão', ticketId: 't-2', at: '2026-11-03T23:31:00Z' })
    expect(f.shown).toEqual([])
    const day = harness({}, '2026-11-04T08:00:00')
    day.notifications.ingest({ id: '1', kind: 'needs-you', title: 'Nina precisa', ticketId: 't-1', at: '2026-11-04T08:00:00Z' })
    expect(inQuietWindow(new Date('2026-11-03T23:30:00'), '22:00', '07:00')).toBe(true)
    expect(inQuietWindow(new Date('2026-11-04T08:00:00'), '22:00', '07:00')).toBe(false)
  })

  it('groups delivery pings into one summary toast and opens the first task', () => {
    const f = harness({ delivery: 'summary' })
    for (let i = 1; i <= 5; i += 1) {
      f.notifications.ingest({
        id: `e-${String(i)}`, kind: i === 3 ? 'review' : 'done',
        title: `item ${String(i)}`, ticketId: `t-${String(i)}`, at: '2026-11-03T15:00:00Z',
      })
    }
    expect(f.shown).toHaveLength(0)
    f.notifications.flush()
    expect(f.shown).toHaveLength(1)
    expect(f.shown[0]?.body).toBe('0 coisas esperam você · 5 entregas')
    // The grouped toast opens the overview, not one arbitrary task (SPEC §3).
    expect(f.shown[0]?.href).toBe(personaTaskHref('t-1', 'overview'))
    if (f.shown[0] !== undefined) f.open(f.shown[0].href)
    expect(f.open).toHaveBeenCalledWith('persona://task/t-1?v=overview')
  })

  it('opens the exact place for each kind of toast', () => {
    const f = harness({ delivery: 'ping', proposalBudget: 9 })
    const kinds = ['needs-you', 'review', 'question', 'failed', 'done'] as const
    kinds.forEach((kind, index) => {
      f.notifications.ingest({ id: `k-${kind}`, kind, title: 'Tarefa', ticketId: `t-${String(index)}`, at: '2026-11-03T15:00:00Z' })
    })
    expect(f.shown.map(toast => toast.href)).toEqual([
      'persona://task/t-0?v=approvals',
      'persona://task/t-1?v=review',
      'persona://task/t-2',
      'persona://task/t-3',
      'persona://task/t-4',
    ])
  })

  it('maps Anvil silence windows onto quietStart/quietEnd', () => {
    expect(policyFromAutonomy({
      proposalBudget: 2, silenceStart: '21:00', silenceEnd: '08:00',
    })).toEqual({
      delivery: 'summary', proposalBudget: 2, quietStart: '21:00', quietEnd: '08:00',
    })
  })

  it('does not apply the delivery budget to needs-you', () => {
    const f = harness({ delivery: 'ping', proposalBudget: 1 })
    f.notifications.ingest({ id: 'r', kind: 'review', title: 'Draft pronto', ticketId: 't-9', at: '2026-11-03T15:00:00Z' })
    f.notifications.ingest({ id: 'n', kind: 'needs-you', title: 'Bloqueada', ticketId: 't-8', at: '2026-11-03T15:01:00Z' })
    expect(f.shown).toHaveLength(2)
    expect(f.shown[0]?.title).toBe('Persona deixou mudanças para você revisar')
    expect(f.shown[0]?.href).toBe('persona://task/t-9?v=review')
  })
})
