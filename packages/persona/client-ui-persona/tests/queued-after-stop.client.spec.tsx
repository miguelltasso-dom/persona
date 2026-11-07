// @vitest-environment jsdom
// Muse 07/11 16:37 (aprovada) / Keel 16:34, lib 6c: depois do Parar a fila da persona fica GUARDADA e ela está PARADA. O balão tracejado dizia "Na fila · sai quando {name} terminar o passo atual" (falso: ela
// não vai terminar passo nenhum). Agora diz "Na fila · sai quando você continuar" e o "Mandar agora" (que envia de verdade, e a persona responde = continua) ganha o nome acessível "Mandar agora e continuar".
// Achado na prova real da fila (Flint, 07/11 16:20). O host não manda esse dado (`reason` só tem 'quota'): a evidência é a do PRÓPRIO FIO (a última mensagem da persona-alvo está parada).
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { QueuedMessageBubble, type QueuedMessageItem } from '../src/client/chat/QueuedMessageBubble.tsx'
import { isHeldAfterStop } from '../src/client/chat/queued-after-stop.ts'
import { en as chatEn, pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const tOf = (dict: Readonly<Record<string, string>>) => (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = dict[key] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}
const t = tOf(chatPt as unknown as Record<string, string>)

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { members: [], personas: [{ id: 'onb-3', name: 'Nina', avatarRef: 'nina' }, { id: 'onb-2', name: 'Bento', avatarRef: 'bento' }] } as unknown as TeamView
const item = (over: Partial<QueuedMessageItem> = {}): QueuedMessageItem => ({ id: 'q1', text: 'depois, inclua o preço de R$ 4,50', targetPersonaName: 'Nina', targetPersonaId: 'onb-3', ...over })
const msg = (id: string, authorId: string, authorPersonaId: string, body: string, extra: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({
  id, authorId, authorName: authorId === 'user' ? 'Você' : 'Nina', authorPersonaId, body, timeLabel: '10:00', reactions: [], ...extra,
})
const bubble = (over: Partial<QueuedMessageItem> = {}, dict: Readonly<Record<string, string>> = chatPt as unknown as Record<string, string>) => (
  <QueuedMessageBubble t={tOf(dict) as never} item={item(over)} onSendNow={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />
)

describe('o balão da fila', () => {
  it('enquanto a persona trabalha: a frase de sempre e o rótulo de sempre', () => {
    render(bubble())
    expect(screen.getByText('Na fila · sai quando Nina terminar o passo atual')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mandar agora a mensagem na fila' })).toBeTruthy()
  })

  it('depois do Parar: "Na fila · sai quando você continuar" e o "Mandar agora" diz "e continuar" no nome acessível (o texto visível não muda)', () => {
    render(bubble({ heldAfterStop: true }))
    expect(screen.getByText('Na fila · sai quando você continuar')).toBeTruthy()
    expect(screen.queryByText(/terminar o passo atual/u)).toBeNull()
    const send = screen.getByRole('button', { name: 'Mandar agora e continuar' })
    expect(send.textContent).toBe('Mandar agora')
    expect(screen.getByRole('button', { name: /Editar/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tirar/u })).toBeTruthy()
  })

  it('em inglês: "In queue · sends when you continue" e "Send now and continue"', () => {
    render(bubble({ heldAfterStop: true }, chatEn as unknown as Record<string, string>))
    expect(screen.getByText('In queue · sends when you continue')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send now and continue' })).toBeTruthy()
  })

  it('quem espera a cota mantém o texto da cota; "Ainda na fila" (voltou do localStorage) também não muda', () => {
    const { unmount } = render(bubble({ heldAfterStop: true, heldForQuota: true }))
    expect(screen.getByText('Na fila · sai quando a cota voltar')).toBeTruthy()
    unmount()
    render(bubble({ heldAfterStop: true, restored: true }))
    expect(screen.queryByText('Na fila · sai quando você continuar')).toBeNull()
  })
})

describe('isHeldAfterStop (a evidência é a do fio)', () => {
  const stopped = msg('p1', 'nina', 'onb-3', 'Parado. A tarefa ficou parada.', { stopped: true })

  it('a ÚLTIMA mensagem da persona-alvo está parada: sim', () => {
    expect(isHeldAfterStop(item(), [msg('u0', 'user', 'user', 'Escreva o cartaz'), stopped])).toBe(true)
  })

  it('mensagens da pessoa depois do Parar não mudam nada; a persona falou de novo (a última não é a parada): não', () => {
    expect(isHeldAfterStop(item(), [stopped, msg('u1', 'user', 'user', 'e a rua da padaria')])).toBe(true)
    expect(isHeldAfterStop(item(), [stopped, msg('p2', 'nina', 'onb-3', 'Voltei com o texto.'), msg('u1', 'user', 'user', 'ok')])).toBe(false)
    expect(isHeldAfterStop(item(), [stopped, msg('p3', 'nina', 'onb-3', 'Escrevendo…', { streaming: true })])).toBe(false)
  })

  it('o Parar de OUTRA persona não conta; sem mensagem da persona, sem persona-alvo ou com a cota: não', () => {
    expect(isHeldAfterStop(item(), [msg('p9', 'bento', 'onb-2', 'Parado.', { stopped: true })])).toBe(false)
    expect(isHeldAfterStop(item(), [msg('u0', 'user', 'user', 'oi')])).toBe(false)
    expect(isHeldAfterStop(item({ targetPersonaId: undefined }), [stopped])).toBe(false)
    expect(isHeldAfterStop(item({ heldForQuota: true }), [stopped])).toBe(false)
  })
})

describe('no fio (GeneralChannelView)', () => {
  const view = (messages: readonly ChannelMessageUi[]) => (
    <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={messages} team={TEAM} queuedMessages={[item()]} />
  )
  const queued = () => document.querySelector('[data-persona-queued-message]') as HTMLElement

  it('Nina parada pela pessoa: o balão da fila diz "sai quando você continuar"', () => {
    render(view([msg('u0', 'user', 'user', 'Escreva o cartaz'), msg('p1', 'nina', 'onb-3', 'Parado. A tarefa ficou parada.', { stopped: true })]))
    expect(within(queued()).getByText('Na fila · sai quando você continuar')).toBeTruthy()
    expect(within(queued()).getByRole('button', { name: 'Mandar agora e continuar' })).toBeTruthy()
  })

  it('Nina trabalhando (a última mensagem dela não é a parada): a frase de sempre', () => {
    render(view([msg('p0', 'nina', 'onb-3', 'Escrevendo o cartaz…', { streaming: true })]))
    expect(within(queued()).getByText('Na fila · sai quando Nina terminar o passo atual')).toBeTruthy()
    expect(within(queued()).getByRole('button', { name: 'Mandar agora a mensagem na fila' })).toBeTruthy()
  })
})
