// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteUsagePanel } from '../src/client/data/lumen-remote-panels.tsx'
import { reserveWhen } from '../src/client/usage/UsageLimits.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({
    status: 'ready',
    scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' },
  })
  return bindObservableForTest({
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
  })
}

function shellHarness(): ReturnType<typeof bindObservableForTest<ReturnType<ReturnType<typeof createShellStore>['store']['getSnapshot']>>> {
  const { store } = createShellStore()
  return bindObservableForTest(store)
}

function usagePersona(extra: Record<string, unknown> = {}): PersonaRemoteClient {
  return {
    getUsage: vi.fn(async () => ({
      ok: true as const,
      value: {
        period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.999Z' },
        folds: [],
        tokens: 0,
        runs: 0,
        origin: 'measured' as const,
        originLabel: 'Medido',
      },
    })),
    getOfficialQuota: vi.fn(async () => ({
      ok: true as const,
      value: [{
        provider: 'openrouter',
        origin: 'official' as const,
        windows: [{ id: 'month', origin: 'official' as const, usedPercent: 12 }],
      }],
    })),
    listMemory: vi.fn(async () => ({ ok: true as const, value: [] })),
    listSkills: vi.fn(async () => ({ ok: true as const, value: [] })),
    listConnectionAccounts: vi.fn(async () => ({ ok: true as const, value: { accounts: [] } })),
    ...extra,
  } as unknown as PersonaRemoteClient
}

