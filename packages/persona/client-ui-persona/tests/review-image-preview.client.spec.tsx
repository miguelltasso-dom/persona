// @vitest-environment jsdom
// Atlas 07/11 (lib 6c): art the persona saves as a FILE (a poster as `cartaz.svg`, and the PNG the host makes next to it) must APPEAR in "Revisar mudanças"
// as an IMAGE, so the person sees it instead of a file name: in the list's preview, in the clash, and in the success moment. A picture is only ever an
// `<img>` of an inline address (an SVG shown that way runs no script and loads nothing), every address goes through one gate, and nothing is ever
// drawn from a half-read file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pt as reviewPt } from '../src/client/locale/review/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import type { ReviewSummaryUi } from '../src/client/review/mock-data.ts'
import { ConflictChoices } from '../src/client/review/simple/ConflictChoices.tsx'
import { DraftReviewPanel } from '../src/client/review/simple/DraftReviewPanel.tsx'
import type { DraftFileUi } from '../src/client/review/simple/draft-types.ts'
import { FilePreview } from '../src/client/review/simple/FilePreview.tsx'
import { REVIEW_IMAGE_MAX_CHARS, safeReviewImageSrc, svgTextToImageSrc } from '../src/client/review/simple/image-src.ts'
import { draftFilesFromReviewSummary, parseUnifiedPatch } from '../src/client/review/simple/patch-to-changes.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = (key: string, params?: Readonly<Record<string, string | number>>): string => bindLocale(reviewPt, key, params)

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">\n  <rect width="200" height="120" fill="#fde7c4"/><text x="20" y="70">Promoção</text>\n</svg>'
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const addedPatch = (path: string, text: string): string => {
  const lines = text.split('\n')
  return [`diff --git a/${path} b/${path}`, 'new file mode 100644', '--- /dev/null', `+++ b/${path}`, `@@ -0,0 +1,${String(lines.length)} @@`, ...lines.map(line => `+${line}`)].join('\n')
}
const deletedPatch = (path: string, text: string): string => {
  const lines = text.split('\n')
  return [`diff --git a/${path} b/${path}`, 'deleted file mode 100644', `--- a/${path}`, '+++ /dev/null', `@@ -1,${String(lines.length)} +0,0 @@`, ...lines.map(line => `-${line}`)].join('\n')
}

function summary(patch: string, files: ReviewSummaryUi['files'], extra: Partial<ReviewSummaryUi> = {}): ReviewSummaryUi {
  return { ticketId: 't1', files, added: 0, deleted: 0, patch, patchTruncated: false, patchLimitBytes: 32_768, secretsRedacted: false, testsClaimed: [], ...extra }
}

/** The SVG text back out of a `data:image/svg+xml` address. */
const svgOf = (src: string | undefined): string => decodeURIComponent((src ?? '').slice((src ?? '').indexOf(',') + 1))

