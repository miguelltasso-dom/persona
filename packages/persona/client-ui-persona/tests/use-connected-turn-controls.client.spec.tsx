// @vitest-environment jsdom
// FL-11 / IV-5: a ponte entre o canal conectado e o Parar / "Direcionar agora" do host. Desligada (flag), sem as chamadas do IV-5 ou sem a
// conversa: `undefined` (a tela fica como era). Ligada: para o alvo certo, diz "parou" só quando algo parou e mostra o texto do host nos erros.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKING_CONTROL_FLAG_KEY } from '../src/client/chat/working-control-flag.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { useConnectedTurnControls, type ConnectedTurnControlsInput } from '../src/client/remote/use-connected-turn-controls.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear(); vi.useRealTimers() })

const TEAM = { personas: [
  { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas' },
  { id: 'persona-nina', name: 'Nina', avatarRef: 'nina' },
] } as unknown as TeamView
const NINA: ChannelPersonaMember = { id: 'nina' as never, name: 'Nina', role: 'Design', state: 'working' }
const STREAMING: ChannelMessageUi = { id: 'coord-m1-reply', authorId: 'nina', authorName: 'Nina', body: 'Vou explicar', timeLabel: '10:00', reactions: [], streaming: true, replyToId: 'm1', authorPersonaId: 'persona-nina' }

function fakeHost(over: Record<string, unknown> = {}) {
  const calls: { method: string; request: Record<string, unknown> }[] = []
  return {
    calls,
    remote: {
      stopTurn: (request: Record<string, unknown>) => { calls.push({ method: 'stopTurn', request }); return { stopped: 'reply', ticketId: '', line: '' } },
      steerWorkingTurn: (request: Record<string, unknown>) => { calls.push({ method: 'steerWorkingTurn', request }); return { mode: 'steer', messageId: 'm9' } },
      ...over,
    },
  }
}

const base = (remote: object | undefined, over: Partial<ConnectedTurnControlsInput> = {}): ConnectedTurnControlsInput => ({
  remote, tenant: { workspaceId: 'ws', projectId: 'pr' }, team: TEAM, members: [NINA], messages: [STREAMING], responderMemberId: 'nina',
  subjectId: 'subject-geral', streamKind: 'channel', ownerId: 'ch-geral', ...over,
})

describe('quando NÃO liga', () => {
  it('flag desligada: undefined', () => {
    const host = fakeHost()
    expect(renderHook(() => useConnectedTurnControls(base(host.remote))).result.current).toBeUndefined()
  })

  it('host sem NENHUMA chamada do IV-5, sem tenant, sem canal ou sem assunto: undefined', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1')
    const host = fakeHost()
    expect(renderHook(() => useConnectedTurnControls(base({ getEngineStatus: () => ({}) }))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedTurnControls(base(undefined))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedTurnControls(base(host.remote, { tenant: null }))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedTurnControls(base(host.remote, { ownerId: null }))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedTurnControls(base(host.remote, { subjectId: '' }))).result.current).toBeUndefined()
  })
})

