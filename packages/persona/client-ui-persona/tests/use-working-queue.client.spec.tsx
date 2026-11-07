// @vitest-environment jsdom
// FL-11 / P0-18: o hook da fila do host: lê as filas das personas pedidas, recarrega quando o fio muda e depois de cada operação, e entrega
// Mandar agora / Editar / Tirar / Desfazer / enfileirar sem inventar texto de erro. O host é um fake em memória que se comporta como o contrato.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QueuedMessageView } from '@deepseek-ai/dsh-persona-host/types'
import { useWorkingQueue } from '../src/client/remote/use-working-queue.ts'
import type { WorkingControlRemote, WorkingScope } from '../src/client/remote/working-control.ts'

const scopeFor = (personaId: string): WorkingScope => ({ workspaceId: 'ws', projectId: 'pr', personaId, subjectId: 'subject-geral', streamKind: 'channel', ownerId: 'ch' })
const nameOf = (id: string): string => (id === 'nina' ? 'Nina' : id === 'bento' ? 'Bento' : id)

/** Um host de mentira com a fila por persona, ordem por createdAt/id, e os erros tipados do contrato. */
function fakeHost(initial: readonly QueuedMessageView[] = []) {
  let rows = [...initial]
  let seq = 100
  const calls: string[] = []
  /** De quem a fila foi lida, na ordem (uma entrada por chamada `listWorkingQueue`). */
  const listed: string[] = []
  const notFound = { ok: false, error: { code: 'not-found', message: 'Essa mensagem já saiu da fila.' } }
  const sorted = (personaId: string): QueuedMessageView[] => rows.filter(r => r.personaId === personaId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const remote: WorkingControlRemote = {
    listWorkingQueue: (req) => { calls.push('list'); listed.push(String(req.personaId)); return sorted(String(req.personaId)) },
    enqueueWorkingMessage: (req) => {
      calls.push('enqueue')
      if (String(req.text).trim() === '') return { ok: false, error: { code: 'invalid-payload', message: 'Escreva alguma coisa antes.' } }
      seq += 1
      const row: QueuedMessageView = { id: `q${String(seq)}`, personaId: String(req.personaId), subjectId: String(req.subjectId), text: String(req.text), createdAt: `2026-11-04T20:00:${String(seq - 40)}.000Z` }
      rows.push(row)
      return row
    },
    editQueuedMessage: (req) => {
      calls.push('edit')
      const row = rows.find(r => r.id === req.id)
      if (row === undefined) return notFound
      rows = rows.map(r => (r.id === req.id ? { ...r, text: String(req.text) } : r))
      return {}
    },
    dropQueuedMessage: (req) => {
      calls.push('drop')
      if (!rows.some(r => r.id === req.id)) return notFound
      rows = rows.filter(r => r.id !== req.id)
      return sorted(String(req.personaId))
    },
    restoreQueuedMessage: (req) => {
      calls.push('restore')
      const item = req.item as QueuedMessageView
      if (!rows.some(r => r.id === item.id)) rows.push(item)
      return sorted(String(req.personaId))
    },
    flushWorkingQueue: (req) => {
      calls.push('flush')
      if (!rows.some(r => r.id === req.queueItemId)) return notFound
      rows = rows.filter(r => r.id !== req.queueItemId)
      return []
    },
  }
  return { remote, calls, listed, rows: () => rows, silentlyRemove: (id: string) => { rows = rows.filter(r => r.id !== id) } }
}

const row = (id: string, personaId: string, createdAt: string, text = `texto ${id}`, over: Partial<QueuedMessageView> = {}): QueuedMessageView => ({ id, personaId, subjectId: 'subject-geral', text, createdAt, ...over })

function mount(host: ReturnType<typeof fakeHost>, personaIds: readonly string[], refreshKey: string | number = 0, enabled = true) {
  return renderHook(
    (props: { ids: readonly string[]; key: string | number }) => useWorkingQueue({ remote: host.remote, enabled, scopeFor: id => scopeFor(id), personaIds: props.ids, nameOf: id => nameOf(id), refreshKey: props.key }),
    { initialProps: { ids: personaIds, key: refreshKey } },
  )
}

describe('ler a fila do host', () => {
  it('junta as filas das personas pedidas, em ordem de enfileiramento, com o nome de quem vai responder', async () => {
    const host = fakeHost([row('q2', 'bento', '2026-11-04T20:00:02.000Z'), row('q1', 'nina', '2026-11-04T20:00:01.000Z'), row('q3', 'nina', '2026-11-04T20:00:03.000Z')])
    const { result } = mount(host, ['nina', 'bento'])
    await waitFor(() => { expect(result.current.items).toHaveLength(3) })
    expect(result.current.items.map(i => `${i.id}:${i.targetPersonaName}`)).toEqual(['q1:Nina', 'q2:Bento', 'q3:Nina'])
  })

  it('o balão "por cota" vem marcado (reason quota)', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z', 'x', { reason: 'quota' })])
    const { result } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items[0]?.heldForQuota).toBe(true) })
  })

  it('desligado (flag) ou sem host: não lê nada e a tela fica como era', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const off = mount(host, ['nina'], 0, false)
    await act(async () => { await Promise.resolve() })
    expect(off.result.current.items).toEqual([])
    expect(host.calls).toEqual([])
  })

  it('recarrega quando o fio muda: o balão que o agendador enviou some', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const { result, rerender } = mount(host, ['nina'], 1)
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    host.silentlyRemove('q1')
    rerender({ ids: ['nina'], key: 2 })
    await waitFor(() => { expect(result.current.items).toHaveLength(0) })
  })

  it('não relê em loop (identidade nova de scopeFor/nameOf a cada render não dispara leitura)', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const { result, rerender } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    const before = host.calls.filter(c => c === 'list').length
    rerender({ ids: ['nina'], key: 0 })
    rerender({ ids: ['nina'], key: 0 })
    await act(async () => { await Promise.resolve() })
    expect(host.calls.filter(c => c === 'list').length).toBe(before)
  })
})

