/**
 * Carbon P1-11 (skills aprendidas): the skill the Playbook offered ("Virar skill?", id `learned-…`) can be shared with the team and turned back off, like a
 * taught one. Sharing already worked in the host; turning it off was refused ('ORIGIN') because only a taught skill could go back. A private skill also tells the
 * profile WHOSE it is (`personaId`), so another persona's profile does not list it.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { notePlaybookWin, type PlaybookDeps } from '../src/playbook.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['bia', 'Bia'], ['teo', 'Teo']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: 'Redação', description: 'Escreve.', personality: 'Calma.', instructions: 'Escreva.',
      avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
}

const win = (ticketId: string) => ({
  ...SCOPE, personaId: 'bia', personaName: 'Bia', ticketId, title: 'Cartaz da promoção de pão de queijo', request: 'Faça o cartaz da promoção de pão de queijo com o preço novo.',
})

/** Three accepted deliveries over two days, then the owner says "Sim, virar skill": a learned skill, active. */
function learned(h: PersonaHost): string {
  const clock = { at: '2026-11-10T10:00:00.000Z' }
  const deps: PlaybookDeps = { screens: h.screens, now: () => clock.at }
  notePlaybookWin(deps, win('t1'))
  notePlaybookWin(deps, win('t2'))
  clock.at = '2026-11-11T09:00:00.000Z'
  const offered = notePlaybookWin(deps, win('t3'))!.note.offered!
  h.screens.decide({ ...SCOPE, id: offered.approvalId, kind: 'skill', accept: true })
  expect(h.screens.getSkillRecord('pp', offered.skillId)).toMatchObject({ origin: 'learned', enabled: true })
  return offered.skillId
}

describe('a learned skill (Playbook)', () => {
  it('can be shared with the team once the owner confirms', () => {
    const h = host()
    seed(h)
    const skillId = learned(h)
    const shared = h.publishTaughtSkill({ ...SCOPE, skillId, scope: 'team', explicit: true })
    expect(shared).toMatchObject({ id: skillId, sharedWithTeam: true, status: 'active' })
  })

  it('can be turned back off: "Voltar a candidata" keeps the skill, disables it and moves its version on', () => {
    const h = host()
    seed(h)
    const skillId = learned(h)
    const before = h.screens.getSkillRecord('pp', skillId)!
    const off = h.rollbackTaughtSkill({ ...SCOPE, skillId })
    expect(off).toMatchObject({ id: skillId, status: 'candidate', version: before.version + 1 })
    expect(h.screens.getSkillRecord('pp', skillId)).toMatchObject({ origin: 'learned', enabled: false })
  })

  it('a skill that is neither taught nor learned still cannot be "turned back" this way (the guard is not gone)', () => {
    const h = host()
    seed(h)
    h.screens.putSkill({ ...SCOPE, id: 'sk-library', name: 'Biblioteca', body: 'Corpo.', sharedWithTeam: true })
    expect(() => h.rollbackTaughtSkill({ ...SCOPE, skillId: 'sk-library' })).toThrow('INVALID_TEACH')
  })

  it('tells the profile whose it is: the private skill carries its persona, so Teo\'s profile can leave it out', () => {
    const h = host()
    seed(h)
    const skillId = learned(h)
    expect(h.screens.listSkills('pp').find(view => view.id === skillId)?.personaId).toBe('bia')
  })
})
