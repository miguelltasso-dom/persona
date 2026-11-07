import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { reviewTreesOf } from '../src/review.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/** IV-10: answer a persona's question with text and files INSIDE the thread (contracts/attention-answer.md). */

async function asked(h: PersonaHost): Promise<{ ticketId: string; attentionId: string }> {
  seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
  say(h, 'question-request', 'preciso de um README no projeto?')
  await h.orchestration.flush(SCOPE.projectId)
  const ticket = h.orchestration.runtime(SCOPE.projectId).repo.tickets.list().find(row => row.attention !== undefined)
  if (ticket?.attention === undefined) throw new Error('missing-question')
  return { ticketId: ticket.id, attentionId: ticket.attention.id }
}

function upload(h: PersonaHost, name: string, text: string, stream: { streamKind: 'channel' | 'dm'; ownerId: string } = { streamKind: 'channel', ownerId: 'geral' }): string {
  return h.attachFile({ ...SCOPE, ...stream, name, bytesBase64: Buffer.from(text).toString('base64') }).id
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

function fault(run: () => unknown): RemoteFault {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

it('a text answer is the person\'s own message in the thread and reaches the ticket; the question is cleared', async () => {
  const h = openJourney()
  const { ticketId, attentionId } = await asked(h)
  expect(h.answerAttention({ ...SCOPE, ticketId, text: '  Na pasta src.  ' })).toBe(true)
  const posted = geral(h).find(row => row.id === `answer:${ticketId}:${attentionId}`)
  expect(posted).toMatchObject({ body: 'Na pasta src.', actorId: 'ana', attachmentIds: [] })
  const ticket = h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)!
  expect(ticket.attention).toBeUndefined()
  expect(ticket.inputs.some(input => input.kind === 'text' && input.text === 'Na pasta src.')).toBe(true)
})

function setWorkerDir(h: PersonaHost, ticketId: string, directory: string): void {
  const repo = h.orchestration.runtime(SCOPE.projectId).repo
  const before = repo.tickets.get(ticketId)!
  repo.tickets.save({ ...before, execution: { name: before.execution?.name ?? 'Guia', directory, assignment: before.execution?.assignment ?? before.title } })
}

function answerText(h: PersonaHost, ticketId: string, startsWith: string): string {
  const input = h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)!.inputs.find(row => row.kind === 'text' && row.text.startsWith(startsWith))
  return input !== undefined && input.kind === 'text' ? input.text : ''
}

afterEach(() => { vi.unstubAllEnvs() })

it('text AND a file: the file is in the thread, named in the answer, and copied next to the worker (its review worktree)', async () => {
  vi.stubEnv('PERSONA_HOME', mkdtempSync(join(tmpdir(), 'persona-home-')))
  const h = openJourney()
  const { ticketId, attentionId } = await asked(h)
  const dir = join(reviewTreesOf(SCOPE.projectId), ticketId)
  mkdirSync(dir, { recursive: true })
  setWorkerDir(h, ticketId, dir)
  const fileId = upload(h, 'estrutura.md', '# estrutura\nsrc/\n')

  expect(h.answerAttention({ ...SCOPE, ticketId, text: 'Veja a estrutura em anexo.', attachmentIds: [fileId] })).toBe(true)

  const posted = geral(h).find(row => row.id === `answer:${ticketId}:${attentionId}`)
  expect(posted).toMatchObject({ body: 'Veja a estrutura em anexo.', attachmentIds: [fileId] })
  expect(answerText(h, ticketId, 'Veja a estrutura')).toContain('Anexos: estrutura.md')
  const staged = join(dir, 'inputs', 'estrutura.md')
  expect(existsSync(staged)).toBe(true)
  expect(readFileSync(staged, 'utf8')).toContain('# estrutura')
})

it('a worker folder that is NOT its review worktree (a task without a folder, or any other path) is never written to', async () => {
  vi.stubEnv('PERSONA_HOME', mkdtempSync(join(tmpdir(), 'persona-home-')))
  const h = openJourney()
  const { ticketId } = await asked(h)
  const elsewhere = mkdtempSync(join(tmpdir(), 'persona-elsewhere-'))
  setWorkerDir(h, ticketId, elsewhere)
  const fileId = upload(h, 'nota.md', 'x')
  expect(h.answerAttention({ ...SCOPE, ticketId, text: 'Segue.', attachmentIds: [fileId] })).toBe(true)
  expect(answerText(h, ticketId, 'Segue.')).toContain('Anexos: nota.md') // still named for the worker
  expect(existsSync(join(elsewhere, 'inputs'))).toBe(false)
})

