// @vitest-environment jsdom
// P0-17 (T3-UX-HARVEST §3): ↑ no composer vazio traz o último pedido desta conversa (↑↓ navegam); Ctrl+S guarda o que foi
// digitado e esvazia o campo (com o campo vazio devolve); colagem >= 32 KiB vira o cartão "Texto colado · N mil caracteres
// · Abrir". Tudo por teclado, sobrevive a trocar de tela/reiniciar (localStorage) e nunca guarda o conteúdo dos anexos.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { COMPOSER_LARGE_PASTE_BYTES } from '../src/client/chat/composer-memory.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // a dica de 1ª vez "Quem responde" não faz parte deste teste
  localStorage.setItem('persona.hint.whoResponds', '1')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(chatPt['composer.placeholderChannel']) as HTMLTextAreaElement

function type(text: string): void {
  fireEvent.change(field(), { target: { value: text } })
}

function sendTyped(text: string): void {
  type(text)
  fireEvent.keyDown(field(), { key: 'Enter' })
}

function renderComposer(props: Partial<React.ComponentProps<typeof ChannelComposer>> = {}) {
  return render(<ChannelComposer t={t as never} members={[]} onSend={vi.fn()} conversationKey="dm:nina" {...props} />)
}

describe('↑ traz o último pedido (histórico por conversa)', () => {
  it('↑ no campo vazio traz o último; ↑ de novo vai mais para trás; ↓ volta; passar do mais novo esvazia', () => {
    renderComposer()
    sendTyped('primeiro pedido')
    sendTyped('segundo pedido')
    expect(field().value).toBe('')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('segundo pedido')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('primeiro pedido')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('primeiro pedido')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().value).toBe('segundo pedido')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().value).toBe('')
  })

  it('com texto no campo as setas só movem o cursor (não trocam o rascunho)', () => {
    renderComposer()
    sendTyped('antigo')
    type('estou escrevendo')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('estou escrevendo')
  })

  it('editar o pedido recuperado o torna um rascunho normal: ↓ não apaga a edição', () => {
    renderComposer()
    sendTyped('pedido original')
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    type('pedido original, editado')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().value).toBe('pedido original, editado')
  })

  it('o histórico é de cada conversa e sobrevive a trocar de tela e reabrir o app', () => {
    const first = renderComposer()
    sendTyped('só da Nina')
    first.unmount()
    renderComposer({ conversationKey: 'dm:bento' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('')
    cleanup()
    renderComposer({ conversationKey: 'dm:nina' })
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('só da Nina')
  })

  it('sem nenhum pedido enviado, ↑ não faz nada', () => {
    renderComposer()
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(field().value).toBe('')
  })
})

describe('Ctrl+S: o rascunho guardado', () => {
  it('com texto: guarda, esvazia o campo e mostra o chip "Rascunho guardado · hora"', () => {
    renderComposer()
    type('meu rascunho')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(field().value).toBe('')
    const chip = screen.getByRole('button', { name: /Rascunho guardado · \d{1,2}:\d{2}/u })
    expect(chip).toBeTruthy()
    expect(within(chip).getByRole('status')).toBeTruthy()
    expect(chip.getAttribute('aria-keyshortcuts')).toBe('Control+S')
  })

  it('com o campo vazio o mesmo atalho devolve o rascunho e o chip some', () => {
    renderComposer()
    type('devolva isto')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(field().value).toBe('devolva isto')
    expect(screen.queryByRole('button', { name: /Rascunho guardado/u })).toBeNull()
  })

  it('o clique no chip também devolve', () => {
    renderComposer()
    type('por clique')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: /Rascunho guardado/u }))
    expect(field().value).toBe('por clique')
  })

  it('Cmd+S (macOS) faz o mesmo e o atalho não deixa o navegador salvar a página', () => {
    renderComposer()
    type('no mac')
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
    act(() => { field().dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    expect(field().value).toBe('')
  })

  it('só espaços não viram rascunho; sem rascunho guardado o atalho com campo vazio não faz nada', () => {
    renderComposer()
    type('   ')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(screen.queryByRole('button', { name: /Rascunho guardado/u })).toBeNull()
    type('')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(field().value).toBe('')
  })

  it('sobrevive a trocar de tela e a reabrir o app (volta o chip e o texto)', () => {
    const first = renderComposer()
    type('continuo depois')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    first.unmount()
    renderComposer()
    expect(screen.getByRole('button', { name: /Rascunho guardado/u })).toBeTruthy()
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(field().value).toBe('continuo depois')
  })

  it('não guarda mais do que o texto digitado (nada de conteúdo de anexo) e é por conversa', () => {
    renderComposer()
    type('só isto')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    const stored = Object.entries({ ...localStorage }).filter(([key]) => key.includes('pocket'))
    expect(stored).toHaveLength(1)
    expect(stored[0]?.[0]).toContain('dm:nina')
    expect(JSON.parse(stored[0]?.[1] ?? '{}')).toEqual({ text: 'só isto', savedAt: expect.any(String), attachmentNames: [] })
    cleanup()
    renderComposer({ conversationKey: 'dm:bento' })
    expect(screen.queryByRole('button', { name: /Rascunho guardado/u })).toBeNull()
  })

  it('se não deu para guardar (storage cheio), o campo fica como está: nada some e nada é prometido', () => {
    renderComposer()
    type('não perca')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError') })
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    expect(field().value).toBe('não perca')
    expect(screen.queryByRole('button', { name: /Rascunho guardado/u })).toBeNull()
  })

  it('enviar uma mensagem não perde o rascunho guardado', () => {
    renderComposer()
    type('guardado')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    sendTyped('agora outra')
    expect(screen.getByRole('button', { name: /Rascunho guardado/u })).toBeTruthy()
  })
})

