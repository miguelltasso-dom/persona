// SW-8 core: today's host patch → plain files, and before/after rows with no "+/−" and no hunk headers.
import { describe, expect, it } from 'vitest'
import { MOCK_REVIEW_SUMMARY, type ReviewSummaryUi } from '../src/client/review/mock-data.ts'
import { draftFilesFromReviewSummary, parseUnifiedPatch, splitPath } from '../src/client/review/simple/patch-to-changes.ts'
import { buildRows, diffLines } from '../src/client/review/simple/text-diff.ts'

const PATCH = [
  'diff --git a/Cardapio/2026/precos.md b/Cardapio/2026/precos.md',
  'index 1111111..2222222 100644',
  '--- a/Cardapio/2026/precos.md',
  '+++ b/Cardapio/2026/precos.md',
  '@@ -1,3 +1,3 @@',
  ' # Preços',
  '-Pão francês: R$ 12',
  '+Pão francês: R$ 14',
  ' Bolo: R$ 30',
  'diff --git a/notas/novo.txt b/notas/novo.txt',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/notas/novo.txt',
  '@@ -0,0 +1,2 @@',
  '+primeira',
  '+segunda',
  'diff --git a/velho.txt b/velho.txt',
  'deleted file mode 100644',
  '--- a/velho.txt',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-tchau',
  'diff --git a/logo.png b/logo.png',
  'Binary files a/logo.png and b/logo.png differ',
].join('\n')

describe('parseUnifiedPatch', () => {
  it('reads kind, path and ops per file; a "---" line inside a hunk is content, not a new file', () => {
    const files = parseUnifiedPatch(PATCH)
    expect(files.map(file => [file.path, file.kind])).toEqual([
      ['Cardapio/2026/precos.md', 'changed'],
      ['notas/novo.txt', 'new'],
      ['velho.txt', 'deleted'],
      ['logo.png', 'changed'],
    ])
    expect(files[0]?.ops).toEqual([
      { t: 'same', text: '# Preços' },
      { t: 'del', text: 'Pão francês: R$ 12' },
      { t: 'add', text: 'Pão francês: R$ 14' },
      { t: 'same', text: 'Bolo: R$ 30' },
    ])
    expect(files[3]?.binary).toBe(true)

    const tricky = parseUnifiedPatch(['--- a/a.md', '+++ b/a.md', '@@ -1,2 +1,2 @@', '--- linha que começa com traços', '+++ linha nova', ' fim'].join('\n'))
    expect(tricky).toHaveLength(1)
    expect(tricky[0]?.ops.map(op => op.t)).toEqual(['del', 'add', 'same'])
  })

  it('works without the "diff --git" lines (the mock/older shape) and marks the gap between two hunks', () => {
    const files = parseUnifiedPatch(['--- a/x.md', '+++ b/x.md', '@@ -1 +1 @@', '-a', '+b', '@@ -10 +10 @@', '-c', '+d', '--- a/y.md', '+++ b/y.md', '@@ -1 +1 @@', '-e', '+f'].join('\n'))
    expect(files.map(file => file.path)).toEqual(['x.md', 'y.md'])
    expect(files[0]?.ops.map(op => op.t)).toEqual(['del', 'add', 'gap', 'del', 'add'])
  })
})

