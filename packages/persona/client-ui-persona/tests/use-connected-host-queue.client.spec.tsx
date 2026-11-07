// @vitest-environment jsdom
// FL-11 / P0-18: a ponte entre o canal conectado e a fila do host. Desligada (flag), sem as chamadas do IV-5 ou sem a conversa: `undefined`
// (a tela fica como era). Ligada: lê as filas de quem trabalha e de quem responde por padrão, e traduz o id do rosto para o da persona do host.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QueuedMessageView } from '@deepseek-ai/dsh-persona-host/types'
import { WORKING_CONTROL_FLAG_KEY } from '../src/client/chat/working-control-flag.ts'
import { useConnectedHostQueue, type ConnectedHostQueueInput } from '../src/client/remote/use-connected-host-queue.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => { localStorage.clear() })

const TEAM = { personas: [
  { id: 'persona-atlas', name: 'Atlas', avatarRef: 'atlas' },
  { id: 'persona-nina', name: 'Nina', avatarRef: 'nina' },
] } as unknown as TeamView

const ATLAS: ChannelPersonaMember = { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] }
const NINA: ChannelPersonaMember = { id: 'nina', name: 'Nina', role: 'Design', state: 'working' }

function fakeHost(initial: readonly QueuedMessageView[] = []) {
  const rows = [...initial]
  const enqueued: Record<string, unknown>[] = []
  return {
    enqueued,
    remote: {
      listWorkingQueue: (req: Record<string, unknown>) => rows.filter(r => r.personaId === req.personaId && r.subjectId === req.subjectId),
      enqueueWorkingMessage: (req: Record<string, unknown>) => {
        enqueued.push(req)
        const row: QueuedMessageView = { id: `q${String(enqueued.length)}`, personaId: String(req.personaId), subjectId: String(req.subjectId), text: String(req.text), createdAt: `2026-11-04T20:00:0${String(enqueued.length)}.000Z`, ...(req.reason === 'quota' ? { reason: 'quota' as const } : {}) }
        rows.push(row)
        return row
      },
    },
    rows: () => rows,
  }
}

const base = (remote: object | undefined, over: Partial<ConnectedHostQueueInput> = {}): ConnectedHostQueueInput => ({
  remote, tenant: { workspaceId: 'ws', projectId: 'pr' }, team: TEAM, members: [ATLAS, NINA], responderMemberId: 'atlas',
  // O cliente chama o assunto padrão de `subject-geral`; o host chama o fio geral do canal de `geral` (o id do #geral): ver `hostSubjectId`.
  subjectId: 'subject-geral', streamKind: 'channel', ownerId: 'geral', refreshKey: 0, ...over,
})

describe('quando NÃO liga (a tela fica como era)', () => {
  it('flag desligada: undefined, e o host nem é consultado', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote)))
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBeUndefined()
  })

  it('host sem NENHUMA chamada do IV-5: undefined', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1')
    const { result } = renderHook(() => useConnectedHostQueue(base({ getEngineStatus: () => ({}) })))
    expect(result.current).toBeUndefined()
  })

  it('sem Remote, sem tenant, sem canal ou sem assunto: undefined', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1')
    const host = fakeHost()
    expect(renderHook(() => useConnectedHostQueue(base(undefined))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedHostQueue(base(host.remote, { tenant: null }))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedHostQueue(base(host.remote, { ownerId: null }))).result.current).toBeUndefined()
    expect(renderHook(() => useConnectedHostQueue(base(host.remote, { subjectId: '' }))).result.current).toBeUndefined()
  })
})

