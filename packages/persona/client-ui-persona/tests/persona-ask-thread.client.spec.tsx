// @vitest-environment jsdom
// IV-10 · a pergunta estruturada NO FIO: o mapa do host, a flag persona.flag.personaAsk, o estado vivo (listPersonaAsks) e a resposta
// pelos chips (answerAttention com optionIds). Sem a flag, o corpo simples do host aparece como antes.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapMessage, mapMessagePersonaAsk, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { useConnectedPersonaAsks, type PersonaAsksBinding } from '../src/client/ask/use-connected-persona-asks.ts'
import { PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import { answerAskChoices, listAskStates, personaAsksRemoteFrom } from '../src/client/ask/persona-asks-remote.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const TEAM = { personas: [{ id: 'p-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação' }], members: [] } as unknown as TeamView
const TENANT = { workspaceId: 'ws', projectId: 'proj' }

/** A mensagem da pergunta; `card: null` tira o cartão (mensagem comum), `card: {...}` troca campos dele (exactOptionalPropertyTypes: sem `undefined`). */
function askEvent(card: Partial<NonNullable<MessageView['personaAsk']>> | null = {}, dropOptions = false): MessageView {
  const base = askCard()
  const { options: _options, ...withoutOptions } = base
  const merged = card === null ? undefined : { ...(dropOptions ? withoutOptions : base), ...card }
  const message = {
    id: 'ask-msg-1', streamId: 'channel:geral', seq: 3,
    body: 'Atlas pergunta: O que a sua empresa faz?\nOpções: Padaria · Agência · Loja online',
    actorId: 'p-atlas', subjectId: '', occurredAt: '2026-11-04T20:00:00.000Z', type: 'message', source: 'host',
    attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '',
  } as MessageView
  return merged === undefined ? message : ({ ...message, personaAsk: merged } as MessageView)
}

function askCard(): NonNullable<MessageView['personaAsk']> {
  return {
    askId: 'att-1', ticketId: 'tk-1', personaId: 'p-atlas', personaName: 'Atlas', question: 'O que a sua empresa faz?', multiple: false,
    options: [{ id: 'padaria', label: 'Padaria' }, { id: 'agencia', label: 'Agência' }, { id: 'loja', label: 'Loja online' }],
  }
}

const mapped = (): ChannelMessageUi => mapMessage(askEvent(), TEAM, 'owner')

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('o mapa do host para a mensagem', () => {
  it('leva o cartão com o nome e o retrato do elenco', () => {
    const ui = mapMessagePersonaAsk(askEvent(), TEAM)
    expect(ui?.askId).toBe('att-1')
    expect(ui?.personaName).toBe('Atlas')
    expect(ui?.characterId).toBeTruthy()
    expect(ui?.options.map(option => option.label)).toEqual(['Padaria', 'Agência', 'Loja online'])
    expect(mapped().personaAsk?.askId).toBe('att-1')
  })

  it('mensagem comum não ganha cartão; pergunta sem texto legível também não', () => {
    expect(mapMessagePersonaAsk(askEvent(null), TEAM)).toBeUndefined()
    expect(mapMessagePersonaAsk(askEvent({ question: ' ' }), TEAM)).toBeUndefined()
  })
})

describe('o fio com e sem a flag', () => {
  const binding = (extra: Partial<PersonaAsksBinding> = {}): PersonaAsksBinding => ({ liveById: {}, onAnswer: vi.fn().mockResolvedValue(undefined), ...extra })

  it('sem o binding (flag desligada) o fio mostra o corpo simples do host e nenhum chip', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} /></ol>)
    expect(screen.getByText(/Atlas pergunta: O que a sua empresa faz\?/u)).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(document.querySelector('[data-persona-ask]')).toBeNull()
  })

  it('com o binding a pergunta vira o cartão com chips e o corpo simples some', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding()} /></ol>)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getAllByRole('radio').map(node => node.textContent)).toEqual(['Padaria', 'Agência', 'Loja online'])
    expect(screen.queryByText(/Opções: Padaria/u)).toBeNull()
  })

  it('tocar num chip manda a escolha ao binding', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding({ onAnswer })} /></ol>)
    fireEvent.click(screen.getByRole('radio', { name: 'Agência' }))
    await waitFor(() => { expect(onAnswer).toHaveBeenCalledTimes(1) })
    expect(onAnswer.mock.calls[0]![0].ticketId).toBe('tk-1')
    expect(onAnswer.mock.calls[0]![1]).toEqual(['agencia'])
  })

  it('o estado vivo do host (respondida) deixa o cartão só leitura', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding({ liveById: { 'att-1': { status: 'answered', optionIds: ['loja'], text: '' } } })} /></ol>)
    expect(screen.getByText('Respondida')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('pergunta só em palavras (sem 2 chips) segue a mensagem de sempre, mesmo com o binding', () => {
    const wordsOnly = mapMessage(askEvent({}, true), TEAM, 'owner')
    render(<ol><MessageList t={t} team={TEAM} messages={[wordsOnly]} personaAsks={binding()} /></ol>)
    expect(screen.getByText(/Atlas pergunta/u)).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})

describe('o Remote do host (persona-asks-remote)', () => {
  it('só enxerga o host que tem as duas chamadas', () => {
    expect(personaAsksRemoteFrom(undefined)).toBeUndefined()
    expect(personaAsksRemoteFrom({})).toBeUndefined()
    expect(personaAsksRemoteFrom({ listPersonaAsks: () => [] })).toBeUndefined()
    expect(personaAsksRemoteFrom({ listPersonaAsks: () => [], answerAttention: () => true })).toBeDefined()
  })

  it('lê o estado por askId (valor puro ou RemoteResult) e responde com optionIds e texto vazio', async () => {
    const answerAttention = vi.fn().mockResolvedValue({ ok: true, value: false })
    const remote = personaAsksRemoteFrom({
      listPersonaAsks: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          { askId: 'a', status: 'answered', answer: { optionIds: ['x'], text: 'oi', attachmentIds: [], answeredAt: 'agora' } },
          { askId: 'b', status: 'open' },
        ],
      }),
      answerAttention,
    })!
    const states = await listAskStates(remote, TENANT)
    expect(states).toEqual({ a: { status: 'answered', optionIds: ['x'], text: 'oi', answeredAt: 'agora' }, b: { status: 'open', optionIds: [], text: '' } })
    expect(await answerAskChoices(remote, TENANT, 'tk-1', ['x', 'y'])).toBe(false)
    expect(answerAttention).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', ticketId: 'tk-1', text: '', optionIds: ['x', 'y'] })
  })

  it('a falha do host sobe com a frase pt-BR dele', async () => {
    const remote = personaAsksRemoteFrom({
      listPersonaAsks: () => [],
      answerAttention: () => ({ ok: false, error: { code: 'conflict', message: 'Essa pergunta já foi respondida.' } }),
    })!
    await expect(answerAskChoices(remote, TENANT, 'tk-1', ['x'])).rejects.toThrow('Essa pergunta já foi respondida.')
  })
})

