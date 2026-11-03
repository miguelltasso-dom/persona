import { describe, expect, it, vi } from 'vitest'
import { DesktopNotifications, inQuietWindow, policyFromAutonomy, type DesktopAttentionPolicy } from '../src/notifications.ts'
import { personaTaskHref } from '../src/deep-link.ts'

function policy(partial: Partial<DesktopAttentionPolicy> = {}): DesktopAttentionPolicy {
  return { delivery: 'ping', proposalBudget: 3, quietStart: '22:00', quietEnd: '07:00', ...partial }
}

function clock(iso: string) {
  return { now: () => new Date(iso) }
}

function harness(partial: Partial<DesktopAttentionPolicy> = {}, iso = '2026-11-03T15:00:00') {
  const shown: Array<{ title: string; body: string; href: string; tag: string }> = []
  const open = vi.fn()
  const notifications = new DesktopNotifications({
    policy: () => policy(partial),
    locale: () => ({
      needsYouTitle: 'Precisa de você',
      reviewReadyTitle: 'Pronta para revisão',
      notifyGroupedBody: '{count} atualizações enquanto você estava ocupado',
    }),
    clock: clock(iso),
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

  it('groups five pings into one summary toast and opens the first task', () => {
    const f = harness({ delivery: 'summary' })
    for (let i = 1; i <= 5; i += 1) {
      f.notifications.ingest({
        id: `e-${String(i)}`, kind: i === 3 ? 'review' : 'needs-you',
        title: `item ${String(i)}`, ticketId: `t-${String(i)}`, at: '2026-11-03T15:00:00Z',
      })
    }
    expect(f.shown).toHaveLength(0)
    f.notifications.flush()
    expect(f.shown).toHaveLength(1)
    expect(f.shown[0]?.body).toBe('5 atualizações enquanto você estava ocupado')
    expect(f.shown[0]?.href).toBe(personaTaskHref('t-1'))
    if (f.shown[0] !== undefined) f.open(f.shown[0].href)
    expect(f.open).toHaveBeenCalledWith('persona://task/t-1')
  })

  it('maps Anvil silence windows onto quietStart/quietEnd', () => {
    expect(policyFromAutonomy({
      proposalBudget: 2, silenceStart: '21:00', silenceEnd: '08:00',
    })).toEqual({
      delivery: 'summary', proposalBudget: 2, quietStart: '21:00', quietEnd: '08:00',
    })
  })

  it('respects the daily proposal budget and titles review-ready in pt-BR', () => {
    const f = harness({ delivery: 'ping', proposalBudget: 1 })
    f.notifications.ingest({ id: 'r', kind: 'review', title: 'Draft pronto', ticketId: 't-9', at: '2026-11-03T15:00:00Z' })
    f.notifications.ingest({ id: 'n', kind: 'needs-you', title: 'Bloqueada', ticketId: 't-8', at: '2026-11-03T15:01:00Z' })
    expect(f.shown).toHaveLength(1)
    expect(f.shown[0]?.title).toBe('Pronta para revisão')
    expect(f.shown[0]?.href).toBe('persona://task/t-9')
  })
})
