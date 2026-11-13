/**
 * D-119b (Lumen, 12/11 21:00; Keel 21:50 "autorizado tudo"): escrita e comando numa conversa PRIVADA por quem NÃO é dela. `postMessage` já exige que o autor seja o ator da sessão E participante da DM
 * (`requireStreamWriter`/`assertStreamWrite`), e `decideAction` já diz "só decide quem é da DM". Os outros Remotes de escrita que levam um ticket, uma conversa ou uma mensagem só pediam `requireWrite` do PROJETO,
 * e o `appendMessage` (por onde passam a fila, o direcionar e o toque em cartão) só conferia `assertCanAddress`. Um teste por Remote: o Gus (membro FORA da DM ana↔guia) é recusado (`forbidden`) e o que
 * ele tentou NÃO aconteceu; o controle é a participante (a Ana), que não é recusada. Escrito vermelho antes do conserto.
 */
import { describe, expect } from 'vitest'
import { CLOCK, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const P = { workspaceId: 'ws', projectId: 'sh' } as const
const SECRET = 'FESTA-SURPRESA-JOAO-4821'
const INTRUDER = 'RESPOSTA-DO-INTRUSO-6613'
const OFFER = 'Fiz as duas versões.\n[[escolha: Qual delas? | Primeira | Segunda]]'

async function rig() {
  const h = openJourney()
  seedJourney(h)
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
  h.teamworkEnabled = true
  h.postMessage({ id: 'req', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: `preciso de um plano da ${SECRET}, só entre nós dois`, actorId: 'ana', subjectId: 'req', occurredAt: CLOCK })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
  const rt = h.orchestration.runtime('sh')
  const task = rt.repo.tickets.list().find(row => row.origin.triggerId === 'req') ?? rt.repo.tickets.list()[0]!
  rt.engine.report(task.id, { state: 'waiting', summary: 'Esperando você', question: 'Posso seguir?' })
  // a card with choices that the persona put in the DM
  h.events.append({ id: 'm-offer', ...P, streamKind: 'dm', ownerId: 'dm-guia', type: 'message', body: OFFER, actorId: 'guia', subjectId: '', occurredAt: CLOCK })
  return { h, task }
}
type Rig = Awaited<ReturnType<typeof rig>>

/** `forbidden` when the host refused the caller, `ok` when it ran, or what else went wrong (a participant may meet a not-found: that is not a refusal). */
const outcome = (run: () => unknown): string => {
  try { run(); return 'ok' } catch (error) { return error instanceof Error ? ((error as { code?: string }).code ?? error.message) : 'erro' }
}
const outcomeAsync = async (run: () => Promise<unknown>): Promise<string> => {
  try { await run(); return 'ok' } catch (error) { return error instanceof Error ? ((error as { code?: string }).code ?? error.message) : 'erro' }
}
const dmText = (h: Rig['h']): string => JSON.stringify(h.listMessages({ ...P, streamKind: 'dm', ownerId: 'dm-guia', actorId: 'ana', afterSeq: 0, limit: 200 }))
const intruder = (h: Rig['h']): void => { h.sessionMemberId = 'gus' }
const participant = (h: Rig['h']): void => { h.sessionMemberId = 'ana' }

describe('W1 responder a pergunta de uma Tarefa de DM é de quem é da DM', () => {
  it('controle: a Ana (da DM) responde e a resposta aparece na DM', async () => {
    const { h, task } = await rig()
    participant(h)
    expect(outcome(() => h.answerAttention({ ...P, ticketId: task.id, text: 'Pode seguir, obrigada.' }))).toBe('ok')
    expect(dmText(h)).toContain('Pode seguir, obrigada.')
  })

  it('o Gus (membro FORA da DM) NÃO responde a pergunta nem escreve na DM', async () => {
    const { h, task } = await rig()
    intruder(h)
    const answered = outcome(() => h.answerAttention({ ...P, ticketId: task.id, text: INTRUDER }))
    participant(h)
    expect(dmText(h), 'o texto do intruso entrou na DM da Ana com a Guia').not.toContain(INTRUDER)
    expect(answered).toBe('forbidden')
  })
})

describe('W2 criar uma DM é de quem faz parte dela (o dono do espaço administra)', () => {
  it('o Gus NÃO cria uma DM entre a Ana e a Bia', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => h.createDm({ id: 'dm-alheia', ...P, participantA: 'ana', participantB: 'bia' }))).toBe('forbidden')
  })

  it('controles: o Gus cria a própria DM com a Bia; o dono cria a de um membro com a Guia (administra)', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => h.createDm({ id: 'dm-gus-bia', ...P, participantA: 'gus', participantB: 'bia' }))).toBe('ok')
    participant(h)
    expect(outcome(() => h.createDm({ id: 'dm-gus-guia', ...P, participantA: 'gus', participantB: 'guia' }))).toBe('ok')
  })
})

