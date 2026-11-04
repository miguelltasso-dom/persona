/** UI model of "Revisar mudanças" (SIMPLE-WORKSPACE-SPEC). Nothing here says git, branch, diff or lines. */

import type { FileChange } from '../../primitives/index.ts'
import type { DiffOp } from './text-diff.ts'

export interface SheetCellChange {
  readonly sheet: string
  /** "C4" */
  readonly cell: string
  readonly before: string
  readonly after: string
}

/** One file the persona changed in the draft. `FileChange` already carries id, name, short folder, kind and type. */
export interface DraftFileUi extends FileChange {
  /** Text, Word, Markdown: the change as ops (from full before/after, or from the older host's patch). */
  readonly ops?: readonly DiffOp[] | undefined
  /** Spreadsheet: which cells changed. */
  readonly cells?: readonly SheetCellChange[] | undefined
  /** Image: addresses of the two versions (any URL the webview can show). */
  readonly beforeImageSrc?: string | undefined
  readonly afterImageSrc?: string | undefined
  /** The change was cut short: "Aqui vai o começo." */
  readonly truncated?: boolean | undefined
  /** PDF/other: the person can open the draft's copy (read only) from the system. */
  readonly canOpenDraft?: boolean | undefined
  /** The same file changed in the folder while the persona worked (DECISIONS: conflict per file). */
  readonly conflict?: boolean | undefined
  /** What the file says in the person's folder right now (conflict only): enables "Ver as duas versões". */
  readonly folderText?: string | undefined
}

export type ConflictChoice = 'mine' | 'theirs' | 'both'

/** What "Aplicar na pasta" is doing right now (SIMPLE-WORKSPACE-SPEC §4). Never half applied. */
export type ApplyPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'applying' }
  /** A file is open in another program (Excel, Word): ask to close it, never fail silently. */
  | { readonly kind: 'locked'; readonly file: string }
  /** A file that lives only online (OneDrive) is being downloaded first. */
  | { readonly kind: 'downloading'; readonly file: string; readonly percent?: number | undefined }
  | { readonly kind: 'failed'; readonly detail?: string | undefined }
  /** Applied; `undoable` when the earlier versions were kept. */
  | { readonly kind: 'done'; readonly undoable: boolean }
