// @vitest-environment jsdom
// CV-3 (CONVERSAS-SPEC §3) + CV-8 (§A, lado do composer): o "Quem responde" com a equipe inteira (popover com busca e teclado), o `@nome` no
// texto, as 2 linhas do "Toda a equipe", a confirmação para mais de 5, e a regra de ouro: a escolha vale SÓ para a próxima mensagem
// ("volta à Coordenação depois de enviar"). Fora do modo CV-3 (flag navPlaces / fan-out) o seletor é o `<select>` de sempre.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, type ChannelComposerProps } from '../src/client/chat/ChannelComposer.tsx'
import { activeMentionToken, buildResponderItems, insertMention, moveResponderActive } from '../src/client/chat/responder-menu.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const member = (id: string, name: string, role: string, over: Partial<ChannelPersonaMember> = {}): ChannelPersonaMember => ({ id: id as never, name, role, state: 'resting', ...over })
const ATLAS = member('atlas', 'Atlas', 'Coordenação', { systemRoles: ['coordination'] })
const NINA = member('nina', 'Nina', 'Design')
const BENTO = member('bento', 'Bento', 'Engenharia')
const SOL = member('sol', 'Sol', 'Pesquisa')
const TEAM = [ATLAS, NINA, BENTO, SOL]

describe('buildResponderItems (puro)', () => {
  it('ordem da spec: as 2 linhas do CV-8, "Quem responde aqui" (Coordenação) e as pessoas', () => {
    const items = buildResponderItems({ members: TEAM, defaultId: 'atlas', query: '', fanoutTeamCount: 4 })
    expect(items.map(item => (item.kind === 'fanout' ? `fanout:${item.choice}` : `${item.kind}:${item.member.id}`))).toEqual([
      'fanout:everyone', 'fanout:relevant', 'default:atlas', 'persona:nina', 'persona:bento', 'persona:sol',
    ])
  })

  it('sem o fan-out (canal sem a flag do host, ou 1 persona só): só a equipe', () => {
    expect(buildResponderItems({ members: TEAM, defaultId: 'atlas', query: '' }).some(item => item.kind === 'fanout')).toBe(false)
    expect(buildResponderItems({ members: TEAM, defaultId: 'atlas', query: '', fanoutTeamCount: 1 }).some(item => item.kind === 'fanout')).toBe(false)
  })

  it('busca por nome ou função, sem acento nem caixa; com busca as linhas do CV-8 saem', () => {
    const byName = buildResponderItems({ members: TEAM, defaultId: 'atlas', query: 'NIN', fanoutTeamCount: 4 })
    expect(byName.map(item => (item.kind === 'fanout' ? 'fanout' : item.member.id))).toEqual(['nina'])
    const byRole = buildResponderItems({ members: TEAM, defaultId: 'atlas', query: 'engenharia' })
    expect(byRole.map(item => (item.kind === 'fanout' ? 'fanout' : item.member.id))).toEqual(['bento'])
    expect(buildResponderItems({ members: [member('joao', 'João', 'Texto')], defaultId: '', query: 'joao' })).toHaveLength(1)
  })

  it('a Coordenação aparece UMA vez (como padrão), nunca de novo entre as pessoas', () => {
    const ids = buildResponderItems({ members: TEAM, defaultId: 'atlas', query: '' }).map(item => (item.kind === 'fanout' ? 'fanout' : item.member.id))
    expect(ids.filter(id => id === 'atlas')).toHaveLength(1)
  })

  it('↑↓ dão a volta; lista vazia = -1', () => {
    expect(moveResponderActive(0, -1, 3)).toBe(2)
    expect(moveResponderActive(2, 1, 3)).toBe(0)
    expect(moveResponderActive(0, 1, 0)).toBe(-1)
  })
})

describe('@nome (puro)', () => {
  it('o @ que o cursor termina de escrever (começo, depois de espaço ou de quebra de linha)', () => {
    expect(activeMentionToken('@ni', 3)).toEqual({ start: 0, query: 'ni' })
    expect(activeMentionToken('oi @', 4)).toEqual({ start: 3, query: '' })
    expect(activeMentionToken('linha\n@so', 9)).toEqual({ start: 6, query: 'so' })
  })

  it('e-mail ou @ colado numa palavra não é menção; cursor fora do @ também não', () => {
    expect(activeMentionToken('a@b.com', 7)).toBeNull()
    expect(activeMentionToken('oi @ni tudo', 11)).toBeNull()
    expect(activeMentionToken('sem arroba', 10)).toBeNull()
  })

  it('inserir troca "@parte" por "@Nome " e põe o cursor depois', () => {
    const token = { start: 3, query: 'ni' }
    expect(insertMention('oi @ni', token, 6, 'Nina')).toEqual({ text: 'oi @Nina ', caret: 9 })
    expect(insertMention('oi @ni e mais', token, 6, 'Ana Maria')).toEqual({ text: 'oi @AnaMaria  e mais', caret: 13 })
  })
})

