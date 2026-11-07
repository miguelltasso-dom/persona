// @vitest-environment jsdom
// IV-4 = P0-28: o /limites e a gaveta mostram as cotas OFICIAIS (as mesmas do Uso); sem dado, "—" e "Cota oficial
// indisponível"; nunca um número de exemplo (38%, 66%, "18:30", 42%, "Trabalho"/"Pessoal" inventados).
import type { ConnectionView, OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { EngineLimitsBars } from '../src/client/chat/EngineLimitsBars.tsx'
import { TurnContextDrawer } from '../src/client/chat/TurnContextDrawer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import {
  ENGINE_LIMITS_LOADING,
  ENGINE_LIMITS_UNAVAILABLE,
  deriveEngineLimits,
  loadEngineLimits,
  type EngineLimitsUi,
} from '../src/client/remote/engine-limits.ts'
import { useEngineLimits } from '../src/client/remote/use-engine-limits.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup(); localStorage.clear() })

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never
const scope = { workspaceId: 'ws', projectId: 'p' }

const connection = (kind: ConnectionView['kind'], extra: Partial<ConnectionView> = {}): ConnectionView => ({
  id: kind, kind, available: true, loggedIn: true, loginHint: '', phase: 'ready', ...extra,
})
const quota = (provider: string, windows: { id: string; usedPercent?: number; resetsAt?: string }[], extra: Partial<OfficialQuotaView> = {}): OfficialQuotaView => ({
  provider,
  origin: 'official' as never,
  windows: windows.map(window => ({ origin: 'official' as never, ...window })),
  ...extra,
})

