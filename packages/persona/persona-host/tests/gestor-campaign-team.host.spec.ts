import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-12 (b), EQ-8/EQ-9 in the host: "Monte um time para a campanha de lançamento do produto" (no functions listed) reuses the team that
 * already has Redação, Design and Mídia, hires only what is missing, and — once the person approves — opens the Tasks of the campaign.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]
const GOAL = 'Monte um time para a campanha de lançamento do produto'

function rig(team = TEAM): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, team)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}
const tickets = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list()
/** The campaign goes on in the background after the plan is approved (each part opens the next): let it rest before the host closes. */
async function settle(h: PersonaHost): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await h.orchestration.flush('pp')
    await new Promise<void>((resolve) => { setTimeout(resolve, 60) })
  }
}

it('EQ-8: the plan REUSES Redação, Design and Mídia and hires nobody — not Atendimento, Financeiro or Pessoas — and says so', () => {
  const h = rig()
  const view = h.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-1', goal: GOAL })
  expect(view.preview.reuse?.map(row => row.function)).toEqual(['Redação', 'Design', 'Mídia'])
  expect(view.preview.hire).toEqual([])
  expect(view.preview.personaTitles).toEqual(['Redação', 'Design', 'Mídia'])
  expect(view.plan.summary).toBe('Vou aproveitar Bia, Teo, Caio e montar o fluxo marketing.')
  expect(h.listPersonas(SCOPE)).toHaveLength(4) // nothing is hired before the person approves, and nothing needs to be
})

it('EQ-9: once the person approves, the plan opens the Tasks of the campaign (the first part now, the chain goes on as each is delivered)', async () => {
  const h = rig()
  h.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-2', goal: GOAL })
  expect(tickets(h)).toHaveLength(0)
  h.approveGestorPlan({ workspaceId: 'ws', planId: 'plan-2' })
  await settle(h)
  const work = tickets(h).filter(item => !item.title.startsWith('Revisar:'))
  expect(work.length).toBeGreaterThan(0)
  expect(work.map(item => item.execution?.name)).toContain('Bia') // text comes first
  expect(h.listPersonas(SCOPE)).toHaveLength(4) // and nobody was hired to do it
})

it('only the missing function is hired: with no Mídia on the team, the plan reuses two and hires Mídia — and it lands on the team', async () => {
  const h = rig(TEAM.filter(row => row.id !== 'caio'))
  const view = h.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-3', goal: GOAL })
  expect(view.preview.reuse?.map(row => row.function)).toEqual(['Redação', 'Design'])
  expect(view.preview.hire?.map(row => row.function)).toEqual(['Mídia'])
  expect(view.plan.summary).toBe('Vou aproveitar Bia, Teo e contratar 1 (Mídia) e montar o fluxo marketing.')
  h.approveGestorPlan({ workspaceId: 'ws', planId: 'plan-3' })
  await settle(h)
  expect(h.listPersonas(SCOPE).some(persona => persona.title === 'Mídia')).toBe(true)
  expect(h.listPersonas(SCOPE).some(persona => persona.title === 'Financeiro')).toBe(false)
})

it('a goal that is NOT a campaign keeps the Gestor exactly as it was (generic structure, nothing reused by function)', () => {
  const h = rig()
  const view = h.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-4', goal: 'Monte uma equipe para a minha padaria' })
  expect((view.preview.reuse ?? []).map(row => row.function)).not.toEqual(expect.arrayContaining(['Redação', 'Design', 'Mídia'])) // nothing reused by the campaign rule
  expect((view.preview.hire ?? []).length).toBeGreaterThan(0)
  expect((view.preview.hire ?? []).map(row => row.function)).not.toContain('Redação')
})
