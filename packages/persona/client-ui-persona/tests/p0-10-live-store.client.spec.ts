// @vitest-environment jsdom
// P0-10 (Carbon, colheita-s1) no live store: o "Desfazer" e a decisão do cartão de ação externa.
//  - Falha do host (`{ ok: false }`, que o Typert devolve SEM rejeitar a Promise) nunca vira "Desfeito" nem fecha o cartão: a chamada rejeita com o erro real.
//    (Esta parte já estava certa: `remote` do store é o `unwrapPersonaRemote`; os testes abaixo são a PROVA, não uma correção.)
//  - Um Desfazer que o host respondeu com `undone: false` (outro Desfazer já em curso) também NÃO é "Desfeito": rejeita (este era o buraco real).
//  - "Salvar e enviar" manda `edited` com assunto e corpo ao host (o host aceita o objeto e o texto).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PersonaRemoteError } from '../src/client/remote/persona-remote-unwrap.ts'

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })
const fail = (code: string, message: string): Promise<Result> => Promise.resolve({ ok: false, error: { code, message } })

let live: PersonaLiveStore | undefined
afterEach(() => { live?.dispose(); live = undefined })

function host(extra: Record<string, unknown>) {
  const remote: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTeam: () => ok({ personas: [], members: [] }),
    listTasks: () => ok([]),
    listMessages: () => ok({ events: [] }),
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
    listApprovals: () => ok([]),
    listDailySummaries: () => ok([]),
    ...extra,
  }
  return remote
}

async function booted(extra: Record<string, unknown>): Promise<PersonaLiveStore> {
  live = createPersonaLiveStore(host(extra) as never)
  await live.bootstrap(() => {})
  return live
}

describe('Desfazer no live store', () => {
  it('o host recusou ({ ok: false }): a chamada REJEITA com o erro do host (a linha não vira "Desfeito")', async () => {
    const undoPersonaAction = vi.fn(() => fail('conflict', 'O prazo do Desfazer acabou.'))
    const store = await booted({ undoPersonaAction })
    await expect(store.undoPersonaAction!('act-1')).rejects.toBeInstanceOf(PersonaRemoteError)
    await expect(store.undoPersonaAction!('act-1')).rejects.toThrow(/O prazo do Desfazer acabou/u)
    expect(undoPersonaAction).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'act-1' }))
  })

  it('o host respondeu `undone: false` (outro Desfazer em curso): rejeita, nunca fecha como "Desfeito"', async () => {
    const store = await booted({ undoPersonaAction: () => ok({ undone: false }) })
    await expect(store.undoPersonaAction!('act-1')).rejects.toThrow()
  })

  it('o host desfez (`undone: true`) ou já estava desfeito (`alreadyUndone`): resolve e recarrega o fio', async () => {
    const listMessages = vi.fn(() => ok({ events: [] }))
    const store = await booted({ undoPersonaAction: () => ok({ undone: true, alreadyUndone: true }), listMessages })
    const before = listMessages.mock.calls.length
    await expect(store.undoPersonaAction!('act-1')).resolves.toBeUndefined()
    await vi.waitFor(() => { expect(listMessages.mock.calls.length).toBeGreaterThan(before) })
  })
})

describe('a decisão do cartão de ação externa no live store', () => {
  it('o host recusou ({ ok: false }): rejeita (o cartão volta a poder tentar e mostra o motivo), sem recarregar como se tivesse enviado', async () => {
    const decideApproval = vi.fn(() => fail('invalid-payload', 'A prévia está cortada ou tem uma parte escondida: não dá para aprovar sem ver tudo.'))
    const store = await booted({ decideApproval })
    await expect(store.decideActionApproval!({ approvalId: 'approval-1', choice: 'send' })).rejects.toBeInstanceOf(PersonaRemoteError)
    expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'action', id: 'approval-1', choice: 'send' }))
  })

  it('"Salvar e enviar": o host recebe o assunto e o corpo editados em `edited` (kind action, choice edit)', async () => {
    const decideApproval = vi.fn(() => ok({ id: 'approval-1', status: 'approved' }))
    const store = await booted({ decideApproval })
    await store.decideActionApproval!({ approvalId: 'approval-1', choice: 'edit', edited: { subject: 'Novo assunto', body: 'Texto ajustado' } })
    expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'action', choice: 'edit', edited: { subject: 'Novo assunto', body: 'Texto ajustado' } }))
  })
})