describe('ligada', () => {
  beforeEach(() => { localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1') })

  it('lê a fila de quem trabalha e de quem responde por padrão, com o nome da persona', async () => {
    const host = fakeHost([
      { id: 'q1', personaId: 'persona-nina', subjectId: 'geral', text: 'Depois o logo', createdAt: '2026-11-04T20:00:01.000Z' },
      { id: 'q2', personaId: 'persona-atlas', subjectId: 'geral', text: 'Resumo', createdAt: '2026-11-04T20:00:02.000Z', reason: 'quota' },
    ])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote)))
    await waitFor(() => { expect(result.current?.items).toHaveLength(2) })
    expect(result.current?.items.map(i => `${i.id}:${i.targetPersonaName}:${String(i.heldForQuota ?? false)}`)).toEqual(['q1:Nina:false', 'q2:Atlas:true'])
  })

  it('enfileirar traduz o id do rosto ("atlas") para a persona do host e manda o escopo do canal', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote)))
    act(() => { result.current?.enqueue('Mande o resumo', { id: 'atlas', name: 'Atlas' }, 'quota') })
    await waitFor(() => { expect(result.current?.items).toHaveLength(1) })
    expect(host.enqueued[0]).toMatchObject({
      workspaceId: 'ws', projectId: 'pr', personaId: 'persona-atlas', subjectId: 'geral', streamKind: 'channel', ownerId: 'geral', text: 'Mande o resumo', reason: 'quota',
    })
    expect(result.current?.items[0]?.heldForQuota).toBe(true)
  })

  it('o mesmo texto sem cota não manda reason', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote)))
    act(() => { result.current?.enqueue('Oi', { id: 'nina', name: 'Nina' }) })
    await waitFor(() => { expect(host.enqueued).toHaveLength(1) })
    expect('reason' in (host.enqueued[0] ?? {})).toBe(false)
    expect(host.enqueued[0]?.personaId).toBe('persona-nina')
  })
})

describe('a fila PENDENTE de quem não trabalha continua visível (o Parar mantém a fila; E2E-V11 "a fila é visível")', () => {
  beforeEach(() => { localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1') })
  const PARADA: ChannelPersonaMember = { id: 'nina', name: 'Nina', role: 'Design', state: 'resting' }
  const queued = (id: string, subjectId = 'geral'): QueuedMessageView => ({ id, personaId: 'persona-nina', subjectId, text: `texto ${id}`, createdAt: `2026-11-04T20:00:0${id.slice(-1)}.000Z` })

  it('recarregar a tela com a persona PARADA (nem trabalhando, nem quem responde): os balões da fila mantida aparecem', async () => {
    const host = fakeHost([queued('q1'), queued('q2')])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items.map(i => `${i.id}:${i.targetPersonaName}`)).toEqual(['q1:Nina', 'q2:Nina']) })
  })

  it('ela trabalhava, a pessoa via a fila, o Parar acontece (some de "trabalhando", o fio ganha a linha): a fila continua na tela', async () => {
    const host = fakeHost([queued('q1'), queued('q2')])
    const { result, rerender } = renderHook(
      (props: Partial<ConnectedHostQueueInput>) => useConnectedHostQueue(base(host.remote, props)),
      { initialProps: { members: [ATLAS, NINA], refreshKey: 1 } as Partial<ConnectedHostQueueInput> },
    )
    await waitFor(() => { expect(result.current?.items).toHaveLength(2) })
    rerender({ members: [ATLAS, PARADA], refreshKey: 2 })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current?.items.map(i => i.id)).toEqual(['q1', 'q2'])
  })

  it('cada assunto tem a sua fila: a fila mantida de outro assunto não aparece neste', async () => {
    const host = fakeHost([queued('q1'), queued('q3', 'subject-outro')])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items.map(i => i.id)).toEqual(['q1']) })
  })

  it('quem entra na equipe depois (os membros mudam) também é descoberta, sem recarregar a tela', async () => {
    const host = fakeHost([queued('q1')])
    const { result, rerender } = renderHook(
      (props: Partial<ConnectedHostQueueInput>) => useConnectedHostQueue(base(host.remote, props)),
      { initialProps: { members: [ATLAS] } as Partial<ConnectedHostQueueInput> },
    )
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current?.items).toEqual([])
    rerender({ members: [ATLAS, PARADA] })
    await waitFor(() => { expect(result.current?.items.map(i => i.id)).toEqual(['q1']) })
  })

  it('a ação sobre o balão de uma persona parada chega ao host com o escopo certo (Tirar)', async () => {
    const host = fakeHost([queued('q1')])
    const dropped: Record<string, unknown>[] = []
    const remote = { ...host.remote, dropQueuedMessage: (req: Record<string, unknown>) => { dropped.push(req); host.rows().splice(0, 1); return [] } }
    const { result } = renderHook(() => useConnectedHostQueue(base(remote, { members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items).toHaveLength(1) })
    act(() => { result.current?.drop('q1') })
    await waitFor(() => { expect(dropped).toHaveLength(1) })
    expect(dropped[0]).toMatchObject({ workspaceId: 'ws', projectId: 'pr', personaId: 'persona-nina', subjectId: 'geral', id: 'q1' })
    await waitFor(() => { expect(result.current?.items).toHaveLength(0) })
  })
})

