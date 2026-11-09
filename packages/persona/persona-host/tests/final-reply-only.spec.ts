import { createFakeRunner, createScriptedRunner, type RunEvent, type TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it as plain, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { resolveHostRunner, tapTurn, type PersonaRunnersSlice, type TextCapture } from '../src/runner.ts'
import { TEAM_GUIDANCE_CORE } from '../src/harness-team.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * TEAM-10 attempt 4 (09/11, P0-2): the line of Téo in the thread was his whole monologue between tools — "Vou começar conferindo se o foto.png existe…
 * Nenhum arquivo de imagem… Vou verificar…" glued ("contém.Nenhum") — instead of his answer. Only the LAST block of text after the LAST tool is what a persona
 * says (the thread, the bilhete, the review, the opinion): the pieces between tools are her thinking aloud, never a message. The texts below are the real ones
 * of `persona-e2e/artifacts/team10/real-attempt-4-*`.
 */
afterEach(() => {
  delete process.env.PERSONA_REAL_CLI
})

const AT = '2026-11-09T12:00:00.000Z'
const HANDLE = { runId: 'r', sessionId: 's', ticketId: 't', assignmentId: 'a', personaId: 'p', cwd: '.', model: 'm' }

const NARRATION_1 = 'Vou começar conferindo se o `foto.png` existe no projeto e o que ele contém.'
const NARRATION_2 = 'Nenhum arquivo de imagem no diretório de trabalho. Vou verificar o diretório e procurar `foto.png` mais amplamente.'
const NARRATION_3 = 'A pasta tem só um `LEIAME.txt` sem conteúdo útil: não há `foto.png` nem foto de pão de queijo no projeto. Vou fazer um rascunho de layout com o texto aprovado e um espaço reservado para a foto.'
const FINAL = 'O rascunho está pronto: cartaz 4:5 com o texto aprovado e um espaço reservado para a foto. Falta só a foto correta da padaria.'

const tool = (name: string): RunEvent => ({ type: 'report', at: AT, report: { state: 'progress', summary: `tool:${name}` } })
const say = (text: string): RunEvent => ({ type: 'delta', at: AT, text })
const ended: RunEvent = { type: 'ended', at: AT, report: { state: 'ready', summary: 'turn ended' } }

function turnOf(script: readonly RunEvent[]): TurnRunner {
  const play = async function* (): AsyncGenerator<RunEvent> { for (const event of script) yield event }
  return {
    capabilities: () => ({ kind: 'cli', stream: true, cancel: true, resume: false, usage: false, mcpTools: 'unavailable', permission: 'explicit' }),
    health: () => Promise.resolve({ ok: true, detail: '' }),
    authenticate: () => Promise.resolve({ ok: true, detail: '' }),
    start: () => Promise.resolve(HANDLE),
    startTurn: () => Promise.resolve(HANDLE),
    stream: () => play(),
    events: () => play(),
    cancel: () => Promise.resolve(),
    resume: () => Promise.resolve(HANDLE),
    usage: () => Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  } as unknown as TurnRunner
}

async function tapped(script: readonly RunEvent[]): Promise<{ capture: TextCapture; heard: string[] }> {
  const heard: string[] = []
  const capture: TextCapture = { last: '', onPartial: text => heard.push(text) }
  for await (const event of tapTurn(turnOf([{ type: 'started', at: AT, handle: HANDLE }, ...script]), capture).stream(HANDLE)) void event
  return { capture, heard }
}

plain('tapTurn: what the persona says is the text AFTER the last tool — the pieces between tools are never glued into it', async () => {
  const { capture } = await tapped([say(NARRATION_1), tool('Read'), say(NARRATION_2), tool('Glob'), say(NARRATION_3), tool('Write'), say(FINAL), ended])
  expect(capture.last).toBe(FINAL)
  expect(capture.last).not.toContain('Vou começar')
  expect(capture.last).not.toContain('contém.Nenhum')
})

plain('tapTurn: a streamed piece after a tool starts the reply over (the thread never shows the monologue followed by the answer)', async () => {
  const { heard } = await tapped([say(NARRATION_1), tool('Read'), say('Pronto, '), say('terminei.'), ended])
  expect(heard.at(-1)).toBe('Pronto, terminei.')
  expect(heard.filter(text => text.includes('Pronto')).every(text => !text.includes('Vou começar'))).toBe(true)
})

plain('tapTurn: the cumulative `partial` of an adapter that already restarted its text after a tool wins as before', async () => {
  const { capture } = await tapped([say(NARRATION_1), tool('Read'), say('Oi'), { type: 'partial', at: AT, text: 'Oi, tudo bem?' }, ended])
  expect(capture.last).toBe('Oi, tudo bem?')
})

plain('tapTurn: with nothing said after the last tool the text is empty (never the monologue) and the turn is marked as having spoken before', async () => {
  const { capture } = await tapped([say(NARRATION_1), tool('Read'), say(NARRATION_2), tool('Write'), ended])
  expect(capture.last).toBe('')
  expect(capture.last).not.toBe('turn ended')
  expect(capture.narrated).toBe(true)
})

plain('tapTurn: a turn with no tool keeps every piece, as before', async () => {
  const { capture } = await tapped([say('Olá'), say(', tudo'), say(' bem?'), ended])
  expect(capture.last).toBe('Olá, tudo bem?')
  expect(capture.narrated).not.toBe(true)
})

plain('tapTurn: a model text that merely starts with "tool:" is still a text, not a tool', async () => {
  const { capture } = await tapped([{ type: 'report', at: AT, report: { state: 'progress', summary: 'tool: use a faixa amarela para o contato' } }, say('ok'), ended])
  expect(capture.last).toBe('ok')
})

// ---- the whole Task: thread, bilhete, review hook and report carry the final words only -------------------------

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

async function runTask(script: readonly RunEvent[]): Promise<{ waits: string[]; delivered: string[]; summary: string | undefined; thread: string[] }> {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async options => createScriptedRunner({
      turns: options.purpose === 'talk'
        ? [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }]
        : [{ events: [...script] }],
    }),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  const waits: string[] = []
  const delivered: string[] = []
  const originalWait = h.orchestration.handoffWait
  const originalDelivered = h.orchestration.taskDelivered
  onTestFinished(() => { h.orchestration.handoffWait = originalWait; h.orchestration.taskDelivered = originalDelivered })
  h.orchestration.handoffWait = (_projectId, _ticketId, text) => { waits.push(text); return undefined }
  h.orchestration.taskDelivered = (info) => { delivered.push(info.text); return false }
  h.postMessage({
    id: 'm-art', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'faz o cartaz da promoção do pão de queijo', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-09T11:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]
  if (task === undefined) throw new Error('no task')
  const thread = h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events.map(item => item.body)
  return { waits, delivered, summary: h.orchestration.runtime('pp').repo.tickets.get(task.id)?.assignments.at(-1)?.report?.summary, thread }
}

it('the thread, the bilhete, the review hook and the Task report carry ONLY the last text after the last tool', async () => {
  const got = await runTask([say(NARRATION_1), tool('Read'), say(NARRATION_2), tool('Glob'), say(NARRATION_3), tool('Write'), say(FINAL), ended])
  expect(got.waits).toEqual([FINAL])
  expect(got.delivered).toEqual([FINAL])
  expect(got.summary).toBe(FINAL)
  expect(got.thread).toContain(FINAL)
  for (const body of got.thread) {
    expect(body).not.toContain('Vou começar')
    expect(body).not.toContain('Nenhum arquivo de imagem')
    expect(body).not.toContain('contém.Nenhum')
  }
})

it('a turn that ends on a tool with nothing after it falls to ONE short human sentence — never the monologue, never the placeholder', async () => {
  const got = await runTask([say(NARRATION_1), tool('Read'), say(NARRATION_2), tool('Write'), ended])
  const said = got.waits[0] ?? ''
  expect(said.trim()).not.toBe('')
  expect(said.length).toBeLessThan(120)
  for (const text of [said, got.summary ?? '', ...got.thread]) {
    expect(text).not.toContain('Vou começar')
    expect(text).not.toContain('Nenhum arquivo')
    expect(text).not.toContain('turn ended')
  }
  expect(got.thread).toContain(said)
  expect(got.summary).toBe(said)
})

// ---- P0-3: the persona never asks for a PNG nor speaks of shell/tools --------------------------------------------

plain('the guidance every worker reads says the host turns SVG into PNG by itself and that a limit is told in plain words (D-099)', () => {
  expect(TEAM_GUIDANCE_CORE).toMatch(/SVG/u)
  expect(TEAM_GUIDANCE_CORE).toMatch(/PNG/u)
  expect(TEAM_GUIDANCE_CORE).toMatch(/sozinh[oa]/iu) // the host does it, alone
  expect(TEAM_GUIDANCE_CORE).toMatch(/nunca (?:pe[çc]a|pedir)[^.]*PNG/iu)
  expect(TEAM_GUIDANCE_CORE).toMatch(/shell/iu)
  expect(TEAM_GUIDANCE_CORE.length).toBeLessThan(1400) // every worker's prompt pays for it
})