describe('o hook useConnectedPersonaAsks', () => {
  function Probe({ remote, messages }: { readonly remote: object | undefined; readonly messages: readonly ChannelMessageUi[] }): ReactNode {
    const [tick] = useState(0)
    const binding = useConnectedPersonaAsks({ remote, tenant: TENANT, messages, refreshKey: `${String(messages.length)}:${String(tick)}` })
    return (
      <div>
        <span data-testid="state">{binding === undefined ? 'off' : 'on'}</span>
        <span data-testid="live">{binding === undefined ? '' : JSON.stringify(binding.liveById)}</span>
        <button type="button" onClick={() => { void binding?.onAnswer(messages[0]!.personaAsk!, ['agencia']).catch(() => undefined) }}>responder</button>
      </div>
    )
  }

  const fakeRemote = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    listPersonaAsks: vi.fn().mockResolvedValue([{ askId: 'att-1', status: 'open' }]),
    answerAttention: vi.fn().mockResolvedValue(true),
    ...extra,
  })

  it('desligado por padrão: sem a flag nada acontece e o host nem é chamado', async () => {
    const remote = fakeRemote()
    render(<Probe remote={remote} messages={[mapped()]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
    await act(async () => { await Promise.resolve() })
    expect(remote.listPersonaAsks).not.toHaveBeenCalled()
  })

  it('com a flag mas sem as chamadas no host, ou sem pergunta com chips no fio: fica desligado', () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const { rerender } = render(<Probe remote={{ listPersonaAsks: () => [] }} messages={[mapped()]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
    rerender(<Probe remote={fakeRemote()} messages={[]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
  })

  it('ligado: lê o estado vivo e responde pelo Remote; a resposta marca respondida e o host é lido de novo', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const remote = fakeRemote()
    render(<Probe remote={remote} messages={[mapped()]} />)
    expect(screen.getByTestId('state').textContent).toBe('on')
    await waitFor(() => { expect(screen.getByTestId('live').textContent).toContain('"att-1"') })
    expect(remote.listPersonaAsks).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
    fireEvent.click(screen.getByRole('button', { name: 'responder' }))
    await waitFor(() => { expect(remote.answerAttention).toHaveBeenCalledTimes(1) })
    expect(remote.answerAttention).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', ticketId: 'tk-1', text: '', optionIds: ['agencia'] })
    await waitFor(() => { expect(screen.getByTestId('live').textContent).toContain('"answered"') })
    await waitFor(() => { expect((remote.listPersonaAsks as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2) })
  })
})
