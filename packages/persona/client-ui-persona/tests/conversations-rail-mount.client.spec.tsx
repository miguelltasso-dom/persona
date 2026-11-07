// @vitest-environment jsdom
// CV-1: a barra única montada no PersonaSidebar, atrás da flag do A-1. Flag ligada + conversas injetadas = lugares compactos e a
// barra de Canais/Pessoas no lugar da faixa "Sua equipe"; qualquer outro caso = o rail de antes.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'
import type { ConversationTarget } from '../src/client/shell/conversation-selection.ts'
import type { RailPersona } from '../src/client/shell/RailTeam.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

const TEAM: readonly RailPersona[] = [
  { id: 'nina', characterId: 'nina', name: 'Nina', role: 'Pesquisa', state: 'working', unread: 0 },
]

const SOURCE: ConversationsSource = {
  channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }],
  people: [{ id: 'nina', name: 'Nina', role: 'Pesquisa', characterId: 'nina', state: 'working', teamId: null, teamName: null, unread: 0, hasConversation: true, recentRank: 0 }],
}

function observable<T>(initial: T): HostObservable<T> & { set: (next: T) => void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next) => { value = next; for (const listener of [...listeners]) listener() },
  }
}

function rail(extra: { conversations?: ConversationsSource | null; active?: ConversationTarget | null; selectPanel?: (panel: never) => void } = {}) {
  const { store } = createShellStore()
  const approvals = createSnapshotStore({ pending: 0 })
  const team = createSnapshotStore<readonly RailPersona[]>(TEAM)
  const revision = createSnapshotStore({ n: 0 })
  const openConversation = vi.fn()
  const selectPanel = extra.selectPanel ?? vi.fn()
  const conversations = extra.conversations === null ? undefined : observable(extra.conversations ?? SOURCE)
  const active = observable<ConversationTarget | null>(extra.active ?? null)
  const view = render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={selectPanel as never}
      renderSlot={(() => null) as never}
      openConversation={openConversation}
      activeConversation={active}
      {...(conversations === undefined ? {} : { conversations })}
    />,
  )
  return { ...view, openConversation, selectPanel, active, conversations }
}

describe('flag do A-1 LIGADA + conversas injetadas: a barra única', () => {
  beforeEach(() => { localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })

  it('mostra Canais e Pessoas e NÃO a faixa "Sua equipe" (ela se fundiu na barra)', () => {
    const { container } = rail()
    expect(container.querySelector('[data-persona-conversations]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Canais' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pessoas' })).toBeTruthy()
    expect(screen.queryByText('Sua equipe')).toBeNull()
  })

  it('os lugares ficam compactos e sem "Conversas" (cinco)', () => {
    const { container } = rail()
    expect(container.querySelector('#persona-nav-places')?.hasAttribute('data-compact')).toBe(true)
    expect([...container.querySelectorAll('[data-nav-place]')].map(node => node.getAttribute('data-nav-place')))
      .toEqual(['overview', 'projects', 'approvals', 'team', 'memory'])
    expect(screen.queryByRole('button', { name: /^Conversas/u })).toBeNull()
  })

  it('clicar numa pessoa ou no canal chama openConversation (1 clique)', () => {
    const { openConversation, container } = rail()
    fireEvent.click(container.querySelector('[data-persona-id="nina"]') as HTMLElement)
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'nina' })
    fireEvent.click(screen.getByText('geral'))
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'channel', id: 'ch-geral' })
  })

  it('a linha ativa segue a conversa aberta (observável) e nenhum lugar fica marcado', () => {
    const { container, active } = rail({ active: { kind: 'dm', personaId: 'nina' } })
    expect(container.querySelector('[data-persona-id="nina"]')?.getAttribute('aria-current')).toBe('page')
    act(() => { active.set({ kind: 'channel', id: 'ch-geral' }) })
    expect(container.querySelector('[data-persona-id="nina"]')?.hasAttribute('aria-current')).toBe(false)
    expect(container.querySelector('[data-conversation-kind="channel"]')?.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('[data-nav-place][aria-current="page"]')).toBeNull()
  })

  it('"Organizar a equipe" abre Quem cuida de quem (orgChart)', () => {
    const noTeam = Array.from({ length: 10 }, (_, i): ConversationsSource['people'][number] => ({
      id: `p${String(i)}`, name: `P${String(i)}`, role: 'Engenharia', teamId: null, teamName: null, unread: 0, hasConversation: false,
    }))
    const selectPanel = vi.fn()
    rail({ conversations: { channels: [], people: noTeam }, selectPanel })
    const head = screen.getAllByRole('button').find(button => button.hasAttribute('aria-expanded') && (button.textContent ?? '').startsWith('Sem equipe definida'))
    fireEvent.click(head as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Organizar a equipe' }))
    expect(selectPanel).toHaveBeenCalledWith('orgChart')
  })
})

describe('qualquer outro caso: o rail de antes', () => {
  it('flag LIGADA mas sem as conversas injetadas (preview, testes): a faixa "Sua equipe" continua', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    const { container } = rail({ conversations: null })
    expect(container.querySelector('[data-persona-conversations]')).toBeNull()
    expect(screen.getByText('Sua equipe')).toBeTruthy()
    // os lugares não ficam compactos sem a barra
    expect(container.querySelector('#persona-nav-places')?.hasAttribute('data-compact')).toBe(false)
  })

  it('flag DESLIGADA, mesmo com as conversas injetadas: o rail antigo, sem barra e sem lugares', () => {
    const { container } = rail()
    expect(container.querySelector('[data-persona-conversations]')).toBeNull()
    expect(container.querySelector('[data-nav-place]')).toBeNull()
    expect(container.querySelector('[data-nav-panel="channels"]')).toBeTruthy()
    expect(container.querySelector('[data-nav-panel="directMessages"]')).toBeTruthy()
  })
})