describe('the gate every picture goes through', () => {
  it('lets inline pictures of a known type through, nothing else', () => {
    for (const ok of [PNG_1PX, 'data:image/jpeg;base64,AAAA', 'data:image/webp;base64,AAAA', 'data:image/gif;base64,AAAA', 'data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E', 'data:image/svg+xml;charset=utf-8,%3Csvg%3E']) {
      expect(safeReviewImageSrc(ok)).toBe(ok)
    }
    for (const bad of ['https://example.com/a.png', 'http://127.0.0.1/a.svg', 'javascript:alert(1)', 'blob:http://x/1', 'file:///C:/a.png', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64', '//evil/a.png', '', ' data:image/png;base64,AAAA']) {
      expect(safeReviewImageSrc(bad), bad).toBeUndefined()
    }
    expect(safeReviewImageSrc(undefined)).toBeUndefined()
  })

  it('refuses a picture bigger than the limit (the person opens the draft\'s copy instead)', () => {
    expect(safeReviewImageSrc(`data:image/png;base64,${'A'.repeat(REVIEW_IMAGE_MAX_CHARS)}`)).toBeUndefined()
    expect(safeReviewImageSrc(`data:image/png;base64,${'A'.repeat(1000)}`)).toBeDefined()
  })

  it('an SVG text becomes a picture only when it is a complete <svg>…</svg> (a prolog is fine; a half file is not)', () => {
    expect(svgOf(svgTextToImageSrc(SVG))).toBe(SVG)
    expect(svgTextToImageSrc(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- poster -->\n${SVG}\n`)).toBeDefined()
    expect(svgTextToImageSrc('<svg xmlns="http://www.w3.org/2000/svg"><rect/>')).toBeUndefined()
    expect(svgTextToImageSrc('Promoção de natal')).toBeUndefined()
    expect(svgTextToImageSrc('<html><body><svg></svg></body></html>')).toBeUndefined()
    expect(svgTextToImageSrc('')).toBeUndefined()
    expect(svgTextToImageSrc(`<svg>${'x'.repeat(REVIEW_IMAGE_MAX_CHARS)}</svg>`)).toBeUndefined()
  })
})

describe('an SVG the persona saved is drawn from the patch (the host sends no bytes today)', () => {
  it('a NEW poster: the whole file is in the patch, so it becomes the picture; there is no "before"', () => {
    const [file] = draftFilesFromReviewSummary(summary(addedPatch('Cartaz/cartaz.svg', SVG), [{ path: 'Cartaz/cartaz.svg', added: 3, deleted: 0 }]))
    expect(file?.kind).toBe('new')
    expect(file?.type).toBe('image')
    expect(svgOf(file?.afterImageSrc)).toBe(SVG)
    expect(file?.beforeImageSrc).toBeUndefined()
    expect(file?.canOpenDraft).toBeUndefined()
  })

  it('a DELETED poster shows what was removed (the "before")', () => {
    const [file] = draftFilesFromReviewSummary(summary(deletedPatch('antigo.svg', SVG), [{ path: 'antigo.svg', added: 0, deleted: 3 }]))
    expect(file?.kind).toBe('deleted')
    expect(svgOf(file?.beforeImageSrc)).toBe(SVG)
    expect(file?.afterImageSrc).toBeUndefined()
  })

  it('a CHANGED poster whose single hunk holds the whole file shows before and after', () => {
    const patch = [
      'diff --git a/cartaz.svg b/cartaz.svg', '--- a/cartaz.svg', '+++ b/cartaz.svg', '@@ -1,3 +1,3 @@',
      ' <svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">', '-  <rect width="200" height="120" fill="#fde7c4"/>', '+  <rect width="200" height="120" fill="#cfe8d5"/>', ' </svg>',
    ].join('\n')
    const [file] = draftFilesFromReviewSummary(summary(patch, [{ path: 'cartaz.svg', added: 1, deleted: 1 }]))
    expect(svgOf(file?.beforeImageSrc)).toContain('#fde7c4')
    expect(svgOf(file?.afterImageSrc)).toContain('#cfe8d5')
    expect(svgOf(file?.afterImageSrc).trim().endsWith('</svg>')).toBe(true)
  })

  it('a changed poster seen only in part (its hunk does not start at the top) is NOT drawn: no half-read picture', () => {
    const patch = ['diff --git a/cartaz.svg b/cartaz.svg', '--- a/cartaz.svg', '+++ b/cartaz.svg', '@@ -10,3 +10,3 @@', ' <g>', '-<rect fill="red"/>', '+<rect fill="blue"/>', ' </svg>'].join('\n')
    const [file] = draftFilesFromReviewSummary(summary(patch, [{ path: 'cartaz.svg', added: 1, deleted: 1 }]))
    expect(file?.beforeImageSrc).toBeUndefined()
    expect(file?.afterImageSrc).toBeUndefined()
    expect(file?.canOpenDraft).toBe(true)
  })

  it('a patch cut short is NOT drawn either (and the file says it was cut)', () => {
    const cut = addedPatch('cartaz.svg', SVG).split('\n').slice(0, 7).join('\n')
    const [file] = draftFilesFromReviewSummary(summary(cut, [{ path: 'cartaz.svg', added: 3, deleted: 0 }], { patchTruncated: true }))
    expect(parseUnifiedPatch(cut)[0]?.wholeFile).toBe(false)
    expect(file?.afterImageSrc).toBeUndefined()
  })

  it('an ".svg" that is not an SVG (or is a page with scripts) is not a picture', () => {
    for (const text of ['Promoção de natal', '<html><script>alert(1)</script></html>']) {
      const [file] = draftFilesFromReviewSummary(summary(addedPatch('x.svg', text), [{ path: 'x.svg', added: 1, deleted: 0 }]))
      expect(file?.afterImageSrc, text).toBeUndefined()
    }
  })

  it('a PNG has no bytes in a patch: with nothing from the host it stays a name with "Abrir o arquivo do rascunho"', () => {
    const patch = 'diff --git a/cartaz.png b/cartaz.png\nnew file mode 100644\nBinary files /dev/null and b/cartaz.png differ'
    const [file] = draftFilesFromReviewSummary(summary(patch, [{ path: 'cartaz.png', added: 0, deleted: 0 }]))
    expect(file?.type).toBe('image')
    expect(file?.afterImageSrc).toBeUndefined()
    expect(file?.canOpenDraft).toBe(true)
  })
})

describe('what the host sends for a picture passes through the same gate', () => {
  it('a data address is kept; an http(s) or javascript: one is dropped (and the file falls back to "open the draft\'s copy")', () => {
    const files = draftFilesFromReviewSummary(summary('', [
      { path: 'a.png', added: 0, deleted: 0, kind: 'new', afterImage: PNG_1PX },
      { path: 'b.png', added: 0, deleted: 0, kind: 'new', afterImage: 'https://example.com/b.png' },
      { path: 'c.png', added: 0, deleted: 0, kind: 'new', afterImage: 'javascript:alert(1)' },
    ]))
    expect(files[0]?.afterImageSrc).toBe(PNG_1PX)
    expect(files[1]?.afterImageSrc).toBeUndefined()
    expect(files[1]?.canOpenDraft).toBe(true)
    expect(files[2]?.afterImageSrc).toBeUndefined()
  })

  it('the clash picture (the folder\'s version) is read the same way', () => {
    const [file] = draftFilesFromReviewSummary(summary('', [{ path: 'logo.png', added: 0, deleted: 0, conflict: true, folderImage: PNG_1PX, afterImage: PNG_1PX }]))
    expect(file?.folderImageSrc).toBe(PNG_1PX)
    const [bad] = draftFilesFromReviewSummary(summary('', [{ path: 'logo.png', added: 0, deleted: 0, conflict: true, folderImage: 'https://example.com/x.png', afterImage: PNG_1PX }]))
    expect(bad?.folderImageSrc).toBeUndefined()
  })
})

describe('FilePreview draws a picture only as an <img>', () => {
  const svgFile = (): DraftFileUi => draftFilesFromReviewSummary(summary(addedPatch('cartaz.svg', SVG), [{ path: 'cartaz.svg', added: 3, deleted: 0 }]))[0]!

  it('one picture (a new file): one <img> with the file name, no Antes/Depois switch, and no <svg>/<script> element anywhere', () => {
    const { container } = render(<FilePreview file={svgFile()} t={t} />)
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute('alt')).toBe('cartaz.svg')
    expect(images[0]?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/u)
    expect(screen.queryByRole('group', { name: 'Ver a imagem' })).toBeNull()
    expect(container.querySelector('svg, script, object, embed, iframe')).toBeNull()
  })

  it('two pictures (before and after): both <img>, with the Antes/Depois switch for a narrow review', () => {
    const file: DraftFileUi = { id: 'logo.png', name: 'logo.png', kind: 'changed', type: 'image', beforeImageSrc: PNG_1PX, afterImageSrc: PNG_1PX }
    const { container } = render(<FilePreview file={file} t={t} />)
    expect(container.querySelectorAll('img')).toHaveLength(2)
    expect(screen.getByRole('group', { name: 'Ver a imagem' })).toBeTruthy()
  })

  it('an address that did not pass the gate is never drawn, even when it reaches the component directly', () => {
    const file: DraftFileUi = { id: 'x.png', name: 'x.png', kind: 'new', type: 'image', afterImageSrc: 'https://example.com/x.png' }
    const { container } = render(<FilePreview file={file} t={t} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(reviewPt['preview.unavailable'])).toBeTruthy()
  })
})

describe('the poster and its PNG, side by side in the list (two rows, each with its picture)', () => {
  const pair = (): readonly DraftFileUi[] => draftFilesFromReviewSummary(summary(
    addedPatch('Cartaz/cartaz.svg', SVG),
    [{ path: 'Cartaz/cartaz.svg', added: 3, deleted: 0 }, { path: 'Cartaz/cartaz.png', added: 0, deleted: 0, kind: 'new', afterImage: PNG_1PX }],
  ))

  it('lists BOTH files, and selecting each shows its own picture', () => {
    expect(pair().map(file => file.name)).toEqual(['cartaz.svg', 'cartaz.png'])
    render(<PreviewFrame brandLabel="Persona"><DraftReviewPanel personaName="Bia" files={pair()} onApply={() => {}} /></PreviewFrame>)
    const panel = screen.getByTestId('review-panel')
    // the first file (the SVG) is open: its picture is on screen
    expect(panel.querySelector('img[src^="data:image/svg+xml"]')).not.toBeNull()
    fireEvent.click(within(panel).getByRole('option', { name: /cartaz\.png/u }))
    expect(panel.querySelector('img[src^="data:image/png"]')).not.toBeNull()
  })

  it('the success moment shows what was applied as thumbnails (at most three, none for a deleted file)', () => {
    const files = [...pair(), ...draftFilesFromReviewSummary(summary(deletedPatch('velho.svg', SVG), [{ path: 'velho.svg', added: 0, deleted: 3 }]))]
    render(<PreviewFrame brandLabel="Persona"><DraftReviewPanel personaName="Bia" files={files} phase={{ kind: 'done', undoable: true }} onApply={() => {}} /></PreviewFrame>)
    const pictures = screen.getByTestId('review-applied-pictures')
    expect(within(pictures).getAllByRole('img').map(image => image.getAttribute('alt'))).toEqual(['cartaz.svg', 'cartaz.png'])
  })

  it('no pictures applied (text only) = no thumbnails row', () => {
    const text: DraftFileUi = { id: 'a.md', name: 'a.md', kind: 'changed', type: 'text' }
    render(<PreviewFrame brandLabel="Persona"><DraftReviewPanel personaName="Bia" files={[text]} phase={{ kind: 'done', undoable: false }} onApply={() => {}} /></PreviewFrame>)
    expect(screen.queryByTestId('review-applied-pictures')).toBeNull()
  })
})

describe('a clash on a picture shows both pictures', () => {
  const clash = (extra: Partial<DraftFileUi> = {}): DraftFileUi => ({ id: 'logo.png', name: 'logo.png', kind: 'changed', type: 'image', conflict: true, afterImageSrc: PNG_1PX, ...extra })

  it('the folder\'s picture and the draft\'s, as two <img>', () => {
    render(<ConflictChoices files={[clash({ folderImageSrc: PNG_1PX })]} personaName={undefined} choices={{}} onChoose={() => {}} t={t} />)
    expect(within(screen.getByTestId('review-conflict-images')).getAllByRole('img')).toHaveLength(2)
  })

  it('without the folder\'s picture there is nothing to compare (the choices stay)', () => {
    render(<ConflictChoices files={[clash()]} personaName={undefined} choices={{}} onChoose={() => {}} t={t} />)
    expect(screen.queryByTestId('review-conflict-images')).toBeNull()
    expect(screen.getByTestId('review-conflict')).toBeTruthy()
  })
})

describe('layout rules the DOM cannot show (no layout in jsdom)', () => {
  const css = (path: string): string => readFileSync(join(__dirname, '..', 'src', 'client', 'review', 'simple', path), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

  it('one picture takes the whole row', () => {
    expect(css('FilePreview.module.css')).toMatch(/\.image\[data-single\] \.imagePair\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/u)
  })

  it('the success thumbnails go away on a short window (200 % zoom keeps the title and both buttons in view)', () => {
    const panel = css('DraftReview.module.css')
    const media = /@media \(max-height: 36rem\)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/u.exec(panel)?.[1] ?? ''
    expect(media).toMatch(/\.donePictures\s*\{[^}]*display:\s*none/u)
  })
})