describe('deriveEngineLimits', () => {
  it('motor pronto com as duas janelas: 5 horas e semana, na ordem das contas', () => {
    const limits = deriveEngineLimits([connection('claude')], [
      quota('claude', [{ id: '5h', usedPercent: 40 }, { id: 'week', usedPercent: 10 }], { accountId: 'a', accountLabel: 'Trabalho' }),
    ])
    expect(limits).toMatchObject({ state: 'ready', engine: 'Claude' })
    if (limits.state !== 'ready') return
    expect(limits.fiveHour).toEqual([expect.objectContaining({ id: 'a', label: 'Trabalho', leftPct: 60 })])
    expect(limits.week).toEqual([expect.objectContaining({ id: 'a', leftPct: 90 })])
  })

  it('só olha as cotas do motor em uso (outro provedor não entra)', () => {
    const limits = deriveEngineLimits([connection('claude')], [quota('codex', [{ id: '5h', usedPercent: 5 }]), quota('claude', [{ id: '5h', usedPercent: 70 }])])
    if (limits.state !== 'ready') throw new Error('pronto esperado')
    expect(limits.fiveHour.map(account => account.leftPct)).toEqual([30])
  })

  it('conta de cota única sem apelido leva o nome do motor, nunca "default"', () => {
    const limits = deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h', usedPercent: 25 }])])
    if (limits.state !== 'ready') throw new Error('pronto esperado')
    expect(limits.fiveHour[0]?.label).toBe('Claude')
  })

  it('sem cota publicada, sem janela com número ou sem motor pronto: indisponível (nada inventado)', () => {
    expect(deriveEngineLimits([connection('claude')], [])).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(deriveEngineLimits([connection('claude')], null)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h' }])])).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(deriveEngineLimits([], [quota('claude', [{ id: '5h', usedPercent: 1 }])])).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(deriveEngineLimits(null, null)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(deriveEngineLimits([connection('claude', { loggedIn: false })], [quota('claude', [{ id: '5h', usedPercent: 1 }])])).toEqual(ENGINE_LIMITS_UNAVAILABLE)
  })

  it('só uma janela publicada: a outra fica sem número (a barra não a desenha)', () => {
    const limits = deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h', usedPercent: 50 }])])
    if (limits.state !== 'ready') throw new Error('pronto esperado')
    expect(limits.week.some(account => account.leftPct !== undefined)).toBe(false)
  })
})

describe('loadEngineLimits', () => {
  it('lê conexões e cota do host', async () => {
    const remote = {
      listConnections: vi.fn(() => [connection('claude')]),
      getOfficialQuota: vi.fn(() => [quota('claude', [{ id: '5h', usedPercent: 20 }])]),
    }
    const limits = await loadEngineLimits(remote, scope)
    expect(limits).toMatchObject({ state: 'ready', engine: 'Claude' })
    expect(remote.getOfficialQuota).toHaveBeenCalledWith(scope)
  })

  it('host sem os métodos, sem escopo ou com falha: indisponível, sem lançar', async () => {
    expect(await loadEngineLimits(undefined, scope)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(await loadEngineLimits({}, scope)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(await loadEngineLimits({ listConnections: () => [connection('claude')], getOfficialQuota: () => [] }, null)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
    expect(await loadEngineLimits({
      listConnections: () => { throw new Error('ocupado') },
      getOfficialQuota: () => Promise.reject(new Error('sem cota')),
    }, scope)).toEqual(ENGINE_LIMITS_UNAVAILABLE)
  })
})

describe('EngineLimitsBars', () => {
  const FAKE_NUMBERS = /38%|66%|42%|18:30|Trabalho|Pessoal/u

  it('sem dado: "—" e "Este motor não informa a cota.", sem nenhum número de exemplo', () => {
    const { container } = render(<EngineLimitsBars t={t} limits={ENGINE_LIMITS_UNAVAILABLE} />)
    expect(screen.getByText('Este motor não informa a cota.')).toBeTruthy()
    expect(container.textContent).toContain('—')
    expect(container.textContent).not.toMatch(FAKE_NUMBERS)
    expect(container.textContent).not.toMatch(/\d+%/u)
  })

  it('lendo: esqueletos, sem texto e marcado como ocupado', () => {
    const { container } = render(<EngineLimitsBars t={t} limits={ENGINE_LIMITS_LOADING} />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(container.textContent).toBe('')
  })

  it('com dado: mostra a janela e o número REAL (62% sobrando), e só as janelas que o provedor publicou', () => {
    const limits: EngineLimitsUi = deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h', usedPercent: 38 }])])
    const { container } = render(<EngineLimitsBars t={t} limits={limits} />)
    expect(container.textContent).toContain('5 horas')
    expect(container.textContent).toContain('62% sobrando')
    expect(container.textContent).not.toContain('Semana')
    expect(container.textContent).not.toMatch(/Trabalho|Pessoal|66%|42%/u)
  })

  it('com as duas janelas: 5 horas e Semana', () => {
    const limits = deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h', usedPercent: 10 }, { id: 'week', usedPercent: 55 }])])
    const { container } = render(<EngineLimitsBars t={t} limits={limits} />)
    expect(container.textContent).toContain('5 horas')
    expect(container.textContent).toContain('Semana')
    expect(container.textContent).toContain('90% sobrando')
    expect(container.textContent).toContain('45% sobrando')
  })
})

describe('useEngineLimits', () => {
  function Probe({ remote, withScope = true }: { readonly remote: Parameters<typeof useEngineLimits>[0]; readonly withScope?: boolean }) {
    const { limits, load } = useEngineLimits(remote, withScope ? scope : null)
    return (
      <div>
        <span data-testid="state">{limits.state}</span>
        <button type="button" onClick={load}>ler</button>
      </div>
    )
  }

  it('não consulta o host até pedir; ao pedir mostra "lendo" e depois o resultado', async () => {
    let release: (value: readonly ConnectionView[]) => void = () => {}
    const listConnections = vi.fn(() => new Promise<readonly ConnectionView[]>((resolve) => { release = resolve }))
    const getOfficialQuota = vi.fn(() => [quota('claude', [{ id: '5h', usedPercent: 10 }])])
    render(<Probe remote={{ listConnections, getOfficialQuota }} />)
    expect(screen.getByTestId('state').textContent).toBe('unavailable')
    expect(listConnections).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'ler' }))
    expect(screen.getByTestId('state').textContent).toBe('loading')
    await act(async () => { release([connection('claude')]); await Promise.resolve() })
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('ready') })
  })

  it('sem remote ou sem escopo continua indisponível, sem consultar nada', () => {
    const getOfficialQuota = vi.fn(() => [])
    render(<Probe remote={undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'ler' }))
    expect(screen.getByTestId('state').textContent).toBe('unavailable')
    cleanup()
    render(<Probe remote={{ getOfficialQuota }} withScope={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'ler' }))
    expect(screen.getByTestId('state').textContent).toBe('unavailable')
    expect(getOfficialQuota).not.toHaveBeenCalled()
  })

  it('uma leitura mais nova vale mais que a antiga (resposta atrasada não sobrescreve)', async () => {
    const resolvers: ((value: readonly ConnectionView[]) => void)[] = []
    const listConnections = vi.fn(() => new Promise<readonly ConnectionView[]>((resolve) => { resolvers.push(resolve) }))
    const getOfficialQuota = vi.fn(() => [quota('claude', [{ id: '5h', usedPercent: 10 }])])
    render(<Probe remote={{ listConnections, getOfficialQuota }} />)
    fireEvent.click(screen.getByRole('button', { name: 'ler' }))
    fireEvent.click(screen.getByRole('button', { name: 'ler' }))
    await act(async () => { resolvers[1]?.([connection('claude')]); await Promise.resolve() })
    await waitFor(() => { expect(screen.getByTestId('state').textContent).toBe('ready') })
    await act(async () => { resolvers[0]?.([]); await Promise.resolve() })
    expect(screen.getByTestId('state').textContent).toBe('ready')
  })
})

