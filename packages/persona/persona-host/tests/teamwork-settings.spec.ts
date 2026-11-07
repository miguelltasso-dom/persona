/**
 * D-090 / TEAM-3 and the Configurações › Personas contracts: what the PERSON decides per persona — help to colleagues (on, 6 a day),
 * opinion rounds (2), who may hire, and the engine choice the tab reads. Nothing is decided for them; every number is theirs to change.
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ASK_CAP_PER_DAY, OPINION_ROUNDS } from '../src/teamwork-settings.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  for (const [id, name] of [['p1', 'Bento'], ['p2', 'Nina']] as const) {
    h.createPersona({
      id, ...scope, name, title: 'Time', description: 'Faz.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: id, runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
    })
  }
  h.sessionMemberId = 'ana'
}

const roster = (h: PersonaHost, id: string) => h.listPersonas(scope).find(row => row.id === id)!

it('defaults: help to colleagues ON, 6 asks a day, 2 rounds — and the view carries them only with the flag', () => {
  const h = host()
  seed(h)
  const flag = h.teamworkEnabled
  try {
    h.teamworkEnabled = false
    expect(roster(h, 'p1')).not.toHaveProperty('teamwork') // with Config.teamwork off nothing of the real-team behavior shows
    h.teamworkEnabled = true
    expect(roster(h, 'p1').teamwork).toEqual({
      canAskColleagues: true, askCapPerDay: ASK_CAP_PER_DAY.standard, askedToday: 0, maxOpinionRounds: OPINION_ROUNDS.standard,
    })
    expect(ASK_CAP_PER_DAY.standard).toBe(6)
    expect(OPINION_ROUNDS.standard).toBe(2)
  } finally {
    h.teamworkEnabled = flag
  }
})

it('the person changes only what they name; each persona has its own; askedToday comes from the engine\'s registry', () => {
  const h = host()
  seed(h)
  const flag = h.teamworkEnabled
  h.teamworkEnabled = true
  h.teamwork.askedToday = (_projectId, personaId) => personaId === 'p1' ? 3 : 0
  try {
    const first = h.setPersonaTeamwork({ ...scope, personaId: 'p1', askCapPerDay: 12 })
    expect(first.teamwork).toEqual({ canAskColleagues: true, askCapPerDay: 12, askedToday: 3, maxOpinionRounds: 2 })
    const second = h.setPersonaTeamwork({ ...scope, personaId: 'p1', canAskColleagues: false, maxOpinionRounds: 3 })
    expect(second.teamwork).toEqual({ canAskColleagues: false, askCapPerDay: 12, askedToday: 3, maxOpinionRounds: 3 }) // the cap stays
    expect(roster(h, 'p2').teamwork).toEqual({ canAskColleagues: true, askCapPerDay: 6, askedToday: 0, maxOpinionRounds: 2 }) // others untouched
    expect(h.listTeam(scope).personas.find(row => row.id === 'p1')?.teamwork?.canAskColleagues).toBe(false) // the roster read agrees
  } finally {
    h.teamwork.askedToday = () => 0
    h.teamworkEnabled = flag
  }
})

it('a number outside its range is refused whole: nothing is half-written', () => {
  const h = host()
  seed(h)
  const flag = h.teamworkEnabled
  h.teamworkEnabled = true
  try {
    for (const bad of [0, 21, 2.5, Number.NaN]) {
      expect(() => h.setPersonaTeamwork({ ...scope, personaId: 'p1', canAskColleagues: false, askCapPerDay: bad })).toThrow(/pedidos por dia/iu)
    }
    for (const bad of [0, 4]) {
      expect(() => h.setPersonaTeamwork({ ...scope, personaId: 'p1', maxOpinionRounds: bad })).toThrow(/rodadas/iu)
    }
    expect(() => h.setPersonaTeamwork({ ...scope, personaId: 'p1', canAskColleagues: 'sim' as unknown as boolean })).toThrow(/ajuda a colegas/iu)
    expect(roster(h, 'p1').teamwork).toEqual({ canAskColleagues: true, askCapPerDay: 6, askedToday: 0, maxOpinionRounds: 2 }) // not even `canAskColleagues:false` went through
    expect(h.setPersonaTeamwork({ ...scope, personaId: 'p1', askCapPerDay: 1 }).teamwork?.askCapPerDay).toBe(1)
    expect(h.setPersonaTeamwork({ ...scope, personaId: 'p1', askCapPerDay: 20 }).teamwork?.askCapPerDay).toBe(20)
  } finally {
    h.teamworkEnabled = flag
  }
})

it('only the responsável or the workspace owner changes it; a plain member is refused', () => {
  const h = host()
  seed(h)
  h.sessionMemberId = 'bia'
  expect(() => h.setPersonaTeamwork({ ...scope, personaId: 'p1', askCapPerDay: 3 })).toThrow('forbidden')
  expect(() => h.setPersonaCanRecruit({ ...scope, personaId: 'p1', canRecruit: true })).toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(roster(h, 'p1').canRecruit).toBe(false) // nothing changed
})

it('"Pode contratar": the person turns it on or off per persona', () => {
  const h = host()
  seed(h)
  expect(roster(h, 'p1').canRecruit).toBe(false)
  expect(h.setPersonaCanRecruit({ ...scope, personaId: 'p1', canRecruit: true }).canRecruit).toBe(true)
  expect(roster(h, 'p1').canRecruit).toBe(true)
  expect(roster(h, 'p2').canRecruit).toBe(false)
  expect(h.setPersonaCanRecruit({ ...scope, personaId: 'p1', canRecruit: false }).canRecruit).toBe(false)
  expect(() => h.setPersonaCanRecruit({ ...scope, personaId: 'ghost', canRecruit: true })).toThrow(/persona-not-found|não existe/iu)
})

it('the roster carries the engine choice the tab opens on: the model and the capricho, null = Padrão do motor', () => {
  const h = host()
  seed(h)
  expect(roster(h, 'p1').engine).toEqual({ runnerKind: 'cli', runnerCli: 'claude', runnerModel: null, runnerEffort: null })
  h.setPersonaEngine({ ...scope, personaId: 'p1', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'opus', runnerEffort: 'xhigh' })
  expect(roster(h, 'p1').engine).toEqual({ runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'opus', runnerEffort: 'xhigh' })
  expect(roster(h, 'p2').engine?.runnerEffort).toBeNull()
})
