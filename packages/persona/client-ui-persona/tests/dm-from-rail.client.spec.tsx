// @vitest-environment jsdom
// DESIGN-01-MUSE §5.1 #06 (DM pela barra única, 4 condições): a 2ª coluna "Mensagens diretas" sai porque o rail já é a lista de pessoas.
//  1. o rail herda o que a coluna dava: a bolinha de não lidas (o número até 9, depois 9+) e o estado da regra 0.2 (âmbar quando algo espera a pessoa);
//  2. a conversa lê na MESMA largura do #geral (nenhuma largura nova);
//  3. o rastro de 64 px (≤ 960 px): rostos com o ponto de não lidas, o clique abre a DM;
//  4. ordem estável (Coordenação primeiro, depois a ordem de contratação), sem reordenar por atividade.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView, type DmRowUi } from '../src/client/chat/DirectMessagesView.tsx'
import { ConversationsRail, unreadBadgeText } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationPerson } from '../src/client/shell/conversations-model.ts'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const chatT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

const row = (over: Partial<DmRowUi> = {}): DmRowUi => ({ id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa', state: 'resting', ...over })

function dm(over: Partial<DmRowUi> = {}, props: { readonly listInRail?: boolean } = {}) {
  return render(
    <DirectMessagesView
      t={chatT}
      shellT={t}
      loading={false}
      dms={[row(over), row({ id: 'dm-bento', peerId: 'bento', peerName: 'Bento', characterId: 'bento' })]}
      selectedId="dm-nina"
      messages={[]}
      onSelect={vi.fn()}
      onSend={vi.fn()}
      {...props}
    />,
  )
}

describe('condição 0: a coluna "Mensagens diretas" sai quando o rail lista as pessoas', () => {
  it('com a barra única (flag do A-1): não existe a lista lateral e o título da conversa é o h1', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    const view = dm()
    expect(view.container.querySelector('aside')).toBeNull()
    expect(screen.queryByRole('list', { name: chatPt['dm.listTitle'] })).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Nina' })).toBeTruthy()
    expect(view.container.querySelector('[data-list-in-rail]')).not.toBeNull()
  })

  it('sem a barra única o app é o de antes: a lista segue lá (a flag manda; `listInRail` decide à força)', () => {
    const before = dm()
    expect(before.container.querySelector('aside')).not.toBeNull()
    before.unmount()
    const forced = dm({}, { listInRail: true })
    expect(forced.container.querySelector('aside')).toBeNull()
  })
})

describe('o estado do topo da DM é o do vocabulário único (regra 0.2)', () => {
  beforeEach(() => { localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })

  const chip = (): string | null => document.querySelector('[data-persona-state]:not(img)')?.textContent ?? null

  it('sem tarefa: Disponível (e a pose em pé), nunca "Descansando"', () => {
    dm({ state: 'resting' })
    expect(chip()).toBe(shellPt['team.statusAvailable'])
  })

  it('dentro de uma Janela de silêncio: Descansando; pausada: Pausada; esperando você: Esperando você', () => {
    const quiet = dm({ state: 'resting', quiet: true })
    expect(chip()).toBe(shellPt['team.statusResting'])
    quiet.unmount()
    const paused = dm({ state: 'resting', paused: true })
    expect(chip()).toBe(shellPt['team.statusPaused'])
    paused.unmount()
    dm({ state: 'waiting' })
    expect(chip()).toBe(shellPt['team.statusWaiting'])
  })
})

describe('condição 1: o rail herda as não lidas e o estado', () => {
  const person = (id: string, over: Partial<ConversationPerson> = {}): ConversationPerson => ({
    id, name: id.charAt(0).toUpperCase() + id.slice(1), role: 'Equipe', teamId: null, teamName: null, unread: 0, hasConversation: true, state: 'resting', ...over,
  })
  const mount = (people: readonly ConversationPerson[], variant: 'full' | 'trail' = 'full', open = vi.fn()) => {
    const source: ConversationsSource = { channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }], people }
    render(<ConversationsRail t={t} source={source} active={null} openConversation={open} variant={variant} />)
    return open
  }
  const badge = (id: string): string | null => document.querySelector(`[data-persona-id="${id}"] [class*="badge" i]`)?.textContent ?? null

  it('o selo é o número até 9 e "9+" depois', () => {
    expect(unreadBadgeText(1)).toBe('1')
    expect(unreadBadgeText(9)).toBe('9')
    expect(unreadBadgeText(10)).toBe('9+')
    expect(unreadBadgeText(120)).toBe('9+')
    mount([person('nina', { unread: 3 }), person('bento', { unread: 12 }), person('sol')])
    expect(badge('nina')).toBe('3')
    expect(badge('bento')).toBe('9+')
    expect(badge('sol')).toBeNull()
  })

  it('quem espera a pessoa ganha o ponto âmbar (cheio) e o nome diz "Esperando você"', () => {
    mount([person('nina', { state: 'waiting' }), person('sol')])
    const dot = document.querySelector('[data-persona-id="nina"] [data-persona-state]')
    expect(dot?.getAttribute('data-persona-state')).toBe('waiting')
    expect(document.querySelector('[data-persona-id="nina"]')?.getAttribute('aria-label')).toContain('Esperando você')
    expect(document.querySelector('[data-persona-id="sol"] [data-persona-state]')?.getAttribute('data-persona-state')).toBe('available')
  })

  it('o estado aparece também nas linhas compactas dos grupos (mais de 8 pessoas)', () => {
    const crowd = Array.from({ length: 9 }, (_, index) => person(`p${String(index)}`, { teamId: 'eq', teamName: 'Equipe', state: index === 0 ? 'waiting' : 'resting' }))
    mount(crowd)
    fireEvent.click(screen.getByRole('button', { name: /Equipe/u }))
    expect(document.querySelector('[data-persona-id="p0"] [data-persona-state]')?.getAttribute('data-persona-state')).toBe('waiting')
  })
})