describe('colagem grande vira o cartão "Texto colado · N mil caracteres · Abrir"', () => {
  const big = `${'linha de texto longa. '.repeat(Math.ceil((COMPOSER_LARGE_PASTE_BYTES * 1.5) / 22))}`.slice(0, 48_000)

  function paste(text: string): void {
    fireEvent.paste(field(), { clipboardData: { getData: () => text } })
  }

  async function renderWithUpload() {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: 'att-1', name: file.name }))
    renderComposer({ uploadAttachment })
    paste(big)
    await waitFor(() => { expect(screen.getByText(/Texto colado · 48 mil caracteres/u)).toBeTruthy() })
    return uploadAttachment
  }

  it('o campo não é entupido: o texto vai como anexo e aparece o cartão com "Abrir"', async () => {
    const upload = await renderWithUpload()
    expect(field().value).toBe('')
    expect(upload).toHaveBeenCalledTimes(1)
    const sent = upload.mock.calls[0]?.[0]
    expect(sent?.name).toBe(chatPt['composer.pasteFileName'])
    expect(sent?.size).toBe(big.length)
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeTruthy()
  })

  it('"Abrir" mostra o texto inteiro numa janela; Esc fecha e o cartão continua', async () => {
    await renderWithUpload()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog', { name: 'Texto colado' })
    expect(dialog.textContent).toContain('linha de texto longa.')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Texto colado' })).toBeNull()
    expect(screen.getByText(/Texto colado · 48 mil caracteres/u)).toBeTruthy()
  })

  it('o cartão tem o ✕ que remove (por teclado: é um botão) e some junto com o texto guardado em memória', async () => {
    await renderWithUpload()
    fireEvent.click(screen.getByRole('button', { name: /Remover/u }))
    expect(screen.queryByText(/Texto colado/u)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull()
  })

  it('texto pequeno cola normalmente no campo (sem cartão)', () => {
    const uploadAttachment = vi.fn()
    renderComposer({ uploadAttachment })
    const small = 'um parágrafo curto'
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } }
    event.clipboardData = { getData: () => small }
    act(() => { field().dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(false)
    expect(uploadAttachment).not.toHaveBeenCalled()
    expect(screen.queryByText(/Texto colado/u)).toBeNull()
  })

  it('sem upload no host a colagem grande entra no campo como texto (nada é perdido)', () => {
    renderComposer()
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } }
    event.clipboardData = { getData: () => big }
    act(() => { field().dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(false)
  })

  it('o Ctrl+S guarda só o que foi digitado, nunca o texto colado', async () => {
    await renderWithUpload()
    type('comentário curto')
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true })
    const stored = Object.entries({ ...localStorage }).filter(([key]) => key.includes('pocket'))
    expect(stored[0]?.[1]).not.toContain('linha de texto longa')
  })
})
