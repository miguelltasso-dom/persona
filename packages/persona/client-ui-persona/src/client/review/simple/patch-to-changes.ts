/**
 * The host that exists today sends one unified patch plus a file list. This turns it into the plain model of
 * "Revisar mudanças" — kind (Novo/Mudou/Apagado), type by extension, and before/after ops — so the new screen works
 * before the draft host (SW-6) sends full before/after content. The patch itself is never shown.
 */

import { fileTypeOf } from '../../primitives/index.ts'
import type { ReviewSummaryUi } from '../mock-data.ts'
import type { DraftFileUi } from './draft-types.ts'
import { diffLines, type DiffOp } from './text-diff.ts'

export interface ParsedFilePatch {
  readonly path: string
  readonly kind: 'new' | 'changed' | 'deleted'
  readonly ops: readonly DiffOp[]
  readonly binary: boolean
}

interface Builder {
  path: string
  oldPath: string | undefined
  kind: 'new' | 'changed' | 'deleted'
  ops: DiffOp[]
  binary: boolean
  hunks: number
  /** Lines still expected in the current hunk (old side, new side). */
  oldLeft: number
  newLeft: number
  fromGit: boolean
}

const DEV_NULL = '/dev/null'

function cleanPath(raw: string): string {
  const withoutTime = raw.split('\t')[0] ?? raw
  return withoutTime.replace(/^"|"$/g, '').replace(/^[ab]\//u, '')
}

function fresh(path: string, fromGit: boolean): Builder {
  return { path, oldPath: undefined, kind: 'changed', ops: [], binary: false, hunks: 0, oldLeft: 0, newLeft: 0, fromGit }
}

/** Reads `git diff` style patches (with or without the `diff --git` lines). */
export function parseUnifiedPatch(patch: string): readonly ParsedFilePatch[] {
  const files: ParsedFilePatch[] = []
  let cur: Builder | null = null
  const finish = (): void => {
    if (cur !== null && (cur.path !== '' || cur.ops.length > 0)) {
      files.push({ path: cur.path, kind: cur.kind, ops: cur.ops, binary: cur.binary })
    }
    cur = null
  }
  for (const line of patch.replace(/\r\n/g, '\n').split('\n')) {
    const inHunk = cur !== null && (cur.oldLeft > 0 || cur.newLeft > 0)
    if (cur !== null && inHunk) {
      if (line.startsWith('\\')) continue
      const mark = line[0] ?? ' '
      const text = line.slice(1)
      if (mark === '-') { cur.ops.push({ t: 'del', text }); cur.oldLeft -= 1; continue }
      if (mark === '+') { cur.ops.push({ t: 'add', text }); cur.newLeft -= 1; continue }
      cur.ops.push({ t: 'same', text })
      cur.oldLeft -= 1
      cur.newLeft -= 1
      continue
    }
    if (line.startsWith('diff --git ')) {
      finish()
      const match = /^diff --git a\/(.+?) b\/(.+)$/u.exec(line)
      cur = fresh(match?.[2] ?? '', true)
    } else if (line.startsWith('new file mode')) {
      if (cur !== null) cur.kind = 'new'
    } else if (line.startsWith('deleted file mode')) {
      if (cur !== null) cur.kind = 'deleted'
    } else if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      if (cur !== null) cur.binary = true
    } else if (line.startsWith('--- ')) {
      // Without `diff --git` lines a `---` after hunks starts the next file.
      if (cur === null || (!cur.fromGit && cur.hunks > 0)) {
        finish()
        cur = fresh('', false)
      }
      const raw = line.slice(4)
      cur.oldPath = raw.startsWith(DEV_NULL) ? undefined : cleanPath(raw)
      if (raw.startsWith(DEV_NULL)) cur.kind = 'new'
      if (cur.path === '' && cur.oldPath !== undefined) cur.path = cur.oldPath
    } else if (line.startsWith('+++ ')) {
      if (cur === null) cur = fresh('', false)
      const raw = line.slice(4)
      if (raw.startsWith(DEV_NULL)) cur.kind = 'deleted'
      else cur.path = cleanPath(raw)
    } else if (line.startsWith('@@')) {
      if (cur === null) cur = fresh('', false)
      const match = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/u.exec(line)
      cur.oldLeft = match?.[1] === undefined ? 1 : Number(match[1])
      cur.newLeft = match?.[2] === undefined ? 1 : Number(match[2])
      if (cur.hunks > 0) cur.ops.push({ t: 'gap' })
      cur.hunks += 1
    }
  }
  finish()
  return files
}

/** "Cardápio/2026/precos.docx" → name + short folder. */
export function splitPath(path: string): { readonly name: string; readonly folder: string | undefined } {
  const parts = path.split('/').filter(part => part !== '')
  const name = parts.at(-1) ?? path
  const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined
  return { name, folder }
}

/**
 * Review summary of today's host → the files of "Revisar mudanças".
 * A file listed without a patch section (cut short) is shown as changed, with "Aqui vai o começo.".
 */
export function draftFilesFromReviewSummary(summary: ReviewSummaryUi): readonly DraftFileUi[] {
  const parsed = new Map(parseUnifiedPatch(summary.patch).map(file => [file.path, file]))
  const seen = new Set<string>()
  const files: DraftFileUi[] = []
  const byPath = new Map(summary.files.map(file => [file.path, file]))
  const push = (path: string): void => {
    if (seen.has(path)) return
    seen.add(path)
    const { name, folder } = splitPath(path)
    const section = parsed.get(path)
    const host = byPath.get(path)
    const type = fileTypeOf(name)
    // Full before/after from the draft host wins; otherwise the older host's patch is read into the same ops.
    const fullOps = host?.before !== undefined || host?.after !== undefined ? diffLines(host.before ?? '', host.after ?? '') : undefined
    const patchShowable = section !== undefined && !section.binary && (type === 'text' || type === 'other' || type === 'sheet')
    const ops = fullOps ?? (patchShowable ? section.ops : undefined)
    const hasCells = host?.cells !== undefined && host.cells.length > 0
    const hasImages = host?.beforeImage !== undefined || host?.afterImage !== undefined
    const showable = ops !== undefined || hasCells || hasImages
    files.push({
      id: path,
      name,
      folder,
      kind: host?.kind ?? section?.kind ?? 'changed',
      type,
      ...(ops === undefined ? {} : { ops }),
      ...(hasCells ? { cells: host.cells } : {}),
      ...(host?.beforeImage === undefined ? {} : { beforeImageSrc: host.beforeImage }),
      ...(host?.afterImage === undefined ? {} : { afterImageSrc: host.afterImage }),
      ...(host?.truncated === true || (section === undefined && host?.before === undefined && summary.patchTruncated) ? { truncated: true } : {}),
      ...(host?.canOpenDraft === true || section?.binary === true || (!showable && type !== 'text') ? { canOpenDraft: true } : {}),
      ...(host?.conflict === true ? { conflict: true } : {}),
    })
  }
  for (const file of summary.files) push(file.path)
  for (const path of parsed.keys()) push(path)
  return files
}
