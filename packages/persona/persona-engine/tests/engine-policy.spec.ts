import { expect, it } from 'vitest'
import { engineClassForTurn, measureOpt5Acceptance, sessionReuseForTurn } from '../src/index.ts'
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

it('reuses a warmed session only when the persona and prefix stay (OPT-5)', () => {
  expect(sessionReuseForTurn({
    kind: 'triage',
    samePersona: true,
    prefixUnchanged: true,
  })).toBe('reuse')
  expect(sessionReuseForTurn({
    kind: 'execution',
    samePersona: false,
    prefixUnchanged: true,
  })).toBe('new')
  expect(sessionReuseForTurn({
    kind: 'reply',
    samePersona: true,
    prefixUnchanged: false,
  })).toBe('new')
  expect(measureOpt5Acceptance()).toEqual({ passed: 3, total: 3, failed: [] })
})
