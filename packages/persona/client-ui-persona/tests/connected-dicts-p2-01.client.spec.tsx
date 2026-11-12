// @vitest-environment jsdom
// COLHEITA-S1 · P2-01 parte B (Keel 05:53/06:02): o painel conectado usa o dicionário que o slot entrega (ctx.locale), não o pt
// fixo do próprio componente. Vermelho primeiro: com o dicionário em inglês, o painel ainda mostra o pt.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedCofre } from '../src/client/cofre/ConnectedCofre.tsx'
import { ConnectedStation } from '../src/client/station/ConnectedStation.tsx'
import { en as cofreEn } from '../src/client/locale/cofre/locales.ts'
import { en as stationEn } from '../src/client/locale/station/locales.ts'
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

const noop = (() => undefined) as never

describe('P2-01 · painéis conectados leem o dicionário do slot', () => {
  it('Estação: com o dicionário em inglês, o estado "pareado" sai em inglês', async () => {
    const persona = {
      stationView: vi.fn(async () => ({ ok: true, value: VIEW })),
      issueStationCode: vi.fn(async () => ({ ok: true, value: { code: 'ABCD-EFGH', expiresAt: '2026-11-12T02:10:00.000Z' } })),
      pairStation: vi.fn(async () => ({ ok: true, value: { ok: true, line: 'computador dedicado pareado' } })),
      setStationRunning: vi.fn(async () => ({ ok: true, value: VIEW })),
    }
    render(<ConnectedStation persona={persona as never} useTenant={noop} useShell={noop} dicts={{ station: stationEn }} />)
    await waitFor(() => { expect(screen.getByText(stationEn['state.paired'])).toBeTruthy() })
    expect(screen.queryByText('Computador dedicado pareado')).toBeNull()
  })

  it('Cofre: com o dicionário em inglês, o título da tela sai em inglês', async () => {
    const persona = {
      listCofreEntries: vi.fn(async () => ({ ok: true, value: [] })),
      listCofreCodes: vi.fn(async () => ({ ok: true, value: [] })),
    }
    render(<ConnectedCofre persona={persona as never} useTenant={noop} useShell={noop} dicts={{ cofre: cofreEn }} />)
    await waitFor(() => { expect(screen.getByRole('heading', { name: cofreEn['card.title'] })).toBeTruthy() })
    expect(screen.queryByRole('heading', { name: 'Cofre' })).toBeNull()
  })
})