it('a files-only answer gets a plain sentence; an empty answer is refused', async () => {
  const h = openJourney()
  const { ticketId, attentionId } = await asked(h)
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId, text: '   ' })).code).toBe('invalid-payload')
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId, text: '', attachmentIds: [] })).message).toMatch(/Escreva a resposta, escolha uma opção ou anexe um arquivo/u)
  expect(h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)?.attention).toBeDefined() // still asking
  const fileId = upload(h, 'logo.txt', 'x')
  expect(h.answerAttention({ ...SCOPE, ticketId, text: '', attachmentIds: [fileId] })).toBe(true)
  expect(geral(h).find(row => row.id === `answer:${ticketId}:${attentionId}`)).toMatchObject({ body: 'Segue o arquivo.', attachmentIds: [fileId] })
  // the worker of this ticket runs in a relative folder ('.'): nothing may be copied into the host's own working directory
  expect(existsSync(join(process.cwd(), 'inputs', 'logo.txt'))).toBe(false)
})

it('a file from another conversation or a made-up id is refused BEFORE anything is posted; the question stays open', async () => {
  const h = openJourney()
  const { ticketId, attentionId } = await asked(h)
  const dm = h.createDm({ id: 'dm1', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'coord' })
  const foreign = upload(h, 'outro.txt', 'x', { streamKind: 'dm', ownerId: dm.id })
  for (const attachmentIds of [[foreign], ['nao-existe']]) {
    const failure = fault(() => h.answerAttention({ ...SCOPE, ticketId, text: 'Segue.', attachmentIds }))
    expect(failure.code).toBe('invalid-payload')
    expect(failure.message).toMatch(/arquivos não pertence/)
  }
  expect(geral(h).some(row => row.id === `answer:${ticketId}:${attentionId}`)).toBe(false)
  expect(h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)?.attention).toBeDefined()
})

it('one answer per question: the second is refused and changes nothing; an unknown or foreign ticket is not found', async () => {
  const h = openJourney()
  const { ticketId, attentionId } = await asked(h)
  expect(h.answerAttention({ ...SCOPE, ticketId, text: 'Primeira.' })).toBe(true)
  const inputs = h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)!.inputs.length
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId, text: 'Segunda.' })).code).toBe('conflict')
  expect(h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)!.inputs.length).toBe(inputs)
  expect(geral(h).find(row => row.id === `answer:${ticketId}:${attentionId}`)?.body).toBe('Primeira.')
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId: 'nao-existe', text: 'x' })).code).toBe('not-found')
})

it('the worker wakes and reads the answer: a new assignment takes it up and reports', async () => {
  const h = openJourney()
  const { ticketId } = await asked(h)
  const repo = h.orchestration.runtime(SCOPE.projectId).repo
  const assignmentsBefore = repo.tickets.get(ticketId)!.assignments.length
  h.answerAttention({ ...SCOPE, ticketId, text: 'Na pasta src.' })
  // the wake runs in the background: wait for the new assignment to report (never a fixed sleep)
  const deadline = Date.now() + 8_000
  while (latestAssignment(repo.tickets.get(ticketId)!)?.report?.state !== 'ready' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const after = repo.tickets.get(ticketId)!
  expect(after.attention).toBeUndefined()
  expect(after.assignments.length).toBe(assignmentsBefore + 1)
  expect(latestAssignment(after)?.report?.state).toBe('ready')
  expect(after.undelivered).toEqual([]) // the answer was handed to the worker
})

it('only someone who can write answers: a guest is refused and the question stays', async () => {
  const h = openJourney()
  const { ticketId } = await asked(h)
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.sessionMemberId = 'gus'
  expect(() => h.answerAttention({ ...SCOPE, ticketId, text: 'Eu respondo.' })).toThrow(/forbidden/u)
  h.sessionMemberId = 'ana'
  expect(h.orchestration.runtime(SCOPE.projectId).repo.tickets.get(ticketId)?.attention).toBeDefined()
})