describe('condição 3: o rastro de 64 px', () => {
  const person = (id: string, over: Partial<ConversationPerson> = {}): ConversationPerson => ({
    id, name: id.charAt(0).toUpperCase() + id.slice(1), role: 'Equipe', teamId: null, teamName: null, unread: 0, hasConversation: true, state: 'resting', ...over,
  })

  it('mostra os rostos de TODAS as pessoas com o ponto de não lidas e o clique abre a DM', () => {
    const open = vi.fn()
    const people = Array.from({ length: 9 }, (_, index) => person(`p${String(index)}`, { unread: index === 2 ? 4 : 0 }))
    render(<ConversationsRail t={t} source={{ channels: [], people }} active={null} openConversation={open} variant="trail" />)
    expect(document.querySelectorAll('[data-persona-id]')).toHaveLength(9)
    expect(document.querySelector('[data-persona-id="p2"]')?.textContent).toContain('4')
    fireEvent.click(document.querySelector('[data-persona-id="p2"]') as HTMLElement)
    expect(open).toHaveBeenCalledWith({ kind: 'dm', personaId: 'p2' })
  })
})

describe('condição 4: ordem estável', () => {
  it('Coordenação primeiro e depois a ordem recebida; ter conversa recente NÃO sobe ninguém, no rail e no trilho', () => {
    const base = { role: 'Equipe', teamId: null, teamName: null, unread: 0, state: 'resting' as const }
    const people: ConversationPerson[] = [
      { ...base, id: 'atlas', name: 'Atlas', hasConversation: false },
      { ...base, id: 'zeca', name: 'Zeca', hasConversation: false },
      { ...base, id: 'bento', name: 'Bento', hasConversation: true, recentRank: 0 },
    ]
    const ids = (): string[] => [...document.querySelectorAll('[data-persona-id]')].map(node => node.getAttribute('data-persona-id') ?? '')
    const full = render(<ConversationsRail t={t} source={{ channels: [], people }} active={null} openConversation={vi.fn()} />)
    expect(ids()).toEqual(['atlas', 'zeca', 'bento'])
    full.unmount()
    render(<ConversationsRail t={t} source={{ channels: [], people }} active={null} openConversation={vi.fn()} variant="trail" />)
    expect(ids()).toEqual(['atlas', 'zeca', 'bento'])
  })
})

describe('condição 2: a mesma largura de leitura do #geral', () => {
  const dmCss = readFileSync(join(import.meta.dirname, '../src/client/chat/DirectMessagesView.module.css'), 'utf8').replaceAll('\r\n', '\n')
  const channelCss = readFileSync(join(import.meta.dirname, '../src/client/chat/GeneralChannelView.module.css'), 'utf8').replaceAll('\r\n', '\n')

  it('a conversa da DM e a coluna do #geral usam o mesmo máximo (1120 px de texto + 32 px de cada lado)', () => {
    const channelMax = /^\.column\s*\{[^}]*max-width:\s*(\d+)px\s*;/mu.exec(channelCss)?.[1]
    expect(channelMax).toBe('1120')
    expect(dmCss).toMatch(new RegExp(`\\.layout\\[data-list-in-rail\\] \\.threadHeader,\\s*\\.layout\\[data-list-in-rail\\] \\.composer\\s*\\{[^}]*max-width:\\s*calc\\(${channelMax}px \\+ 2 \\* var\\(--persona-space-8\\)\\)`, 'u'))
    expect(dmCss).toMatch(/\.layout\[data-list-in-rail\]\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/u)
    expect(dmCss).not.toMatch(/\.layout\[data-list-in-rail\][^{]*\{[^}]*(?:9\d\dpx|920)/u)
  })
})
