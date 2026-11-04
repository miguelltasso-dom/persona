import { expect, it } from 'vitest'
import {
  CHANNEL_WORD_LIMIT,
  batchInitiative,
  capChannelReply,
  countWords,
  engineClassForTurn,
  initiativeCadenceDays,
  trimInitiativeToBudget,
} from '../src/index.ts'

it('caps a channel reply at 100 words and batches initiative per persona per day', () => {
  const long = Array.from({ length: 140 }, (_, i) => `w${String(i)}`).join(' ')
  const capped = capChannelReply(long)
  expect(countWords(capped)).toBe(CHANNEL_WORD_LIMIT)
  const batches = batchInitiative([
    { id: 'a1', personaId: 'nina', title: 'cardápio', day: '2026-11-04' },
    { id: 'a2', personaId: 'nina', title: 'encomenda', day: '2026-11-04' },
    { id: 'b1', personaId: 'bento', title: 'teste', day: '2026-11-04' },
  ])
  expect(batches).toHaveLength(2)
  expect(batches.find(row => row.personaId === 'nina')?.ids).toEqual(['a1', 'a2'])
  expect(engineClassForTurn('triage')).toBe('cheap')
  expect(engineClassForTurn('execution')).toBe('persona')
  const trimmed = trimInitiativeToBudget([
    { id: 'a1', personaId: 'nina', title: 'cardápio', day: '2026-11-04' },
    { id: 'a2', personaId: 'nina', title: 'encomenda', day: '2026-11-04' },
    { id: 'a3', personaId: 'nina', title: 'extra', day: '2026-11-04' },
  ], 200, 400)
  expect(trimmed.map(row => row.id)).toEqual(['a1', 'a2'])
  expect(initiativeCadenceDays(0.2)).toBe(3)
  expect(initiativeCadenceDays(0.5)).toBe(2)
  expect(initiativeCadenceDays(0.8)).toBe(1)
})
