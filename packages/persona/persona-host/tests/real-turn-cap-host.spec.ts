import { createFakeRunner, createScriptedRunner, RealTurnCapError, withRealTurnCap, type resolveRunner } from '@deepseek-ai/dsh-persona-runners'
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { resolveHostRunner, type HostRunnerRequest } from '../src/runner.ts'
import type { CompleteOnboardingRequest } from '../src/types.ts'
import { SCOPE, it, openJourney } from './journeys/journey-host.ts'

/**
 * ENG-1 (P0): on the installed app the first delivery ended in `engine_unavailable` in 4–5 ms without the CLI ever starting. The one
 * guard that refuses a turn BEFORE the CLI starts is the real-turn cap (D-069, fail closed): an unset/relative ledger, a corrupt one
 * or a spent cap refuse EVERY turn. The host must say THAT — the cap's own sentence — not a generic "engine unavailable", and the cap
 * itself keeps refusing (only the words change).
 */

const NOT_CHECKED = 'Precisa de você: não consegui conferir o limite de execuções reais desta rodada, então não iniciei nada.'

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p1', 'Guia'], ['p2', 'Nina']] as const) {
    h.createPersona({
      id, ...SCOPE, name, title: 'Cargo', description: 'x', personality: 'Direta.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
}

/** The REAL host runner path (`resolveHostRunner`) over a scripted CLI, with a refusal installed in front of the turn. Counts real starts. */
function realPath(h: PersonaHost, refuse: (inner: ReturnType<typeof createScriptedRunner>) => ReturnType<typeof createScriptedRunner>): { started: () => number } {
  const scripted = h.orchestration.scripted
  const realCli = process.env.PERSONA_REAL_CLI
  h.orchestration.scripted = false
  process.env.PERSONA_REAL_CLI = '1' // the installed app: no scripted replies
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  onTestFinished(() => {
    h.orchestration.scripted = scripted
    if (realCli === undefined) delete process.env.PERSONA_REAL_CLI
    else process.env.PERSONA_REAL_CLI = realCli
  })
  let started = 0
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => resolveHostRunner(request, {
    createFakeRunner,
    resolveRunner: (async () => {
      const inner = createScriptedRunner({ turns: [] })
      const counted = { ...inner, start: (input: Parameters<typeof inner.start>[0]) => { started += 1; return inner.start(input) }, startTurn: (input: Parameters<typeof inner.startTurn>[0]) => { started += 1; return inner.startTurn(input) } }
      return refuse(counted as typeof inner)
    }) as unknown as typeof resolveRunner,
  })
  return { started: () => started }
}

const lineOf = (h: PersonaHost, bodyPart: string) => h.events.listProject('pp').find(event => event.actorId !== 'ana' && event.body.includes(bodyPart))
const ask = async (h: PersonaHost, id: string, body: string): Promise<void> => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id })
  await h.orchestration.flush('pp')
}

it('a cap that cannot be checked (no ledger) refuses the Task BEFORE the CLI starts, and the person reads the cap\'s own sentence', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  const real = realPath(h, inner => withRealTurnCap(inner, { cap: 3, ledgerPath: undefined }))
  await ask(h, 'm1', '@Nina preciso de um README no projeto')
  expect(real.started()).toBe(0) // fail closed, untouched: the CLI never started
  const said = lineOf(h, 'não consegui conferir o limite')
  expect(said?.body).toBe(NOT_CHECKED)
  expect(h.events.listProject('pp').some(event => event.body.includes('engine_unavailable'))).toBe(false) // never the generic code
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(item => item.origin.triggerId === 'm1')
  expect(ticket).toBeDefined()
  expect(ticket!.attention?.question).toBe(NOT_CHECKED) // the Task waits on the person, with the true reason ("Precisa de você")
  expect(latestAssignment(ticket!)?.state).not.toBe('ended')
})

it('a spent cap says how far it got ("N de N… Nada foi iniciado.") and still refuses', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  const real = realPath(h, (inner) => {
    const spent = (): never => { throw new RealTurnCapError('cap_reached', { used: 1, cap: 1 }) }
    return { ...inner, start: () => Promise.resolve(spent()), startTurn: () => Promise.resolve(spent()) }
  })
  await ask(h, 'm2', '@Nina preciso de um README no projeto')
  expect(real.started()).toBe(0)
  expect(lineOf(h, 'limite de execuções reais')?.body).toBe('Precisa de você: o limite de execuções reais desta rodada foi atingido (1 de 1). Nada foi iniciado.')
})

it('a plain conversation refused by the cap is told too (never silence), with the same sentence', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  const real = realPath(h, inner => withRealTurnCap(inner, { cap: 3, ledgerPath: undefined }))
  await ask(h, 'm3', 'Como você está hoje?')
  expect(real.started()).toBe(0)
  expect(lineOf(h, 'não consegui conferir o limite')?.body).toContain(NOT_CHECKED)
})

it('any OTHER failure is unchanged: it is still the generic engine_unavailable line', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seed(h)
  realPath(h, (inner) => {
    const broken = (): never => { throw new TypeError('algo inesperado') }
    return { ...inner, start: () => Promise.resolve(broken()), startTurn: () => Promise.resolve(broken()) }
  })
  await ask(h, 'm4', '@Nina preciso de um README no projeto')
  expect(h.events.listProject('pp').some(event => event.body.includes('engine_unavailable'))).toBe(true)
  expect(lineOf(h, 'não consegui conferir o limite')).toBeUndefined()
})

const ONBOARDING: CompleteOnboardingRequest = {
  workspaceId: 'ws', personalProjectId: 'pp', displayName: 'Ana',
  team: [{
    name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.', instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true, systemRoles: ['coordination'],
  }, {
    name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, systemRoles: [],
  }],
  templateIds: [], runnerChoices: ['dsh'], cofreSeed: 'Agência Ponto — estúdio de sites.',
}

it('the FIRST DELIVERY of the installed app (Claude connected) refused by the cap says the sentence of the cap, never "engine_unavailable"', async () => {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  const real = realPath(h, inner => withRealTurnCap(inner, { cap: 3, ledgerPath: undefined }))
  vi.spyOn(h.connections, 'detect').mockResolvedValue([{ id: 'claude', kind: 'cli', installed: true, loggedIn: true, models: ['haiku'] }])
  vi.spyOn(h.orchestration, 'prewarmProject').mockResolvedValue(undefined)
  onTestFinished(() => { vi.restoreAllMocks() })
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  expect(real.started()).toBe(0) // the CLI never started for the Task
  const said = h.events.listProject('pp').filter(event => event.actorId !== 'ana' && event.body.includes('não consegui conferir o limite'))
  expect(said.length).toBeGreaterThan(0)
  expect(said[0]?.body).toContain(NOT_CHECKED)
  expect(h.events.listProject('pp').some(event => event.body.includes('engine_unavailable'))).toBe(false)
})
