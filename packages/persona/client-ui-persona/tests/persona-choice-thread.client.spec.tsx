// @vitest-environment jsdom
// Colheita item 11 · o cartão de escolha do fim da vez NO FIO: o mapa do host, as palavras da persona com o cartão logo abaixo, a flag
// persona.flag.personaAsk e o toque (answerChoice no Remote, nunca answerAttention, porque nenhuma Tarefa espera por este cartão).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapMessage, mapMessagePersonaAsk, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { useConnectedPersonaAsks, type PersonaAsksBinding } from '../src/client/ask/use-connected-persona-asks.ts'
import { PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const TEAM = { personas: [{ id: 'p-bia', name: 'Bia', avatarRef: 'bia', title: 'Redação' }], members: [] } as unknown as TeamView
const TENANT = { workspaceId: 'ws', projectId: 'proj' }

function offerEvent(body = 'Fiz as duas versões do post.'): MessageView {
  return {
    id: 'm-offer', streamId: 'channel:geral', seq: 4, body, actorId: 'p-bia', subjectId: '', occurredAt: '2026-11-11T17:30:00.000Z',
    type: 'message', source: 'host', attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '',
    personaAsk: {
      kind: 'fimDoTurno', askId: 'choice:m-offer', ticketId: '', personaId: 'p-bia', personaName: 'Bia', question: 'Qual delas publicamos?', multiple: false,
      options: [{ id: 'a', label: 'Post para o Instagram' }, { id: 'b', label: 'Post para o Facebook' }],
    },
  } as MessageView
}

const mapped = (body?: string): ChannelMessageUi => mapMessage(offerEvent(body), TEAM, 'owner')

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('o mapa do host para a mensagem do fim da vez', () => {
  it('leva o cartão com a variante, sem Tarefa, e o nome e o retrato do elenco; as palavras da persona seguem', () => {
    const ui = mapMessagePersonaAsk(offerEvent(), TEAM)
    expect(ui).toMatchObject({ kind: 'fimDoTurno', askId: 'choice:m-offer', ticketId: '', personaName: 'Bia', multiple: false })
    expect(ui?.characterId).toBeTruthy()
    expect(ui?.options.map(option => option.id)).toEqual(['a', 'b'])
    expect(mapped().body).toBe('Fiz as duas versões do post.')
    expect(mapped().personaAsk?.kind).toBe('fimDoTurno')
  })
})

describe('o fio com e sem a flag', () => {
  const binding = (extra: Partial<PersonaAsksBinding> = {}): PersonaAsksBinding => ({ liveById: {}, onAnswer: vi.fn().mockResolvedValue(undefined), ...extra })

  it('sem o binding (flag desligada) o fio mostra só as palavras da persona, sem cartão e sem marcador', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} /></ol>)
    expect(screen.getByText('Fiz as duas versões do post.')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(document.body.textContent).not.toContain('[[')
  })

  it('com o binding: as palavras da persona como mensagem e o cartão logo abaixo, sem repetir o nome', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding()} /></ol>)
    expect(screen.getByText('Fiz as duas versões do post.')).toBeTruthy()
    const card = document.querySelector('[data-persona-ask-kind="fimDoTurno"]')
    expect(card).not.toBeNull()
    expect(screen.getAllByRole('radio').map(radio => radio.getAttribute('data-letter'))).toEqual(['A', 'B'])
    expect(screen.getAllByText('Bia')).toHaveLength(1) // o nome aparece uma vez (na mensagem), não de novo no cartão
  })

  it('uma mensagem só com o cartão (sem palavras) mostra o rosto e o nome no próprio cartão', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[mapped('')]} personaAsks={binding()} /></ol>)
    expect(screen.getAllByText('Bia')).toHaveLength(1)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(document.querySelectorAll('[data-persona-ask-kind="fimDoTurno"]')).toHaveLength(1)
  })

  it('tocar numa opção manda a escolha ao binding com a letra; o estado vivo do host deixa o cartão só leitura', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding({ onAnswer })} /></ol>)
    fireEvent.click(screen.getByRole('radio', { name: /Post para o Facebook/u }))
    await waitFor(() => { expect(onAnswer).toHaveBeenCalledTimes(1) })
    expect(onAnswer.mock.calls[0]![0].askId).toBe('choice:m-offer')
    expect(onAnswer.mock.calls[0]![1]).toEqual(['b'])
    rerender(<ol><MessageList t={t} team={TEAM} messages={[mapped()]} personaAsks={binding({ liveById: { 'choice:m-offer': { status: 'answered', optionIds: ['b'], text: '✓ B · Post para o Facebook', answeredAt: '2026-11-11T17:32:00.000Z' } } })} /></ol>)
    expect(screen.getByText(/Você escolheu B/u)).toBeTruthy()
  })
})

describe('o hook useConnectedPersonaAsks com o cartão do fim da vez', () => {
  function Probe({ remote, messages }: { readonly remote: object | undefined; readonly messages: readonly ChannelMessageUi[] }): ReactNode {
    const [tick] = useState(0)
    const binding = useConnectedPersonaAsks({ remote, tenant: TENANT, messages, refreshKey: `${String(messages.length)}:${String(tick)}` })
    return (
      <div>
        <span data-testid="state">{binding === undefined ? 'off' : 'on'}</span>
        <span data-testid="live">{binding === undefined ? '' : JSON.stringify(binding.liveById)}</span>
        <button type="button" onClick={() => { void binding?.onAnswer(messages[0]!.personaAsk!, ['b']).catch(() => undefined) }}>escolher</button>
      </div>
    )
  }

  const fakeRemote = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    listPersonaAsks: vi.fn().mockResolvedValue([]),
    answerAttention: vi.fn().mockResolvedValue(true),
    answerChoice: vi.fn().mockResolvedValue(true),
    ...extra,
  })

  it('o toque chama answerChoice com a mensagem da persona e a opção, nunca answerAttention, e marca respondida', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const remote = fakeRemote()
    render(<Probe remote={remote} messages={[mapped()]} />)
    expect(screen.getByTestId('state').textContent).toBe('on')
    fireEvent.click(screen.getByRole('button', { name: 'escolher' }))
    await waitFor(() => { expect(remote.answerChoice).toHaveBeenCalledTimes(1) })
    expect(remote.answerChoice).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', messageId: 'm-offer', optionId: 'b' })
    expect(remote.answerAttention).not.toHaveBeenCalled()
    await waitFor(() => { expect(screen.getByTestId('live').textContent).toContain('"answered"') })
  })

  it('o estado respondido do host (listPersonaAsks) chega por askId; a falha do host (já escolhida) volta como recusa', async () => {
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    const answerChoice = vi.fn().mockResolvedValue({ ok: false, error: { code: 'conflict', message: 'Você já escolheu neste cartão.' } })
    const remote = fakeRemote({
      answerChoice,
      listPersonaAsks: vi.fn().mockResolvedValue([{ askId: 'choice:m-offer', status: 'answered', answer: { optionIds: ['a'], text: '✓ A · Post para o Instagram', attachmentIds: [], answeredAt: '2026-11-11T17:32:00.000Z' } }]),
    })
    render(<Probe remote={remote} messages={[mapped()]} />)
    await waitFor(() => { expect(screen.getByTestId('live').textContent).toContain('"optionIds":["a"]') })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'escolher' })); await Promise.resolve() })
    expect(answerChoice).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('live').textContent).toContain('"optionIds":["a"]') // a escolha que já valia continua
  })
})
