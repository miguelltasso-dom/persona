/**
 * Muse (Saúde, Lumen), Keel 05:53: the SYSTEM routine "Resumo da manhã" showed as a red X and LOWERED the team's score. It never becomes a Task or a line (the
 * card of the day IS its result), so the Saúde read "no executions" as a failure and "no owner" as a gap. The team's own routines (the morning card, a
 * persona's initiative) are not the person's to own: they are not in the Saúde's list and do not lower its score. A routine of the PERSON with no owner
 * still is a finding.
 */
import { expect } from 'vitest'
import { isSystemRoutine } from '../src/governance.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]
const WS = { workspaceId: 'ws' }

it('a team with no real failure has no X for the morning routine and the initiative routines — the score is not lowered by them', () => {
  const h = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.teamworkEnabled = true
  h.timezoneOffsetMinutes = () => -180
  h.morningBrief.check('pp', 'app-open') // creates "Resumo da manhã" (a system routine) whether or not there is something to say
  const routines = h.routines.list('pp')
  expect(routines.some(row => row.id.startsWith('morning-brief:'))).toBe(true) // the routine IS there
  expect(routines.some(row => row.id.startsWith('initiative:'))).toBe(true) // and so is a persona's initiative routine
  const health = h.getTeamHealth(WS)
  // a finding of the Saúde is `{ id: '<kind>:<subject>', title, … }`
  const about = health.findings.filter(item => item.id.startsWith('routine_without_owner:morning-brief:') || item.id.startsWith('routine_without_owner:initiative:'))
  expect(about, 'a system routine is not a finding').toEqual([])
  expect(health.findings.filter(item => item.id.startsWith('routine_without_owner:')), 'no ownerless-routine finding at all on a team with no routine of its own').toEqual([])
})

it('the score does not change because the team has system routines', () => {
  const quiet = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(quiet, TEAM)
  const baseline = quiet.getTeamHealth(WS).score
  const withMorning = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(withMorning, TEAM)
  withMorning.teamworkEnabled = true
  withMorning.timezoneOffsetMinutes = () => -180
  withMorning.morningBrief.check('pp', 'app-open')
  expect(withMorning.getTeamHealth(WS).score).toBe(baseline)
})

it('a routine of the PERSON that nobody owns is still a finding (the filter is for the team\'s own routines, not a blindfold)', () => {
  const h = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.routines.create({
    id: 'routine-custom-1', workspaceId: 'ws', projectId: 'pp', name: 'Relatório semanal',
    rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', timeZone: 'America/Sao_Paulo', catchUp: 'skip',
  })
  const findings = h.getTeamHealth(WS).findings
  expect(findings.some(item => item.id === 'routine_without_owner:routine-custom-1')).toBe(true)
})

it('the system routines are named by their ids and nothing else', () => {
  expect(isSystemRoutine('morning-brief:pp')).toBe(true)
  expect(isSystemRoutine('initiative:bia')).toBe(true)
  expect(isSystemRoutine('routine-custom-1')).toBe(false)
  expect(isSystemRoutine('my-morning-brief:pp')).toBe(false)
  expect(SCOPE.projectId).toBe('pp')
})
