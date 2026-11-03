import { expect, it } from 'vitest'
import {
  MemoryRepositories, decisionList, decodeCursor, encodeCursor, overview, search,
  ticketDetail, ticketList, threadDetail, threadList,
} from '../src/index.ts'
import { filledRepo, host, ticket } from './views.fixture.ts'

it('saudável não ocupa espaço: overview vazia sem Precisa de você nem problemas', () => {
  const view = overview(host(new MemoryRepositories('launch')))
  expect(view.person).toEqual([])
  expect(view.problems).toEqual([])
  expect(view.executor).toEqual({ running: 0, queued: 0, maxWorkers: 4, idle: 4 })
  expect(view.project_id).toBe('launch')
})

it('Precisa de você vem primeiro e problemas só blocked/failed', () => {
  const repo = filledRepo()
  const view = overview(host(repo, id => id !== 'hidden'))
  expect(view.person.map(row => row.id)).toEqual(['need'])
  expect(view.person[0]?.attention).toBe('Qual branch?')
  expect(view.problems).toEqual([])
  expect(view.flow.created).toBe(4)
})

it('ticketList filtra estágio, pagina e omite o que can() recusa', () => {
  const repo = filledRepo()
  const open = ticketList(host(repo, id => id !== 'hidden'), 'open', 0, 10)
  expect(open.items.map(row => row.id)).toEqual(['need', 'wait', 'work'])
  expect(open.total).toBe(3)
  const person = ticketList(host(repo, id => id !== 'hidden'), 'person', 0, 10)
  expect(person.items.map(row => row.id)).toEqual(['need'])
  const page1 = ticketList(host(repo, id => id !== 'hidden'), 'open', 0, 1)
  expect(page1.items).toHaveLength(1)
  expect(page1.next_offset).toBe(1)
  expect(ticketList(host(repo, () => false), 'open', 0, 10).total).toBe(0)
})

it('ticketRow expõe coluna P5, chip Aguardando evento, selo e ações', () => {
  const repo = filledRepo()
  const rows = ticketList(host(repo, id => id !== 'hidden'), 'open', 0, 10).items
  const wait = rows.find(row => row.id === 'wait')
  expect(wait).toMatchObject({
    column: 'doing', chip: 'waiting', chipLabel: 'Aguardando evento', strategy: 'explicit',
    actions: { retry: false, stop: true },
  })
  const ended = ticketList(host(repo, id => id !== 'hidden'), 'ended', 0, 10).items[0]
  expect(ended).toMatchObject({ id: 'done', column: 'done', outcome: 'completed', actions: { retry: false, stop: false } })
})

it('ticketDetail traz Mandate, origem, canais, assignments, inputs e threads seguidas', () => {
  const detail = ticketDetail(host(filledRepo(), id => id !== 'hidden'), 'need')
  expect(detail).toMatchObject({
    project_id: 'launch',
    mandate: { strength: 'explicit', scope: 'small', actorId: 'alice' },
    originTriggerId: 'tr1',
    channels: [{ source: 'chat', thread: 't1' }],
    threads: [{ key: 'chat:t1' }],
  })
  expect(ticketDetail(host(filledRepo(), () => false), 'need')).toBeUndefined()
})

it('cursor de timeline é estável no formato <at>|<id>', () => {
  const repo = filledRepo()
  const first = threadDetail(host(repo), 'chat:t1', undefined, 1)
  expect(first?.turns).toHaveLength(1)
  expect(first?.next_cursor).toBe(encodeCursor(first!.turns[0]!.at, first!.turns[0]!.id))
  const next = threadDetail(host(repo), 'chat:t1', first!.next_cursor!, 10)
  expect(next?.turns.map(turn => turn.id)).toEqual(['tr2'])
  expect(next?.next_cursor).toBeNull()
  expect(decodeCursor('2026-11-03T12:00:01.000Z|tr1')).toEqual({ at: '2026-11-03T12:00:01.000Z', id: 'tr1' })
  expect(threadList(host(repo), 0, 10).items[0]?.key).toBe('chat:t1')
})

it('search é ACL-aware e decisionList pagina', () => {
  const repo = filledRepo()
  const hits = search(host(repo, id => id !== 'hidden'), 'Revisar')
  expect(hits.tickets.map(row => row.id)).toEqual(['need'])
  expect(search(host(repo, id => id !== 'hidden'), 'abra o PR').threads[0]?.id).toBe('chat:t1')
  expect(search(host(repo, id => id !== 'hidden'), 'pedido').decisions[0]?.id).toBe('d-need')
  expect(search(host(repo), '').tickets).toEqual([])
  expect(decisionList(host(repo), 0, 10).items[0]?.project_id).toBe('launch')
})

it('lista saudável de tickets vazia quando o projeto não tem trabalho', () => {
  const repo = new MemoryRepositories('empty')
  repo.tickets.save(ticket('x', { ended: { at: '2026-11-01T00:00:00.000Z', by: 'executor', outcome: 'completed' } }))
  expect(ticketList(host(repo), 'open', 0, 10).items).toEqual([])
})