/** Como `mount`, mas com a leitura de descoberta (todas as personas da conversa, uma vez por chave). */
function mountDiscovering(host: { remote: WorkingControlRemote }, props: { ids: readonly string[]; key: string | number; discoverIds: readonly string[]; discoverKey: string }, remote: WorkingControlRemote = host.remote) {
  return renderHook(
    (p: typeof props) => useWorkingQueue({ remote, enabled: true, scopeFor: id => scopeFor(id), personaIds: p.ids, nameOf: id => nameOf(id), refreshKey: p.key, discoverIds: p.discoverIds, discoverKey: p.discoverKey }),
    { initialProps: props },
  )
}

describe('a fila PENDENTE de quem não trabalha continua visível (o Parar mantém a fila)', () => {
  it('depois do Parar a persona sai de "quem trabalha" e os balões continuam na tela (E2E-V11: a fila é visível)', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z', 'depois, inclua o preço'), row('q2', 'nina', '2026-11-04T20:00:02.000Z', 'e a rua da padaria')])
    const { result, rerender } = mount(host, ['nina'], 1)
    await waitFor(() => { expect(result.current.items).toHaveLength(2) })
    const before = host.listed.length
    // Parar (feito por outra via, ex. outra janela ou o host): ela deixa de trabalhar, o fio ganha a linha "Parado." e o refreshKey muda.
    rerender({ ids: [], key: 2 })
    await waitFor(() => { expect(host.listed.length).toBeGreaterThan(before) })
    expect(host.listed.slice(before)).toContain('nina')
    // a leitura terminou e a tela foi atualizada (esvazia os microtasks): os dois balões continuam lá, na ordem do host
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current.items.map(i => i.text)).toEqual(['depois, inclua o preço', 'e a rua da padaria'])
  })

  it('quando a fila finalmente sai (Mandar agora / agendador), a persona deixa de ser lida', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const { result, rerender } = mount(host, ['nina'], 1)
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    rerender({ ids: [], key: 2 })
    await waitFor(() => { expect(host.listed.filter(id => id === 'nina').length).toBeGreaterThan(1) })
    host.silentlyRemove('q1')
    rerender({ ids: [], key: 3 })
    await waitFor(() => { expect(result.current.items).toHaveLength(0) })
    const reads = host.listed.length
    rerender({ ids: [], key: 4 })
    await act(async () => { await Promise.resolve() })
    expect(host.listed.length).toBe(reads)
  })

  it('uma leitura que falha NÃO apaga o balão (a persona não é tocada) e a próxima leitura que responde atualiza de verdade', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    let busy = false
    const remote: WorkingControlRemote = { ...host.remote, listWorkingQueue: (req) => { if (busy) throw new Error('host ocupado'); return host.remote.listWorkingQueue?.(req) } }
    const { result, rerender } = renderHook(
      (p: { key: number }) => useWorkingQueue({ remote, enabled: true, scopeFor: id => scopeFor(id), personaIds: [], nameOf: id => nameOf(id), refreshKey: p.key, discoverIds: ['nina'], discoverKey: 'c1' }),
      { initialProps: { key: 1 } },
    )
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    busy = true
    rerender({ key: 2 })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    // a leitura que falha não apaga o balão (a persona não é tocada) ...
    expect(result.current.items).toHaveLength(1)
    busy = false
    host.silentlyRemove('q1')
    rerender({ key: 3 })
    // ... e a próxima leitura, que responde, atualiza de verdade
    await waitFor(() => { expect(result.current.items).toHaveLength(0) })
  })
})

