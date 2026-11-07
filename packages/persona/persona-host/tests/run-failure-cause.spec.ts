import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * ENG-1: the person sees one typed line (`engine_unavailable`) for a dozen different causes. The REAL cause is kept where a person
 * debugging it can read it: `lastErrors` and a `run_failure` row keyed by the message that started the run.
 */

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  return h
}

const failureOf = (h: PersonaHost, id: string) => h.screens.screens.get<{ at: string; detail: string; stack: string }>('pp', 'run_failure', id)
const errorLine = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
  .find(row => row.runError !== undefined)?.runError

it('an unexpected error before the engine runs keeps its cause (name, message, where) and the person still gets the typed line', async () => {
  const h = open()
  h.orchestration.runnerFactory = async () => { throw new TypeError('Cannot read properties of undefined (reading "join")') }
  say(h, 'f1', '@Nina monte o cardápio novo')
  await h.orchestration.flush('pp')
  const failure = failureOf(h, 'f1')
  expect(failure?.detail).toBe('TypeError: Cannot read properties of undefined (reading "join")')
  expect(failure?.stack).toContain('TypeError')
  // `lastErrors` carries only the class and the code (no message: it may echo a request); the cause is in `run_failure`.
  expect(h.orchestration.lastErrors).toContain('TypeError')
  expect(errorLine(h)).toMatchObject({ code: 'engine_unavailable' })
})

it('credentials and the home folder never reach lastErrors, the stderr line or the run_failure row', async () => {
  const h = open()
  const secret = 'synthetic-credential-detail'
  h.orchestration.runnerFactory = async () => {
    throw new Error(`falhou api_key=${secret} Authorization: Bearer abcdefghijklmnop1234 em C:\\Users\\migue\\dev\\x e /home/migue/y sk-abcdefghijklmnop1234`)
  }
  say(h, 'f4', '@Nina monte o cardápio novo')
  await h.orchestration.flush('pp')
  const row = JSON.stringify(failureOf(h, 'f4'))
  for (const hidden of [secret, 'abcdefghijklmnop1234', 'C:\\\\Users\\\\migue', '/home/migue']) {
    expect(row, hidden).not.toContain(hidden)
    expect(JSON.stringify(h.orchestration.lastErrors), hidden).not.toContain(hidden)
  }
  expect(failureOf(h, 'f4')?.detail).toContain('[removido]')
})

it('a resolve failure keeps its code, provider and cause', async () => {
  const h = open()
  h.orchestration.runnerFactory = async () => { throw Object.assign(new RunnerResolveError('cli_not_found', 'claude'), { cause: new Error('spawn EINVAL') }) }
  say(h, 'f2', '@Nina monte o cardápio novo')
  await h.orchestration.flush('pp')
  const detail = failureOf(h, 'f2')?.detail ?? ''
  expect(detail).toContain('cli_not_found')
  expect(detail).toContain('Claude')
  expect(detail).toContain('spawn EINVAL')
  expect(errorLine(h)).toBeDefined()
})

it('a worker turn that ends with nothing is recorded as such, not as a mystery', async () => {
  const h = open()
  h.orchestration.scripted = false
  h.orchestration.liveText = ''
  say(h, 'f3', '@Nina monte o cardápio novo')
  await h.orchestration.flush('pp')
  expect(failureOf(h, 'f3')?.detail).toContain('o turno terminou sem texto')
})
