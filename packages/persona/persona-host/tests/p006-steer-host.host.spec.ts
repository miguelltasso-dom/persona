import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * P0-06 (Carbon colheita-s1), LADO HOST: com um turno de Tarefa aberto, o dono manda "Direcionar agora" e depois uma mensagem normal, e o runner RECUSA o steer (entre dois passos, ou porque o
 * runtime não aceita). Esperado: nenhuma das duas mensagens se perde; ambas ficam na fila do runner (`deliver(..., 'queue')`, uma vez cada, idempotentes), NENHUM 2º turno concorrente é aberto sobre a
 * sessão ocupada (o único `deliver` que não é 'queue'/'steer' é o que iniciou a Tarefa), nada é cancelado e a sessão não é recriada (as ferramentas MCP do turno ativo continuam abertas).
 * O código antigo (snapshot d232da3e00) fazia `if (runner.steer !== undefined) return runner.steer(...)`: recusado = a mensagem some. O teste "guarda" reinstala essa lógica antiga e prova que o cenário a reprova.
 */
const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const STEER_TEXT = 'Direcione para o item 2 da planilha'
const NORMAL_TEXT = 'e inclua o preço na tabela'

interface Call { readonly kind: 'ensureSession' | 'deliver' | 'steer' | 'cancel'; readonly sessionId: string; readonly requestId?: string; readonly text?: string; readonly mode?: string; readonly open: boolean }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}

/** Um runner com o turno ABERTO (status 'running' até soltar) que registra cada chamada do host e RECUSA o steer. */
function busyRunnerRefusingSteer() {
  const inner = createFakeRunner()
  let open = true
  let began = false
  let release = (): void => undefined
  const wait = new Promise<void>((resolve) => { release = resolve })
  const calls: Call[] = []
  const runner: Runner = {
    ensureSession: (id, cwd, title, role) => { calls.push({ kind: 'ensureSession', sessionId: id, open }); return inner.ensureSession(id, cwd, title, role) },
    deliver: async (sessionId, requestId, text, mode) => { calls.push({ kind: 'deliver', sessionId, requestId, text, mode, open }); began = true; await inner.deliver(sessionId, requestId, text, mode) },
    steer: (sessionId, requestId, text) => { calls.push({ kind: 'steer', sessionId, requestId, text, open }); return Promise.resolve(false) },
    cancel: async (sessionId, options) => { calls.push({ kind: 'cancel', sessionId, open }); open = false; release(); await inner.cancel(sessionId, options) },
    status: sessionId => (open ? 'running' : inner.status(sessionId)),
    whenIdle: async (sessionId) => { await wait; await inner.whenIdle(sessionId) },
    onEvent: listener => inner.onEvent(listener),
    capabilities: () => inner.capabilities(),
  }
  return { runner, calls, started: () => began, finish: () => { open = false; release() } }
}

