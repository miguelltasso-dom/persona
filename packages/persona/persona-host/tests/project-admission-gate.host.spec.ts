import { describe, expect, it } from 'vitest'
import { PROJECT_CEILING_ID, PROJECT_CEILING_KIND, PROJECT_TURNS_KIND } from '../src/project-admission-host.ts'
import { WindowResumeQueue } from '../src/window-reserve.ts'
import { openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Marco DOGFOOD M2 (host): the ceiling of a PROJECT is a gate in the ingest (a request of the person at the ceiling is kept with ONE honest line and resumes by itself the next day), the counter
 * is durable and counts one turn per request, and the scheduler's look tells the resume of a new day. The time zone of the host is UTC-3 (the day turns at 03:00Z).
 */
const NOON = '2026-11-12T15:00:00.000Z'
const NEXT_DAY = '2026-11-13T03:00:00.000Z'

function bed(): { readonly h: ReturnType<typeof openJourney>; readonly clock: { iso: string } } {
  const clock = { iso: NOON }
  const h = openJourney(NOON)
  h.orchestration.now = () => clock.iso
  h.timezoneOffsetMinutes = () => -180
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  seedJourney(h, [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }])
  return { h, clock }
}

const ceiling = (h: ReturnType<typeof openJourney>, turnsPerDay: number): void => {
  h.screens.screens.put('pp', PROJECT_CEILING_KIND, PROJECT_CEILING_ID, { turnsPerDay, tokensPerDay: 0, pausePct: 95 })
}

describe('M2 host: the project ceiling in the ingest', () => {
  it('a request of the person counts ONE turn of the day, and the counter is a durable document', async () => {
    const { h } = bed()
    say(h, 'm1', '@Lia monte o cardápio da semana')
    await h.orchestration.work
    expect(h.projectAdmission.loadOf('pp').turns.used).toBe(1)
    expect(h.screens.screens.get<{ used: number }>('pp', PROJECT_TURNS_KIND, '2026-11-12')?.used).toBe(1)
  })

  it('at 100% the request of the person is KEPT (not answered, not lost) with one honest line; it is not counted', async () => {
    const { h } = bed()
    ceiling(h, 2)
    h.projectAdmission.admit('pp', 'person')
    h.projectAdmission.admit('pp', 'person')
    expect(h.projectAdmission.loadOf('pp').state).toBe('full')
    say(h, 'm1', '@Lia monte o cardápio da semana')
    say(h, 'm2', '@Lia e o das sobremesas')
    await h.orchestration.work
    expect(h.events.has('coord-m1-project'), 'one line for the conversation').toBe(true)
    expect(h.events.has('coord-m2-project'), 'not one line per message').toBe(false)
    expect(new WindowResumeQueue(h.screens.screens).list('pp').map(row => row.eventIds)).toEqual([['m1', 'm2']])
    expect(h.projectAdmission.loadOf('pp').turns.used).toBe(2)
    expect(h.events.has('project-pause:pp:2026-11-12:turns:full'), 'the project said it stopped, once').toBe(true)
  })

  it('the held request resumes BY ITSELF when the local day turns over (the scheduler\'s release), counted in the new day', async () => {
    const { h, clock } = bed()
    ceiling(h, 2)
    h.projectAdmission.admit('pp', 'person')
    h.projectAdmission.admit('pp', 'person')
    say(h, 'm1', '@Lia monte o cardápio da semana')
    await h.orchestration.work
    expect(h.orchestration.releaseWindowQueue('pp'), 'still the same day').toBe(0)
    expect(new WindowResumeQueue(h.screens.screens).count('pp')).toBe(1)
    clock.iso = NEXT_DAY
    expect(h.orchestration.releaseWindowQueue('pp'), 'a new day').toBe(1)
    await h.orchestration.work
    expect(new WindowResumeQueue(h.screens.screens).count('pp')).toBe(0)
    expect(h.projectAdmission.loadOf('pp')).toMatchObject({ windowKey: '2026-11-13', turns: { used: 1 } })
    expect(h.events.has('project-resume:pp:2026-11-13:turns'), 'the project told it is back').toBe(true)
  })

  it('raising the ceiling releases what waited (the owner can always give more room)', async () => {
    const { h } = bed()
    ceiling(h, 1)
    h.projectAdmission.admit('pp', 'person')
    say(h, 'm1', '@Lia monte o cardápio da semana')
    await h.orchestration.work
    expect(h.orchestration.releaseWindowQueue('pp')).toBe(0)
    ceiling(h, 50)
    expect(h.orchestration.releaseWindowQueue('pp')).toBe(1)
    await h.orchestration.work
    expect(h.projectAdmission.loadOf('pp').turns.used).toBe(2)
  })

  it('the pause line of the project is idempotent: the same marks never post twice', async () => {
    const { h } = bed()
    ceiling(h, 20)
    for (let index = 0; index < 19; index += 1) h.projectAdmission.admit('pp', 'person')
    for (let index = 0; index < 5; index += 1) h.projectAdmission.admit('pp', 'quadro')
    expect(h.events.has('project-pause:pp:2026-11-12:turns')).toBe(true)
    expect(h.events.has('project-pause:pp:2026-11-12:turns:full'), 'not full yet: only the pause was told').toBe(false)
    expect(h.projectAdmission.events('pp').map(event => event.kind)).toEqual(['pause'])
  })
})
