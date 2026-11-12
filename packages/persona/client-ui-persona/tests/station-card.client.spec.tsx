// @vitest-environment jsdom
// Colheita item 24 · o cartão Estação de Agentes: pareada/ligada, Windows acordado só com trabalho, RAM, Tailscale, código de
// pareamento e as ações (conectar, parear, ligar/desligar).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StationCard, type StationCardProps, type StationViewUi } from '../src/client/station/StationCard.tsx'
import { pt as stationPt } from '../src/client/locale/station/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(stationPt, key, params)) as StationCardProps['t']

const VIEW: StationViewUi = {
  paired: true,
  power: 'segurando',
  running: true,
  ram: { freeBytes: 8 * 1024 ** 3, floorBytes: 1.5 * 1024 ** 3, perCliBytes: 600 * 1024 ** 2 },
  queue: 2,
  clis: 1,
  tailscale: { state: 'ativo', address: '100.64.0.1', line: 'O Tailscale está ligado neste computador.' },
}

function card(extra: Partial<StationCardProps> = {}): StationCardProps {
  return {
    state: 'ready',
    view: VIEW,
    onIssue: vi.fn(async () => undefined),
    onPair: vi.fn(async () => undefined),
    onToggle: vi.fn(async () => undefined),
    t,
    ...extra,
  }
}

describe('StationCard', () => {
  it('shows the station state, the RAM and the queue', () => {
    render(<StationCard {...card()} />)
    expect(screen.getByText('Computador dedicado pareado')).toBeTruthy()
    expect(screen.getByText('Ligada')).toBeTruthy()
    expect(screen.getByText('O Windows fica acordado enquanto há trabalho')).toBeTruthy()
    expect(screen.getByText('Memória livre: 8.0 GB')).toBeTruthy()
    expect(screen.getByText('2 na fila')).toBeTruthy()
    expect(screen.getByText('1 trabalhando agora')).toBeTruthy()
  })

  it('offers the Tailscale install only when it is missing', () => {
    const onInstall = vi.fn()
    render(<StationCard {...card({ view: { ...VIEW, tailscale: { state: 'ausente', line: 'O Tailscale não está instalado.' } }, onInstallTailscale: onInstall })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Instalar Tailscale' }))
    expect(onInstall).toHaveBeenCalledOnce()
    cleanup()
    render(<StationCard {...card()} />)
    expect(screen.queryByRole('button', { name: 'Instalar Tailscale' })).toBeNull()
  })

  it('shows the issued code once and pairs with what was typed', async () => {
    const props = card({ code: { code: 'ABCD-EFGH', expiresAt: '2026-11-12T01:20:00.000Z' } })
    render(<StationCard {...props} />)
    expect(screen.getByText('ABCD-EFGH')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Código da máquina'), { target: { value: 'WXYZ-2345' } })
    fireEvent.submit(screen.getByLabelText('Código da máquina').closest('form') as HTMLFormElement)
    await waitFor(() => { expect(props.onPair).toHaveBeenCalledWith('WXYZ-2345') })
  })

  it('turns the station off from the same button that turns it on', async () => {
    const props = card()
    render(<StationCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }))
    await waitFor(() => { expect(props.onToggle).toHaveBeenCalledWith(false) })
  })

  it('shows the host refusal in words', async () => {
    const props = card({ onPair: vi.fn(async () => { throw new Error('esse código venceu; gere outro no seu computador') }) })
    render(<StationCard {...props} />)
    fireEvent.change(screen.getByLabelText('Código da máquina'), { target: { value: 'AAAA-AAAA' } })
    fireEvent.submit(screen.getByLabelText('Código da máquina').closest('form') as HTMLFormElement)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/venceu/u) })
  })
})
