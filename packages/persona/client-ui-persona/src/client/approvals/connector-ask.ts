/**
 * "Precisa de você / Liberar para {B}" (contracts/team-real.md §9, Anvil): ONE kind of approval for a persona that needs a connector it
 * cannot use yet — "a Bia pediu ao Teo e o Teo não pode usar o Gmail" (reason `colleague`) and "a Nina quer usar o Drive" (reason
 * `initiative`). Read from the host card as DATA, never trusted: anything strange is "no connector ask" and the card degrades to
 * the host's own title/question. The words are written here from the fields; the text never comes from content the persona read.
 *
 *   ApprovalView.connector = { reason, connectorName, cli, connectorId, access, requestedByPersonaId?/Name?, taskId?/taskTitle?,
 *                              purpose?, options: ('once' | 'always' | 'not-now')[] }
 *   decideApproval({ …, kind: 'connector', choice })  →  ApprovalView + connectorDecision?: { choice, grant? }
 */

export type ConnectorChoice = 'once' | 'always' | 'not-now'

export interface ConnectorAskUi {
  readonly reason: 'colleague' | 'initiative'
  /** "Gmail", "Drive": the connector's name as the person knows it. */
  readonly connectorName: string
  readonly access: 'read' | 'write'
  /** `colleague`: A, who asked B. */
  readonly requestedByName?: string
  /** `colleague`: the colleague's task that waits. */
  readonly taskTitle?: string
  /** `initiative`: the human sentence for "why". */
  readonly purpose?: string
  /** What the host accepts for this card; the UI offers exactly these and never invents one. */
  readonly options: readonly ConnectorChoice[]
}

const CHOICES: readonly ConnectorChoice[] = ['once', 'always', 'not-now']
const MAX = 300

function text(value: unknown): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim().slice(0, MAX)
}

/**
 * @param raw - `ApprovalView.connector` from the host (unknown on the wire).
 * @returns The ask, or `undefined` when the card does not say what connector is missing (then the host's own title/question stand).
 */
export function readConnectorAsk(raw: unknown): ConnectorAskUi | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  const connectorName = text(row.connectorName)
  if (connectorName === '') return undefined
  if (row.reason !== 'colleague' && row.reason !== 'initiative') return undefined
  const options = Array.isArray(row.options)
    ? CHOICES.filter(choice => (row.options as unknown[]).includes(choice))
    : []
  // "Agora não" always exists: the person is never forced to grant; a card with no usable option still offers it.
  const offered: readonly ConnectorChoice[] = options.includes('not-now') ? options : [...options, 'not-now']
  const requestedByName = text(row.requestedByPersonaName)
  const taskTitle = text(row.taskTitle)
  const purpose = text(row.purpose)
  return {
    reason: row.reason,
    connectorName,
    access: row.access === 'write' ? 'write' : 'read',
    ...(requestedByName === '' ? {} : { requestedByName }),
    ...(taskTitle === '' ? {} : { taskTitle }),
    ...(purpose === '' ? {} : { purpose }),
    options: offered,
  }
}

type Dict = Readonly<Record<string, string>>

function fill(template: string, params: Readonly<Record<string, string>>): string {
  return Object.entries(params).reduce((line, [name, value]) => line.split(`{${name}}`).join(value), template)
}

/** Copy with the same fallback as the other new texts: the generated locale may not carry the key yet; never a raw key on screen. */
export function connectorText(dict: Dict, key: string, fallback: string, params: Readonly<Record<string, string>> = {}): string {
  const found = dict[key]
  return fill(typeof found === 'string' && found.length > 0 ? found : fallback, params)
}

/** "Liberar o Gmail para o Téo". */
export function connectorTitle(dict: Dict, ask: ConnectorAskUi, personaName: string): string {
  return connectorText(dict, 'connector.title', 'Liberar o {connector} para {name}', { connector: ask.connectorName, name: personaName })
}

/** "A Bia pediu ao Téo “Arte da home”, mas o Téo não pode usar o Gmail." / "A Nina quer usar o Drive: organizar as notas." */
export function connectorQuestion(dict: Dict, ask: ConnectorAskUi, personaName: string): string {
  if (ask.reason === 'colleague' && ask.requestedByName !== undefined && ask.taskTitle !== undefined) {
    return connectorText(dict, 'connector.question.colleague', '{from} pediu a {name} “{task}”, mas {name} não pode usar o {connector}.', {
      from: ask.requestedByName,
      name: personaName,
      task: ask.taskTitle,
      connector: ask.connectorName,
    })
  }
  if (ask.reason === 'initiative' && ask.purpose !== undefined) {
    return connectorText(dict, 'connector.question.initiative', '{name} quer usar o {connector}: {purpose}', {
      name: personaName,
      connector: ask.connectorName,
      purpose: ask.purpose,
    })
  }
  return connectorText(dict, 'connector.question.generic', '{name} precisa do {connector} e ainda não pode usá-lo.', { name: personaName, connector: ask.connectorName })
}

export function connectorChoiceLabel(dict: Dict, choice: ConnectorChoice, personaName: string): string {
  if (choice === 'once') return connectorText(dict, 'connector.once', 'Liberar só desta vez')
  if (choice === 'always') return connectorText(dict, 'connector.always', 'Sempre permitir para {name}', { name: personaName })
  return connectorText(dict, 'connector.notNow', 'Agora não')
}

/** The honest consequence under the buttons: what each choice really does (the host decides; this only says it plainly). */
export function connectorChoiceHint(dict: Dict, choice: ConnectorChoice, ask: ConnectorAskUi, personaName: string): string {
  if (choice === 'once') {
    return connectorText(dict, 'connector.once.hint', 'Só esta tarefa usa o {connector}; a permissão some quando ela terminar.', { connector: ask.connectorName })
  }
  if (choice === 'always') {
    return connectorText(dict, 'connector.always.hint', '{name} passa a poder ler no {connector} sem perguntar. Escrever e apagar continuam perguntando.', { name: personaName, connector: ask.connectorName })
  }
  return connectorText(dict, 'connector.notNow.hint', 'A tarefa fica parada e diz o motivo; nada é recusado em silêncio.')
}
