/**
 * Spoken + undo feedback for the single decision cycle (DECISIONS-SPEC Regra 2).
 * - `aria-live="polite"` announces "Aprovado: …" / "Deixado de lado: …" once per decision;
 * - the 6 s "Desfazer" toast exists ONLY when the host marked the decision `reversible` and an undo handler is wired.
 * Mounted by both Visão geral and Aprovações, so approving in either gives the same feedback.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Toast, ToastRegion } from '../primitives/index.ts'
import { DECISION_UNDO_MS, type Decision, type DecisionState, type DecisionT } from './decision-types.ts'
import styles from './Decisions.module.css'

export interface DecisionFeedbackProps {
  readonly decisions: readonly Decision[] | undefined
  readonly t: DecisionT
  readonly onUndo?: ((decisionId: string) => void) | undefined
}

/** "Agora Téo pode ler o Gmail sem perguntar": the grant is READ only, so the line says read (never "usar"). Falls back to these words while the locale lacks the key. */
function connectorGrantLine(t: DecisionT, grant: { readonly personaName: string; readonly connectorName: string }): string {
  const key = 'decision.undoToast.connector'
  const params = { name: grant.personaName, connector: grant.connectorName }
  // The key is newer than the generated locale types: read as text (the fallback below covers a build that lacks it).
  const text = (t as unknown as (key: string, params?: Readonly<Record<string, string | number>>) => string)(key, params)
  return text !== key && text.length > 0 ? text : `Agora ${grant.personaName} pode ler o ${grant.connectorName} sem perguntar`
}

export function DecisionFeedback({ decisions, t, onUndo }: DecisionFeedbackProps): ReactNode {
  const [announcement, setAnnouncement] = useState('')
  const [undo, setUndo] = useState<{ readonly id: string; readonly title: string; readonly connector?: { readonly personaName: string; readonly connectorName: string } } | null>(null)
  const seen = useRef(new Map<string, DecisionState>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    for (const decision of decisions ?? []) {
      const before = seen.current.get(decision.id)
      if (before === decision.state) continue
      seen.current.set(decision.id, decision.state)
      // First sight is not a change: only announce what happens while this screen is open.
      if (before === undefined) continue
      if (decision.state === 'accepted') {
        setAnnouncement(t('decision.live.accepted', { title: decision.title }))
        if (decision.reversible === true && onUndo !== undefined) {
          setUndo({ id: decision.id, title: decision.title, ...(decision.connectorGrant === undefined ? {} : { connector: decision.connectorGrant }) })
          if (timer.current !== null) clearTimeout(timer.current)
          timer.current = setTimeout(() => { setUndo(null); timer.current = null }, DECISION_UNDO_MS)
        }
      } else if (decision.state === 'declined') {
        setAnnouncement(t('decision.live.declined', { title: decision.title }))
      }
    }
  }, [decisions, onUndo, t])

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  return (
    <>
      <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true" data-persona-decision-live="">
        {announcement}
      </div>
      {undo !== null && (
        <ToastRegion label={t('decision.noticesLabel')}>
          <Toast
            tone="success"
            title={undo.connector === undefined
              ? t('decision.undoToast', { title: undo.title })
              : connectorGrantLine(t, undo.connector)}
            action={(
              <Button
                size="s"
                variant="ghost"
                onClick={() => {
                  onUndo?.(undo.id)
                  setUndo(null)
                  if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
                }}
              >
                {t('decision.undo')}
              </Button>
            )}
          />
        </ToastRegion>
      )}
    </>
  )
}
