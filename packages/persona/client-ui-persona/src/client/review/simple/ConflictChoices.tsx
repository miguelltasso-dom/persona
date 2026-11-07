/**
 * "{Persona} e você mudaram {arquivo}" (SIMPLE-WORKSPACE-SPEC §6; wording by Muse, see conflict-text.ts): one choice per file in conflict, in plain words.
 * No conflict markers ever reach the person's file; "Manter os dois" is the recommended, safe default — but it is
 * the person who picks it: nothing is applied over their file until every conflict has an answer.
 */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../../assets/generated-imports.ts'
import { ChoiceCards } from '../../primitives/index.ts'
import { BeforeAfterText } from './BeforeAfterText.tsx'
import { safeReviewImageSrc } from './image-src.ts'
import { diffLines, opsToText } from './text-diff.ts'
import type { ConflictChoice, DraftFileUi } from './draft-types.ts'
import { conflictCopyName, conflictText } from './conflict-text.ts'
import styles from './ConflictChoices.module.css'

export { conflictCopyName }

export interface ConflictChoicesProps {
  readonly files: readonly DraftFileUi[]
  /** The persona's name when the host gave one; `undefined` = unknown (no stand-in name is written into the sentences). */
  readonly personaName: string | undefined
  readonly choices: Readonly<Record<string, ConflictChoice | undefined>>
  readonly onChoose: (fileId: string, choice: ConflictChoice) => void
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
}

export function ConflictChoices({ files, personaName, choices, onChoose, t }: ConflictChoicesProps): ReactNode {
  const conflicts = files.filter(file => file.conflict === true)
  if (conflicts.length === 0) return null
  return (
    <section className={styles.root} aria-labelledby="persona-conflicts-title" data-persona-review="conflicts" data-testid="review-conflict">
      <img className={styles.art} src={ILLUSTRATIONS['conflito-mesmo-arquivo']} alt="" width={160} height={160} decoding="async" />
      <h3 id="persona-conflicts-title" className={styles.heading}>{t('blocked.chip')}</h3>
      <ul className={styles.list}>
        {conflicts.map((file) => {
          const titleId = `persona-conflict-${file.id}`
          return (
            <li key={file.id} className={styles.item}>
              <h4 id={titleId} className={styles.title}>{conflictText(t, 'conflict.title', personaName, { file: file.name })}</h4>
              <p className={styles.body}>{conflictText(t, 'conflict.body', personaName)}</p>
              {file.folderText !== undefined && file.ops !== undefined && (
                <details className={styles.compare}>
                  <summary>{t('conflict.compare')}</summary>
                  <BeforeAfterText
                    t={t}
                    ops={diffLines(file.folderText, opsToText(file.ops, 'after'))}
                    labels={{ before: t('conflict.yours'), after: conflictText(t, 'conflict.draftSide', personaName) }}
                  />
                </details>
              )}
              {file.type === 'image' && safeReviewImageSrc(file.folderImageSrc) !== undefined && safeReviewImageSrc(file.afterImageSrc) !== undefined && (
                // A picture in a clash: the person sees BOTH pictures (the folder's and the draft's), only as <img>.
                <details className={styles.compare}>
                  <summary>{t('conflict.compare')}</summary>
                  <div className={styles.imageCompare} data-testid="review-conflict-images">
                    <figure className={styles.imageSide}>
                      <img className={styles.imageSideImg} src={safeReviewImageSrc(file.folderImageSrc)} alt={`${file.name} · ${t('conflict.yours')}`} />
                      <figcaption className={styles.imageSideCaption}>{t('conflict.yours')}</figcaption>
                    </figure>
                    <figure className={styles.imageSide}>
                      <img className={styles.imageSideImg} src={safeReviewImageSrc(file.afterImageSrc)} alt={`${file.name} · ${conflictText(t, 'conflict.draftSide', personaName)}`} />
                      <figcaption className={styles.imageSideCaption}>{conflictText(t, 'conflict.draftSide', personaName)}</figcaption>
                    </figure>
                  </div>
                </details>
              )}
              <ChoiceCards<ConflictChoice>
                legend={t('conflict.legend')}
                hideLegend
                name={`persona-conflict-choice-${file.id}`}
                value={choices[file.id]}
                onChange={(choice) => { onChoose(file.id, choice) }}
                options={[
                  { id: 'mine', title: t('conflict.mine.title'), body: conflictText(t, 'conflict.mine.body', personaName) },
                  { id: 'theirs', title: conflictText(t, 'conflict.theirs.title', personaName), body: t('conflict.theirs.body') },
                  {
                    id: 'both',
                    title: t('conflict.both.title'),
                    body: conflictText(t, 'conflict.both.body', personaName, { copy: conflictCopyName(file.name) }),
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
