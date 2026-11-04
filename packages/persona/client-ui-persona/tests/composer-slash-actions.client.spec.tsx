// @vitest-environment jsdom
// P0-27 (controle morto não existe): o menu "/" só lista o que tem ação. /limites é sempre do composer; /assunto,
// /ensinar e /contratar aparecem quando a tela entrega o handler; /lado e /resumo saem do menu até terem ação.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { DirectMessagesView, type DmRowUi } from '../src/client/chat/DirectMessagesView.tsx'
import { COMPOSER_SLASH_COMMANDS, availableSlashIds, filterSlashCommands, type ComposerSlashActions } from '../src/client/chat/composer-slash-commands.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('persona.hint.whoResponds', '1')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(chatPt['composer.placeholderChannel']) as HTMLTextAreaElement
const menu = (): HTMLElement | null => screen.queryByRole('listbox', { name: chatPt['composer.slashMenu'] })
const optionNames = (): string[] => within(menu() as HTMLElement).getAllByRole('option').map(option => option.textContent ?? '')

function typeSlash(text: string): void {
  fireEvent.change(field(), { target: { value: text, selectionStart: text.length } })
}

describe('registro: só o que tem ação', () => {
  it('sem handlers só /limites existe; os outros cinco saem do menu', () => {
    expect([...availableSlashIds(undefined)]).toEqual(['limites'])
    expect(filterSlashCommands('').map(row => row.id)).toEqual(['limites'])
  })

  it('cada handler liga exatamente o seu comando', () => {
    const actions: ComposerSlashActions = { assunto: () => {}, contratar: () => {} }
    expect(filterSlashCommands('', availableSlashIds(actions)).map(row => row.id)).toEqual(['limites', 'assunto', 'contratar'])
  })

  it('o filtro pelo que foi digitado continua valendo', () => {
    const actions: ComposerSlashActions = { assunto: () => {}, ensinar: () => {} }
    expect(filterSlashCommands('as', availableSlashIds(actions)).map(row => row.id)).toEqual(['assunto'])
    expect(filterSlashCommands('xyz', availableSlashIds(actions))).toEqual([])
  })

  it('nenhum comando do registro fica sem destino: ou tem handler possível ou é o /limites', () => {
    const ids = COMPOSER_SLASH_COMMANDS.map(row => row.id)
    expect(ids).toEqual(['limites', 'assunto', 'lado', 'ensinar', 'contratar', 'resumo'])
  })
})

