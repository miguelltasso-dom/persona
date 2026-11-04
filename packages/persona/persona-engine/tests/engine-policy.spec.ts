import { expect, it } from 'vitest'
import { engineClassForTurn } from '../src/index.ts'
import type { TurnKind } from '@deepseek-ai/dsh-persona-core'

const KINDS: readonly TurnKind[] = [
  'triage',
  'reply',
  'execution',
  'initiative',
  'librarian',
  'watchdog',
  'evaluation',
]

it('maps execution and reply to persona; every other turn stays cheap (OPT-5)', () => {
  expect(engineClassForTurn('execution')).toBe('persona')
  expect(engineClassForTurn('reply')).toBe('persona')
  for (const kind of KINDS) {
    const want = kind === 'execution' || kind === 'reply' ? 'persona' : 'cheap'
    expect(engineClassForTurn(kind)).toBe(want)
  }
})
