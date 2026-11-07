/**
 * D-096: the sentence on a Task's card when the engine ran it differently from what was set. Pure, no host.
 */
import { expect, it } from 'vitest'
import { engineNoteOf } from '../src/engine-note.ts'

const NAMES = ['Gmail', 'Drive', 'Notas']

it('native-once: one connector that was not there → "Rodou no modo nativo desta vez: o conector {Nome} não estava disponível."', () => {
  expect(engineNoteOf({ connectorsFallback: 'native-once', connectorsUnreached: [{ ordinal: 0, reason: 'failed' }] }, NAMES))
    .toBe('Rodou no modo nativo desta vez: o conector Gmail não estava disponível.')
})

it('native-once: several connectors, by position, each named once and in plain Portuguese', () => {
  expect(engineNoteOf({ connectorsFallback: 'native-once', connectorsUnreached: [{ ordinal: 0, reason: 'absent' }, { ordinal: 2, reason: 'timeout' }, { ordinal: 0, reason: 'many' }] }, NAMES))
    .toBe('Rodou no modo nativo desta vez: os conectores Gmail e Notas não estavam disponíveis.')
})

it('floor: the connector needs the person to sign in again, the persona went on without it (and native was NOT used)', () => {
  expect(engineNoteOf({ connectorsFallback: 'floor', connectorsUnreached: [{ ordinal: 1, reason: 'needs-auth' }] }, NAMES))
    .toBe('O conector Drive precisa que você entre de novo na conta; a persona seguiu sem ele.')
  expect(engineNoteOf({ connectorsFallback: 'floor', connectorsUnreached: [{ ordinal: 0, reason: 'no-login' }, { ordinal: 1, reason: 'needs-auth' }] }, NAMES))
    .toBe('Os conectores Gmail e Drive precisam que você entre de novo na conta; a persona seguiu sem eles.')
})

it('a position the host cannot name is never shown as an id: the sentence says "um conector que você liberou"', () => {
  expect(engineNoteOf({ connectorsFallback: 'native-once', connectorsUnreached: [{ ordinal: 9, reason: 'failed' }] }, NAMES))
    .toBe('Rodou no modo nativo desta vez: um conector que você liberou não estava disponível.')
})

it('the proof of the CLI version failed → native, with the sentence that says the isolation could not be verified; any other reason says nothing', () => {
  for (const reason of ['failed-version', 'parity-unproven', 'parity-failed', 'unverified']) {
    expect(engineNoteOf({ envMode: 'native', envModeRequested: 'needed', envModeReason: reason }, NAMES))
      .toBe('Rodou no modo nativo desta vez: o isolamento ainda não foi verificado nesta versão do motor.')
  }
  expect(engineNoteOf({ envMode: 'needed', envModeReason: 'verified' }, NAMES)).toBeUndefined()
  expect(engineNoteOf({ envMode: 'answer-only', envModeReason: 'off' }, NAMES)).toBeUndefined()
  expect(engineNoteOf({}, NAMES)).toBeUndefined()
})
