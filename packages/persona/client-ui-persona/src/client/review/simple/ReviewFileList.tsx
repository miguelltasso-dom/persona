/**
 * The files of a draft as a selectable list (REVIEW-APPROVALS-REDESIGN §1): `role="listbox"`, ↑ ↓ Home End move the
 * selection (and the focus), Enter / Space pick one. Type icon, name, short folder, Novo / Mudou / Apagado chip — never
 * colour alone — and an amber dot on the file that needs a choice.
 */

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Chip, UiIcon, type ChipTone, type FileChangeKind, type FileType, type UiIconName } from '../../primitives/index.ts'
import type { DraftFileUi } from './draft-types.ts'
import styles from './ReviewFileList.module.css'

const TYPE_ICON: Readonly<Record<FileType, UiIconName>> = { text: 'fileText', sheet: 'fileSheet', image: 'image', pdf: 'file', other: 'file' }
const KIND_TONE: Readonly<Record<FileChangeKind, ChipTone>> = { new: 'success', changed: 'info', deleted: 'danger' }

export interface ReviewFileListLabels {
  readonly heading: string
  readonly kind: Readonly<Record<FileChangeKind, string>>
  /** "Este arquivo sai da pasta" */
  readonly deletedNote: string
  /** "Escolha o que fica" — the badge of a file in conflict. */
  readonly conflict: string
}

export interface ReviewFileListProps {
  readonly files: readonly DraftFileUi[]
  readonly selectedId: string
  readonly onSelect: (fileId: string) => void
  readonly labels: ReviewFileListLabels
}

export function ReviewFileList({ files, selectedId, onSelect, labels }: ReviewFileListProps): ReactNode {
  const listRef = useRef<HTMLUListElement>(null)

  const move = (index: number): void => {
    const target = files[Math.max(0, Math.min(files.length - 1, index))]
    if (target === undefined) return
    onSelect(target.id)
    // Focus follows the selection (after React paints the new tabIndex).
    window.requestAnimationFrame(() => {
      const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')
      options?.[Math.max(0, Math.min(files.length - 1, index))]?.focus()
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number, file: DraftFileUi): void => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(index + 1); break
      case 'ArrowUp': event.preventDefault(); move(index - 1); break
      case 'Home': event.preventDefault(); move(0); break
      case 'End': event.preventDefault(); move(files.length - 1); break
      case 'Enter':
      case ' ': event.preventDefault(); onSelect(file.id); break
      default: break
    }
  }

  return (
    <ul className={styles.list} role="listbox" aria-label={labels.heading} ref={listRef} data-testid="review-file-list">
      {files.map((file, index) => {
        const selected = file.id === selectedId
        const needsChoice = file.conflict === true
        return (
          <li
            key={file.id}
            role="option"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.option}
            data-selected={selected ? '' : undefined}
            data-kind={file.kind}
            data-testid="review-file"
            data-file-id={file.id}
            onClick={() => { onSelect(file.id) }}
            onKeyDown={(event) => { onKeyDown(event, index, file) }}
          >
            <span className={styles.icon} aria-hidden="true"><UiIcon name={TYPE_ICON[file.type]} size={20} strokeWidth={1.9} /></span>
            <span className={styles.text}>
              <span className={styles.name}>{file.name}</span>
              {file.folder !== undefined && <span className={styles.folder}>{file.folder}</span>}
              {file.kind === 'deleted' && <span className={styles.note}>{labels.deletedNote}</span>}
            </span>
            <Chip size="s" tone={needsChoice ? 'warning' : KIND_TONE[file.kind]}>{needsChoice ? labels.conflict : labels.kind[file.kind]}</Chip>
            {needsChoice && <span className={styles.dot} aria-hidden="true" />}
          </li>
        )
      })}
    </ul>
  )
}
