// FL-11 / IV-5 (contracts/working-control.md): o lado do cliente: chama os 8 remotes com os campos certos, traduz o erro tipado do host e
// transforma a linha da fila no balão tracejado. Sem regra de produto: o host guarda a fila; aqui só se chama e se traduz.
import { describe, expect, it } from 'vitest'
import {
  WorkingControlError,
  dropQueued,
  editQueued,
  enqueueMessage,
  flushQueue,
  hostSubjectId,
  listQueue,
  queuedViewToItem,
  restoreQueued,
  steerTurn,
  stopTurn,
  workingErrorText,
  type WorkingControlRemote,
  type WorkingScope,
} from '../src/client/remote/working-control.ts'
import type { QueuedMessageView } from '@deepseek-ai/dsh-persona-host/types'

describe('hostSubjectId: o assunto como o HOST o chama', () => {
  it('o assunto padrão do cliente ("subject-geral") é o fio geral do canal: no #geral é "geral" (o host trata "geral" como sem tópico)', () => {
    expect(hostSubjectId('subject-geral', 'geral')).toBe('geral')
  })

  it('num canal de equipe o fio geral é o id do canal (único por canal; o host trata subjectId === ownerId como sem tópico)', () => {
    expect(hostSubjectId('subject-geral', 'team-vendas')).toBe('team-vendas')
  })

  it('um assunto criado pela pessoa (tópico de verdade) e o id da DM seguem como estão', () => {
    expect(hostSubjectId('subject-1730000000000', 'geral')).toBe('subject-1730000000000')
    expect(hostSubjectId('dm-ana-p1', 'dm-ana-p1')).toBe('dm-ana-p1')
  })
})

const channel: WorkingScope = { workspaceId: 'ws', projectId: 'pr', personaId: 'nina', subjectId: 'subject-geral', streamKind: 'channel', ownerId: 'ch-geral' }
const dm: WorkingScope = { workspaceId: 'ws', projectId: 'pr', personaId: 'nina', subjectId: 'dm-ana-p1', streamKind: 'dm', ownerId: 'dm-ana-p1' }

const view = (over: Partial<QueuedMessageView> = {}): QueuedMessageView => ({
  id: 'q1', personaId: 'nina', subjectId: 'subject-geral', text: 'Depois mande o resumo', createdAt: '2026-11-04T20:00:00.000Z', ...over,
})

function fakeRemote(handler: (method: string, request: Record<string, unknown>) => unknown): { remote: WorkingControlRemote; calls: [string, Record<string, unknown>][] } {
  const calls: [string, Record<string, unknown>][] = []
  const make = (method: string) => (request: Record<string, unknown>) => { calls.push([method, request]); return handler(method, request) }
  const remote: WorkingControlRemote = {
    enqueueWorkingMessage: make('enqueueWorkingMessage'),
    listWorkingQueue: make('listWorkingQueue'),
    editQueuedMessage: make('editQueuedMessage'),
    dropQueuedMessage: make('dropQueuedMessage'),
    restoreQueuedMessage: make('restoreQueuedMessage'),
    flushWorkingQueue: make('flushWorkingQueue'),
    steerWorkingTurn: make('steerWorkingTurn'),
    stopTurn: make('stopTurn'),
  }
  return { remote, calls }
}

