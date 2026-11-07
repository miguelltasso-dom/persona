import { expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { QuotaWaitBook } from '../src/quota-wait.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * CV-8 (contracts/mentions-fanout.md): "Toda a equipe", "Quem tiver algo a dizer" and several @menções become a block of TYPED lines,
 * one per persona (D-079: nobody left without a line). Behind the host's `fanout` flag (OFF by default until the Muse accepts it).
 */
const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
let serial = 0

function seed(h: PersonaHost): void {
  serial = 0
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p-coord', 'Coord'], ['p-nina', 'Nina'], ['p-bento', 'Bento'], ['p-mia', 'Mia']] as const) {
    h.createPersona({
      id, ...scope, name, title: `Cargo de ${name}`, description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
  h.orchestration.fanoutEnabled = true // the feature under test (OFF by default)
  onTestFinished(() => { h.orchestration.fanoutEnabled = false })
}

/** Control what each persona answers (and see who was asked) without a model. Restored after the test. */
function answers(h: PersonaHost, by: Record<string, string | Error> = {}): { asked: Array<{ persona: string; prompt: string }> } {
  const asked: Array<{ persona: string; prompt: string }> = []
  const original = h.orchestration.answerOnce.bind(h.orchestration)
  h.orchestration.answerOnce = (_project, persona, _session, prompt) => {
    asked.push({ persona: persona.name, prompt })
    const out = by[persona.name] ?? `Resposta de ${persona.name}`
    return out instanceof Error ? Promise.reject(out) : Promise.resolve(out)
  }
  onTestFinished(() => { h.orchestration.answerOnce = original })
  return { asked }
}

const send = (h: PersonaHost, body: string, extra: { fanout?: 'everyone' | 'relevant' } = {}): string => {
  serial += 1
  const id = `u${String(serial)}`
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: '', ...extra })
  return id
}
const events = (h: PersonaHost) =>
  h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const block = (h: PersonaHost, id: string) =>
  events(h).filter(item => item.id.startsWith(`coord-${id}-fan-`)).sort((a, b) => (a.fanout?.index ?? 0) - (b.fanout?.index ?? 0))

it('"Toda a equipe" through the real (scripted) path: one typed line per persona, and the single-persona reply is NOT taken', async () => {
  const h = host()
  seed(h)
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  const lines = block(h, id)
  expect(lines.map(line => line.actorId).sort()).toEqual(['p-bento', 'p-coord', 'p-mia', 'p-nina'])
  expect(lines.every(line => line.fanout?.kind === 'reply' && line.fanout.source === 'everyone' && line.fanout.total === 4 && line.fanout.id === `fan-${id}`)).toBe(true)
  expect(lines.map(line => line.fanout?.index)).toEqual([1, 2, 3, 4])
  expect(lines.find(line => line.actorId === 'p-nina')?.body).toBe('Resposta de Nina.')
  expect(events(h).some(item => item.id === `coord-${id}-reply`)).toBe(false) // the block replaced the one-persona reply
})

it('a paused persona and one at the limit get their line WITHOUT a call; the others answer', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  h.orchestration.setPersonaPaused('pp', 'p-bento', true)
  onTestFinished(() => { h.orchestration.setPersonaPaused('pp', 'p-bento', false) })
  const until = new Date(Date.parse(h.orchestration.now()) + 3_600_000).toISOString()
  new QuotaWaitBook(h.orchestration.screens!).record('pp', { ticketId: 'tq', assignmentId: 'aq', provider: 'Claude', personaId: 'p-mia', resetAt: until, since: h.orchestration.now() })
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  const byPersona = Object.fromEntries(block(h, id).map(line => [line.actorId, line]))
  expect(byPersona['p-bento']?.fanout).toMatchObject({ kind: 'paused', total: 4 })
  expect(byPersona['p-mia']?.fanout).toMatchObject({ kind: 'limit', until })
  expect(byPersona['p-nina']?.fanout?.kind).toBe('reply')
  expect(byPersona['p-coord']?.fanout?.kind).toBe('reply')
  expect(asked.map(item => item.persona).sort()).toEqual(['Coord', 'Nina']) // Bento (paused) and Mia (limit) were never asked
})

