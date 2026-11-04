/**
 * Before/after of a text file, in plain rows (SIMPLE-WORKSPACE-SPEC §3). No `+`/`−`, no hunk headers: the screen
 * shows what left (struck, red tint) and what came in (underlined, green tint) side by side.
 */

export type DiffOp =
  | { readonly t: 'same'; readonly text: string }
  | { readonly t: 'del'; readonly text: string }
  | { readonly t: 'add'; readonly text: string }
  /** Unshown stretch between two changes. */
  | { readonly t: 'gap' }

/** One aligned row: the left cell is "Antes", the right cell is "Depois". `null` = nothing on that side. */
export type DiffRow =
  | { readonly kind: 'same'; readonly text: string }
  | { readonly kind: 'change'; readonly before: string | null; readonly after: string | null }
  | { readonly kind: 'gap' }

/** Above this many cells the LCS would be slow in a UI thread: fall back to "everything replaced". */
const MAX_LCS_CELLS = 2_000_000

function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** Line diff of two whole texts (SW-6 gives full before/after; the older host only gives a patch → see parseUnifiedPatch). */
export function diffLines(before: string, after: string): readonly DiffOp[] {
  const a = splitLines(before)
  const b = splitLines(after)
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map((text): DiffOp => ({ t: 'del', text })), ...b.map((text): DiffOp => ({ t: 'add', text }))]
  }
  // Longest common subsequence table, filled from the end so the walk below runs forward.
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ t: 'same', text: a[i]! })
      i += 1
      j += 1
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ t: 'del', text: a[i]! })
      i += 1
    } else {
      ops.push({ t: 'add', text: b[j]! })
      j += 1
    }
  }
  for (; i < a.length; i += 1) ops.push({ t: 'del', text: a[i]! })
  for (; j < b.length; j += 1) ops.push({ t: 'add', text: b[j]! })
  return ops
}

/**
 * Align ops into rows: unchanged lines span both columns; a removed run and the added run that follows it are
 * paired line by line, so "Antes" and "Depois" read across.
 * @param context - unchanged lines kept around a change; the rest collapse into one gap row (0 = keep all).
 */
export function buildRows(ops: readonly DiffOp[], context = 0): readonly DiffRow[] {
  const rows: DiffRow[] = []
  let removed: string[] = []
  let added: string[] = []
  const flush = (): void => {
    const count = Math.max(removed.length, added.length)
    for (let k = 0; k < count; k += 1) rows.push({ kind: 'change', before: removed[k] ?? null, after: added[k] ?? null })
    removed = []
    added = []
  }
  for (const op of ops) {
    if (op.t === 'del') removed.push(op.text)
    else if (op.t === 'add') added.push(op.text)
    else {
      flush()
      rows.push(op.t === 'gap' ? { kind: 'gap' } : { kind: 'same', text: op.text })
    }
  }
  flush()
  return context > 0 ? collapseUnchanged(rows, context) : rows
}

function collapseUnchanged(rows: readonly DiffRow[], context: number): readonly DiffRow[] {
  const keep = new Array<boolean>(rows.length).fill(false)
  rows.forEach((row, index) => {
    if (row.kind === 'same') return
    for (let k = Math.max(0, index - context); k <= Math.min(rows.length - 1, index + context); k += 1) keep[k] = true
  })
  const out: DiffRow[] = []
  rows.forEach((row, index) => {
    if (keep[index] === true) out.push(row)
    else if (out.at(-1)?.kind !== 'gap') out.push({ kind: 'gap' })
  })
  return out
}