describe('W3 o toque num cartão de escolha da persona na DM é de quem é da DM', () => {
  it('o Gus NÃO responde o cartão (a escolha dele não vira mensagem na DM)', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => h.answerChoice({ ...P, messageId: 'm-offer', optionId: 'a' }))).toBe('forbidden')
    expect(h.events.has('choice-answer:m-offer'), 'a escolha do intruso virou mensagem').toBe(false)
  })

  it('controle: a Ana responde e a escolha aparece na DM', async () => {
    const { h } = await rig()
    participant(h)
    expect(outcome(() => h.answerChoice({ ...P, messageId: 'm-offer', optionId: 'a' }))).toBe('ok')
    expect(h.events.has('choice-answer:m-offer'), 'a escolha da Ana virou mensagem na DM').toBe(true)
  })
})

describe('W4 a fila de trabalho e o direcionar numa DM são de quem é da DM', () => {
  const enqueue = (h: Rig['h'], text: string) => h.enqueueWorkingMessage({ ...P, personaId: 'guia', subjectId: 'req', text, streamKind: 'dm', ownerId: 'dm-guia' })

  it('o Gus NÃO põe uma mensagem na fila da DM; a Ana põe', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => enqueue(h, INTRUDER))).toBe('forbidden')
    participant(h)
    expect(outcome(() => enqueue(h, 'Ana na fila'))).toBe('ok')
  })

  it('o Gus NÃO edita, tira nem despacha a fila da Ana (e nada sai na DM)', async () => {
    const { h } = await rig()
    participant(h)
    const row = enqueue(h, 'Ana na fila')
    intruder(h)
    expect(outcome(() => h.editQueuedMessage({ ...P, personaId: 'guia', subjectId: 'req', id: row.id, text: INTRUDER })), 'editQueuedMessage').toBe('forbidden')
    expect(outcome(() => h.dropQueuedMessage({ ...P, personaId: 'guia', subjectId: 'req', id: row.id })), 'dropQueuedMessage').toBe('forbidden')
    expect(outcome(() => h.flushWorkingQueue({ ...P, personaId: 'guia', subjectId: 'req' })), 'flushWorkingQueue').toBe('forbidden')
    participant(h)
    expect(dmText(h)).not.toContain('Ana na fila')
    expect(outcome(() => h.flushWorkingQueue({ ...P, personaId: 'guia', subjectId: 'req' })), 'a Ana despacha a própria fila').toBe('ok')
    expect(dmText(h)).toContain('Ana na fila')
  })

  it('o Gus NÃO direciona o turno que a Guia faz para a Ana, nem dizendo que a conversa é o #geral (o turno em curso é de uma Tarefa de DM)', async () => {
    const { h, task } = await rig()
    h.orchestration.runningTicketOf = () => task // the persona is working on the DM-born Task
    intruder(h)
    expect(await outcomeAsync(() => h.steerWorkingTurn({ ...P, personaId: 'guia', subjectId: 'req', text: INTRUDER, streamKind: 'dm', ownerId: 'dm-guia' })), 'direcionando pela DM').toBe('forbidden')
    expect(await outcomeAsync(() => h.steerWorkingTurn({ ...P, personaId: 'guia', subjectId: 'geral', text: INTRUDER, streamKind: 'channel', ownerId: 'geral' })), 'direcionando pelo #geral').toBe('forbidden')
    participant(h)
    expect(await outcomeAsync(() => h.steerWorkingTurn({ ...P, personaId: 'guia', subjectId: 'req', text: 'Siga por aí.', streamKind: 'dm', ownerId: 'dm-guia' })), 'a Ana direciona').not.toBe('forbidden')
  })
})

