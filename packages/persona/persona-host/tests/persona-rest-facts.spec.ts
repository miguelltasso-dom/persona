/**
 * Muse's state vocabulary needs two facts PER PERSONA from the host (Keel 11/11): `paused` ("Pausada": this persona was paused on purpose) and `quiet`
 * ("Descansando": inside the team's Janela de silêncio, the whole team paused, or her own silence window). Both ride on `PersonaNowView` (the "agora"
 * strip, `getOverviewNow`) and on `PersonaView` (the roster, `listPersonas`), and are present ONLY when true: absent = awake, never an invented `false`.
 * They read the same truths the host already obeys (the pause row, the team pause, `HouseRules.quietNow`, the autonomy silence), not a copy.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const AT = (hhmm: string): string => `2026-11-05T${hhmm}:00.000Z`

function open(): PersonaHost {
  const h = openJourney(AT('14:00'))
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.timezoneOffsetMinutes = () => 0
  h.orchestration.now = () => AT('14:00')
  return h
}

const now = (h: PersonaHost) => Object.fromEntries(h.getOverviewNow(SCOPE).personas.map(row => [row.personaId, { quiet: row.quiet, paused: row.paused }]))
const roster = (h: PersonaHost) => Object.fromEntries(h.listPersonas(SCOPE).map(row => [row.id, { quiet: row.quiet, paused: row.paused }]))
const AWAKE = { quiet: undefined, paused: undefined }

it('nothing paused, no window: nobody carries the flags (absent = awake, never `false`)', () => {
  const h = open()
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: AWAKE, nina: AWAKE, bento: AWAKE })
  expect(JSON.stringify(h.getOverviewNow(SCOPE))).not.toMatch(/"(quiet|paused)"/u)
  expect(JSON.stringify(h.listPersonas(SCOPE))).not.toMatch(/"(quiet|paused)"/u)
})

it('a persona paused on purpose reads `paused` and only she does', () => {
  const h = open()
  h.orchestration.setPersonaPaused('pp', 'nina', true)
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: AWAKE, nina: { quiet: undefined, paused: true }, bento: AWAKE })
  h.orchestration.setPersonaPaused('pp', 'nina', false)
  expect(now(h).nina).toEqual(AWAKE)
})

it('inside the team\'s Janela de silêncio EVERY persona is `quiet`; outside it nobody is', () => {
  const h = open()
  h.putQuietWindow({ ...SCOPE, id: 'q1', label: 'Tarde', start: '13:00', end: '15:00' })
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: { quiet: true, paused: undefined }, nina: { quiet: true, paused: undefined }, bento: { quiet: true, paused: undefined } })
  h.orchestration.now = () => AT('15:00') // the end is exclusive
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: AWAKE, nina: AWAKE, bento: AWAKE })
})

it('the whole team paused reads `quiet` for everybody (and nobody is `paused` on purpose)', () => {
  const h = open()
  h.pauseTeam(SCOPE)
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: { quiet: true, paused: undefined }, nina: { quiet: true, paused: undefined }, bento: { quiet: true, paused: undefined } })
  h.resumeTeam(SCOPE)
  expect(now(h)).toEqual({ guia: AWAKE, nina: AWAKE, bento: AWAKE })
})

it('a persona\'s OWN silence window makes only her `quiet`', () => {
  const h = open()
  h.setAutonomy({ ...SCOPE, personaId: 'bento', mode: 'propose', proposalBudget: 3, tokenBudget: 1_000, executionBudget: 8, silenceStart: '13:00', silenceEnd: '15:00' })
  for (const view of [now(h), roster(h)]) expect(view).toEqual({ guia: AWAKE, nina: AWAKE, bento: { quiet: true, paused: undefined } })
})

it('paused and quiet are independent facts: a paused persona inside the window carries both (the screen decides which word wins)', () => {
  const h = open()
  h.putQuietWindow({ ...SCOPE, id: 'q1', label: 'Tarde', start: '13:00', end: '15:00' })
  h.orchestration.setPersonaPaused('pp', 'nina', true)
  expect(now(h).nina).toEqual({ quiet: true, paused: true })
  expect(roster(h).nina).toEqual({ quiet: true, paused: true })
})