it('"nada a acrescentar" and a failed turn are told, never silence; the failure sentence is fixed (no raw error)', async () => {
  const h = host()
  seed(h)
  answers(h, { Nina: '[[nada]]', Bento: new Error('o motor caiu em C:\\segredo'), Mia: '   ' })
  const id = send(h, 'Alguma ideia?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  const byPersona = Object.fromEntries(block(h, id).map(line => [line.actorId, line]))
  expect(byPersona['p-nina']?.fanout?.kind).toBe('nothing')
  expect(byPersona['p-nina']?.body).toBe('Nina: nada a acrescentar.')
  expect(byPersona['p-bento']?.fanout).toMatchObject({ kind: 'failed', message: 'Houve um problema ao responder. Tente de novo em instantes.' })
  expect(JSON.stringify(byPersona['p-bento'])).not.toContain('segredo')
  expect(byPersona['p-mia']?.fanout).toMatchObject({ kind: 'failed', message: 'A resposta veio vazia. Tente de novo.' })
  expect(block(h, id)).toHaveLength(4)
})

it('two @menções in a conversation: a block of the two, in the order of the text, instead of only the first answering', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Nina @Bento, vejam isso quando puderem')
  await h.orchestration.flush('pp')
  const lines = block(h, id)
  expect(lines.map(line => line.actorId)).toEqual(['p-nina', 'p-bento'])
  expect(lines.every(line => line.fanout?.source === 'mentions' && line.fanout.total === 2)).toBe(true)
  expect(asked.map(item => item.persona).sort()).toEqual(['Bento', 'Nina'])
  expect(asked[0]?.prompt).toContain('citada(o)')
})

it('with the flag OFF (the default) nothing changes: two @menções are answered by the first only, no block', async () => {
  const h = host()
  seed(h)
  h.orchestration.fanoutEnabled = false
  const { asked } = answers(h)
  const id = send(h, '@Nina @Bento, vejam isso quando puderem')
  await h.orchestration.flush('pp')
  expect(block(h, id)).toEqual([])
  expect(asked).toEqual([]) // the block's turns were not used
  expect(events(h).some(item => item.id === `coord-${id}-reply` && item.actorId === 'p-nina')).toBe(true) // the old route: the first named answers
})

it('"Quem tiver algo a dizer": the Coordenação makes ONE pick and only the picked answer', async () => {
  const h = host()
  seed(h)
  const picks = answers(h, { Coord: 'Nina, Mia, Fantasma' })
  const id = send(h, 'Quem cuida do site?', { fanout: 'relevant' })
  await h.orchestration.flush('pp')
  expect(block(h, id).map(line => line.actorId).sort()).toEqual(['p-mia', 'p-nina'])
  expect(block(h, id).every(line => line.fanout?.total === 2 && line.fanout.source === 'relevant')).toBe(true)
  expect(picks.asked.map(item => item.persona).sort()).toEqual(['Coord', 'Mia', 'Nina']) // the pick + the two
})

it('"Quem tiver algo a dizer" with nobody picked: ONE line of the Coordenação says so, and nobody else is asked', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h, { Coord: 'NINGUÉM' })
  const id2 = send(h, 'Alguém tem algo?', { fanout: 'relevant' })
  await h.orchestration.flush('pp')
  const only = block(h, id2)
  expect(asked.map(item => item.persona)).toEqual(['Coord'])
  expect(only).toHaveLength(1)
  expect(only[0]?.fanout).toMatchObject({ kind: 'nothing', nobody: true, total: 1 })
  expect(only[0]?.body).toBe('Ninguém tem algo a acrescentar agora.')
})

it('a work request naming two: the first leads ONE Task and the other gets its own short turn in the block ("o que você traz?")', async () => {
  const h = host()
  seed(h)
  const { asked } = answers(h)
  const id = send(h, '@Nina @Bento façam o relatório do mês')
  await h.orchestration.flush('pp')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
  const lines = block(h, id)
  expect(lines.map(line => line.actorId)).toEqual(['p-bento'])
  expect(lines[0]?.fanout).toMatchObject({ kind: 'reply', source: 'mentions', total: 1 })
  expect(asked.some(item => item.persona === 'Bento' && item.prompt.includes('trabalhar COM Nina'))).toBe(true)
  expect(events(h).some(item => item.id === `coord-${id}-with`)).toBe(true)
})

it('estimateAsk: the chip numbers of the block — exact calls, none for the paused or the limited, "relevant" is 1 + 0..5, off = absent', async () => {
  const h = host()
  seed(h)
  h.orchestration.setPersonaPaused('pp', 'p-bento', true)
  onTestFinished(() => { h.orchestration.setPersonaPaused('pp', 'p-bento', false) })
  const ask = (texto: string, audience?: 'everyone' | 'relevant') =>
    h.estimateAsk({ ...scope, texto, streamKind: 'channel', ownerId: 'geral', ...(audience === undefined ? {} : { audience }) }).fanout
  expect(ask('Como estamos?', 'everyone')).toEqual({ source: 'everyone', replies: 4, asked: 3, limited: 0, paused: 1, chamadas: { min: 3, max: 3 } })
  expect(ask('Como estamos?', 'relevant')).toEqual({ source: 'relevant', replies: 4, asked: 3, limited: 0, paused: 1, chamadas: { min: 1, max: 4 } })
  expect(ask('Como vão @Nina e @Mia?')).toMatchObject({ source: 'mentions', replies: 2, asked: 2, chamadas: { min: 2, max: 2 } })
  expect(ask('@Nina @Mia façam o relatório do mês')).toMatchObject({ source: 'mentions', replies: 1, asked: 1, chamadas: { min: 1, max: 1 } }) // only the collaborator costs a fan-out call
  expect(ask('Como vai a @Nina?')).toBeUndefined() // one persona: a plain ask
  h.orchestration.fanoutEnabled = false
  expect(ask('Como estamos?', 'everyone')).toBeUndefined() // flag off: absent
})