describe('a leitura de descoberta (abrir a conversa ou recarregar a tela)', () => {
  it('lê TODAS as personas da conversa: a parada com fila mantida aparece mesmo sem trabalhar nem responder', async () => {
    const host = fakeHost([row('q1', 'bento', '2026-11-04T20:00:01.000Z', 'quando puder, o preço')])
    const { result } = mountDiscovering(host, { ids: ['nina'], key: 0, discoverIds: ['nina', 'bento', 'caio'], discoverKey: 'channel|ch|subject-geral|bento,caio,nina' })
    await waitFor(() => { expect(result.current.items.map(i => `${i.id}:${i.targetPersonaName}`)).toEqual(['q1:Bento']) })
    expect([...new Set(host.listed)].sort()).toEqual(['bento', 'caio', 'nina'])
  })

  it('só uma vez por conversa: mensagem nova no fio relê quem tem fila, não a equipe inteira', async () => {
    const host = fakeHost([row('q1', 'bento', '2026-11-04T20:00:01.000Z')])
    const props = { ids: ['nina'] as readonly string[], key: 0 as string | number, discoverIds: ['nina', 'bento', 'caio'], discoverKey: 'k1' }
    const { result, rerender } = mountDiscovering(host, props)
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    const before = host.listed.length
    rerender({ ...props, key: 1 })
    await waitFor(() => { expect(host.listed.length).toBeGreaterThan(before) })
    // nina (pedida) e bento (já mostrou balões); caio (só descoberta, sem fila) não é relido.
    expect([...new Set(host.listed.slice(before))].sort()).toEqual(['bento', 'nina'])
  })

  it('outra conversa (chave nova) descobre de novo', async () => {
    const host = fakeHost()
    const props = { ids: [] as readonly string[], key: 0 as string | number, discoverIds: ['nina', 'caio'], discoverKey: 'k1' }
    const { rerender } = mountDiscovering(host, props)
    await waitFor(() => { expect([...new Set(host.listed)].sort()).toEqual(['caio', 'nina']) })
    const before = host.listed.length
    rerender({ ...props, discoverKey: 'k2', discoverIds: ['nina', 'caio', 'dora'] })
    await waitFor(() => { expect(host.listed.slice(before)).toContain('dora') })
  })

  it('sem nenhuma persona ainda (equipe não carregou) a descoberta NÃO é dada por feita: roda quando elas chegarem', async () => {
    const host = fakeHost([row('q1', 'bento', '2026-11-04T20:00:01.000Z')])
    const props = { ids: [] as readonly string[], key: 0 as string | number, discoverIds: [] as readonly string[], discoverKey: 'k-vazia' }
    const { result, rerender } = mountDiscovering(host, props)
    await act(async () => { await Promise.resolve() })
    expect(result.current.items).toEqual([])
    rerender({ ...props, discoverIds: ['bento'], discoverKey: 'k-cheia' })
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
  })

  it('se o host não respondeu a nenhuma leitura, tenta descobrir de novo no próximo refresh', async () => {
    const host = fakeHost([row('q1', 'bento', '2026-11-04T20:00:01.000Z')])
    let busy = true
    const remote: WorkingControlRemote = { ...host.remote, listWorkingQueue: (req) => { if (busy) throw new Error('host ocupado'); return host.remote.listWorkingQueue?.(req) } }
    const props = { ids: [] as readonly string[], key: 0 as string | number, discoverIds: ['bento'], discoverKey: 'k1' }
    const { result, rerender } = mountDiscovering(host, props, remote)
    await act(async () => { await Promise.resolve() })
    expect(result.current.items).toEqual([])
    busy = false
    rerender({ ...props, key: 1 })
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
  })

  it('sem discoverKey (chamador antigo) nada muda: só as personas pedidas são lidas', async () => {
    const host = fakeHost([row('q1', 'bento', '2026-11-04T20:00:01.000Z')])
    const { result } = mount(host, ['nina'])
    await act(async () => { await Promise.resolve() })
    expect(result.current.items).toEqual([])
    expect([...new Set(host.listed)]).toEqual(['nina'])
  })
})

