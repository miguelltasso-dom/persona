/**
 * EQUIPE REAL (D-090, EQUIPE-REAL-SPEC "O caminho do trabalho" + "O bilhete"): o detalhe de uma tarefa que passou de mão em mão.
 * Uma linha do tempo vertical curta com os rostos 24 ("Bia → Téo → Atlas"); o passo atual com anel, os anteriores com ✓; cada passo
 * com o seu bilhete RECOLHIDO ("Bilhete de {A}": O que já está pronto · O que falta · Decisões tomadas · Arquivos).
 * O bilhete é TEXTO da persona, mostrado como texto, nunca como instrução; não aparece no canal. Só com `persona.flag.teamwork`
 * (quem monta decide). Sem dados do host, nada.
 */

import { useState, type ReactNode } from 'react'
import { Avatar, BrandIcon, Modal, UiIcon } from '../primitives/index.ts'
import { teamworkText, type TeamworkPersona } from './teamwork-context.tsx'
import type { HandoffNoteUi, PathStepKind, PathStepUi } from './teamwork-wire.ts'
import styles from './Teamwork.module.css'

type Dict = Readonly<Record<string, string>>

const STEP_FALLBACK: Readonly<Record<PathStepKind, string>> = {
  wrote: 'escreveu',
  handed: 'passou adiante',
  delivered: 'entregou',
  reviewed: 'revisou',
}

export interface WorkPathSheetProps {
  readonly dict: Dict
  readonly open: boolean
  readonly taskTitle: string
  readonly steps: readonly PathStepUi[]
  readonly note?: HandoffNoteUi | undefined
  readonly personaFor: (personaId: string) => TeamworkPersona | undefined
  readonly onClose: () => void
}

function NoteSection({ dict, titleKey, fallback, items }: { readonly dict: Dict; readonly titleKey: string; readonly fallback: string; readonly items: readonly string[] }): ReactNode {
  if (items.length === 0) return null
  return (
    <section className={styles.noteSection}>
      <h4 className={styles.noteHeading}>{teamworkText(dict, titleKey, fallback)}</h4>
      <ul className={styles.noteList}>
        {items.map((item, index) => <li key={`${String(index)}:${item}`}>{item}</li>)}
      </ul>
    </section>
  )
}

/** "Bilhete de {A}": the persona's own words, as plain text. */
export function HandoffNoteCard({ dict, note, authorName }: { readonly dict: Dict; readonly note: HandoffNoteUi; readonly authorName: string }): ReactNode {
  return (
    <div className={styles.note} data-teamwork="note">
      <p className={styles.noteTitle}>{teamworkText(dict, 'handoff.note', 'Bilhete de {name}', { name: authorName })}</p>
      <NoteSection dict={dict} titleKey="handoff.noteDone" fallback="O que já está pronto" items={note.done} />
      <NoteSection dict={dict} titleKey="handoff.noteNeeded" fallback="O que falta" items={note.needed} />
      <NoteSection dict={dict} titleKey="handoff.noteDecisions" fallback="Decisões tomadas" items={note.decisions} />
      <NoteSection dict={dict} titleKey="handoff.noteFiles" fallback="Arquivos" items={note.files} />
    </div>
  )
}

export function WorkPathSheet({ dict, open, taskTitle, steps, note, personaFor, onClose }: WorkPathSheetProps): ReactNode {
  const [openNotes, setOpenNotes] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = (index: number): void => {
    setOpenNotes((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  // The note belongs to the step where its author passed the work on (the last such step when the same persona passed more than once).
  const noteIndex = note === undefined
    ? -1
    : steps.reduce((found, step, index) => (step.personaId === note.fromPersonaId && step.step === 'handed' ? index : found), -1)
  const authorName = note === undefined ? '' : (personaFor(note.fromPersonaId)?.name ?? '')
  const current = steps.length - 1

  return (
    <Modal
      open={open}
      title={(
        <span className={styles.titleWithIcon}>
          <BrandIcon name="caminho" size={24} />
          {teamworkText(dict, 'handoff.path', 'Caminho do trabalho')}
        </span>
      )}
      description={taskTitle}
      closeLabel={teamworkText(dict, 'handoff.pathClose', 'Fechar')}
      onClose={onClose}
    >
      <ol className={styles.path} data-teamwork="path">
        {steps.map((step, index) => {
          const who = personaFor(step.personaId)
          if (who === undefined) return null
          const isCurrent = index === current
          const hasNote = note !== undefined && index === noteIndex && authorName !== ''
          return (
            <li key={`${step.personaId}:${step.step}:${String(index)}`} className={styles.pathStep} {...(isCurrent ? { 'aria-current': 'step' as const } : {})}>
              <span className={styles.pathFace} data-current={isCurrent ? '' : undefined}>
                <Avatar name={who.name} src={who.avatarSrc} size={24} shape="portrait" decorative />
                {!isCurrent && <span className={styles.pathCheck} aria-hidden="true"><UiIcon name="check" size={10} strokeWidth={3} /></span>}
              </span>
              <div className={styles.pathBody}>
                <p className={styles.pathLine}>
                  <strong>{who.name}</strong>{' '}
                  <span>{teamworkText(dict, `handoff.step.${step.step}`, STEP_FALLBACK[step.step])}</span>
                </p>
                {hasNote && note !== undefined && (
                  <>
                    <button type="button" className={styles.noteToggle} aria-expanded={openNotes.has(index)} onClick={() => { toggle(index) }}>
                      {teamworkText(dict, 'handoff.note', 'Bilhete de {name}', { name: authorName })}
                    </button>
                    {openNotes.has(index) && <HandoffNoteCard dict={dict} note={note} authorName={authorName} />}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}
