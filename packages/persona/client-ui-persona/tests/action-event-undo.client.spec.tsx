// @vitest-environment jsdom
// COLHEITA 5 (Muse §5): ação interna e reversível = sem pergunta; a linha "A Bia criou a tarefa “Post de sexta” · Desfazer" vale por 5 min e
// depois vira texto simples (tinta suave), sem link. "Desfeito" só quando o host aceitou; se recusou, a linha diz que não deu.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionEventLine } from '../src/client/chat/ActionEventLine.tsx'
import type { GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapActionEvent, type ActionEventUi } from '../src/client/remote/map-host-ui.ts'
import type { ActionEventWire, MessageView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
const NOW = new Date('2026-11-11T14:00:00.000Z')
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { cleanup(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const FIVE_MIN = new Date(NOW.getTime() + 5 * 60_000).toISOString()
const wire = (extra: Partial<ActionEventWire> = {}): ActionEventWire => ({
  verb: 'board_card_create', connectorName: 'Persona', target: 'Post de sexta', activityId: 'act-1', undoable: true, undoUntil: FIVE_MIN, ...extra,
})
const ui = (extra: Partial<ActionEventWire> = {}): ActionEventUi => mapActionEvent({ actionEvent: wire(extra) } as unknown as MessageView)!
const line = (event: ActionEventUi, onUndo?: (id: string) => void | Promise<void>) =>
  render(<ActionEventLine t={t} event={event} personaName="Bia" rowTag="div" {...(onUndo === undefined ? {} : { onUndo })} />)
const textOf = (): HTMLElement => screen.getByText(/Bia criou a tarefa/u)

describe('a janela de 5 minutos', () => {
  it('"A Bia criou a tarefa “Post de sexta”" com "Desfazer · 5 min" enquanto vale', () => {
    line(ui(), vi.fn())
    expect(textOf().textContent).toBe('Bia criou a tarefa “Post de sexta”')
    expect(screen.getByRole('button', { name: 'Desfazer · 5 min' })).toBeTruthy()
    expect(textOf().className).not.toMatch(/muted/u)
  })

  it('o prazo conta para trás e, ao acabar, o link some e a linha vira texto simples em tinta suave', async () => {
    line(ui(), vi.fn())
    await act(async () => { vi.advanceTimersByTime(4 * 60_000 + 30_000) })
    expect(screen.getByRole('button', { name: 'Desfazer · 30 s' })).toBeTruthy()
    expect(textOf().className).not.toMatch(/muted/u)
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(screen.queryByRole('button', { name: /Desfazer/u })).toBeNull()
    expect(textOf().className).toMatch(/muted/u)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('já vencida quando a linha aparece (a conversa foi aberta depois): texto simples, sem Desfazer', () => {
    line(ui({ undoUntil: new Date(NOW.getTime() - 60_000).toISOString() }), vi.fn())
    expect(screen.queryByRole('button')).toBeNull()
    expect(textOf().className).toMatch(/muted/u)
  })

  it('uma ação que nunca teve Desfazer (sem prazo) não vira "vencida": segue como está', () => {
    line(ui({ undoable: false, undoUntil: undefined as never }), vi.fn())
    expect(screen.queryByRole('button')).toBeNull()
    expect(textOf().className).not.toMatch(/muted/u)
  })
})

describe('desfazer', () => {
  it('aceito pelo host: vira "Desfeito" em texto simples e o botão some', async () => {
    const onUndo = vi.fn(async () => undefined)
    line(ui(), onUndo)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Desfazer · 5 min' })) })
    await vi.waitFor(() => { expect(screen.getByText('Desfeito')).toBeTruthy() })
    expect(onUndo).toHaveBeenCalledWith('act-1')
    expect(screen.queryByRole('button')).toBeNull()
    expect(textOf().className).toMatch(/muted/u)
  })

  it('recusado pelo host (prazo, algo mudou): NÃO vira "Desfeito"; a linha diz que não deu e o botão continua', async () => {
    const onUndo = vi.fn(async () => { throw new Error('O prazo para desfazer passou (5 minutos).') })
    line(ui(), onUndo)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Desfazer · 5 min' })) })
    await vi.waitFor(() => { expect(screen.getByText('Não deu para desfazer.')).toBeTruthy() })
    expect(screen.queryByText('Desfeito')).toBeNull()
    expect(screen.getByRole('button', { name: 'Desfazer · 5 min' })).toBeTruthy()
  })

  it('o host já guarda como desfeita (a conversa recarregou): "Desfeito" e nenhum Desfazer, mesmo dentro dos 5 min', () => {
    line(ui({ undone: true, undoable: undefined as never, undoUntil: undefined as never }), vi.fn())
    expect(screen.getByText('Desfeito')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(textOf().className).toMatch(/muted/u)
  })

  it('sem onUndo não há botão morto', () => {
    line(ui())
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('as palavras', () => {
  it('tarefa, sprint planejada e a edição de rotina têm frase própria (nunca a de reserva)', () => {
    line(ui({ verb: 'sprint_plan', target: 'Sprint 3' }))
    expect(screen.getByText('Bia planejou a sprint “Sprint 3”')).toBeTruthy()
    cleanup()
    line(ui({ verb: 'routine_edit', target: 'Resumo da manhã' }))
    expect(screen.getByText('Bia editou a rotina “Resumo da manhã”')).toBeTruthy()
    cleanup()
    line(ui({ verb: 'board_card_delete', target: 'Rascunho' }))
    expect(screen.getByText('Bia apagou a tarefa “Rascunho”')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Persona$|mexeu em/u)
  })
})