/** Um host cujas respostas o TESTE libera, uma a uma e na ordem que quiser: leituras que se sobrepõem e terminam fora de ordem, como no app real (cada chamada guarda a fila do MOMENTO em que foi feita). */
function gatedHost(initial: readonly QueuedMessageView[]) {
  let rows = [...initial]
  let serial = 0
  const pending: { readonly personaId: string; readonly seq: number; readonly release: () => void; released: boolean }[] = []
  const remote: WorkingControlRemote = {
    listWorkingQueue: (req) => new Promise((resolve) => {
      const personaId = String(req.personaId)
      const snapshot = rows.filter(r => r.personaId === personaId)
      serial += 1
      const call = { personaId, seq: serial, released: false, release: () => { call.released = true; resolve(snapshot) } }
      pending.push(call)
    }),
  }
  return {
    remote,
    calls: () => pending.map(call => ({ personaId: call.personaId, seq: call.seq })),
    setRows: (next: readonly QueuedMessageView[]) => { rows = [...next] },
    release: (match: (call: { personaId: string; seq: number }) => boolean) => { for (const call of pending) if (!call.released && match(call)) call.release() },
  }
}

describe('leituras que se SOBREPÕEM (a tela relê a cada mensagem nova): o host real devolvia os itens e a tela mostrava 0', () => {
  const props = (key: number, extra: { discoverKey?: string; discoverIds?: readonly string[] } = {}) => ({ key, ids: ['atlas'] as readonly string[], ...extra })
  const mountGated = (host: ReturnType<typeof gatedHost>, first: ReturnType<typeof props>) => renderHook(
    (p: ReturnType<typeof props>) => useWorkingQueue({ remote: host.remote, enabled: true, scopeFor: id => scopeFor(id), personaIds: p.ids, nameOf: id => nameOf(id), refreshKey: p.key, ...(p.discoverKey === undefined ? {} : { discoverKey: p.discoverKey, discoverIds: p.discoverIds ?? [] }) }),
    { initialProps: first },
  )

  it('uma leitura ANTIGA e lenta (sem a persona) que termina por ÚLTIMO não apaga o que a leitura de descoberta achou', async () => {
    const host = gatedHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z'), row('q2', 'nina', '2026-11-04T20:00:02.000Z')])
    const { result, rerender } = mountGated(host, props(1))
    await waitFor(() => { expect(host.calls()).toHaveLength(1) }) // rodada 1: só o respondedor (atlas), esperando
    rerender(props(2, { discoverKey: 'k', discoverIds: ['atlas', 'nina'] })) // a equipe chega: rodada 2 pede atlas + nina
    await waitFor(() => { expect(host.calls().length).toBeGreaterThanOrEqual(3) })
    host.release(call => call.seq > 1) // a rodada 2 termina PRIMEIRO e acha a fila da nina
    await waitFor(() => { expect(result.current.items).toHaveLength(2) })
    host.release(call => call.seq === 1) // a rodada 1 (antiga, sem a nina) termina por ÚLTIMO
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current.items.map(i => i.id)).toEqual(['q1', 'q2'])
    // e a nina continua conhecida: a leitura seguinte (mensagem nova) a relê
    rerender(props(3, { discoverKey: 'k', discoverIds: ['atlas', 'nina'] }))
    await waitFor(() => { expect(host.calls().some(call => call.personaId === 'nina' && call.seq > 3)).toBe(true) })
  })

  it('o resultado ANTIGO da MESMA persona não ressuscita um balão que o host já enviou', async () => {
    const host = gatedHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const { result, rerender } = mountGated(host, props(1, { discoverKey: 'k', discoverIds: ['nina'] }))
    await waitFor(() => { expect(host.calls().filter(call => call.personaId === 'nina')).toHaveLength(1) }) // rodada 1 leu a nina COM q1 (ainda esperando)
    host.setRows([]) // o agendador do host enviou a fila
    rerender(props(2, { discoverKey: 'k', discoverIds: ['nina'] }))
    await waitFor(() => { expect(host.calls().filter(call => call.personaId === 'nina').length).toBeGreaterThanOrEqual(2) })
    host.release(call => call.personaId === 'nina' && call.seq > 1) // a rodada 2 (nova, fila vazia) termina primeiro
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current.items).toHaveLength(0)
    host.release(call => call.personaId === 'nina' && call.seq === 1) // a rodada 1 (velha, com q1) termina depois
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(result.current.items).toHaveLength(0)
  })
})