describe('os campos de cada chamada', () => {
  it('listar: o escopo da fila (persona + conversa), sem streamKind', async () => {
    const { remote, calls } = fakeRemote(() => [view()])
    expect(await listQueue(remote, channel)).toEqual([view()])
    expect(calls[0]).toEqual(['listWorkingQueue', { workspaceId: 'ws', projectId: 'pr', personaId: 'nina', subjectId: 'subject-geral' }])
  })

  it('enfileirar no canal: streamKind "channel" e o id do canal', async () => {
    const { remote, calls } = fakeRemote(() => view())
    await enqueueMessage(remote, channel, 'Oi')
    expect(calls[0]?.[1]).toMatchObject({ text: 'Oi', streamKind: 'channel', ownerId: 'ch-geral', subjectId: 'subject-geral', personaId: 'nina' })
  })

  it('na DM: streamKind "dm", ownerId = o id da DM, e o MESMO subjectId em toda chamada da fila', async () => {
    const { remote, calls } = fakeRemote(() => [])
    await enqueueMessage(remote, dm, 'Oi')
    await listQueue(remote, dm)
    await editQueued(remote, dm, 'q1', 'novo')
    await dropQueued(remote, dm, 'q1')
    await flushQueue(remote, dm, 'q1')
    expect(calls[0]?.[1]).toMatchObject({ streamKind: 'dm', ownerId: 'dm-ana-p1' })
    for (const [, request] of calls) expect(request.subjectId).toBe('dm-ana-p1')
  })

  it('editar manda o texto novo; tirar manda o id; desfazer manda o item inteiro', async () => {
    const { remote, calls } = fakeRemote(() => [])
    await editQueued(remote, channel, 'q1', 'Texto novo')
    await dropQueued(remote, channel, 'q1')
    await restoreQueued(remote, channel, view())
    expect(calls[0]?.[1]).toMatchObject({ id: 'q1', text: 'Texto novo' })
    expect(calls[1]?.[1]).toMatchObject({ id: 'q1' })
    expect(calls[2]?.[1]).toMatchObject({ item: view() })
  })

  it('"Mandar agora" manda o balão (queueItemId); sem id manda a fila toda', async () => {
    const { remote, calls } = fakeRemote(() => [])
    await flushQueue(remote, channel, 'q1')
    await flushQueue(remote, channel)
    expect(calls[0]?.[1]).toMatchObject({ queueItemId: 'q1' })
    expect('queueItemId' in (calls[1]?.[1] ?? {})).toBe(false)
  })

  it('direcionar: o texto, a conversa e o resultado steer/sent (sent NÃO é erro)', async () => {
    const { remote, calls } = fakeRemote(() => ({ mode: 'sent', messageId: 'm1' }))
    expect(await steerTurn(remote, channel, 'Corrija o rumo')).toEqual({ mode: 'sent', messageId: 'm1' })
    expect(calls[0]?.[1]).toMatchObject({ text: 'Corrija o rumo', streamKind: 'channel', ownerId: 'ch-geral' })
  })

  it('parar: resposta em andamento por eventId, Tarefa por ticketId; sem nenhum dos dois, o escopo da conversa; "none" não é erro', async () => {
    const { remote, calls } = fakeRemote(() => ({ stopped: 'none', ticketId: '', line: '' }))
    expect((await stopTurn(remote, channel, { eventId: 'm-pessoa' })).stopped).toBe('none')
    await stopTurn(remote, channel, { ticketId: 'tk-1' })
    await stopTurn(remote, channel, {})
    expect(calls[0]?.[1]).toMatchObject({ eventId: 'm-pessoa', personaId: 'nina' })
    expect('subjectId' in (calls[0]?.[1] ?? {})).toBe(false)
    expect(calls[1]?.[1]).toMatchObject({ ticketId: 'tk-1' })
    expect(calls[2]?.[1]).toMatchObject({ subjectId: 'subject-geral' })
  })
})

describe('o resultado do host', () => {
  it('desembrulha { ok: true, value } e aceita o valor puro', async () => {
    const wrapped = fakeRemote(() => ({ ok: true, value: [view()] }))
    expect(await listQueue(wrapped.remote, channel)).toEqual([view()])
    const plain = fakeRemote(() => Promise.resolve([view()]))
    expect(await listQueue(plain.remote, channel)).toEqual([view()])
  })

  it('erro tipado: o code e a MENSAGEM pronta do host chegam inteiros', async () => {
    const { remote } = fakeRemote(() => ({ ok: false, error: { code: 'not-found', message: 'Essa mensagem já saiu da fila.' } }))
    const error = await dropQueued(remote, channel, 'q1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WorkingControlError)
    expect((error as WorkingControlError).code).toBe('not-found')
    expect(workingErrorText(error)).toBe('Essa mensagem já saiu da fila.')
  })

  it('invalid-payload e forbidden; código desconhecido vira "unknown"', async () => {
    const codes = ['invalid-payload', 'forbidden', 'qualquer-outra']
    for (const code of codes) {
      const { remote } = fakeRemote(() => ({ ok: false, error: { code, message: '' } }))
      const error = await enqueueMessage(remote, channel, ' ').catch((e: unknown) => e) as WorkingControlError
      expect(error.code).toBe(code === 'qualquer-outra' ? 'unknown' : code)
    }
  })

  it('sem mensagem do host a UI não inventa frase (texto null)', async () => {
    const { remote } = fakeRemote(() => ({ ok: false, error: { code: 'forbidden' } }))
    const error = await flushQueue(remote, channel).catch((e: unknown) => e)
    expect(workingErrorText(error)).toBeNull()
    expect(workingErrorText(new Error('x'))).toBeNull()
  })

  it('host antigo sem o método: erro "unknown" (a tela cai para o que já fazia)', async () => {
    const error = await listQueue({}, channel).catch((e: unknown) => e) as WorkingControlError
    expect(error).toBeInstanceOf(WorkingControlError)
    expect(error.code).toBe('unknown')
  })
})

describe('queuedViewToItem', () => {
  it('a linha do host vira o balão tracejado da persona alvo', () => {
    expect(queuedViewToItem(view(), 'Nina')).toEqual({ id: 'q1', text: 'Depois mande o resumo', targetPersonaName: 'Nina', targetPersonaId: 'nina' })
  })

  it('reason "quota" = "Na fila · sai quando a cota voltar" (heldForQuota); sem reason, não', () => {
    expect(queuedViewToItem(view({ reason: 'quota' }), 'Nina').heldForQuota).toBe(true)
    expect(queuedViewToItem(view(), 'Nina').heldForQuota).toBeUndefined()
  })
})