const until = async (condition: () => boolean, what: string, ms = 10_000): Promise<void> => {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`)
    await new Promise(resolve => setTimeout(resolve, 15))
  }
}
const lines = (h: PersonaHost): string[] => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(row => row.body)

/** Roda o cenário e devolve o que o host fez com o runner. `oldSteer` reinstala o steerTicket do snapshot antigo (sem o fallback para a fila). */
async function scenario(h: PersonaHost, options: { oldSteer?: boolean } = {}) {
  seed(h)
  const busy = busyRunnerRefusingSteer()
  h.orchestration.runnerFactory = () => Promise.resolve(busy.runner)
  h.postMessage({ id: 'm1', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Faça o relatório lento', actorId: 'ana', subjectId: '' })
  await until(() => busy.started(), 'a Tarefa começar')
  // O turno só está de fato ABERTO quando a Tarefa está `running` e o runner dela está registrado como "quente" (onde `taskRunnerOf` o acha): espera as duas coisas, senão o teste depende de tempo.
  await until(() => h.orchestration.runningTicketOf('pp', 'p1') !== undefined && h.orchestration.warmRunners.has('pp:p1:task'), 'o turno da Tarefa ficar aberto')
  const workerSession = busy.calls.find(call => call.kind === 'ensureSession')?.sessionId ?? ''
  expect(workerSession, 'sessão da Tarefa').not.toBe('')
  if (options.oldSteer === true) {
    // O corpo de steerTicket em d232da3e00: o steer recusado devolve false e NADA mais acontece.
    const orchestration = h.orchestration as unknown as { taskRunnerOf: (projectId: string, ticketId: string) => Runner | undefined; steerTicket: (projectId: string, ticketId: string, requestId: string, text: string) => Promise<boolean> }
    orchestration.steerTicket = async function (this: typeof orchestration, projectId, ticketId, requestId, text) {
      const runner = this.taskRunnerOf(projectId, ticketId)
      if (runner === undefined || runner.status(workerSession) !== 'running') return false
      if (runner.steer !== undefined) return runner.steer(workerSession, requestId, text)
      await runner.deliver(workerSession, requestId, text, 'steer')
      return true
    }
  }
  const steered = await h.steerWorkingTurn({ ...scope, personaId: 'p1', subjectId: 'geral', streamKind: 'channel', ownerId: 'geral', text: STEER_TEXT })
  h.postMessage({ id: 'm2', ...scope, streamKind: 'channel', ownerId: 'geral', body: `@Bento ${NORMAL_TEXT}`, actorId: 'ana', subjectId: '' })
  await until(() => lines(h).some(line => line.startsWith('Passei para Bento')), 'o aviso de que a mensagem foi absorvida')
  const whileOpen = [...busy.calls]
  busy.finish()
  await h.orchestration.flush('pp')
  return { steered, busy, whileOpen, workerSession, delivered: (text: string) => busy.calls.filter(call => call.kind === 'deliver' && (call.text ?? '').includes(text)) }
}

it('"Direcionar agora" com o steer RECUSADO + mensagem normal: nenhuma se perde, ambas vão para a fila UMA vez, nenhum 2º turno concorrente, nada cancelado, sessão não recriada', async () => {
  const h = host()
  const run = await scenario(h)
  // o host tentou o steer (o runner recusou) e não fingiu que entregou
  expect(run.steered.mode).toBe('sent')
  expect(run.busy.calls.filter(call => call.kind === 'steer' && call.text === STEER_TEXT)).toHaveLength(1)
  // as duas mensagens chegam ao runner, na fila, exatamente uma vez cada
  const steerText = run.delivered(STEER_TEXT)
  const normalText = run.delivered(NORMAL_TEXT)
  expect(steerText.map(call => call.mode), 'texto do "Direcionar agora"').toEqual(['queue'])
  expect(normalText.map(call => call.mode), 'mensagem normal').toEqual(['queue'])
  // nenhum segundo turno: o INÍCIO da Tarefa é o único deliver com requestId `launch:` (as duas mensagens entram como `steer:`/`msg:` na fila); nada foi cancelado; a sessão não foi recriada
  const delivers = run.busy.calls.filter(call => call.kind === 'deliver')
  expect(delivers.filter(call => (call.requestId ?? '').startsWith('launch:'))).toHaveLength(1)
  expect(delivers.filter(call => !(call.requestId ?? '').startsWith('launch:') && call.mode !== 'queue' && call.mode !== 'steer')).toEqual([])
  expect(new Set(delivers.map(call => call.sessionId)).size, 'tudo na MESMA sessão da Tarefa').toBe(1)
  // exatamente 3 entregas, EM ORDEM: o lançamento da Tarefa, o texto do "Direcionar agora", a mensagem normal (a ordem em que a pessoa mandou); só UMA entrega contém o pedido original (nenhum 2º lançamento)
  expect(delivers, 'lançamento + 2 mensagens enfileiradas').toHaveLength(3)
  expect(delivers[0]?.text).toContain('relatório lento')
  expect(delivers[1]?.text).toBe(STEER_TEXT)
  expect(delivers[2]?.text).toContain(NORMAL_TEXT)
  expect(delivers.filter(call => (call.text ?? '').includes('relatório lento'))).toHaveLength(1)
  expect(run.busy.calls.filter(call => call.kind === 'cancel')).toEqual([])
  expect(run.busy.calls.filter(call => call.kind === 'ensureSession' && call.sessionId === run.workerSession)).toHaveLength(1)
  // o turno terminou: o host NÃO reenviou as mensagens como turno novo (continuam 1 entrega cada)
  expect(run.delivered(STEER_TEXT)).toHaveLength(1)
  expect(run.delivered(NORMAL_TEXT)).toHaveLength(1)
  // a pessoa lê UM aviso de que a mensagem foi absorvida (não duplicado)
  expect(lines(h).filter(line => line.startsWith('Passei para Bento'))).toHaveLength(1)
})

it('GUARDA: com o steerTicket ANTIGO (d232da3e00, sem o fallback para a fila) o mesmo cenário reprova: o texto do "Direcionar agora" SOME (0 entregas)', async () => {
  const h = host()
  const run = await scenario(h, { oldSteer: true })
  expect(run.steered.mode).toBe('sent')
  expect(run.delivered(STEER_TEXT), 'no código antigo a mensagem do "Direcionar agora" não chega a runner nenhum').toHaveLength(0)
  expect(run.delivered(NORMAL_TEXT).map(call => call.mode)).toEqual(['queue']) // a mensagem normal nunca dependeu do steer
})