describe('ligação nas telas: /limites e gaveta mostram o dado real ou "indisponível"', () => {
  const FAKE = /38%|66%|42%|18:30|Trabalho|Pessoal/u
  const ready = deriveEngineLimits([connection('claude')], [quota('claude', [{ id: '5h', usedPercent: 38 }])])

  function composer(props: Partial<React.ComponentProps<typeof ChannelComposer>> = {}) {
    localStorage.setItem('persona.hint.whoResponds', '1')
    render(<ChannelComposer t={t} members={[]} {...props} />)
    const field = screen.getByPlaceholderText(chatPt['composer.placeholderChannel'])
    fireEvent.change(field, { target: { value: '/limites', selectionStart: 8 } })
    fireEvent.keyDown(field, { key: 'Enter' })
    return screen.getByRole('region', { name: chatPt['composer.limitsPanelTitle'] })
  }

  it('/limites sem fonte de dados: "—" e "Este motor não informa a cota.", sem nenhum número de exemplo', () => {
    const panel = composer()
    expect(panel.textContent).toContain('Este motor não informa a cota.')
    expect(panel.textContent).not.toMatch(FAKE)
  })

  it('/limites com o dado real do host: mostra o número real e avisa quem monta a tela para ler as cotas', () => {
    const onOpenLimits = vi.fn()
    const panel = composer({ engineLimits: ready, onOpenLimits })
    expect(onOpenLimits).toHaveBeenCalledTimes(1)
    expect(panel.textContent).toContain('62% sobrando')
    expect(panel.textContent).not.toMatch(/66%|42%|Trabalho|Pessoal/u)
  })

  it('a gaveta "Contexto usado" usa o mesmo dado: indisponível por padrão, real quando chega', () => {
    const context = { ticketId: 't1', title: 'Pesquisa de preços', triggerIds: [], records: [] }
    const { container, rerender } = render(<TurnContextDrawer t={t} context={context} />)
    expect(container.textContent).toContain('Este motor não informa a cota.')
    expect(container.textContent).not.toMatch(FAKE)
    rerender(<TurnContextDrawer t={t} context={context} limits={ready} />)
    expect(container.textContent).toContain('62% sobrando')
    expect(container.textContent).not.toMatch(/42%|18:30|Trabalho/u)
  })
})
