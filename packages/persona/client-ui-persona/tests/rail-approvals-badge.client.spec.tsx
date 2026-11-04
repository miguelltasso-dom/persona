// @vitest-environment jsdom
// DECISIONS-SPEC: the rail badge reads the same count as the Visão geral chip, and it must NOT change the
// accessible NAME of "Aprovações" (the boot gate, the gallery and screen readers find the button by that name).
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

afterEach(() => { cleanup() })

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

function renderRail(pending: number) {
  const { store } = createShellStore()
  const approvals = createSnapshotStore({ pending })
  const team = createSnapshotStore<readonly never[]>([])
  const revision = createSnapshotStore({ n: 0 })
  render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={() => {}}
      renderSlot={(() => null) as never}
    />,
  )
}

describe('rail badge "Aprovações · n"', () => {
  it('shows the number; the button keeps its exact name and the count is its description', () => {
    renderRail(3)
    const button = screen.getByRole('button', { name: 'Aprovações' })
    expect(button.textContent).toContain('3')
    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe('3 pendentes')
  })

  it('no number, no badge, no description when nothing waits', () => {
    renderRail(0)
    const button = screen.getByRole('button', { name: 'Aprovações' })
    expect(button.getAttribute('aria-describedby')).toBeNull()
    expect(button.textContent).toBe('Aprovações')
  })
})
