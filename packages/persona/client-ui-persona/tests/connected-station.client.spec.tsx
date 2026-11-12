// @vitest-environment jsdom
// Colheita item 24 · o painel conectado da Estação de Agentes: carrega a view do host, mostra o estado e pede o código.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedStation } from '../src/client/station/ConnectedStation.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

vi.mock('../src/client/data/use-remote-project-scope.ts', () => ({
  useRemoteProjectScope: () => ({ scope: { workspaceId: 'ws', projectId: 'pp' }, gate: 'ready', retryBootstrap: () => undefined }),
}))

installPreviewTheme()
afterEach(cleanup)

const VIEW = {
  paired: true,
  power: 'livre',
  running: true,
  ram: { freeBytes: 8 * 1024 ** 3, floorBytes: 1.5 * 1024 ** 3, perCliBytes: 600 * 1024 ** 2 },
  queue: 0,
  clis: 0,
  tailscale: { state: 'ativo', line: 'O Tailscale está ligado neste computador.' },
} as const

function remote() {
  return {
    stationView: vi.fn(async () => ({ ok: true, value: VIEW })),
    issueStationCode: vi.fn(async () => ({ ok: true, value: { code: 'ABCD-EFGH', expiresAt: '2026-11-12T02:10:00.000Z' } })),
    pairStation: vi.fn(async () => ({ ok: true, value: { ok: true, line: 'computador dedicado pareado' } })),
    setStationRunning: vi.fn(async () => ({ ok: true, value: VIEW })),
  }
}

describe('ConnectedStation', () => {
  it('loads the station view and shows it', async () => {
    const persona = remote()
    render(<ConnectedStation persona={persona as never} useTenant={(() => undefined) as never} useShell={(() => undefined) as never} />)
    await waitFor(() => { expect(screen.getByText('Computador dedicado pareado')).toBeTruthy() })
    expect(persona.stationView).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp' })
  })

  it('asks the host for a code and shows it once', async () => {
    const persona = remote()
    render(<ConnectedStation persona={persona as never} useTenant={(() => undefined) as never} useShell={(() => undefined) as never} />)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Conectar computador dedicado' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar computador dedicado' }))
    await waitFor(() => { expect(screen.getByText('ABCD-EFGH')).toBeTruthy() })
  })
})