describe('draftFilesFromReviewSummary', () => {
  const summary: ReviewSummaryUi = {
    ...MOCK_REVIEW_SUMMARY,
    files: [
      { path: 'Cardapio/2026/precos.md', added: 1, deleted: 1 },
      { path: 'notas/novo.txt', added: 2, deleted: 0 },
      { path: 'velho.txt', added: 0, deleted: 1 },
      { path: 'logo.png', added: 0, deleted: 0 },
      { path: 'grande.docx', added: 90, deleted: 4 },
    ],
    patch: PATCH,
    patchTruncated: true,
  }

  it('gives plain files: short folder, kind, type by extension; binary and cut-short files say so', () => {
    const files = draftFilesFromReviewSummary(summary)
    const byName = Object.fromEntries(files.map(file => [file.name, file]))
    expect(byName['precos.md']).toMatchObject({ name: 'precos.md', folder: 'Cardapio/2026', kind: 'changed', type: 'text' })
    expect(byName['precos.md']?.ops?.length).toBeGreaterThan(0)
    expect(byName['novo.txt']?.kind).toBe('new')
    expect(byName['velho.txt']?.kind).toBe('deleted')
    expect(byName['logo.png']).toMatchObject({ type: 'image', canOpenDraft: true })
    expect(byName['logo.png']?.ops).toBeUndefined()
    // listed but its patch was cut short: shown as changed, "Aqui vai o começo."
    expect(byName['grande.docx']).toMatchObject({ kind: 'changed', truncated: true })
  })

  it('never exposes an absolute path or a patch header', () => {
    const files = draftFilesFromReviewSummary(summary)
    expect(JSON.stringify(files)).not.toMatch(/diff --git|@@|[A-Z]:\\|\/Users\//u)
  })

  it('splitPath keeps a short folder, never more than the project-relative path', () => {
    expect(splitPath('a/b/c.docx')).toEqual({ name: 'c.docx', folder: 'a/b' })
    expect(splitPath('c.docx')).toEqual({ name: 'c.docx', folder: undefined })
  })
})

describe('per-file fields from the draft host (SW-6) win over the patch', () => {
  it('full before/after, cells, images and conflict flow into the plain files', () => {
    const summary: ReviewSummaryUi = {
      ...MOCK_REVIEW_SUMMARY,
      patch: '',
      files: [
        { path: 'Cardapio/cardapio.docx', added: 0, deleted: 0, kind: 'changed', before: 'Pão R$ 12\nBolo R$ 30\n', after: 'Pão R$ 14\nBolo R$ 30\n', conflict: true },
        { path: 'precos.xlsx', added: 0, deleted: 0, kind: 'changed', cells: [{ sheet: 'Preços', cell: 'C4', before: 'R$ 12', after: 'R$ 14' }] },
        { path: 'logo.png', added: 0, deleted: 0, kind: 'new', afterImage: 'data:image/png;base64,AAAA' },
        { path: 'contrato.pdf', added: 0, deleted: 0, kind: 'new', canOpenDraft: true },
      ],
    }
    const files = draftFilesFromReviewSummary(summary)
    const byName = Object.fromEntries(files.map(file => [file.name, file]))
    expect(byName['cardapio.docx']).toMatchObject({ folder: 'Cardapio', kind: 'changed', type: 'text', conflict: true })
    expect(byName['cardapio.docx']?.ops?.some(op => op.t === 'del' && op.text === 'Pão R$ 12')).toBe(true)
    expect(byName['precos.xlsx']?.cells).toHaveLength(1)
    expect(byName['logo.png']).toMatchObject({ kind: 'new', afterImageSrc: 'data:image/png;base64,AAAA' })
    expect(byName['contrato.pdf']).toMatchObject({ canOpenDraft: true })
  })
})

describe('text before/after rows', () => {
  it('diffLines + buildRows: removed and added lines pair up across "Antes" and "Depois"', () => {
    const ops = diffLines('# Preços\nPão: R$ 12\nBolo: R$ 30\n', '# Preços\nPão: R$ 14\nBolo: R$ 30\nTorta: R$ 40\n')
    const rows = buildRows(ops)
    expect(rows).toEqual([
      { kind: 'same', text: '# Preços' },
      { kind: 'change', before: 'Pão: R$ 12', after: 'Pão: R$ 14' },
      { kind: 'same', text: 'Bolo: R$ 30' },
      { kind: 'change', before: null, after: 'Torta: R$ 40' },
    ])
  })

  it('a new file is all "Depois"; a deleted file is all "Antes"', () => {
    expect(buildRows(diffLines('', 'a\nb\n'))).toEqual([
      { kind: 'change', before: null, after: 'a' },
      { kind: 'change', before: null, after: 'b' },
    ])
    expect(buildRows(diffLines('a\n', ''))).toEqual([{ kind: 'change', before: 'a', after: null }])
  })

  it('context collapses long unchanged stretches into one gap', () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${String(i)}`).join('\n')
    const after = before.replace('l15', 'L15')
    const rows = buildRows(diffLines(before, after), 2)
    expect(rows.filter(row => row.kind === 'gap')).toHaveLength(2)
    expect(rows.length).toBeLessThan(12)
  })

  it('huge inputs do not freeze: they fall back to "everything replaced"', () => {
    const a = Array.from({ length: 1800 }, (_, i) => `a${String(i)}`).join('\n')
    const b = Array.from({ length: 1800 }, (_, i) => `b${String(i)}`).join('\n')
    const ops = diffLines(a, b)
    expect(ops.filter(op => op.t === 'del')).toHaveLength(1800)
    expect(ops.filter(op => op.t === 'add')).toHaveLength(1800)
  })
})