describe('W5 agir sobre a Tarefa, a resposta ou a entrega nascidas numa DM é de quem é da DM', () => {
  it('Parar a Tarefa da DM: o Gus não; a Ana sim', async () => {
    const { h, task } = await rig()
    intruder(h)
    expect(await outcomeAsync(() => h.stopTurn({ ...P, personaId: 'guia', ticketId: task.id }))).toBe('forbidden')
    participant(h)
    expect(await outcomeAsync(() => h.stopTurn({ ...P, personaId: 'guia', ticketId: task.id }))).not.toBe('forbidden')
  })

  it('cancelar a resposta em andamento na DM: o Gus não', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => h.cancelReply({ ...P, eventId: 'req' }))).toBe('forbidden')
    participant(h)
    expect(outcome(() => h.cancelReply({ ...P, eventId: 'req' }))).not.toBe('forbidden')
  })

  it('mover o cartão da Tarefa da DM (iniciaria a persona): o Gus não', async () => {
    const { h, task } = await rig()
    intruder(h)
    expect(outcome(() => h.moveTicket({ ...P, ticketId: task.id, columnId: 'doing' }))).toBe('forbidden')
    participant(h)
    expect(outcome(() => h.moveTicket({ ...P, ticketId: task.id, columnId: 'doing' }))).not.toBe('forbidden')
  })

  it('preparar, aceitar e descartar a entrega da Tarefa da DM: o Gus não', async () => {
    const { h, task } = await rig()
    intruder(h)
    expect(await outcomeAsync(() => h.prepareReview({ ...P, ticketId: task.id })), 'prepareReview').toBe('forbidden')
    expect(await outcomeAsync(() => h.acceptReview({ ...P, ticketId: task.id, mode: 'ff' })), 'acceptReview').toBe('forbidden')
    expect(await outcomeAsync(() => h.discardReview({ ...P, ticketId: task.id })), 'discardReview').toBe('forbidden')
    participant(h)
    expect(await outcomeAsync(() => h.discardReview({ ...P, ticketId: task.id })), 'a Ana não é recusada').not.toBe('forbidden')
  })
})

describe('W6 os assuntos e as mensagens de uma DM são organizados por quem é da DM', () => {
  it('o Gus NÃO cria assunto na DM nem move uma mensagem dela para outro assunto', async () => {
    const { h } = await rig()
    intruder(h)
    expect(outcome(() => h.createConversationSubject({ ...P, streamKind: 'dm', ownerId: 'dm-guia', name: 'Intruso' })), 'createConversationSubject').toBe('forbidden')
    expect(outcome(() => h.moveMessageToSubject({ ...P, streamKind: 'dm', ownerId: 'dm-guia', eventId: 'req', subjectId: 'dm:dm-guia:t1' })), 'moveMessageToSubject').toBe('forbidden')
    participant(h)
    expect(outcome(() => h.createConversationSubject({ ...P, streamKind: 'dm', ownerId: 'dm-guia', name: 'Festa' })), 'a Ana cria assunto').toBe('ok')
  })
})

describe('W7 a pergunta de lado e o resumo de uma DM são de quem é da DM (o que se pergunta e a resposta derivam da conversa)', () => {
  const ASIDE = 'O que a Ana me pediu sobre a FESTA-SURPRESA-JOAO-4821?'

  it('o Gus NÃO lê (nem lista) a pergunta de lado que a Ana fez sobre o assunto da DM, nem abre uma nova nela', async () => {
    const { h } = await rig()
    participant(h)
    const ask = h.openAsideAsk({ ...P, personaId: 'guia', subjectId: 'req', question: ASIDE })
    intruder(h)
    expect(outcome(() => h.listAsideAsks({ ...P, personaId: 'guia', subjectId: 'req' })), 'listAsideAsks').toBe('forbidden')
    expect(outcome(() => h.getAsideAsk({ ...P, id: ask.id })), 'getAsideAsk').toBe('forbidden')
    expect(outcome(() => h.openAsideAsk({ ...P, personaId: 'guia', subjectId: 'req', question: INTRUDER })), 'openAsideAsk').toBe('forbidden')
    participant(h)
    expect(JSON.stringify(h.listAsideAsks({ ...P, personaId: 'guia', subjectId: 'req' })), 'a Ana lê a própria pergunta de lado').toContain('FESTA-SURPRESA-JOAO-4821')
    expect(outcome(() => h.getAsideAsk({ ...P, id: ask.id }))).toBe('ok')
  })
})

describe('W8 o Parar do celular é o mesmo Parar: a Tarefa de uma DM só para por quem é da DM', () => {
  it('o celular do Gus NÃO para a Tarefa da DM da Ana com a Guia; o da Ana para', async () => {
    const { h, task } = await rig()
    let stopped = 0
    h.orchestration.stopTicketRun = () => { stopped += 1; return Promise.resolve(true) }
    const deviceOf = (member: string) => {
      const made = h.remoteDevices.enroll(member, `Celular de ${member}`)
      if (typeof made === 'string') throw new Error(`enroll: ${made}`)
      return h.remoteDevices.liveRecord(made.id)!
    }
    const stopRunOfDevice = (h as unknown as { stopRunOfDevice(runId: string, device: unknown): Promise<boolean> }).stopRunOfDevice.bind(h)
    expect(await stopRunOfDevice(task.id, deviceOf('gus')), 'o celular do intruso parou a Tarefa').toBe(false)
    expect(stopped).toBe(0)
    expect(await stopRunOfDevice(task.id, deviceOf('ana')), 'o celular da Ana (da DM) para').toBe(true)
    expect(stopped).toBe(1)
  })
})