describe('as operações', () => {
  it('enfileirar: o balão aparece vindo do host; a persona usada passa a ser lida mesmo ociosa', async () => {
    const host = fakeHost()
    const { result } = mount(host, [])
    let ok = false
    await act(async () => { ok = await result.current.enqueue('nina', 'Depois do passo, me avise') })
    expect(ok).toBe(true)
    await waitFor(() => { expect(result.current.items.map(i => i.text)).toEqual(['Depois do passo, me avise']) })
  })

  it('enfileirar texto em branco: o host recusa e a mensagem pronta dele chega à tela (nada inventado)', async () => {
    const host = fakeHost()
    const { result } = mount(host, ['nina'])
    await act(async () => { await result.current.enqueue('nina', '  ') })
    expect(result.current.error).toBe('Escreva alguma coisa antes.')
    act(() => { result.current.clearError() })
    expect(result.current.error).toBeNull()
  })

  it('Mandar agora: só aquele balão sai da fila', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z'), row('q2', 'nina', '2026-11-04T20:00:02.000Z')])
    const { result } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items).toHaveLength(2) })
    await act(async () => { await result.current.sendNow('q1') })
    await waitFor(() => { expect(result.current.items.map(i => i.id)).toEqual(['q2']) })
  })

  it('Editar troca o texto do balão no host', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z', 'velho')])
    const { result } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    await act(async () => { await result.current.edit('q1', 'novo') })
    await waitFor(() => { expect(result.current.items[0]?.text).toBe('novo') })
  })

  it('Tirar + Desfazer: o balão volta com o MESMO id e na posição original', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z'), row('q2', 'nina', '2026-11-04T20:00:02.000Z'), row('q3', 'nina', '2026-11-04T20:00:03.000Z')])
    const { result } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items).toHaveLength(3) })
    await act(async () => { await result.current.drop('q2') })
    await waitFor(() => { expect(result.current.items.map(i => i.id)).toEqual(['q1', 'q3']) })
    expect(result.current.removed?.id).toBe('q2')
    await act(async () => { await result.current.undoDrop() })
    await waitFor(() => { expect(result.current.items.map(i => i.id)).toEqual(['q1', 'q2', 'q3']) })
    expect(result.current.removed).toBeNull()
  })

  it('o balão já saiu (not-found): a mensagem do host aparece e a fila é relida', async () => {
    const host = fakeHost([row('q1', 'nina', '2026-11-04T20:00:01.000Z')])
    const { result } = mount(host, ['nina'])
    await waitFor(() => { expect(result.current.items).toHaveLength(1) })
    host.silentlyRemove('q1')
    await act(async () => { await result.current.sendNow('q1') })
    expect(result.current.error).toBe('Essa mensagem já saiu da fila.')
    await waitFor(() => { expect(result.current.items).toHaveLength(0) })
  })

  it('operação num balão que a tela nem conhece não chama o host', async () => {
    const host = fakeHost()
    const { result } = mount(host, ['nina'])
    await act(async () => { await result.current.sendNow('fantasma'); await result.current.drop('fantasma'); await result.current.edit('fantasma', 'x') })
    expect(host.calls.filter(c => c !== 'list')).toEqual([])
  })
})
