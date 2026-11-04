// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ENGINE_RESUMED_NOTICE_MS, EngineMissingBanner } from '../src/client/chat/EngineMissingBanner.tsx'
import { ConnectedEngineBanner } from '../src/client/remote/ConnectedEngineBanner.tsx'
import type { EngineStatusUi } from '../src/client/remote/engine-status.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const NO_AI: EngineStatusUi = { readiness: 'unavailable', reason: 'none_connected', pending: 0 }
const READY: EngineStatusUi = { readiness: 'ready', reason: null, pending: 0 }

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function pass(ms = 0): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('EngineMissingBanner (FR-3)', () => {
  it('sem IA: diz o que falta e oferece Conectar / Conferir de novo', () => {
    const onConnect = vi.fn()
    const onRecheck = vi.fn()
    render(<EngineMissingBanner t={t} status={NO_AI} onConnect={onConnect} onRecheck={onRecheck} />)
    expect(screen.getByText('Falta uma IA para a equipe trabalhar.')).toBeTruthy()
    expect(screen.getByText(/Não encontrei nenhuma ferramenta de IA/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Conectar uma IA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conferir de novo' }))
    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })

  it('o motivo muda o texto (login pendente / cota) e mostra as mensagens guardadas', () => {
    const { rerender } = render(<EngineMissingBanner t={t} status={{ readiness: 'unavailable', reason: 'login_required', pending: 2 }} />)
    expect(screen.getByText(/falta entrar na sua conta/u)).toBeTruthy()
    expect(screen.getByText(/Mensagens guardadas: 2/u)).toBeTruthy()
    rerender(<EngineMissingBanner t={t} status={{ readiness: 'unavailable', reason: 'quota_exhausted', pending: 0 }} />)
    expect(screen.getByText(/A cota da IA acabou/u)).toBeTruthy()
    expect(screen.queryByText(/Mensagens guardadas/u)).toBeNull()
  })

  it('não aparece enquanto o host sonda, não sabe ou a IA está pronta (nunca afirma logout sem saber)', () => {
    for (const status of [
      { readiness: 'checking', reason: null, pending: 0 },
      { readiness: 'unknown', reason: null, pending: 0 },
      READY,
    ] as const) {
      const { container, unmount } = render(<EngineMissingBanner t={t} status={status} />)
      expect(container.textContent).toBe('')
      unmount()
    }
  })

  it('IA conecta com mensagens retidas: mostra "retomando" por alguns segundos e some', async () => {
    const { rerender, container } = render(
      <EngineMissingBanner t={t} status={{ readiness: 'unavailable', reason: 'none_connected', pending: 3 }} />,
    )
    rerender(<EngineMissingBanner t={t} status={READY} />)
    expect(screen.getByText('IA conectada. Retomando as mensagens guardadas: 3.')).toBeTruthy()
    await pass(ENGINE_RESUMED_NOTICE_MS + 50)
    expect(container.textContent).toBe('')
  })

  it('IA conecta sem nada retido: some sem aviso', () => {
    const { rerender, container } = render(<EngineMissingBanner t={t} status={NO_AI} />)
    rerender(<EngineMissingBanner t={t} status={READY} />)
    expect(container.textContent).toBe('')
  })
})

describe('ConnectedEngineBanner (FR-3: estado real do host)', () => {
  it('lê getEngineStatus, mostra a faixa e a retira quando a IA conecta (os retidos retomam)', async () => {
    const host = { state: 'unavailable', reason: 'none_connected', pending: 1 } as { state: string; reason: string | null; pending: number }
    const remote = {
      getEngineStatus: vi.fn(() => Promise.resolve({ ok: true as const, value: { ...host } })),
      retryEngine: vi.fn(() => Promise.resolve({ ok: true as const, value: { ...host } })),
    }
    render(<ConnectedEngineBanner t={t} engineRemote={remote} workspaceId="ws" projectId="pp" />)
    await pass()
    expect(screen.getByText('Falta uma IA para a equipe trabalhar.')).toBeTruthy()
    expect(screen.getByText(/Mensagens guardadas: 1/u)).toBeTruthy()

    host.state = 'ready'
    host.reason = null
    host.pending = 0
    await pass(4_100)
    expect(screen.queryByText('Falta uma IA para a equipe trabalhar.')).toBeNull()
    expect(screen.getByText('IA conectada. Retomando as mensagens guardadas: 1.')).toBeTruthy()
  })

  it('"Conferir de novo" força a checagem no host (retryEngine)', async () => {
    const remote = {
      getEngineStatus: vi.fn(() => Promise.resolve({ ok: true as const, value: { state: 'unavailable', reason: 'login_required', pending: 0 } })),
      retryEngine: vi.fn(() => Promise.resolve({ ok: true as const, value: { state: 'ready', reason: null, pending: 0 } })),
    }
    render(<ConnectedEngineBanner t={t} engineRemote={remote} workspaceId="ws" projectId="pp" />)
    await pass()
    fireEvent.click(screen.getByRole('button', { name: 'Conferir de novo' }))
    await pass()
    expect(remote.retryEngine).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp' })
    expect(screen.queryByText('Falta uma IA para a equipe trabalhar.')).toBeNull()
  })

  it('sem tenant ou host sem o método: não mostra nada nem quebra', async () => {
    const { container } = render(<ConnectedEngineBanner t={t} engineRemote={{}} workspaceId={undefined} projectId={undefined} />)
    await pass()
    expect(container.textContent).toBe('')
    const second = render(<ConnectedEngineBanner t={t} engineRemote={{}} workspaceId="ws" projectId="pp" />)
    await pass()
    expect(second.container.textContent).toBe('')
  })
})