describe('o assunto padrão do cliente é o fio GERAL do host (hostSubjectId)', () => {
  beforeEach(() => { localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1') })
  const PARADA: ChannelPersonaMember = { id: 'nina', name: 'Nina', role: 'Design', state: 'resting' }
  const row = (id: string, subjectId: string): QueuedMessageView => ({ id, personaId: 'persona-nina', subjectId, text: `texto ${id}`, createdAt: `2026-11-04T20:00:0${id.slice(-1)}.000Z` })

  it('a fila que o host (e o E2E-V11) chama de "geral" aparece na tela, que chama o mesmo assunto de "subject-geral"', async () => {
    const host = fakeHost([row('q1', 'geral'), row('q2', 'subject-geral')])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items.map(i => i.id)).toEqual(['q1']) })
  })

  it('num canal de EQUIPE o fio geral é o id do canal: não mistura com a fila do #geral', async () => {
    const host = fakeHost([row('q1', 'team-vendas'), row('q2', 'geral')])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { ownerId: 'team-vendas', members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items.map(i => i.id)).toEqual(['q1']) })
  })

  it('um assunto criado pela pessoa (tópico de verdade) vai como está, ao ler e ao enfileirar', async () => {
    const host = fakeHost([row('q1', 'subject-1730000000000'), row('q2', 'geral')])
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { subjectId: 'subject-1730000000000', members: [ATLAS, PARADA] })))
    await waitFor(() => { expect(result.current?.items.map(i => i.id)).toEqual(['q1']) })
    act(() => { result.current?.enqueue('Depois o preço', { id: 'nina', name: 'Nina' }) })
    await waitFor(() => { expect(host.enqueued).toHaveLength(1) })
    expect(host.enqueued[0]).toMatchObject({ subjectId: 'subject-1730000000000', ownerId: 'geral', personaId: 'persona-nina' })
  })

  it('enfileirar no assunto padrão NUNCA manda "subject-geral" ao host (viraria um tópico que não existe)', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote)))
    act(() => { result.current?.enqueue('Oi', { id: 'nina', name: 'Nina' }) })
    await waitFor(() => { expect(host.enqueued).toHaveLength(1) })
    expect(host.enqueued[0]?.subjectId).toBe('geral')
    expect(JSON.stringify(host.enqueued)).not.toContain('subject-geral')
  })
})

describe('na DM (a MESMA fila do host, escopo da conversa)', () => {
  beforeEach(() => { localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1') })

  it('enfileirar na DM: streamKind "dm", e o id da DM é ao mesmo tempo o assunto e o dono', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { streamKind: 'dm', ownerId: 'dm-nina', subjectId: 'dm-nina', members: [NINA], responderMemberId: 'nina' })))
    act(() => { result.current?.enqueue('Depois o logo', { id: 'nina', name: 'Nina' }) })
    await waitFor(() => { expect(result.current?.items).toHaveLength(1) })
    expect(host.enqueued[0]).toMatchObject({ streamKind: 'dm', ownerId: 'dm-nina', subjectId: 'dm-nina', personaId: 'persona-nina', text: 'Depois o logo' })
    expect(result.current?.items[0]?.targetPersonaName).toBe('Nina')
  })

  it('sem DM aberta (ownerId null) o controle não existe', () => {
    const host = fakeHost()
    const { result } = renderHook(() => useConnectedHostQueue(base(host.remote, { streamKind: 'dm', ownerId: null, subjectId: '' })))
    expect(result.current).toBeUndefined()
  })
})