// ---- "Tentar de novo": repeat ONE persona of a block whose line says she could not answer ----

/** Like `answers`, but what each persona says can change between calls (a retry after a failure). */
function changing(h: PersonaHost, by: Record<string, string | Error | Promise<string>>): { asked: string[] } {
  const asked: string[] = []
  const original = h.orchestration.answerOnce.bind(h.orchestration)
  h.orchestration.answerOnce = (_project, persona) => {
    asked.push(persona.name)
    const out = by[persona.name] ?? `Resposta de ${persona.name}`
    return out instanceof Error ? Promise.reject(out) : Promise.resolve(out)
  }
  onTestFinished(() => { h.orchestration.answerOnce = original })
  return { asked }
}

it('retry: a failed line is asked again and replaced IN PLACE (same line, same place in the block); the others are not asked', async () => {
  const h = host()
  seed(h)
  const by: Record<string, string | Error> = { Nina: new Error('boom') }
  const { asked } = changing(h, by)
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  const before = block(h, id).find(line => line.actorId === 'p-nina')
  expect(before?.fanout?.kind).toBe('failed')
  by.Nina = 'Agora sim: tudo bem por aqui.'
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' })).toEqual({ started: true })
  await h.orchestration.flush('pp')
  const after = block(h, id).find(line => line.actorId === 'p-nina')
  expect(after?.id).toBe(before?.id)
  expect(after?.body).toBe('Agora sim: tudo bem por aqui.')
  expect(after?.fanout).toMatchObject({ kind: 'reply', index: before?.fanout?.index, total: before?.fanout?.total, id: before?.fanout?.id })
  expect(after?.fanout?.message).toBeUndefined() // the failure sentence is gone
  expect(asked.filter(name => name === 'Nina')).toHaveLength(2) // once at first, once on the retry
  expect(asked.filter(name => name !== 'Nina')).toHaveLength(3) // the others only once
  expect(block(h, id)).toHaveLength(4) // still one line per persona
})

it('retry that fails again keeps the line failed with the fixed sentence (no raw error), and can be tried once more', async () => {
  const h = host()
  seed(h)
  const by: Record<string, string | Error> = { Nina: new Error('segredo api_key=abc') }
  changing(h, by)
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' }).started).toBe(true)
  await h.orchestration.flush('pp')
  const line = block(h, id).find(item => item.actorId === 'p-nina')
  expect(line?.fanout?.kind).toBe('failed')
  expect(line?.fanout?.message).toBe('Houve um problema ao responder. Tente de novo em instantes.')
  expect(JSON.stringify(line)).not.toContain('api_key')
  by.Nina = 'Voltei.'
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' }).started).toBe(true)
  await h.orchestration.flush('pp')
  expect(block(h, id).find(item => item.actorId === 'p-nina')?.body).toBe('Voltei.')
})

it('retry says why it did not start: not failed, not found, paused, at the limit, flag off — and calls nobody', async () => {
  const h = host()
  seed(h)
  const { asked } = changing(h, { Mia: new Error('boom') })
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  const calls = asked.length
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' })).toEqual({ started: false, reason: 'not-failed' }) // she answered
  expect(h.retryFanoutReply({ ...scope, messageId: 'ghost', personaId: 'p-mia' })).toEqual({ started: false, reason: 'not-found' })
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'ghost' })).toEqual({ started: false, reason: 'not-found' })
  h.orchestration.setPersonaPaused('pp', 'p-mia', true)
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-mia' })).toEqual({ started: false, reason: 'paused' })
  h.orchestration.setPersonaPaused('pp', 'p-mia', false)
  h.orchestration.fanoutEnabled = false
  expect(h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-mia' })).toEqual({ started: false, reason: 'disabled' })
  expect(asked).toHaveLength(calls)
})

it('retry: one attempt at a time per line (a second press while it runs is told "running", not a second call)', async () => {
  const h = host()
  seed(h)
  const by: Record<string, string | Error | Promise<string>> = { Nina: new Error('boom') }
  const { asked } = changing(h, by)
  const id = send(h, 'Como estamos?', { fanout: 'everyone' })
  await h.orchestration.flush('pp')
  let release: (text: string) => void = () => undefined
  by.Nina = new Promise<string>((resolve) => { release = resolve })
  const first = h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' })
  const second = h.retryFanoutReply({ ...scope, messageId: id, personaId: 'p-nina' })
  expect(first).toEqual({ started: true })
  expect(second).toEqual({ started: false, reason: 'running' })
  release('Pronto.')
  await h.orchestration.flush('pp')
  expect(asked.filter(name => name === 'Nina')).toHaveLength(2)
  expect(block(h, id).find(item => item.actorId === 'p-nina')?.body).toBe('Pronto.')
})
