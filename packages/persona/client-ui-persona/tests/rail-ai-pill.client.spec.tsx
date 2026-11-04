// @vitest-environment jsdom
// A-5: a pílula do rodapé do rail diz o estado real da IA e o popover "Estou fora" ganha, no topo, a linha da IA com o
// botão certo ("Ver uso e limites" ou "Conectar uma IA"). Nada some: o interruptor "Estou fora" continua embaixo.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import type { MainPanelId } from '../src/client/shell/create-shell-store.ts'
import type { RailAiStatus } from '../src/client/shell/rail-ai-status.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

function setup(options: { ai?: RailAiStatus | undefined; host?: 'online' | 'offline' | 'unknown' } = {}) {
  const shell = createShellStore()
  if (options.host === 'online') shell.actions.setHostPing(true, 1)
  if (options.host === 'offline') shell.actions.setHostPing(false, null)
  const approvals = createSnapshotStore({ pending: 0 })
  const team = createSnapshotStore<readonly never[]>([])
  const revision = createSnapshotStore({ n: 0 })
  let aiSnapshot: RailAiStatus = options.ai ?? { kind: 'checking' }
  const aiListeners = new Set<() => void>()
  const aiStore = {
    getSnapshot: (): RailAiStatus => aiSnapshot,
    subscribe: (listener: () => void): (() => void) => { aiListeners.add(listener); return () => { aiListeners.delete(listener) } },
    set: (next: RailAiStatus): void => { aiSnapshot = next; for (const listener of [...aiListeners]) listener() },
  }
  const selectPanel = vi.fn<(id: MainPanelId) => void>()
  const view = render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(shell.store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={selectPanel}
      renderSlot={(() => null) as never}
      {...(options.ai === undefined ? {} : { railAi: { getSnapshot: () => aiStore.getSnapshot(), subscribe: (l: () => void) => aiStore.subscribe(l) } })}
    />,
  )
  return { ...view, aiStore, selectPanel }
}

const pill = (): HTMLElement => document.querySelector('button[aria-haspopup="dialog"]') as HTMLElement

describe('pílula de estado do rodapé (A-5)', () => {
  it('IA pronta com cota: "Claude · 82% livre", ponto de estado "online"', () => {
    setup({ host: 'online', ai: { kind: 'ready', engine: 'Claude', freePct: 82, limited: false } })
    expect(screen.getByRole('button', { name: 'Claude · 82% livre' })).toBe(pill())
    expect(pill().getAttribute('data-status')).toBe('online')
  })

  it('pouca folga: o mesmo texto, ponto em warning', () => {
    setup({ host: 'online', ai: { kind: 'ready', engine: 'Claude', freePct: 12, limited: false } })
    expect(pill().getAttribute('aria-label')).toBe('Claude · 12% livre')
    expect(pill().getAttribute('data-status')).toBe('warning')
  })

  it('sem IA: "Sem IA conectada · Conectar" em warning', () => {
    setup({ host: 'online', ai: { kind: 'unavailable' } })
    expect(pill().getAttribute('aria-label')).toBe('Sem IA conectada · Conectar')
    expect(pill().getAttribute('data-status')).toBe('warning')
  })

  it('conferindo: "Conferindo a IA…", ponto lilás (pending) e nunca "Sem IA"', () => {
    setup({ host: 'online', ai: { kind: 'checking' } })
    expect(pill().getAttribute('aria-label')).toBe('Conferindo a IA…')
    expect(pill().getAttribute('data-status')).toBe('pending')
  })

  it('equipe fora do ar vence a IA; sem fonte de IA a pílula diz "Conectado" como antes', () => {
    setup({ host: 'offline', ai: { kind: 'ready', engine: 'Claude', freePct: 82, limited: false } })
    expect(pill().getAttribute('data-status')).toBe('offline')
    cleanup()
    setup({ host: 'online' })
    expect(pill().getAttribute('aria-label')).toBe('Conectado')
  })

  it('o texto da pílula acompanha o estado quando o host muda', () => {
    const { aiStore } = setup({ host: 'online', ai: { kind: 'checking' } })
    expect(pill().getAttribute('aria-label')).toBe('Conferindo a IA…')
    act(() => { aiStore.set({ kind: 'ready', engine: 'Codex', freePct: null, limited: false }) })
    expect(pill().getAttribute('aria-label')).toBe('Codex · —')
  })
})

