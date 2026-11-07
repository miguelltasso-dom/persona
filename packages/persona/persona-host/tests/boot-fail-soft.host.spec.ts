/**
 * P0 of the boot (Quill 03:25, Keel 03:28): with the v1.1 behaviors ON (the product default now), a base that holds a subject nobody may read made
 * the host DIE — `compileUsed` (started before the runner resolves and awaited later) rejected with `StoreError: forbidden` out of the subject fold,
 * and a rejection nobody awaits kills the process ("dsh: fatal load failure"). Optional context never stops a turn, and boot is fail-soft per
 * project: an old base with something odd in it says so in one diagnostics line and the host comes up.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const CLOCK = '2026-11-04T12:00:00.000Z'
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Arte' },
]
const channelId = (h: PersonaHost): string => h.product.listChannels('pp').find(row => row.name === 'geral')!.id

/** A message in a SUBJECT written by someone who is not a member and does not take part in the channel: a persona's line, the team's own line, a removed member. */
function strangerInSubject(h: PersonaHost, topicId: string, id = 'x1', actorId = 'team:review'): void {
  h.events.append({
    id, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: channelId(h), type: 'message',
    body: 'Revise o texto da campanha', actorId, subjectId: 'x', occurredAt: CLOCK, topicId,
  })
}

it('the subject fold of a message whose author cannot read the subject adds nothing and NEVER rejects (the rejection nobody awaited killed the host)', async () => {
  const h = openJourney(CLOCK)
  seedJourney(h, TEAM)
  const stream = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }
  const topicId = h.listConversationSubjects(stream).subjects[0]!.id
  strangerInSubject(h, topicId)
  const event = h.events.get('x1')!
  const speaker = h.product.getPersona('bia')!
  // the failure was real: the raw read of that subject, in the name of that author, IS forbidden (so only the wrapper keeps it from the process)
  const raw = Reflect.get(h.orchestration, 'foldSubject') as (event: unknown, used: unknown[]) => void
  expect(() => { raw.call(h.orchestration, event, []) }).toThrow(/forbidden/u)
  // exactly as the orchestrator uses it: started now, awaited later
  const started = h.orchestration.compileUsed(event, speaker)
  const used = await started
  expect(Array.isArray(used)).toBe(true)
  expect(used.some(row => row.kind === 'subject_summary' || row.kind === 'subject_recent')).toBe(false) // nothing was read in the name of someone who may not
  expect(h.orchestration.lastErrors).toContain('subject-fold: forbidden') // one short line for the diagnostics: the kind, never a name or a body
  expect(JSON.stringify(h.exportDiagnostics())).not.toContain('Revise o texto')
})

it('attachSubjectFold on its own is fail-soft too, and a reader who CAN read the subject still gets the fold', () => {
  const h = openJourney(CLOCK)
  seedJourney(h, TEAM)
  const stream = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }
  const topicId = h.listConversationSubjects(stream).subjects[0]!.id
  for (let i = 1; i <= 6; i += 1) {
    h.postMessage({ id: `m-${String(i)}`, ...stream, body: `chat ${String(i)}`, actorId: 'ana', subjectId: 's', occurredAt: CLOCK, topicId })
  }
  strangerInSubject(h, topicId, 'x2', 'ghost')
  const none: Array<{ kind: string }> = []
  expect(() => { h.orchestration.attachSubjectFold(h.events.get('x2')!, none as never) }).not.toThrow()
  expect(none).toEqual([])
  const ok: Array<{ kind: string }> = []
  h.orchestration.attachSubjectFold(h.events.get('m-6')!, ok as never)
  expect(ok.some(row => row.kind === 'subject_summary')).toBe(true) // the person's own reading is unchanged
})

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

it('a DIRTY base opens in the PRODUCTION defaults (teamwork, fanout, productTools on): a subject nobody may read, a retired persona with a pending request, a plan card with parts gone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-dirty-'))
  dirs.push(dir)
  const databasePath = join(dir, 'p.db')
  // 1. an old install: written by an earlier host (no team behaviors), with the odd things real people leave behind
  const first = new Context()
  const old = new PersonaHost(first, { databasePath, teamwork: false, fanout: false, productTools: false, startOnBoardMove: false })
  old.orchestration.now = () => CLOCK
  old.orchestration.scripted = true
  seedJourney(old, TEAM)
  old.teamworkEnabled = true
  const stream = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }
  const topicId = old.listConversationSubjects(stream).subjects[0]!.id
  old.postMessage({ id: 'u1', ...stream, body: 'vamos planejar a campanha', actorId: 'ana', subjectId: 'u1', occurredAt: CLOCK, topicId })
  strangerInSubject(old, topicId)
  old.postMessage({ id: 'u2', ...stream, body: '@Bia escreva o texto e @Teo faça a arte da campanha de lançamento', actorId: 'ana', subjectId: 'u2', occurredAt: CLOCK })
  await old.orchestration.flush('pp')
  old.retirePersona({ ...SCOPE, personaId: 'teo' }) // gone from the roster while her Task and the plan card still exist
  await first.fiber.dispose()

  // 2. the app of today opens that same file with the product defaults, as the installed app does
  const second = new Context()
  const h = new PersonaHost(second, { databasePath, flagDefaults: 'production' })
  try {
    h.orchestration.now = () => CLOCK
    h.orchestration.scripted = true
    expect(h.hostFlags).toMatchObject({ teamwork: true, fanout: true, productTools: true, defaults: 'production' })
    // everything the first screen asks for answers; nothing throws, nothing is a rejection nobody awaits
    expect(() => h.getWhileAway(SCOPE)).not.toThrow()
    expect(() => h.listApprovals(SCOPE)).not.toThrow()
    expect(() => h.listPersonas(SCOPE)).not.toThrow()
    expect(() => h.listMessages({ ...stream, actorId: 'ana', afterSeq: 0, limit: 200 })).not.toThrow()
    // and a new message in the unreadable subject runs a whole turn on top of it
    h.postMessage({ id: 'u3', ...stream, body: 'e agora, como estamos?', actorId: 'ana', subjectId: 'u3', occurredAt: CLOCK, topicId })
    await h.orchestration.flush('pp')
    expect(h.listMessages({ ...stream, actorId: 'ana', afterSeq: 0, limit: 200 }).events.some(row => row.id === 'u3')).toBe(true)
    expect(JSON.parse(h.exportDiagnostics().json)).toMatchObject({ flags: { teamwork: true } })
  } finally {
    await second.fiber.dispose()
  }
})

it('a fresh host in the production defaults comes up on an EMPTY base and answers the first screen', async () => {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: '', flagDefaults: 'production' })
  try {
    expect(h.hostFlags.defaults).toBe('production')
    expect(h.orchestration.lastErrors).toEqual([])
  } finally {
    await ctx.fiber.dispose()
  }
})