describe('menu "/" no composer', () => {
  it('sem ações: "/" lista só "Ver limites do motor"', () => {
    render(<ChannelComposer t={t} members={[]} />)
    typeSlash('/')
    expect(optionNames()).toHaveLength(1)
    expect(optionNames()[0]).toContain(chatPt['composer.slash.limites'])
  })

  it('com ações: lista /limites e o que a tela entregou, sem /lado nem /resumo', () => {
    render(<ChannelComposer t={t} members={[]} slashActions={{ assunto: vi.fn(), contratar: vi.fn(), ensinar: vi.fn() }} />)
    typeSlash('/')
    const names = optionNames().join(' | ')
    expect(names).toContain(chatPt['composer.slash.limites'])
    expect(names).toContain(chatPt['composer.slash.assunto'])
    expect(names).toContain(chatPt['composer.slash.ensinar'])
    expect(names).toContain(chatPt['composer.slash.contratar'])
    expect(names).not.toContain(chatPt['composer.slash.lado'])
    expect(names).not.toContain(chatPt['composer.slash.resumo'])
  })

  it('"/ensinar" chama a ação e limpa o campo', () => {
    const ensinar = vi.fn()
    render(<ChannelComposer t={t} members={[]} slashActions={{ ensinar }} />)
    typeSlash('/ensinar')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(ensinar).toHaveBeenCalledWith('')
    expect(field().value).toBe('')
  })

  it('"/contratar" por clique no item do menu', () => {
    const contratar = vi.fn()
    render(<ChannelComposer t={t} members={[]} slashActions={{ contratar }} />)
    typeSlash('/contr')
    fireEvent.click(screen.getByRole('option', { name: new RegExp(chatPt['composer.slash.contratar'], 'u') }))
    expect(contratar).toHaveBeenCalledTimes(1)
  })

  it('"/assunto nome" entrega o nome; Enter sem o nome só deixa o comando pronto para digitar', () => {
    const assunto = vi.fn()
    render(<ChannelComposer t={t} members={[]} slashActions={{ assunto }} />)
    typeSlash('/assunto')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(assunto).not.toHaveBeenCalled()
    expect(field().value).toBe('/assunto ')
    typeSlash('/assunto Compras da semana')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(assunto).toHaveBeenCalledWith('Compras da semana')
    expect(field().value).toBe('')
  })

  it('/limites continua abrindo o painel acima do composer', () => {
    render(<ChannelComposer t={t} members={[]} />)
    typeSlash('/limites')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(screen.getByRole('region', { name: chatPt['composer.limitsPanelTitle'] })).toBeTruthy()
  })

  it('uma mensagem normal que começa com "/" sem comando válido é enviada como texto (o menu não engole)', () => {
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={[]} onSend={onSend} />)
    typeSlash('/etc/hosts quebrou')
    expect(menu()).toBeNull()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('/etc/hosts quebrou', [])
  })
})

describe('DM: cada conversa tem a sua memória', () => {
  const NINA: DmRowUi = { id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa' }
  const BENTO: DmRowUi = { id: 'dm-bento', peerId: 'bento', peerName: 'Bento', characterId: 'bento', role: 'Engenharia' }

  function dm(selectedId: string, onSend = vi.fn()) {
    return (
      <DirectMessagesView
        t={t}
        shellT={shellTranslate}
        loading={false}
        dms={[NINA, BENTO]}
        selectedId={selectedId}
        messages={[]}
        onSelect={() => undefined}
        onSend={onSend}
        slashActions={{ ensinar: vi.fn() }}
      />
    )
  }
  const composer = (name: string): HTMLTextAreaElement => screen.getByPlaceholderText(`Mensagem para ${name}…`) as HTMLTextAreaElement

  it('o rascunho digitado numa DM não aparece na outra (nada de mensagem para a pessoa errada)', () => {
    const { rerender } = render(dm('dm-nina'))
    fireEvent.change(composer('Nina'), { target: { value: 'só para a Nina' } })
    rerender(dm('dm-bento'))
    expect(composer('Bento').value).toBe('')
  })

  it('o histórico (↑) é da conversa: o que foi enviado à Nina não volta no Bento', () => {
    const { rerender } = render(dm('dm-nina'))
    fireEvent.change(composer('Nina'), { target: { value: 'pedido da Nina' } })
    fireEvent.keyDown(composer('Nina'), { key: 'Enter' })
    rerender(dm('dm-bento'))
    fireEvent.keyDown(composer('Bento'), { key: 'ArrowUp' })
    expect(composer('Bento').value).toBe('')
    rerender(dm('dm-nina'))
    fireEvent.keyDown(composer('Nina'), { key: 'ArrowUp' })
    expect(composer('Nina').value).toBe('pedido da Nina')
  })

  it('o /ensinar aparece na DM (a ação existe) e o /lado não', () => {
    render(dm('dm-nina'))
    const box = composer('Nina')
    fireEvent.change(box, { target: { value: '/', selectionStart: 1 } })
    const names = within(screen.getByRole('listbox', { name: chatPt['composer.slashMenu'] })).getAllByRole('option').map(option => option.textContent ?? '').join(' | ')
    expect(names).toContain(chatPt['composer.slash.ensinar'])
    expect(names).not.toContain(chatPt['composer.slash.lado'])
  })
})
