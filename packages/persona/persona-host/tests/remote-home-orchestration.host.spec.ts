import type { RunEvent, RunHandle, StartTurnInput, TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, vi } from 'vitest'
import { createRemoteRunnerOf } from '../src/computers/remote-home-hook.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * D-116 executor, THROUGH the real orchestration (Keel 20:52; Lumen's gate): a persona whose home is another computer answers a channel through the runner of her home, and a private DM never leaves this PC:
 * the person reads the honest sentence in the DM and nothing is started on the other computer.
 */
function remoteRunner(replyText: string, options: { readonly hold?: boolean } = {}): { readonly runner: TurnRunner; readonly started: StartTurnInput[]; readonly cancelled: string[] } {
  const started: StartTurnInput[] = []
  const cancelled: string[] = []
  let release: () => void = () => undefined
  const held = options.hold === true ? new Promise<void>((resolve) => { release = resolve }) : Promise.resolve()
  const start = (input: StartTurnInput): Promise<RunHandle> => {
    started.push(input)
    return Promise.resolve({ runId: `r-${input.ticketId}`, sessionId: input.ticketId, ticketId: input.ticketId, assignmentId: input.assignmentId, personaId: input.personaId, cwd: input.cwd, model: input.model })
  }
  const stream = (handle: RunHandle): AsyncIterable<RunEvent> => ({
    async *[Symbol.asyncIterator](): AsyncIterator<RunEvent> {
      yield { type: 'started', at: '2026-11-12T12:00:00.000Z', handle }
      await held
      yield { type: 'delta', at: '2026-11-12T12:00:01.000Z', text: replyText }
      yield { type: 'ended', at: '2026-11-12T12:00:02.000Z', report: { state: 'ready', summary: replyText } }
    },
  })
  return {
    started,
    cancelled,
    runner: {
      capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: true, mcpTools: 'available', permission: 'explicit' }),
      health: () => Promise.resolve({ ok: true, detail: 'ok' }),
      authenticate: () => Promise.resolve({ ok: true, detail: 'ok' }),
      start, startTurn: start, resume: start, stream, events: stream,
      cancel: (handle) => { cancelled.push(typeof handle === 'string' ? handle : handle.runId); release(); return Promise.resolve() },
      usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    },
  }
}

function seedHost(): ReturnType<typeof openJourney> {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  h.orchestration.scripted = false
  h.orchestration.skipTriage = true
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }])
  h.createPersona({
    id: 'nina', ...SCOPE, name: 'Nina', title: 'Execução', description: 'Execução', personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: 'nina',
    runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  return h
}

const hooked = (h: ReturnType<typeof openJourney>, remote: ReturnType<typeof remoteRunner>): void => {
  h.orchestration.remoteRunnerOf = createRemoteRunnerOf({
    turns: () => ({ isRemote: personaId => personaId === 'nina', runnerFor: () => remote.runner }),
    conversationOf: (projectId, ticketId) => h.orchestration.conversationOfTicket(projectId, ticketId),
  })
}

describe('a persona whose home is another computer, through the real orchestration', () => {
  it('a channel conversation reaches the runner of her home and her answer is in the thread', async () => {
    const h = seedHost()
    const remote = remoteRunner('Respondido da estação B.')
    hooked(h, remote)
    h.postMessage({ id: 'm-canal', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina verifique o arquivo no servidor', actorId: 'ana', subjectId: 'm-canal' })
    await h.orchestration.flush('pp')
    expect(remote.started, 'the turn went to her home').toHaveLength(1)
    const messages = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
    expect(messages.some(message => message.body.includes('Respondido da estação B.'))).toBe(true)
  })

  it('a private DM with her never leaves this PC: nothing is started on the other computer and the person reads why, in the DM', async () => {
    const h = seedHost()
    const remote = remoteRunner('NAO-DEVIA-RODAR-EM-B')
    hooked(h, remote)
    h.createDm({ id: 'dm-nina', ...SCOPE, participantA: 'ana', participantB: 'nina' })
    h.postMessage({ id: 'm-dm', ...SCOPE, streamKind: 'dm', ownerId: 'dm-nina', body: 'Nina, só entre nós: lembra do que combinamos?', actorId: 'ana', subjectId: 'm-dm' })
    for (let pass = 0; pass < 6; pass += 1) await h.orchestration.flush('pp')
    expect(remote.started, 'a private DM is not carried to another computer').toEqual([])
    const thread = h.listMessages({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-nina', actorId: 'ana', afterSeq: 0, limit: 100 }).events.map(message => message.body).join('\n')
    expect(thread).toContain('Esta conversa é particular')
    expect(thread).not.toContain('NAO-DEVIA-RODAR-EM-B')
  })
})

describe('"Parar" from the phone', () => {
  const stopOf = (h: ReturnType<typeof openJourney>): ((runId: string, device: unknown) => Promise<boolean>) => (h as unknown as { stopRunOfDevice(runId: string, device: unknown): Promise<boolean> }).stopRunOfDevice.bind(h)
  const deviceOf = (h: ReturnType<typeof openJourney>, memberId: string): unknown => {
    const made = h.remoteDevices.enroll(memberId, 'Pixel', { address: '100.64.0.9' })
    if (typeof made === 'string') throw new Error(made)
    return h.remoteDevices.liveRecord(made.id)
  }

  it('stops the Task and the turn that runs on the other computer when the device\'s member may write the project; a stranger\'s device changes nothing', async () => {
    const h = seedHost()
    const remote = remoteRunner('Feito em B.', { hold: true })
    hooked(h, remote)
    h.postMessage({ id: 'm-parar', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina faça o relatório agora', actorId: 'ana', subjectId: 'm-parar' })
    void h.orchestration.flush('pp')
    await vi.waitFor(() => { expect(remote.started).toHaveLength(1) }, { timeout: 5_000 })
    const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.ended === undefined)
    expect(ticket, 'the request became a Task that is running on B').toBeDefined()

    expect(await stopOf(h)(ticket?.id ?? '', deviceOf(h, 'm-estranho')), 'a device of someone who cannot write the project').toBe(false)
    expect(remote.cancelled).toEqual([])
    expect(await stopOf(h)('tarefa-que-nao-existe', deviceOf(h, 'ana'))).toBe(false)

    expect(await stopOf(h)(ticket?.id ?? '', deviceOf(h, 'ana'))).toBe(true)
    await vi.waitFor(() => { expect(remote.cancelled).toHaveLength(1) }, { timeout: 5_000 }) // the cancel reached the runner of her home
    expect(h.orchestration.runtime('pp').repo.tickets.get(ticket?.id ?? '')?.ended).toBeDefined()
  })
})
