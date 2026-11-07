/**
 * HT-3 · a linha "{nome} começou agora" no cartão do quadro, com o rosto da persona e o anel pulsando UMA vez (PERSONA-POWERS-SPEC §4).
 * O aviso vem do quadro conectado (`started-now.ts`: só com a tarefa atual da persona = este cartão, movido pela pessoa nesta sessão); o cartão
 * só desenha o que o contexto entrega. Fora do provedor, ou sem aviso para este cartão, não desenha nada.
 * Reduced-motion: o anel não pulsa, fica só o texto.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { Avatar } from '../primitives/index.ts'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { StartedNow } from './started-now.ts'
import styles from './StartedNowNote.module.css'

export interface StartedNowContextValue {
  readonly startedFor: (cardId: string) => StartedNow | undefined
}

const StartedNowContext = createContext<StartedNowContextValue | undefined>(undefined)

export function StartedNowProvider({ value, children }: { readonly value: StartedNowContextValue; readonly children: ReactNode }): ReactNode {
  return <StartedNowContext.Provider value={value}>{children}</StartedNowContext.Provider>
}

export interface StartedNowNoteProps {
  readonly cardId: string
  /** "{name} começou agora" — a frase vem do locale do quadro (`board.startedNow`). */
  readonly label: (name: string) => string
}

export function StartedNowNote({ cardId, label }: StartedNowNoteProps): ReactNode {
  const started = useContext(StartedNowContext)?.startedFor(cardId)
  if (started === undefined) return null
  const src = resolvePersonaFace({ id: started.personaId, name: started.personaName })
  return (
    <p className={styles.note} role="status" data-started-now={started.personaId}>
      <span className={styles.ring} aria-hidden="true">
        <Avatar name={started.personaName} size={24} shape="portrait" decorative {...(src === undefined ? {} : { src })} />
      </span>
      <span>{label(started.personaName)}</span>
    </p>
  )
}
