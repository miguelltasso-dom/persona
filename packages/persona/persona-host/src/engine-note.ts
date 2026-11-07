/**
 * D-096 (Atlas, Keel 04:39), the plain words on a Task's card when the engine ran it differently from what was set. Pure: the typed signal of the
 * runner in, one Portuguese sentence out (or nothing). Nothing here is a model's text and nothing carries a URL: the runner reports connectors by
 * POSITION in the list the host passed (`accountConnectors`, deduplicated, first-occurrence order) and the host puts the names, which it already has.
 *
 *   native-once  the `needed` launch could not deliver a granted connector (absent, failed, too slow, ambiguous): THIS Task ran native, once.
 *   floor        the connector needs the person to sign in again; native cannot reach it either and costs ~300 000 tokens a request for nothing,
 *                so the Task went on at the floor with what did arrive.
 */

/** The part of the runner's usage this sentence reads. */
export interface EngineNoteInput {
  readonly envMode?: string
  readonly envModeRequested?: string
  readonly envModeReason?: string
  readonly connectorsUnreached?: ReadonlyArray<{ readonly ordinal: number; readonly reason: string }>
  readonly connectorsFallback?: 'native-once' | 'floor'
}

/** Reasons that mean the isolated launch could not be trusted at all (not a connector's fault). */
const UNPROVEN: readonly string[] = ['failed-version', 'parity-unproven', 'parity-failed', 'unverified']

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`
}

function connectorsPhrase(names: readonly string[], one: string, many: string): string {
  return names.length === 1 ? `o conector ${names[0] ?? ''} ${one}` : `os conectores ${listOf(names)} ${many}`
}

/**
 * @param input - What the runner reported for the call.
 * @param names - The shown names of the connectors the host passed to the runner, in the SAME order (position = the runner's ordinal).
 * @returns The sentence for the Task's card, or undefined when the call ran as it was set.
 */
export function engineNoteOf(input: EngineNoteInput, names: readonly string[]): string | undefined {
  const unreached = input.connectorsUnreached ?? []
  const named = [...new Set(unreached.map(row => names[row.ordinal]).filter((name): name is string => name !== undefined && name !== ''))]
  const who = named.length > 0 ? named : ['um conector que você liberou']
  const single = who.length === 1
  if (input.connectorsFallback === 'native-once') {
    const subject = named.length > 0 ? connectorsPhrase(named, 'não estava disponível', 'não estavam disponíveis') : 'um conector que você liberou não estava disponível'
    return `Rodou no modo nativo desta vez: ${subject}.`
  }
  if (input.connectorsFallback === 'floor') {
    const subject = named.length > 0 ? connectorsPhrase(named, 'precisa', 'precisam') : 'um conector que você liberou precisa'
    return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} que você entre de novo na conta; a persona seguiu sem ${single ? 'ele' : 'eles'}.`
  }
  if (input.envMode === 'native' && input.envModeRequested === 'needed' && input.envModeReason !== undefined && UNPROVEN.includes(input.envModeReason)) {
    return 'Rodou no modo nativo desta vez: o isolamento ainda não foi verificado nesta versão do motor.'
  }
  return undefined
}
