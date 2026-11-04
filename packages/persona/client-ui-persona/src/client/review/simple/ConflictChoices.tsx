/**
 * "Você e a {Persona} mudaram {arquivo}" (SIMPLE-WORKSPACE-SPEC §6): one choice per file in conflict, in plain words.
 * No conflict markers ever reach the person's file; "Manter os dois" is the recommended, safe default — but it is
 * the person who picks it: nothing is applied over their file until every conflict has an answer.
 */

import type { ReactNode } from 'react'
import { ChoiceCards } from '../../primitives/index.ts'
import { BeforeAfterText } from './BeforeAfterText.tsx'
import { diffLines, opsToText } from './text-diff.ts'
import type { ConflictChoice, DraftFileUi } from './draft-types.ts'
import styles from './ConflictChoices.module.css'

export interface ConflictChoicesProps {
  readonly files: readonly DraftFileUi[]
  readonly personaName: string
  readonly choices: Readonly<Record<string, ConflictChoice | undefined>>
  readonly onChoose: (fileId: string, choice: ConflictChoice) => void
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
}

/** "cardápio.docx" + "Bia" → "cardápio (de Bia).docx" — the copy that sits next to the person's file. */
export function conflictCopyName(fileName: string, personaName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} (de ${personaName})`
  return `${fileName.slice(0, dot)} (de ${personaName})${fileName.slice(dot)}`
}

export function ConflictChoices({ files, personaName, choices, onChoose, t }: ConflictChoicesProps): ReactNode {
  const conflicts = files.filter(file => file.conflict === true)
  if (conflicts.length === 0) return null
  return (
    <section className={styles.root} aria-labelledby="persona-conflicts-title" data-persona-review="conflicts">
      <h3 id="persona-conflicts-title" className={styles.heading}>{t('blocked.chip')}</h3>
      <ul className={styles.list}>
        {conflicts.map((file) => {
          const titleId = `persona-conflict-${file.id}`
          return (
            <li key={file.id} className={styles.item}>
              <h4 id={titleId} className={styles.title}>{t('conflict.title', { name: personaName, file: file.name })}</h4>
              <p className={styles.body}>{t('conflict.body', { name: personaName })}</p>
              {file.folderText !== undefined && file.ops !== undefined && (
                <details className={styles.compare}>
                  <summary>{t('conflict.compare')}</summary>
                  <BeforeAfterText
                    t={t}
                    ops={diffLines(file.folderText, opsToText(file.ops, 'after'))}
                    labels={{ before: t('conflict.yours'), after: t('conflict.draftSide', { name: personaName }) }}
                  />
                </details>
              )}
              <ChoiceCards<ConflictChoice>
                legend={t('conflict.legend')}
                hideLegend
                name={`persona-conflict-choice-${file.id}`}
                value={choices[file.id]}
                onChange={(choice) => { onChoose(file.id, choice) }}
                options={[
                  { id: 'mine', title: t('conflict.mine.title'), body: t('conflict.mine.body', { name: personaName }) },
                  { id: 'theirs', title: t('conflict.theirs.title', { name: personaName }), body: t('conflict.theirs.body') },
                  {
                    id: 'both',
                    title: t('conflict.both.title'),
                    body: t('conflict.both.body', { name: personaName, copy: conflictCopyName(file.name, personaName) }),
                    badge: t('conflict.recommended'),
                  },
                ]}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
