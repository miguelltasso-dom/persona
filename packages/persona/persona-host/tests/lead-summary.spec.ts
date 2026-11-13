import { expect, it } from 'vitest'
import { daySummaryId } from '../src/day-summary.ts'
import { SUMMARY_DUE_MINUTE, leadSummary, type SummaryFacts, type SummaryPorts } from '../src/lead-summary.ts'

/**
 * Marco Dogfood M2, the day summary of the responsible, PURE (fake ports): WHEN it is due (the end of the local day, or any past day), WHO writes it (the responsible, never a paused one), WHAT happens on an empty day
 * (nothing is posted: the right to silence) and that it goes ONCE (stable id). The words come from Anvil's composer; the facts come from the host as the LEAST privileged member reads the board.
 */
const empty: SummaryFacts = { done: [], doing: [], waiting: [], stuck: [], teamMemory: [], tomorrow: [] }
const lead = { id: 'guia', name: 'Guia' }

function rig(over: { today?: string; minute?: number; paused?: boolean; facts?: Partial<SummaryFacts>; already?: boolean; noLead?: boolean } = {}) {
  const posts: Array<{ projectId: string; speakerId: string; id: string; text: string }> = []
  const asked: string[] = []
  const ports: SummaryPorts = {
    today: () => over.today ?? '2026-11-12',
    minuteOfDay: () => over.minute ?? 23 * 60 + 45,
    responsible: () => (over.noLead === true ? undefined : lead),
    responsiblePaused: () => over.paused === true,
    facts: (_projectId, dayLocal) => { asked.push(dayLocal); return { ...empty, ...over.facts } },
    posted: () => over.already === true,
    post: (projectId, speakerId, id, text) => { posts.push({ projectId, speakerId, id, text }) },
  }
  return { ports, posts, asked }
}

const oneDone: Partial<SummaryFacts> = { done: [{ title: 'Cardápio da semana', by: 'Bia' }] }

it('TODAY is due only from the end of the day (23:30 local); a PAST day is due at any hour; a day that has not begun never is', () => {
  const early = rig({ minute: SUMMARY_DUE_MINUTE - 1, facts: oneDone })
  expect(leadSummary(early.ports, 'pp', '2026-11-12')).toBe('not-due')
  expect(early.asked, 'a summary that is not due does not even read the board').toEqual([])
  const late = rig({ minute: SUMMARY_DUE_MINUTE, facts: oneDone })
  expect(leadSummary(late.ports, 'pp', '2026-11-12')).toBe('posted')
  const past = rig({ minute: 8 * 60, facts: oneDone })
  expect(leadSummary(past.ports, 'pp', '2026-11-11')).toBe('posted') // yesterday's, at 08:00 after the silence window
  expect(leadSummary(rig({ facts: oneDone }).ports, 'pp', '2026-11-13')).toBe('not-due')
})

it('it goes as the RESPONSIBLE with the stable id of the day, in the composer\'s words, ONCE (a second call after a restart posts nothing)', () => {
  const first = rig({ facts: oneDone })
  expect(leadSummary(first.ports, 'pp', '2026-11-12')).toBe('posted')
  expect(first.posts).toHaveLength(1)
  expect(first.posts[0]).toMatchObject({ projectId: 'pp', speakerId: 'guia', id: daySummaryId('pp', '2026-11-12') })
  expect(first.posts[0]?.text).toContain('Hoje o quadro andou: 1 cartão ficou pronto.')
  const again = rig({ facts: oneDone, already: true })
  expect(leadSummary(again.ports, 'pp', '2026-11-12')).toBe('posted')
  expect(again.posts, 'the message already exists: nothing is written twice').toEqual([])
})

it('a day with nothing (no card done, going, waiting or chased) posts NOTHING and is recorded as a quiet day', () => {
  const quiet = rig()
  expect(leadSummary(quiet.ports, 'pp', '2026-11-12')).toBe('quiet-day')
  expect(quiet.posts).toEqual([])
})

it('a paused responsible, or none, does not post: it waits (a day that stays paused is dropped by the loop, never summarized two days late)', () => {
  const paused = rig({ paused: true, facts: oneDone })
  expect(leadSummary(paused.ports, 'pp', '2026-11-12')).toBe('waiting')
  expect(paused.posts).toEqual([])
  const nobody = rig({ noLead: true, facts: oneDone })
  expect(leadSummary(nobody.ports, 'pp', '2026-11-12')).toBe('waiting')
  expect(nobody.posts).toEqual([])
})