describe('popover da pílula', () => {
  it('com IA: linha do estado + "Ver uso e limites" abre Uso e limites e fecha o popover; "Estou fora" segue embaixo', () => {
    const { selectPanel } = setup({ host: 'online', ai: { kind: 'ready', engine: 'Claude', freePct: 82, limited: false } })
    fireEvent.click(pill())
    const dialog = screen.getByRole('dialog', { name: 'Estou fora' })
    expect(within(dialog).getByText('Claude · 82% livre')).toBeTruthy()
    expect(within(dialog).getByRole('switch', { name: 'Estou fora' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver uso e limites' }))
    expect(selectPanel).toHaveBeenCalledWith('usage')
    expect(screen.queryByRole('dialog', { name: 'Estou fora' })).toBeNull()
  })

  it('sem IA: "Sem IA conectada" + "Conectar uma IA" abre Conexões', () => {
    const { selectPanel } = setup({ host: 'online', ai: { kind: 'unavailable' } })
    fireEvent.click(pill())
    const dialog = screen.getByRole('dialog', { name: 'Estou fora' })
    expect(within(dialog).getByText('Sem IA conectada')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Conectar uma IA' }))
    expect(selectPanel).toHaveBeenCalledWith('connections')
  })

  it('conferindo: a linha aparece sem botão (não há para onde levar ainda)', () => {
    setup({ host: 'online', ai: { kind: 'checking' } })
    fireEvent.click(pill())
    const dialog = screen.getByRole('dialog', { name: 'Estou fora' })
    expect(within(dialog).getByText('Conferindo a IA…')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /uso e limites|Conectar uma IA/u })).toBeNull()
  })

  it('equipe fora do ar ou sem fonte de IA: sem linha da IA, só o "Estou fora"', () => {
    setup({ host: 'offline', ai: { kind: 'ready', engine: 'Claude', freePct: 82, limited: false } })
    fireEvent.click(pill())
    expect(document.querySelector('[data-persona-rail-ai]')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Estou fora' })).toBeTruthy()
  })

  it('Esc fecha e devolve o foco à pílula (teclado completo)', () => {
    setup({ host: 'online', ai: { kind: 'unavailable' } })
    fireEvent.click(pill())
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Estou fora' })).toBeNull()
    expect(document.activeElement).toBe(pill())
  })
})

describe('cota indisponível: o "—" explicado (Muse, A-5)', () => {
  const quiet = { kind: 'ready', engine: 'Claude', freePct: null, limited: false } as const

  it('tooltip da pílula com a frase da Muse quando a cota oficial ainda não existe', () => {
    vi.useFakeTimers()
    setup({ host: 'online', ai: quiet })
    expect(pill().getAttribute('aria-label')).toBe('Claude · —')
    fireEvent.focus(pill())
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').textContent).toBe('A cota oficial do Claude ainda não está disponível.')
    vi.useRealTimers()
  })

  it('com o popover aberto não há tooltip (ele já diz a mesma frase) e o foco fica na pílula; fechado, volta', () => {
    vi.useFakeTimers()
    setup({ host: 'online', ai: quiet })
    fireEvent.focus(pill())
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.click(pill())
    expect(screen.getByRole('dialog', { name: 'Estou fora' })).toBeTruthy()
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerLeave(pill().parentElement as HTMLElement)
    fireEvent.pointerEnter(pill().parentElement as HTMLElement)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Estou fora' })).toBeNull()
    fireEvent.pointerLeave(pill().parentElement as HTMLElement)
    fireEvent.pointerEnter(pill().parentElement as HTMLElement)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').textContent).toBe('A cota oficial do Claude ainda não está disponível.')
    vi.useRealTimers()
  })

  it('a mesma frase na linha do estado do popover, com o link "Ver uso e limites"', () => {
    setup({ host: 'online', ai: quiet })
    fireEvent.click(pill())
    const dialog = screen.getByRole('dialog', { name: 'Estou fora' })
    expect(within(dialog).getByText('Claude · —')).toBeTruthy()
    expect(within(dialog).getByText('A cota oficial do Claude ainda não está disponível.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Ver uso e limites' })).toBeTruthy()
  })

  it('com a cota publicada a frase some e o tooltip não existe (vira "{n}% livre" sozinho)', () => {
    const { aiStore } = setup({ host: 'online', ai: quiet })
    act(() => { aiStore.set({ kind: 'ready', engine: 'Claude', freePct: 82, limited: false }) })
    expect(pill().getAttribute('aria-label')).toBe('Claude · 82% livre')
    fireEvent.focus(pill())
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(pill())
    expect(screen.queryByText('A cota oficial do Claude ainda não está disponível.')).toBeNull()
  })

  it('sem IA, conferindo ou equipe fora do ar: nenhuma frase de cota', () => {
    setup({ host: 'online', ai: { kind: 'unavailable' } })
    fireEvent.click(pill())
    expect(screen.queryByText(/cota oficial/u)).toBeNull()
  })
})
