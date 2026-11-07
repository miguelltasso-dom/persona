/**
 * "Precisa de você / Liberar para {B}" (contracts/team-real.md §9): the choices of a connector card, exactly the ones the host accepts:
 *  - "Liberar só desta vez" — only the colleague's task runs WITH the connector, the permission goes away when it ends;
 *  - "Sempre permitir para {B}" — a permanent READ grant (writing and deleting keep asking); it has an Desfazer in the toast;
 *  - "Agora não" — the task waits and says why (never a silent refusal).
 * The consequence of "sempre" is written under the buttons (it is the only one that outlasts the task); the other two are described to
 * assistive tech. Nothing here decides: it calls what it is given, once, and stops while the host answers.
 */

import { useId, type ReactNode } from 'react'
import { Button } from '../primitives/index.ts'
import { connectorChoiceHint, connectorChoiceLabel, connectorText, type ConnectorAskUi, type ConnectorChoice } from './connector-ask.ts'
import styles from './Connector.module.css'

type Dict = Readonly<Record<string, string>>

export interface ConnectorActionsProps {
  readonly dict: Dict
  readonly ask: ConnectorAskUi
  /** Who needs the connector (B). */
  readonly personaName: string
  readonly deciding?: boolean
  readonly disabled?: boolean
  readonly onChoose: (choice: ConnectorChoice) => void
}

const VARIANT = { once: 'primary', always: 'secondary', 'not-now': 'ghost' } as const

export function ConnectorActions({ dict, ask, personaName, deciding = false, disabled = false, onChoose }: ConnectorActionsProps): ReactNode {
  const id = useId()
  // The order the person reads: the safe small one first, the lasting one second, the way out last.
  const choices = (['once', 'always', 'not-now'] as const).filter(choice => ask.options.includes(choice))
  return (
    <>
      <div
        className={styles.group}
        role="group"
        aria-label={connectorText(dict, 'connector.choices', 'Como liberar o {connector} para {name}', { connector: ask.connectorName, name: personaName })}
        data-connector-choices=""
      >
        {choices.map(choice => (
          <Button
            key={choice}
            variant={VARIANT[choice]}
            size="s"
            disabled={disabled || deciding}
            aria-describedby={`${id}-${choice}`}
            data-connector-choice={choice}
            onClick={() => { onChoose(choice) }}
          >
            {connectorChoiceLabel(dict, choice, personaName)}
          </Button>
        ))}
      </div>
      {choices.map(choice => (
        choice === 'always'
          ? <p key={choice} id={`${id}-${choice}`} className={styles.hint}>{connectorChoiceHint(dict, choice, ask, personaName)}</p>
          : <span key={choice} id={`${id}-${choice}`} className={styles.srOnly}>{connectorChoiceHint(dict, choice, ask, personaName)}</span>
      ))}
    </>
  )
}
