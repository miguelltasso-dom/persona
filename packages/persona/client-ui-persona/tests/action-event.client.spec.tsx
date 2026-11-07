// @vitest-environment jsdom
// D-084 / PERSONA-POWERS-SPEC §2 ("Age dentro de limites": faz e mostra): a linha "{persona} enviou um email para …" quando a persona agiu direto.
// O "Desfazer · 18 s" só aparece quando o host diz que dá (`undoable` + prazo) e NUNCA em email, post ou pagamento.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionEventLine, actionEventText, formatUndoLeft, HARNESS_VERBS } from '../src/client/chat/ActionEventLine.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import { mapActionEvent, mapMessage, type ActionEventUi, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ActionEventWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z')) })
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = { personas: [], members: [] } as unknown as TeamView
const FUTURE = '2026-11-05T12:00:18.000Z' // 18 s depois do "agora" fixo
const wire = (extra: Partial<ActionEventWire> = {}): ActionEventWire => ({ verb: 'email', connectorName: 'Gmail', target: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', activityId: 'act-1', ...extra })
const ui = (extra: Partial<ActionEventWire> = {}): ActionEventUi => mapActionEvent({ actionEvent: wire(extra) } as unknown as MessageView)!

describe('mapActionEvent (nunca um Desfazer falso)', () => {
  it('email/post/pagamento NUNCA têm Desfazer, mesmo que o host marque undoable por engano', () => {
    for (const verb of ['email', 'post', 'pay'] as const) {
      expect(ui({ verb, undoable: true, undoUntil: FUTURE })).not.toHaveProperty('undoUntilMs')
    }
  })

  it('apagar (restaurar da lixeira) e ações do harness têm Desfazer só com undoable E prazo válido', () => {
    expect(ui({ verb: 'delete', undoable: true, undoUntil: FUTURE })).toHaveProperty('undoUntilMs', Date.parse(FUTURE))
    expect(ui({ verb: 'board_card_move', undoable: true, undoUntil: FUTURE })).toMatchObject({ verb: 'other', undoUntilMs: Date.parse(FUTURE) })
    expect(ui({ verb: 'delete', undoable: false, undoUntil: FUTURE })).not.toHaveProperty('undoUntilMs')
    expect(ui({ verb: 'delete', undoable: true })).not.toHaveProperty('undoUntilMs')
    expect(ui({ verb: 'delete', undoable: true, undoUntil: 'amanhã' })).not.toHaveProperty('undoUntilMs')
  })

  it('sem destino, conector ou id da atividade não há linha', () => {
    expect(mapActionEvent({ actionEvent: wire({ target: ' ' }) } as unknown as MessageView)).toBeUndefined()
    expect(mapActionEvent({ actionEvent: wire({ connectorName: '' }) } as unknown as MessageView)).toBeUndefined()
    expect(mapActionEvent({ actionEvent: wire({ activityId: '' }) } as unknown as MessageView)).toBeUndefined()
    expect(mapActionEvent({} as MessageView)).toBeUndefined()
  })

  it('mapMessage carrega a linha', () => {
    const row = mapMessage(hostMessage({ id: 'm1', seq: 1, actorId: 'persona-nina', body: 'enviou', subjectId: '', occurredAt: '2026-11-05T11:59:00.000Z', actionEvent: wire() } as never), TEAM, 'ana')
    expect(row.actionEvent).toMatchObject({ verb: 'email', target: 'ana@padarialua.com.br', subject: 'Encomenda de sexta' })
  })
})

describe('textos', () => {
  it.each([
    [{ verb: 'email' }, 'Nina enviou um email para ana@padarialua.com.br · Encomenda de sexta'],
    [{ verb: 'email', subject: undefined }, 'Nina enviou um email para ana@padarialua.com.br'],
    [{ verb: 'post', target: 'Bolo de sexta' }, 'Nina publicou no Gmail'],
    [{ verb: 'pay', target: 'R$ 120,00' }, 'Nina pagou R$ 120,00 · pelo Gmail'],
    [{ verb: 'delete', target: '3 arquivos' }, 'Nina apagou 3 arquivos · no Gmail'],
    [{ verb: 'board_card_move', target: 'Logo da padaria' }, 'Nina moveu “Logo da padaria”'],
    [{ verb: 'board_card_move', target: 'Logo da padaria', after: 'Fazendo' }, 'Nina moveu “Logo da padaria” para Fazendo'],
    [{ verb: 'sprint_start', target: 'Sprint 12' }, 'Nina iniciou a sprint “Sprint 12”'],
    [{ verb: 'routine_pause', target: 'Resumo da manhã' }, 'Nina pausou a rotina “Resumo da manhã”'],
    [{ verb: 'persona_hire', target: 'Bolota' }, 'Nina contratou Bolota'],
    [{ verb: 'verbo_que_ninguem_conhece', connectorName: 'Quadros', target: 'Logo da padaria' }, 'Nina mexeu em “Logo da padaria” · Quadros'],
  ] as const)('%j', (extra, text) => {
    const { subject: _s, ...base } = wire()
    const event = mapActionEvent({ actionEvent: { ...(extra.verb === 'email' && 'subject' in extra ? base : wire()), ...extra } } as unknown as MessageView)!
    expect(actionEventText(t, event, 'Nina')).toBe(text)
  })
})

describe('o tempo do Desfazer vai legível (Muse)', () => {
  it.each([[18, '18 s'], [59, '59 s'], [60, '1 min'], [61, '2 min'], [300, '5 min'], [3599, '60 min'], [3600, '1 h'], [5400, '2 h'], [7200, '2 h']] as const)('%d s -> %s', (seconds, text) => {
    expect(formatUndoLeft(t, seconds)).toBe(text)
  })

  it('o botão de 1 h não diz "3600 s"', () => {
    render(<ActionEventLine t={t} event={ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: '2026-11-05T13:00:00.000Z' })} personaName="Nina" rowTag="div" onUndo={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Desfazer · 1 h' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/3600/u)
  })
})

describe('os verbos do harness (HT-1) e a frase de reserva (sem artigo antes da persona)', () => {
  it('toda frase dos verbos conhecidos existe no locale (nunca a chave crua)', () => {
    for (const verb of HARNESS_VERBS) {
      const event = mapActionEvent({ actionEvent: wire({ verb, target: 'Alvo', after: 'Fazendo' }) } as unknown as MessageView)!
      const text = actionEventText(t, event, 'Nina')
      expect(text, verb).toMatch(/^Nina /u)
      expect(text, verb).not.toMatch(/action\.did|\{|\}/u)
    }
  })

  it('o mapper guarda o verbo do host e o "para onde"; email/post/pagamento/apagar não precisam deles', () => {
    expect(ui({ verb: 'board_card_move', after: 'Fazendo' })).toMatchObject({ verb: 'other', harnessVerb: 'board_card_move', after: 'Fazendo' })
    expect(ui({ verb: 'email' })).not.toHaveProperty('harnessVerb')
  })
})

describe('"Ver" abre o que SAIU, só leitura (Muse; PERSONA-POWERS §2)', () => {
  const EMAIL_CONTENT = { to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os 3 bolos de cenoura para sexta.' }
  const line = (extra: Partial<ActionEventWire>, timeLabel = '09:00') =>
    render(<ActionEventLine t={t} event={ui(extra)} personaName="Nina" personaCharacterId="nina" rowTag="div" timeLabel={timeLabel} onUndo={vi.fn()} />)

  it('email enviado: "Ver" abre o Para/Assunto/Mensagem e o carimbo "Enviado às 09:00"; NENHUM Desfazer', () => {
    line({ verb: 'email', undoable: true, undoUntil: FUTURE, content: EMAIL_CONTENT })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Email enviado por Nina')
    // o rosto 24 de quem enviou ao lado do título (o mesmo do eyebrow da prévia)
    expect(dialog.querySelector('img')).not.toBeNull()
    expect(dialog.textContent).toContain('ana@padarialua.com.br')
    expect(dialog.textContent).toContain('Encomenda de sexta')
    expect(dialog.textContent).toContain('Oi, Ana! Confirmo os 3 bolos de cenoura para sexta.')
    expect(screen.getByText('Enviado às 09:00')).toBeTruthy()
    // só leitura: nada para editar nem decidir dentro
    expect(dialog.querySelector('input, textarea')).toBeNull()
    expect(screen.queryByRole('button', { name: /Desfazer/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pagamento: Valor e Quem recebe em negrito, Referência e "Pago às 09:00"', () => {
    line({ verb: 'pay', target: 'R$ 120,00', content: { amount: 'R$ 120,00', payee: 'Moinho Bom Grão', reference: 'Pedido 4471' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Pagamento feito por Nina')
    expect(within(dialog).getByText('R$ 120,00').tagName).toBe('STRONG')
    expect(within(dialog).getByText('Moinho Bom Grão').tagName).toBe('STRONG')
    expect(within(dialog).getByText('Pedido 4471')).toBeTruthy()
    expect(screen.getByText('Pago às 09:00')).toBeTruthy()
  })

  it('os títulos dizem QUEM fez, sem artigo: "Publicação feita por Nina", "Itens apagados por Nina"', () => {
    const { unmount } = line({ verb: 'delete', target: '3 arquivos', content: { items: ['a.pdf'], count: 1 } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByRole('dialog').textContent).toContain('Itens apagados por Nina')
    unmount()
    line({ verb: 'post', content: { body: 'Bolo de sexta!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByRole('dialog').textContent).toContain('Publicação feita por Nina')
    expect(screen.getByRole('dialog').textContent).not.toMatch(/por a Nina|pela Nina/u)
  })

  it('apagar: a lista do que foi apagado e "Apagado às 09:00"; post: o texto e "Publicado às 09:00"', () => {
    const { unmount } = line({ verb: 'delete', target: '3 arquivos', content: { items: ['contrato-antigo.pdf', 'rascunho.docx', 'foto-1.png'], count: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByText('contrato-antigo.pdf')).toBeTruthy()
    expect(screen.getByText('Apagado às 09:00')).toBeTruthy()
    unmount()
    line({ verb: 'post', content: { body: 'Bolo de cenoura de sexta!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByText('Bolo de cenoura de sexta!')).toBeTruthy()
    expect(screen.getByText('Publicado às 09:00')).toBeTruthy()
  })

  it('sem o conteúdo (o host não guardou) ou com conteúdo incompleto NÃO há "Ver" (nada sem destino)', () => {
    const { unmount } = line({ verb: 'email' })
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
    unmount()
    const incomplete = line({ verb: 'email', content: { to: 'ana@padarialua.com.br' } }) // sem a mensagem
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
    incomplete.unmount()
    line({ verb: 'pay', content: { amount: 'R$ 120,00' } }) // sem quem recebe
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
  })

  it('ação do harness (mover cartão…) não tem "Ver" de conteúdo, mesmo que o host mande algo', () => {
    line({ verb: 'board_card_move', after: 'Fazendo', content: EMAIL_CONTENT })
    expect(screen.queryByRole('button', { name: 'Ver' })).toBeNull()
  })

  it('sem o carimbo da hora o "Ver" mostra só o conteúdo (nunca "Enviado às undefined")', () => {
    render(<ActionEventLine t={t} event={ui({ verb: 'email', content: EMAIL_CONTENT })} personaName="Nina" rowTag="div" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByRole('dialog').textContent).not.toMatch(/Enviado às|undefined/u)
  })
})

describe('ActionEventLine', () => {
  const line = (event: ActionEventUi, onUndo?: (id: string) => void | Promise<void>) =>
    render(<ActionEventLine t={t} event={event} personaName="Nina" rowTag="div" {...(onUndo === undefined ? {} : { onUndo })} />)

  it('email enviado: a linha sem nenhum botão (não tem Desfazer, nunca)', () => {
    line(ui({ verb: 'email', undoable: true, undoUntil: FUTURE }), vi.fn())
    expect(screen.getByText('Nina enviou um email para ana@padarialua.com.br · Encomenda de sexta')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Desfazer/u)
  })

  it('apagar com undoable: "Desfazer · 18 s" conta para trás e some quando o prazo acaba', async () => {
    line(ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: FUTURE }), vi.fn())
    expect(screen.getByRole('button', { name: 'Desfazer · 18 s' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByRole('button', { name: 'Desfazer · 13 s' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(14_000) })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sem o handler não há Desfazer (nenhum botão morto)', () => {
    line(ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: FUTURE }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('Desfazer chama o handler com o id da atividade, mostra "Desfazendo…" e depois some', async () => {
    let finish: () => void = () => undefined
    const onUndo = vi.fn(() => new Promise<void>((done) => { finish = done }))
    line(ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: FUTURE }), onUndo)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer · 18 s' }))
    expect(onUndo).toHaveBeenCalledWith('act-1')
    const busy = screen.getByRole('button', { name: 'Desfazendo…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(onUndo).toHaveBeenCalledTimes(1)
    finish()
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('nenhum id nem palavra técnica na tela', () => {
    line(ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: FUTURE }), vi.fn())
    expect(document.body.textContent).not.toMatch(/act-1|activityId|undoable|MCP/u)
  })
})

describe('no MessageList e a flag persona.flag.actionPreview', () => {
  const row = (): ChannelMessageUi => ({ id: 'm9', authorId: 'nina', authorName: 'Nina', body: 'Nina enviou um email.', timeLabel: '09:00', reactions: [], actionEvent: ui({ verb: 'delete', target: '3 arquivos', undoable: true, undoUntil: FUTURE }) })

  it('flag desligada: a mensagem do host aparece como texto (sem linha, sem Desfazer)', () => {
    render(<MessageList t={t} messages={[row()]} onUndoAction={vi.fn()} />)
    expect(screen.getByText(/Nina enviou um email\./u)).toBeTruthy()
    expect(document.querySelector('[data-action-event]')).toBeNull()
  })

  it('flag ligada: vira a linha em <li> e o Desfazer chega ao handler', async () => {
    localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1')
    const onUndo = vi.fn().mockResolvedValue(undefined)
    render(<MessageList t={t} messages={[row()]} onUndoAction={onUndo} />)
    const item = document.querySelector('[data-action-event="delete"]') as HTMLElement
    expect(item.tagName).toBe('LI')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer · 18 s' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(onUndo).toHaveBeenCalledWith('act-1')
  })
})
