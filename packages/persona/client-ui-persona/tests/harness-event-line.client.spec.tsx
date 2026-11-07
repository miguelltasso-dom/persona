// @vitest-environment jsdom
// HT-3 (contracts/harness-tools.md §8): a linha "{persona} começou “{tarefa}” porque você moveu para Fazendo" e o porquê de não ter
// começado (pausa · silêncio · entrega pendente · sem responsável), com a ação que resolve. O host manda campos; as palavras são daqui.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HarnessEventLine, harnessLineText } from '../src/client/chat/HarnessEventLine.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapHarnessLine, mapMessage, type ChannelMessageUi, type HarnessLineUi } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const line = (extra: Partial<HarnessLineUi> = {}): HarnessLineUi => ({
  outcome: 'started', ticketId: 'ticket-9f3a', title: 'Logo da padaria', personaId: 'persona-nina', personaName: 'Nina', characterId: 'nina', ...extra,
})

const TEAM = { personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' }], members: [] } as unknown as TeamView

function event(harness: MessageView['harness'], body = 'Nina começou “Logo da padaria”.'): MessageView {
  return {
    id: 'coord-board-ticket-9f3a-1', streamId: 'channel:geral', seq: 7, body, actorId: 'coordination', subjectId: '', occurredAt: '2026-11-04T20:00:00.000Z',
    type: 'message', source: 'host', attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '',
    ...(harness === undefined ? {} : { harness }),
  } as MessageView
}

describe('textos (PERSONA-POWERS-SPEC §4)', () => {
  it('começou', () => {
    expect(harnessLineText(t, line())).toBe('Nina começou “Logo da padaria” porque você moveu para Fazendo')
  })

  it.each([
    ['paused', undefined, 'Nina está em pausa. “Logo da padaria” fica em Fazendo e começa quando Nina voltar.'],
    ['silence', undefined, '“Logo da padaria” fica em Fazendo e começa quando acabar o silêncio de Nina.'],
    ['silence', '07:00', '“Logo da padaria” fica em Fazendo e começa quando acabar o silêncio de Nina (às 07:00).'],
    ['delivery_pending', undefined, 'Nina ainda espera você decidir a entrega anterior. “Logo da padaria” começa depois que você Aplicar ou Descartar.'],
    ['no_owner', undefined, '“Logo da padaria” está em Fazendo, mas ainda não tem responsável. Escolha uma persona para começar.'],
  ] as const)('não começou: %s %s', (reason, until, expected) => {
    expect(harnessLineText(t, line({ outcome: 'held', reason, ...(until === undefined ? {} : { until }) }))).toBe(expected)
  })

  it('sem o nome da persona: "A persona", nunca "undefined" nem o id', () => {
    const { personaName: _n, personaId: _i, characterId: _c, ...anonymous } = line()
    const text = harnessLineText(t, anonymous)
    expect(text).toBe('A persona começou “Logo da padaria” porque você moveu para Fazendo')
    expect(text).not.toMatch(/undefined|persona-nina|ticket-9f3a/u)
  })
})

describe('mapHarnessLine (o título é sempre o da tarefa)', () => {
  const base = { verb: 'board_card_move', outcome: 'started', ticketId: 'ticket-9f3a', title: 'Logo da padaria', persona: { personaId: 'persona-nina', name: 'Nina' } } as const

  it('mapeia o resultado com a persona do time (rosto e nome)', () => {
    const mapped = mapHarnessLine(event(base as MessageView['harness']), TEAM)
    expect(mapped).toMatchObject({ outcome: 'started', ticketId: 'ticket-9f3a', title: 'Logo da padaria', personaId: 'persona-nina', personaName: 'Nina', characterId: 'nina' })
  })

  it('título com cara de id some a linha (o corpo legível do host fica como fallback); id nunca vai para a tela', () => {
    expect(mapHarnessLine(event({ ...base, title: 'ticket-9f3a' } as MessageView['harness']), TEAM)).toBeUndefined()
    expect(mapHarnessLine(event({ ...base, title: '  ' } as MessageView['harness']), TEAM)).toBeUndefined()
  })

  it('motivo e hora do silêncio passam; hora vazia some; verbo desconhecido é ignorado', () => {
    expect(mapHarnessLine(event({ ...base, outcome: 'held', reason: 'silence', until: ' 07:00 ' } as MessageView['harness']), TEAM)).toMatchObject({ reason: 'silence', until: '07:00' })
    expect(mapHarnessLine(event({ ...base, outcome: 'held', reason: 'silence', until: '' } as MessageView['harness']), TEAM)).not.toHaveProperty('until')
    expect(mapHarnessLine(event({ ...base, verb: 'board_card_delete' } as unknown as MessageView['harness']), TEAM)).toBeUndefined()
  })

  it('sem persona (sem dona): linha sem nome, sem rosto', () => {
    const { persona: _p, ...noOwner } = base
    const mapped = mapHarnessLine(event({ ...noOwner, outcome: 'held', reason: 'no_owner' } as MessageView['harness']), TEAM)
    expect(mapped).toMatchObject({ outcome: 'held', reason: 'no_owner' })
    expect(mapped).not.toHaveProperty('personaName')
    expect(mapped).not.toHaveProperty('characterId')
  })

  it('mapMessage carrega a linha para o fio', () => {
    const row = mapMessage(event(base as MessageView['harness']), TEAM, 'me')
    expect(row.harness).toMatchObject({ outcome: 'started', title: 'Logo da padaria' })
  })
})

describe('a linha no fio', () => {
  it('começou: o texto e "Ver tarefa" só com o destino', () => {
    const open = vi.fn()
    const { rerender } = render(<HarnessEventLine t={t} line={line()} rowTag="div" />)
    expect(screen.getByText(/Nina começou “Logo da padaria” porque você moveu para Fazendo/u)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull() // sem handler, sem botão morto
    rerender(<HarnessEventLine t={t} line={line()} rowTag="div" onOpenTask={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver tarefa' }))
    expect(open).toHaveBeenCalledWith('ticket-9f3a')
  })

  it('pausa: "Retomar Nina" chama o handler com o id da persona e fica desabilitado enquanto espera', async () => {
    let finish: () => void = () => undefined
    const resume = vi.fn(() => new Promise<void>((done) => { finish = done }))
    render(<HarnessEventLine t={t} line={line({ outcome: 'held', reason: 'paused' })} rowTag="div" onResumePersona={resume} />)
    const button = screen.getByRole('button', { name: 'Retomar Nina' })
    fireEvent.click(button)
    expect(resume).toHaveBeenCalledWith('persona-nina')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(resume).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await Promise.resolve() })
    expect((screen.getByRole('button', { name: 'Retomar Nina' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('pausa sem handler: sem "Retomar" (nenhum botão sem destino)', () => {
    render(<HarnessEventLine t={t} line={line({ outcome: 'held', reason: 'paused' })} rowTag="div" />)
    expect(screen.queryByRole('button', { name: /Retomar/u })).toBeNull()
  })

  it.each([
    ['delivery_pending', 'Revisar mudanças'],
    ['no_owner', 'Escolher responsável'],
  ] as const)('%s: a ação "%s" abre a tarefa', (reason, label) => {
    const open = vi.fn()
    render(<HarnessEventLine t={t} line={line({ outcome: 'held', reason })} rowTag="div" onOpenTask={open} />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(open).toHaveBeenCalledWith('ticket-9f3a')
    expect(screen.queryByRole('button', { name: 'Ver tarefa' })).toBeNull()
  })

  it('"esperando" não é erro (Muse): o relógio pequeno ao lado do rosto nas 4 de esperando; o "começou" não tem relógio', () => {
    for (const reason of ['paused', 'silence', 'delivery_pending', 'no_owner'] as const) {
      const { container, unmount } = render(<HarnessEventLine t={t} line={line({ outcome: 'held', reason })} rowTag="div" />)
      expect(container.querySelector('svg'), reason).not.toBeNull() // o relógio
      unmount()
    }
    const started = render(<HarnessEventLine t={t} line={line()} rowTag="div" />)
    const clocks = started.container.querySelectorAll('[class*="clock"]')
    expect(clocks).toHaveLength(0)
  })

  it('nenhum id nem palavra técnica na tela', () => {
    render(<HarnessEventLine t={t} line={line({ outcome: 'held', reason: 'delivery_pending' })} rowTag="div" onOpenTask={() => undefined} />)
    expect(document.body.textContent).not.toMatch(/ticket-9f3a|persona-nina|board_card_move|harness|undefined/iu)
  })
})

describe('no MessageList (canal e DM)', () => {
  it('a mensagem com `harness` vira a linha de evento, em <li>, e as demais seguem como mensagem', () => {
    const plain: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Você', body: 'Oi', timeLabel: '20:00', reactions: [] }
    const withHarness: ChannelMessageUi = { id: 'm2', authorId: 'coordination', authorName: 'Coordenação', body: 'corpo legível', timeLabel: '20:01', reactions: [], harness: line() }
    const open = vi.fn()
    render(<MessageList t={t} messages={[plain, withHarness]} onOpenTaskOnBoard={open} />)
    const rows = document.querySelectorAll('[data-harness-line]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tagName).toBe('LI')
    expect(within(rows[0] as HTMLElement).getByText(/Nina começou “Logo da padaria”/u)).toBeTruthy()
    expect(screen.getByText('Oi')).toBeTruthy()
    expect(screen.queryByText('corpo legível')).toBeNull() // o corpo é só o fallback de quem não entende o campo
    fireEvent.click(screen.getByRole('button', { name: 'Ver tarefa' }))
    expect(open).toHaveBeenCalledWith('ticket-9f3a')
  })
})
