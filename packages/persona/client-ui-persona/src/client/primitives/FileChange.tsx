/**
 * FileChangeRow (Muse, design/SIMPLE-WORKSPACE-SPEC.md §3): one file in "Revisar mudanças", in plain words —
 * type icon, file name, short folder, Novo/Mudou/Apagado chip (never "+/− linhas"), optional expand to see
 * before/after. `summarizeFileChanges` writes the header line in words.
 */

import type { ReactNode } from 'react'
import { Chip } from './Chip.tsx'
import { UiIcon, type UiIconName } from './icons.tsx'
import styles from './FileChange.module.css'

export type FileChangeKind = 'new' | 'changed' | 'deleted'
export type FileType = 'text' | 'sheet' | 'image' | 'pdf' | 'other'

export interface FileChange {
  readonly id: string
  readonly name: string
  /** Short folder relative to the project ("Cardápio/2026"); never an absolute path. */
  readonly folder?: string | undefined
  readonly kind: FileChangeKind
  readonly type: FileType
}

export interface FileChangeLabels {
  readonly kind: Readonly<Record<FileChangeKind, string>>
  /** "Este arquivo sai da pasta" */
  readonly deletedNote: string
  readonly show: string
  readonly hide: string
}

const TYPE_ICON: Readonly<Record<FileType, UiIconName>> = { text: 'fileText', sheet: 'fileSheet', image: 'image', pdf: 'file', other: 'file' }
const KIND_TONE = { new: 'success', changed: 'info', deleted: 'danger' } as const

/** Guess the type from the extension (presentation only). */
export function fileTypeOf(name: string): FileType {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (['txt', 'md', 'doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'text'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

export interface FileChangeSummaryLabels {
  /** "{count} arquivos" / "1 arquivo" */
  readonly files: (count: number) => string
  readonly new: (count: number) => string
  readonly changed: (count: number) => string
  readonly deleted: (count: number) => string
}

/** "3 arquivos: 1 novo, 2 mudaram" — words, never line counts. */
export function summarizeFileChanges(changes: readonly FileChange[], l: FileChangeSummaryLabels): string {
  const count = (k: FileChangeKind): number => changes.filter(c => c.kind === k).length
  const parts = ([['new', l.new], ['changed', l.changed], ['deleted', l.deleted]] as const)
    .filter(([k]) => count(k) > 0)
    .map(([k, f]) => f(count(k)))
  return parts.length === 0 ? l.files(changes.length) : `${l.files(changes.length)}: ${parts.join(', ')}`
}

export interface FileChangeRowProps {
  readonly change: FileChange
  readonly labels: FileChangeLabels
  readonly expanded?: boolean
  readonly onToggle?: (() => void) | undefined
  /** Before/after content, shown when expanded. */
  readonly children?: ReactNode
}

export function FileChangeRow({ change, labels, expanded = false, onToggle, children }: FileChangeRowProps): ReactNode {
  const panelId = `file-change-${change.id}`
  const head = (
    <>
      <span className={styles.icon} aria-hidden="true"><UiIcon name={TYPE_ICON[change.type]} size={20} strokeWidth={1.9} /></span>
      <span className={styles.text}>
        <span className={styles.name}>{change.name}</span>
        {change.folder !== undefined && <span className={styles.folder}>{change.folder}</span>}
        {change.kind === 'deleted' && <span className={styles.note}>{labels.deletedNote}</span>}
      </span>
      <Chip size="s" tone={KIND_TONE[change.kind]}>{labels.kind[change.kind]}</Chip>
      {onToggle !== undefined && <span className={styles.chevron} data-open={expanded ? '' : undefined} aria-hidden="true"><UiIcon name="chevronDown" size={18} strokeWidth={2} /></span>}
    </>
  )
  return (
    <li className={styles.row} data-kind={change.kind}>
      {onToggle !== undefined ? (
        <button type="button" className={styles.head} aria-expanded={expanded} aria-controls={expanded ? panelId : undefined} onClick={onToggle}>
          {head}
          <span className="persona-sr-only">{expanded ? labels.hide : labels.show}</span>
        </button>
      ) : <div className={styles.head}>{head}</div>}
      {expanded && children !== undefined && <div id={panelId} className={styles.panel}>{children}</div>}
    </li>
  )
}
