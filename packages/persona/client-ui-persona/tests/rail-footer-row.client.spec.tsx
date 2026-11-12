// @vitest-environment jsdom
// DESIGN-01-MUSE §1.0.4 (rodapé do rail assimétrico): UMA fileira de 3 alvos de 40 px — Configurações (ícone + rótulo), a luminária no
// centro (decorativa, `aria-hidden`, ela NÃO sai: é a fonte da luz do escuro) e Ajuda com o "?" (e não o livro) — com 8 px entre eles.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { cleanup, render } from '@testing-library/react'
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

const SHELL_CSS = readFileSync(join(import.meta.dirname, '../src/client/shell/PersonaSidebar.module.css'), 'utf8').replaceAll('\r\n', '\n')
const LAUNCHER_CSS = readFileSync(join(import.meta.dirname, '../src/client/shell/SettingsLauncher.module.css'), 'utf8').replaceAll('\r\n', '\n')

beforeEach(() => { localStorage.clear(); localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

const SOURCE: ConversationsSource = {
  channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }],
  people: [{ id: 'nina', name: 'Nina', role: 'Pesquisa', characterId: 'nina', state: 'working', teamId: null, teamName: null, unread: 0, hasConversation: true, recentRank: 0 }],
}

function observable<T>(initial: T): HostObservable<T> {
  return { getSnapshot: () => initial, subscribe: () => () => undefined }
}

function mount(): void {
  const { store } = createShellStore()
  const approvals = createSnapshotStore({ pending: 0 })
  const team = createSnapshotStore<readonly RailPersona[]>([])
  const revision = createSnapshotStore({ n: 0 })
  render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={vi.fn() as never}
      renderSlot={((name: string) => (name === 'sidebar.settings' ? <button type="button" data-testid="settings-btn">Configurações</button> : null)) as never}
      openConversation={vi.fn()}
      activeConversation={observable<ConversationTarget | null>(null)}
      conversations={observable(SOURCE)}
    />,
  )
}

/** The block of one CSS rule (the first rule whose selector is exactly `selector`), or '' when there is none. */
const rule = (selector: string): string => {
  const start = SHELL_CSS.search(new RegExp(`^${selector.replace(/[.[\]()]/gu, '\\$&')}\\s*\\{`, 'mu'))
  if (start < 0) return ''
  return SHELL_CSS.slice(SHELL_CSS.indexOf('{', start) + 1, SHELL_CSS.indexOf('}', start))
}

describe('rodapé do rail: uma fileira de 3 alvos de 40 px', () => {
  it('na barra aberta: Configurações, a luminária (decorativa) no centro e Ajuda, nesta ordem, na MESMA fileira', () => {
    mount()
    const row = document.querySelector('[data-rail-foot-row]') as HTMLElement
    expect(row).not.toBeNull()
    const kids = [...row.children] as HTMLElement[]
    expect(kids).toHaveLength(3)
    expect(kids[0]?.querySelector('[data-testid="settings-btn"]')).not.toBeNull()
    expect(kids[1]?.hasAttribute('data-persona-lamp-seat')).toBe(true)
    expect(kids[1]?.getAttribute('aria-hidden')).toBe('true')
    expect(kids[1]?.textContent).toBe('')
    // O Tooltip pode envolver o botão: a Ajuda é o último item da fileira, ele mesmo ou dentro do invólucro do tooltip.
    expect(kids[2]?.matches('[data-nav-panel="help"]') === true || kids[2]?.querySelector('[data-nav-panel="help"]') != null).toBe(true)
  })

  it('a Ajuda é o "?" (ícone help), com o nome e o atalho de sempre', () => {
    mount()
    const help = document.querySelector('[data-nav-panel="help"]') as HTMLElement
    expect(help.getAttribute('data-nav-icon')).toBe('help')
    expect(help.getAttribute('aria-label')).toBe(shellPt['sidebar.helpShortcuts'])
    expect(help.getAttribute('aria-keyshortcuts')).toBe('?')
  })

  it('a luminária fica fora da ordem de foco e da árvore de acessibilidade (nunca é um botão)', () => {
    mount()
    const seat = document.querySelector('[data-persona-lamp-seat]') as HTMLElement
    expect(seat.tagName).toBe('SPAN')
    expect(seat.hasAttribute('tabindex')).toBe(false)
    expect(seat.querySelector('button, a, [role]')).toBeNull()
  })

  it('o CSS: alvos de 40 px, 8 px entre eles, a luminária também 40 px', () => {
    expect(rule('.footActions')).toMatch(/gap:\s*var\(--persona-space-2\)\s*;/u)
    expect(rule('.helpButton')).toMatch(/width:\s*40px\s*;/u)
    expect(rule('.helpButton')).toMatch(/height:\s*40px\s*;/u)
    expect(rule('.lampSeat')).toMatch(/width:\s*40px\s*;/u)
    expect(rule('.lampSeat')).toMatch(/height:\s*40px\s*;/u)
    expect(LAUNCHER_CSS).toMatch(/\.button\s*\{[^}]*min-height:\s*40px\s*;/u)
  })

  it('os três alvos ficam lado a lado com os MESMOS 8 px entre eles: Configurações não estica (senão sobram 41 px antes da luminária)', () => {
    expect(rule('.footActions[data-rail-foot-row] .settingsSlot')).toMatch(/flex:\s*0 0 auto\s*;/u)
  })

  it('o rail de 64 px: o texto da pílula sai do fluxo da grade, então o ponto fica centrado e não colado na borda de cima (Carbon, quill-b7 #6)', () => {
    const text = rule('.sidebar[data-conversations][data-collapsed] .hostStatusText')
    expect(text).toMatch(/position:\s*absolute\s*;/u)
    expect(text).toMatch(/clip:\s*rect\(0 0 0 0\)\s*;/u)
    expect(text).not.toMatch(/display:\s*none/u)
  })

  it('janela baixa: sem folhagem, sem luminária (o assento some junto)', () => {
    expect(SHELL_CSS).toMatch(/\.sidebar\[data-short\]\s+\.lampSeat\s*\{[^}]*display:\s*none\s*;/u)
  })

  it('o rodapé do trilho de 64 px (coluna) não ganha a luminária: ela só existe na fileira', () => {
    localStorage.setItem('persona.rail.collapsed.v1', '1')
    mount()
    expect(document.querySelector('[data-persona-lamp-seat]')).toBeNull()
    expect(document.querySelector('[data-rail-foot-row]')).toBeNull()
    expect(document.querySelector('[data-nav-panel="help"]')).not.toBeNull()
  })
})
