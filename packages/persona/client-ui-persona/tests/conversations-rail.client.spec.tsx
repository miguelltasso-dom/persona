// @vitest-environment jsdom
// CV-1 (CONVERSAS-SPEC §0): a barra única, parte que rola: Canais e Pessoas. Sem 2ª lista: o clique abre a conversa. Linha ativa,
// Recentes, grupos por equipe que recolhem e lembram, teclado (setas, Home/End, Alt+↑/↓).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'
import type { ConversationPerson } from '../src/client/shell/conversations-model.ts'
import type { ConversationTarget } from '../src/client/shell/conversation-selection.ts'
import { CONVERSATION_GROUPS_KEY } from '../src/client/shell/conversations-model.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const person = (id: string, over: Partial<ConversationPerson> = {}): ConversationPerson => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  role: 'Engenharia',
  teamId: 'eng',
  teamName: 'Engenharia',
  unread: 0,
  hasConversation: false,
  ...over,
})

const GERAL = { id: 'ch-geral', name: 'geral', unread: 0 }

/** `count` pessoas em 3 equipes (p00 mkt, p01 eng, p02 atd, …). */
const crowd = (count: number, over: (i: number) => Partial<ConversationPerson> = () => ({})): ConversationPerson[] =>
  Array.from({ length: count }, (_, i) => person(`p${String(i).padStart(2, '0')}`, {
    teamId: ['mkt', 'eng', 'atd'][i % 3] ?? null,
    teamName: ['Marketing', 'Engenharia', 'Atendimento'][i % 3] ?? null,
    ...over(i),
  }))

/** O cabeçalho (botão que recolhe) de um grupo: as linhas de pessoa também trazem a função no nome, então o nome do grupo sozinho não basta. */
const groupHead = (name: string): HTMLElement => {
  const found = screen.getAllByRole('button').find(button => button.hasAttribute('aria-expanded') && (button.textContent ?? '').startsWith(name))
  if (found === undefined) throw new Error('grupo não encontrado: ' + name)
  return found
}

function mount(source: ConversationsSource, active: ConversationTarget | null = null) {
  const openConversation = vi.fn()
  const view = render(<ConversationsRail t={t} source={source} active={active} openConversation={openConversation} />)
  return { ...view, openConversation }
}