describe('RemoteUsagePanel (OPT-7 / D5b)', () => {
  it('renders token panel from getUsagePanel', async () => {
    const getUsagePanel = vi.fn(async () => ({
      ok: true as const,
      value: {
        origin: 'measured' as const,
        tokensPerSuccessfulTask: 42,
        cacheHitRate: 0.25,
        byPersona: [{ key: 'atlas', tokens: 100, calls: 2, cacheHitRate: 0.1 }],
        byKind: [],
      },
    }))
    const persona = usagePersona({ getUsagePanel })

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    // The title is also in the loading header: wait for the section the data draws, not for the heading.
    expect(await screen.findByText(usagePt['section.tokens'])).toBeTruthy()
    expect(screen.getByRole('heading', { name: usagePt['title'] })).toBeTruthy()
    expect(getUsagePanel).toHaveBeenCalled()
    expect(screen.getByText(/42 de uso de IA por tarefa concluída/u)).toBeTruthy()
  })

  it('shows the reserve of the last 5% and spends it with “Continuar agora”', async () => {
    const getWindowReserve = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        resetsAt: '2026-11-11T20:00:00.000Z',
        queued: 2,
        overridden: false,
      },
    }))
    const continueWindowNow = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        queued: 0,
        overridden: true,
      },
    }))
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={usagePersona({ getWindowReserve, continueWindowNow })}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    expect(await screen.findByText(/A equipe pausou o trabalho longo para guardar os últimos 5% do plano para as suas respostas./u)).toBeTruthy()
    expect(screen.getByText('2 pedidos esperando')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: usagePt['window.continue'] }))
    expect(continueWindowNow).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
    expect(await screen.findByText(usagePt['window.released'])).toBeTruthy()
  })

  it('writes the reserve in the singular when only one request waits', async () => {
    const getWindowReserve = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        resetsAt: '2026-11-11T20:00:00.000Z',
        queued: 1,
        overridden: false,
      },
    }))
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={usagePersona({ getWindowReserve })}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )
    expect(await screen.findByText('1 pedido esperando')).toBeTruthy()
    expect(screen.queryByText(/1 pedidos/u)).toBeNull()
  })

  const reserveOf = (extra: Record<string, unknown>) => vi.fn(async () => ({
    ok: true as const,
    value: { state: 'reserve' as const, provider: 'claude', windowId: '5h', usedPercent: 96, resetsAt: '2026-11-11T20:00:00.000Z', queued: 2, overridden: false, ...extra },
  }))
  const open = (getWindowReserve: ReturnType<typeof reserveOf>, extra: Record<string, unknown> = {}) => render(
    <PreviewFrame brandLabel="Persona">
      <RemoteUsagePanel persona={usagePersona({ getWindowReserve, continueWindowNow: vi.fn(), ...extra })} useTenant={tenantHarness()} useShell={shellHarness()} />
    </PreviewFrame>,
  )

  it('PAUSED (Muse, item 10): attention card, the sentence and "Volta …" in one paragraph, the count apart, a compact button, no "janela" and no money', async () => {
    open(reserveOf({}))
    const sentence = await screen.findByText(/A equipe pausou o trabalho longo/u)
    expect(sentence.textContent).toMatch(/ Volta (?:às|[a-zçáéíóú]+ às) \d{2}:\d{2}\.$/u)
    expect(screen.getByText('2 pedidos esperando')).toBeTruthy()
    const button = screen.getByRole('button', { name: usagePt['window.continue'] })
    expect(button.className).toMatch(/reserveAction/u) // fit-content, never the card's full width
    expect(document.querySelector('[data-window-reserve="paused"]')).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/janela|R\$|US\$/u)
  })

  it('PAUSED with nothing waiting: the count line disappears', async () => {
    open(reserveOf({ queued: 0 }))
    await screen.findByText(/A equipe pausou o trabalho longo/u)
    expect(screen.queryByText(/pedidos? esperando/u)).toBeNull()
  })

  it('RELEASED: a neutral card with the green check, no button, no count and no "pausou"', async () => {
    open(reserveOf({ overridden: true }))
    const badge = await screen.findByText('Você liberou os últimos 5% do plano.')
    expect(badge.closest('span')?.className).toMatch(/success/u)
    expect(screen.getByText(/A equipe continua trabalhando até renovar (?:às|[a-zçáéíóú]+ às) \d{2}:\d{2}\./u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: usagePt['window.continue'] })).toBeNull()
    expect(document.body.textContent).not.toMatch(/pausou|esperando/u)
    expect(document.querySelector('[data-window-reserve="released"]')).not.toBeNull()
  })

  it('tone per state (Muse/Atlas/Keel 05:28): only PAUSED uses the attention surface; RELEASED and SPENT are the plain card, with no tone strip', async () => {
    const paused = open(reserveOf({}))
    await screen.findByText(/A equipe pausou o trabalho longo/u)
    const pausedCard = document.querySelector('[data-window-reserve="paused"]')
    expect(pausedCard?.className).toMatch(/notice/u)
    expect(pausedCard?.className).not.toMatch(/reserveCalm/u)
    paused.unmount()

    const released = open(reserveOf({ overridden: true }))
    await screen.findByText('Você liberou os últimos 5% do plano.')
    const releasedCard = document.querySelector('[data-window-reserve="released"]')
    expect(releasedCard?.className).toMatch(/reserveCalm/u)
    expect(releasedCard?.className).not.toMatch(/notice/u)
    expect(releasedCard?.getAttribute('data-tone')).toBeNull()
    released.unmount()

    open(reserveOf({ state: 'exhausted', usedPercent: 100, queued: 3 }))
    await screen.findByText(/O plano acabou por agora\./u)
    const spentCard = document.querySelector('[data-window-reserve="exhausted"]')
    expect(spentCard?.className).toMatch(/reserveCalm/u)
    expect(spentCard?.className).not.toMatch(/notice/u)
    expect(spentCard?.getAttribute('data-tone')).toBeNull()
  })

  it('RELEASED: the check and the sentence sit together (8px), and the loose paragraph carries no browser margin (the ~30px hole under the check)', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/usage/Usage.module.css'), 'utf8').replaceAll('\r', '')
    const rule = (selector: string): string => {
      const start = css.indexOf(`\n${selector} {`)
      expect(start, `rule ${selector}`).toBeGreaterThan(-1)
      return css.slice(start, css.indexOf('}', start))
    }
    expect(rule('.reserveCalm')).toMatch(/gap: var\(--persona-space-2\)/u) // 8px
    expect(rule('.reserveCalm')).not.toMatch(/warning|accent/u) // the neutral states never borrow the attention colour
    expect(rule('.reserveCalm')).toMatch(/border-color: var\(--persona-border-subtle\)/u)
    expect(rule('.reserveWhen')).toMatch(/margin: 0/u)
    expect(rule('.reserve')).toMatch(/display: flex/u) // the calm cards no longer lean on .notice to be a column
  })

  it('SPENT: "O plano acabou por agora. Volta …", the requests are kept, the bar is at 100%, and nothing offers a way around it', async () => {
    open(reserveOf({ state: 'exhausted', usedPercent: 100, queued: 3 }))
    const sentence = await screen.findByText(/O plano acabou por agora\./u)
    expect(sentence.textContent).toMatch(/ Volta (?:às|[a-zçáéíóú]+ às) \d{2}:\d{2}\.$/u)
    expect(screen.getByText('Os pedidos ficam guardados e a equipe retoma sozinha.')).toBeTruthy()
    expect(document.querySelector('[role="progressbar"][aria-valuenow="100"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: usagePt['window.continue'] })).toBeNull()
    expect(screen.queryByText(/pausou/u)).toBeNull()
    expect(document.body.textContent).not.toMatch(/janela|R\$|US\$/u)
  })

  it('the hour: "às 06:06" on the same day, "segunda às 06:06" on another one, nothing without a clock', () => {
    const now = new Date(2026, 10, 12, 9, 0, 0) // quinta
    expect(reserveWhen(new Date(2026, 10, 12, 15, 30, 0).toISOString(), now)).toBe('às 15:30')
    expect(reserveWhen(new Date(2026, 10, 16, 6, 6, 0).toISOString(), now)).toBe('segunda às 06:06')
    expect(reserveWhen(undefined, now)).toBe('')
    expect(reserveWhen('nope', now)).toBe('')
  })
})