function composer(props: Partial<ChannelComposerProps> = {}) {
  const onSend = vi.fn()
  const onFanoutChoiceChange = vi.fn()
  const onOpenPersonaDm = vi.fn()
  render(<ChannelComposer t={t as never} members={TEAM} onSend={onSend} fanoutChoices={{ teamCount: 4 }} onFanoutChoiceChange={onFanoutChoiceChange} onOpenPersonaDm={onOpenPersonaDm} {...props} />)
  return { onSend, onFanoutChoiceChange, onOpenPersonaDm }
}

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement
const trigger = (): HTMLElement => screen.getByRole('button', { name: chatPt['composer.modelLabel'] })
const popover = (): HTMLElement | null => document.querySelector('[data-persona-responder-popover]')
const search = (): HTMLInputElement => screen.getByRole('combobox') as HTMLInputElement
const options = (): string[] => [...document.querySelectorAll('[role="option"]')].map(node => node.textContent ?? '')

describe('o popover do "Quem responde"', () => {
  it('sem o modo CV-3 (sem flag e sem fan-out) o seletor é o <select> de sempre', () => {
    composer({ fanoutChoices: undefined })
    expect(document.querySelector('select')).not.toBeNull()
    expect(popover()).toBeNull()
  })

  it('com a flag navPlaces o popover também vale (sem fan-out)', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    composer({ fanoutChoices: undefined })
    expect(document.querySelector('select')).toBeNull()
    fireEvent.click(trigger())
    expect(popover()).not.toBeNull()
    expect(options().some(text => text.startsWith('Toda a equipe'))).toBe(false)
  })

  it('clicar abre o popover com o foco na busca e a equipe inteira, com a Coordenação sob "Quem responde aqui"', () => {
    composer()
    fireEvent.click(trigger())
    expect(popover()).not.toBeNull()
    expect(document.activeElement).toBe(search())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Quem responde aqui')).toBeTruthy()
    expect(options()).toEqual([
      expect.stringContaining('Toda a equipe (4)'),
      expect.stringContaining('Quem tiver algo a dizer'),
      expect.stringContaining('Atlas'),
      expect.stringContaining('Nina'),
      expect.stringContaining('Bento'),
      expect.stringContaining('Sol'),
    ])
  })

  it('a linha "Quem tiver algo a dizer" explica: "A Coordenação escolhe quem responde"', () => {
    composer()
    fireEvent.click(trigger())
    expect(screen.getByText('A Coordenação escolhe quem responde')).toBeTruthy()
  })

  it('MUSE 07/11: o campo de busca tem placeholder ("Nome ou função…", a mesma chave da busca de DMs) para a pessoa saber que dá para digitar', () => {
    composer()
    fireEvent.click(trigger())
    expect(search().placeholder).toBe(chatPt['dm.searchPlaceholder'])
    expect(search().placeholder).toBe('Nome ou função…')
  })

  it('digitar filtra; ↓ + Enter escolhe; o foco volta ao composer e o popover fecha', () => {
    composer()
    fireEvent.click(trigger())
    fireEvent.change(search(), { target: { value: 'be' } })
    expect(options()).toEqual([expect.stringContaining('Bento')])
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(field())
    expect(document.querySelector('[class*="responderName"]')?.textContent).toBe('Bento')
  })

  it('↑↓ movem a seleção ativa e dão a volta', () => {
    composer()
    fireEvent.click(trigger())
    const active = (): string => document.querySelector('[role="option"][data-active]')?.textContent ?? ''
    expect(active()).toContain('Toda a equipe')
    fireEvent.keyDown(search(), { key: 'ArrowUp' })
    expect(active()).toContain('Sol')
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    expect(active()).toContain('Toda a equipe')
  })

  it('Esc fecha e devolve o foco ao composer', () => {
    composer()
    fireEvent.click(trigger())
    fireEvent.keyDown(search(), { key: 'Escape' })
    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('Ctrl+Enter numa persona abre a conversa com ela (e o rodapé diz isso)', () => {
    const { onOpenPersonaDm } = composer()
    fireEvent.click(trigger())
    fireEvent.change(search(), { target: { value: 'nina' } })
    expect(screen.getByText('Enter responde aqui · Ctrl+Enter abre a conversa com Nina')).toBeTruthy()
    fireEvent.keyDown(search(), { key: 'Enter', ctrlKey: true })
    expect(onOpenPersonaDm).toHaveBeenCalledWith('nina')
    expect(popover()).toBeNull()
  })

  it('sem como abrir a conversa não há rodapé nem atalho morto', () => {
    composer({ onOpenPersonaDm: undefined })
    fireEvent.click(trigger())
    expect(document.querySelector('[class*="responderFooter"]')).toBeNull()
  })

  it('o ARIA do combobox: aria-activedescendant aponta para a opção ativa', () => {
    composer()
    fireEvent.click(trigger())
    const id = search().getAttribute('aria-activedescendant') as string
    expect(document.getElementById(id)?.getAttribute('role')).toBe('option')
  })

  it('clicar fora fecha sem roubar o foco', () => {
    composer()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    fireEvent.click(trigger())
    fireEvent.mouseDown(outside)
    expect(popover()).toBeNull()
    outside.remove()
  })
})

describe('a escolha vale SÓ para a próxima mensagem', () => {
  it('outra persona: a mensagem sai com o @Nome na frente (o host roteia por menção) e depois o chip volta à Coordenação', () => {
    const { onSend } = composer()
    fireEvent.click(trigger())
    fireEvent.change(search(), { target: { value: 'nina' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(document.querySelector('[class*="responderName"]')?.textContent).toBe('Nina')
    fireEvent.change(field(), { target: { value: 'Faça o logo' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('@Nina Faça o logo', [])
    expect(document.querySelector('[class*="responderName"]')?.textContent).toBe('Atlas')
    fireEvent.change(field(), { target: { value: 'E agora?' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenLastCalledWith('E agora?', [])
  })

  it('a Coordenação (o padrão) NÃO ganha menção', () => {
    const { onSend } = composer()
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Oi', [])
  })

  it('quem já escreveu o @Nome no texto não ganha outro', () => {
    const { onSend } = composer()
    fireEvent.click(trigger())
    fireEvent.change(search(), { target: { value: 'nina' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    fireEvent.change(field(), { target: { value: '@Nina faça o logo' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('@Nina faça o logo', [])
  })
})

describe('"Toda a equipe" e "Quem tiver algo a dizer" (CV-8, lado do composer)', () => {
  const pickFanout = (index: 0 | 1): void => {
    fireEvent.click(trigger())
    fireEvent.click(document.querySelectorAll('[role="option"]')[index] as HTMLElement)
  }

  it('escolher avisa o chamador, mostra o nome no seletor e o chip acima do campo', () => {
    const { onFanoutChoiceChange } = composer()
    pickFanout(0)
    expect(onFanoutChoiceChange).toHaveBeenCalledWith('everyone')
    expect(document.querySelector('[class*="responderName"]')?.textContent).toBe('Toda a equipe (4)')
    expect(document.querySelector('[data-fanout-chip]')?.textContent).toContain('Toda a equipe · 4 respostas')
  })

  it('"Quem tiver algo a dizer" não mostra chip (1 + até 5 chamadas, sem surpresa)', () => {
    composer()
    pickFanout(1)
    expect(document.querySelector('[data-fanout-chip]')).toBeNull()
  })

  it('enviar leva options.fanout; depois de enviar a escolha some e o chamador é avisado', () => {
    const { onSend, onFanoutChoiceChange } = composer()
    pickFanout(1)
    fireEvent.change(field(), { target: { value: 'Alguém tem ideia?' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Alguém tem ideia?', [], { fanout: 'relevant' })
    expect(onFanoutChoiceChange).toHaveBeenLastCalledWith(undefined)
    expect(document.querySelector('[class*="responderName"]')?.textContent).toBe('Atlas')
  })

  it('o fan-out não leva @Nome (é para a equipe)', () => {
    const { onSend } = composer()
    fireEvent.click(trigger())
    fireEvent.change(search(), { target: { value: 'nina' } })
    fireEvent.keyDown(search(), { key: 'Enter' })
    pickFanout(0)
    fireEvent.change(field(), { target: { value: 'Opiniões?' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Opiniões?', [], { fanout: 'everyone' })
  })

  it('o chip mostra a estimativa MEDIDA quando o host mandou', () => {
    composer({ fanoutEstimate: { replies: 4, calls: { min: 4, max: 4 } } })
    pickFanout(0)
    expect(document.querySelector('[data-fanout-chip]')?.textContent).toContain('≈ 4 chamadas da sua IA')
  })

  describe('mais de 5 personas: o primeiro Enviar só pergunta', () => {
    const BIG = [ATLAS, ...['a', 'b', 'c', 'd', 'e', 'f'].map(id => member(id, id.toUpperCase(), 'Função'))]

    it('o 1º Enviar abre a confirmação no chip e não envia; "Enviar" confirma', () => {
      const { onSend } = composer({ members: BIG, fanoutChoices: { teamCount: 7 } })
      pickFanout(0)
      fireEvent.change(field(), { target: { value: 'Todos aí?' } })
      fireEvent.keyDown(field(), { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
      expect(document.querySelector('[data-fanout-chip="confirm"]')?.textContent).toContain('Enviar para as 7?')
      fireEvent.click(within(document.querySelector('[data-fanout-chip="confirm"]') as HTMLElement).getByRole('button', { name: 'Enviar' }))
      expect(onSend).toHaveBeenCalledWith('Todos aí?', [], { fanout: 'everyone' })
    })

    it('"Só quem tiver algo a dizer" troca a escolha e envia', () => {
      const { onSend } = composer({ members: BIG, fanoutChoices: { teamCount: 7 } })
      pickFanout(0)
      fireEvent.change(field(), { target: { value: 'Todos aí?' } })
      fireEvent.keyDown(field(), { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: 'Só quem tiver algo a dizer' }))
      expect(onSend).toHaveBeenCalledWith('Todos aí?', [], { fanout: 'relevant' })
    })

    it('com 5 ou menos não pergunta nada', () => {
      const { onSend } = composer({ fanoutChoices: { teamCount: 5 } })
      pickFanout(0)
      fireEvent.change(field(), { target: { value: 'Oi, time' } })
      fireEvent.keyDown(field(), { key: 'Enter' })
      expect(onSend).toHaveBeenCalledWith('Oi, time', [], { fanout: 'everyone' })
    })
  })
})

describe('@nome no texto', () => {
  it('digitar "@" abre a lista com a equipe; filtra pelo que vem depois; Enter vira "@Nina "', () => {
    composer()
    fireEvent.change(field(), { target: { value: 'oi @ni', selectionStart: 6 } })
    field().setSelectionRange(6, 6)
    fireEvent.select(field())
    const menu = document.querySelector('[data-persona-mention-menu]') as HTMLElement
    expect(menu).not.toBeNull()
    expect([...menu.querySelectorAll('[role="option"]')].map(node => node.textContent)).toEqual([expect.stringContaining('Nina')])
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field().value).toBe('oi @Nina ')
    expect(document.querySelector('[data-persona-mention-menu]')).toBeNull()
  })

  it('Esc fecha a lista sem mexer no texto; o Enter seguinte envia normalmente', () => {
    const { onSend } = composer()
    fireEvent.change(field(), { target: { value: '@ni' } })
    field().setSelectionRange(3, 3)
    fireEvent.select(field())
    expect(document.querySelector('[data-persona-mention-menu]')).not.toBeNull()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(document.querySelector('[data-persona-mention-menu]')).toBeNull()
    expect(field().value).toBe('@ni')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('@ni', [])
  })

  it('sem o modo CV-3 o "@" não abre nada', () => {
    composer({ fanoutChoices: undefined })
    fireEvent.change(field(), { target: { value: '@ni' } })
    field().setSelectionRange(3, 3)
    fireEvent.select(field())
    expect(document.querySelector('[data-persona-mention-menu]')).toBeNull()
  })

  it('e-mail não abre a lista', () => {
    composer()
    fireEvent.change(field(), { target: { value: 'ana@ni' } })
    field().setSelectionRange(6, 6)
    fireEvent.select(field())
    expect(document.querySelector('[data-persona-mention-menu]')).toBeNull()
  })
})