describe('até 8 pessoas: todas, em linhas completas', () => {
  const source: ConversationsSource = {
    channels: [GERAL],
    people: [person('nina', { role: 'Pesquisa', hasConversation: true, recentRank: 0, unread: 2, state: 'working' }), person('luna', { role: 'Vigia' })],
  }

  it('mostra Canais e Pessoas com o # e o nome do canal e cada pessoa com função', () => {
    mount(source)
    expect(screen.getByRole('button', { name: 'Canais' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pessoas' })).toBeTruthy()
    expect(screen.getByText('geral')).toBeTruthy()
    expect(document.querySelectorAll('[data-conversation-kind="dm"]')).toHaveLength(2)
    expect(screen.getByText('Pesquisa')).toBeTruthy()
  })

  it('o nome acessível da pessoa leva o estado e as não lidas; o selo é só visual', () => {
    mount(source)
    const row = document.querySelector('[data-persona-id="nina"]') as HTMLElement
    const name = row.getAttribute('aria-label') ?? ''
    expect(name).toContain('Nina')
    expect(name).toContain('Pesquisa')
    expect(name).toContain('2')
    // o rosto também é aria-hidden (decorativo): o selo é o aria-hidden que traz o número
    expect(Array.from(row.querySelectorAll('[aria-hidden="true"]')).some(el => el.textContent === '2')).toBe(true)
  })

  it('clicar numa pessoa ou no canal abre a conversa (1 clique, sem 2ª lista)', () => {
    const { openConversation } = mount(source)
    fireEvent.click(document.querySelector('[data-persona-id="luna"]') as HTMLElement)
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'luna' })
    fireEvent.click(screen.getByText('geral'))
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'channel', id: 'ch-geral' })
  })

  it('a linha ativa é a conversa aberta, uma só (aria-current="page")', () => {
    mount(source, { kind: 'dm', personaId: 'nina' })
    const current = document.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.getAttribute('data-persona-id')).toBe('nina')
    cleanup()
    mount(source, { kind: 'channel', id: 'ch-geral' })
    expect(document.querySelector('[aria-current="page"]')?.getAttribute('data-conversation-kind')).toBe('channel')
  })

  it('fora das conversas (Visão geral, Projetos…) nenhuma linha é a ativa', () => {
    mount(source, null)
    expect(document.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('sem canal e sem pessoas a barra não desenha seções vazias', () => {
    mount({ channels: [], people: [] })
    expect(screen.queryByRole('button', { name: 'Canais' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pessoas' })).toBeNull()
  })
})

describe('mais de 8: "Todas as personas" por equipe, em ordem estável', () => {
  const source = (): ConversationsSource => ({
    channels: [GERAL],
    people: crowd(12, i => (i === 1 ? { hasConversation: true, recentRank: 0 } : i === 4 ? { hasConversation: true, recentRank: 1 } : {})),
  })

  it('mostra "Todas as personas · 12" com os grupos recolhidos e SEM "Recentes" (a recência vive no Ctrl+K)', () => {
    mount(source())
    expect(screen.queryByText('Recentes')).toBeNull()
    expect(screen.getByText('Todas as personas · 12')).toBeTruthy()
    const heads = ['Atendimento', 'Engenharia', 'Marketing'].map(name => groupHead(name))
    expect(heads.map(head => head.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false'])
    // com todos os grupos recolhidos nenhuma linha de pessoa existe no DOM
    expect(document.querySelectorAll('[data-conversation-kind="dm"]')).toHaveLength(0)
  })

  it('o grupo da equipe da conversa aberta vem aberto e a pessoa ativa aparece UMA vez, como ativa', () => {
    mount(source(), { kind: 'dm', personaId: 'p01' })
    const eng = groupHead('Engenharia')
    expect(eng.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[data-persona-id="p01"]')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('abrir um grupo mostra as linhas compactas; recolher esconde; o que a pessoa fez fica lembrado', () => {
    const { unmount } = mount(source())
    const mkt = groupHead('Marketing')
    fireEvent.click(mkt)
    expect(mkt.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelectorAll('[data-persona-id="p00"]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(CONVERSATION_GROUPS_KEY) ?? '{}')).toEqual({ 'team:mkt': false })
    unmount()
    mount(source())
    expect(groupHead('Marketing').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(groupHead('Marketing'))
    expect(document.querySelector('[data-persona-id="p00"]')).toBeNull()
  })

  it('grupo recolhido mostra a contagem e até 4 rostos; as não lidas do grupo aparecem no selo', () => {
    mount({ channels: [], people: crowd(12, i => (i === 0 ? { unread: 3 } : {})) })
    const mkt = groupHead('Marketing')
    expect(within(mkt).getByText('4')).toBeTruthy() // 12 pessoas em 3 equipes = 4 em cada
    expect(mkt.querySelector('span[aria-hidden="true"]')?.children).toHaveLength(4)
    expect(mkt.textContent).toContain('3')
  })

  it('pessoas sem equipe: o grupo "Sem equipe definida" aparece, com o link "Organizar a equipe" no fim (só aberto)', () => {
    const onOrganizeTeam = vi.fn()
    const view = render(
      <ConversationsRail
        t={t}
        source={{ channels: [], people: crowd(10, i => (i < 2 ? { teamId: null, teamName: null } : {})) }}
        active={null}
        openConversation={vi.fn()}
        onOrganizeTeam={onOrganizeTeam}
      />,
    )
    const head = groupHead('Sem equipe definida')
    expect(screen.queryByRole('button', { name: 'Organizar a equipe' })).toBeNull() // recolhido: sem link
    fireEvent.click(head)
    fireEvent.click(screen.getByRole('button', { name: 'Organizar a equipe' }))
    expect(onOrganizeTeam).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('ninguém com equipe (host sem organograma): o grupo único também diz "Sem equipe definida" (a pessoa precisa organizar)', () => {
    mount({ channels: [], people: crowd(10, () => ({ teamId: null, teamName: null })) })
    expect(groupHead('Sem equipe definida')).toBeTruthy()
  })

  it('sem o ouvinte do link (preview, testes) ele não aparece', () => {
    mount({ channels: [], people: crowd(10, () => ({ teamId: null, teamName: null })) })
    fireEvent.click(groupHead('Sem equipe definida'))
    expect(screen.queryByRole('button', { name: 'Organizar a equipe' })).toBeNull()
  })
})

describe('Canais e Pessoas recolhem e lembram', () => {
  it('recolher "Canais" tira a lista e grava; reabrir devolve', () => {
    mount({ channels: [GERAL], people: [person('nina')] })
    const head = screen.getByRole('button', { name: 'Canais' })
    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('geral')).toBeNull()
    expect(JSON.parse(localStorage.getItem(CONVERSATION_GROUPS_KEY) ?? '{}')).toEqual({ 'section:channels': true })
    fireEvent.click(head)
    expect(screen.getByText('geral')).toBeTruthy()
  })

  it('seção recolhida ainda mostra as não lidas no selo (nada some calado)', () => {
    mount({ channels: [{ ...GERAL, unread: 4 }], people: [] })
    const head = screen.getByRole('button', { name: /Canais/u })
    fireEvent.click(head)
    expect(head.textContent).toContain('4')
  })
})

describe('teclado', () => {
  const source: ConversationsSource = { channels: [GERAL], people: [person('nina', { hasConversation: true, recentRank: 0 }), person('luna')] }

  it('↑/↓ andam entre as linhas, Home e End vão às pontas', () => {
    mount(source)
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-conversation-row]'))
    expect(rows).toHaveLength(3)
    rows[0]?.focus()
    fireEvent.keyDown(rows[0] as HTMLElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1] as HTMLElement, { key: 'End' })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2] as HTMLElement, { key: 'Home' })
    expect(document.activeElement).toBe(rows[0])
    fireEvent.keyDown(rows[0] as HTMLElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(rows[2])
  })

  it('Alt+↓ abre a próxima conversa e Alt+↑ a anterior, de qualquer lugar', () => {
    const { openConversation } = mount(source, { kind: 'channel', id: 'ch-geral' })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true }) })
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'nina' })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true }) })
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'luna' }) // dá a volta
  })

  it('só Alt: com Ctrl, Shift ou Meta junto não faz nada; sem Alt também não', () => {
    const { openConversation } = mount(source, { kind: 'channel', id: 'ch-geral' })
    for (const mods of [{ altKey: true, ctrlKey: true }, { altKey: true, shiftKey: true }, { altKey: true, metaKey: true }, {}]) {
      act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', ...mods }) })
    }
    expect(openConversation).not.toHaveBeenCalled()
  })

  it('sem conversa aberta Alt+↓ vai para a primeira e Alt+↑ para a última', () => {
    const { openConversation } = mount(source, null)
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true }) })
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'channel', id: 'ch-geral' })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp', altKey: true }) })
    expect(openConversation).toHaveBeenLastCalledWith({ kind: 'dm', personaId: 'luna' })
  })

  it('desmontar solta o atalho (nada vaza para outras telas)', () => {
    const { openConversation, unmount } = mount(source, null)
    unmount()
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true }) })
    expect(openConversation).not.toHaveBeenCalled()
  })
})