describe('ligada', () => {
  beforeEach(() => { localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1') })

  it('stoppable: a resposta que cresce (quem escreve); sem nada rodando, null', () => {
    const host = fakeHost()
    expect(renderHook(() => useConnectedTurnControls(base(host.remote))).result.current?.stoppable).toEqual({ personaName: 'Nina' })
    const idle = renderHook(() => useConnectedTurnControls(base(host.remote, { messages: [], members: [{ ...NINA, state: 'resting' }] })))
    expect(idle.result.current?.stoppable).toBeNull()
  })

  it('Parar: stopTurn com a persona do host, o eventId da mensagem da pessoa e o escopo do canal; depois diz "parou"', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    act(() => { result.current?.stop() })
    await waitFor(() => { expect(result.current?.stoppedPersona).toBe('Nina') })
    // (o Parar não manda o assunto: `subjectId` é opcional no stopTurn; o mapeamento do assunto padrão vale para a fila e o Direcionar: `hostSubjectId`)
    expect(host.calls[0]).toEqual({ method: 'stopTurn', request: expect.objectContaining({ workspaceId: 'ws', projectId: 'pr', personaId: 'persona-nina', eventId: 'm1' }) })
    expect(result.current?.error).toBeNull()
  })

  it('"parou" some sozinho depois de alguns segundos (para um novo Parar ser dito de novo)', async () => {
    vi.useFakeTimers()
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    await act(async () => { result.current?.stop(); await Promise.resolve(); await Promise.resolve() })
    expect(result.current?.stoppedPersona).toBe('Nina')
    act(() => { vi.advanceTimersByTime(4_100) })
    expect(result.current?.stoppedPersona).toBeNull()
  })

  it('"none" (já tinha terminado) não é erro e não diz que parou', async () => {
    const host = fakeHost({ stopTurn: () => ({ stopped: 'none', ticketId: '', line: '' }) })
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    await act(async () => { result.current?.stop(); await Promise.resolve(); await Promise.resolve() })
    expect(result.current?.stoppedPersona).toBeNull()
    expect(result.current?.error).toBeNull()
  })

  it('erro do host no Parar: a MENSAGEM dele chega (nada inventado) e dá para limpar', async () => {
    const host = fakeHost({ stopTurn: () => ({ ok: false, error: { code: 'forbidden', message: 'Só quem escreve pode parar.' } }) })
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    act(() => { result.current?.stop() })
    await waitFor(() => { expect(result.current?.error).toBe('Só quem escreve pode parar.') })
    act(() => { result.current?.clearError() })
    expect(result.current?.error).toBeNull()
  })

  it('Direcionar: steerWorkingTurn com a persona do host (id do rosto traduzido), o texto e o escopo; "sent" não é erro', async () => {
    const host = fakeHost({ steerWorkingTurn: (request: Record<string, unknown>) => { return { mode: 'sent', messageId: 'm9', echo: request } } })
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    await act(async () => { result.current?.steer('Corrija o rumo', { id: 'nina', name: 'Nina' }); await Promise.resolve(); await Promise.resolve() })
    expect(result.current?.error).toBeNull()
  })

  it('Direcionar chama o host com o escopo certo', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    act(() => { result.current?.steer('Corrija o rumo', { id: 'atlas', name: 'Atlas' }) })
    await waitFor(() => { expect(host.calls.some(c => c.method === 'steerWorkingTurn')).toBe(true) })
    expect(host.calls.find(c => c.method === 'steerWorkingTurn')?.request).toMatchObject({
      personaId: 'persona-atlas', text: 'Corrija o rumo', subjectId: 'ch-geral', streamKind: 'channel', ownerId: 'ch-geral',
    })
  })

  it('Direcionar no assunto padrão NUNCA manda "subject-geral" (o host o trataria como tópico): no #geral vai "geral", como o host chama o fio geral', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote, { ownerId: 'geral' })))
    act(() => { result.current?.steer('Corrija o rumo', { id: 'atlas', name: 'Atlas' }) })
    await waitFor(() => { expect(host.calls.some(c => c.method === 'steerWorkingTurn')).toBe(true) })
    const request = host.calls.find(c => c.method === 'steerWorkingTurn')?.request
    expect(request).toMatchObject({ subjectId: 'geral', ownerId: 'geral' })
    expect(JSON.stringify(request)).not.toContain('subject-geral')
  })

  it('um assunto criado pela pessoa (tópico de verdade) vai ao host como está', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote, { subjectId: 'subject-1730000000000', ownerId: 'geral' })))
    act(() => { result.current?.steer('Corrija o rumo', { id: 'atlas', name: 'Atlas' }) })
    await waitFor(() => { expect(host.calls.some(c => c.method === 'steerWorkingTurn')).toBe(true) })
    expect(host.calls.find(c => c.method === 'steerWorkingTurn')?.request).toMatchObject({ subjectId: 'subject-1730000000000', ownerId: 'geral' })
  })

  it('direcionar texto em branco: o host recusa e a mensagem pronta dele aparece', async () => {
    const host = fakeHost({ steerWorkingTurn: () => ({ ok: false, error: { code: 'invalid-payload', message: 'Escreva alguma coisa antes.' } }) })
    const { result } = renderHook(() => useConnectedTurnControls(base(host.remote)))
    act(() => { result.current?.steer(' ', { id: 'nina', name: 'Nina' }) })
    await waitFor(() => { expect(result.current?.error).toBe('Escreva alguma coisa antes.') })
  })
})
