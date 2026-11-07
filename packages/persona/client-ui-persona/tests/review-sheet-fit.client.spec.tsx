// @vitest-environment jsdom
// "Revisar mudanças" must fit its window (bundle 5, pre-accept `dialogo`, Muse 07/11 — a blocker): the box never passes the screen, and at 200 % zoom the
// title and "Voltar ao quadro" of the success moment are never cut. jsdom has no layout, so this pins the CSS rules that made the real browser
// measure 866 px in an 842 px area (828 + padding + border: `max-height` with `content-box`, from `92vh` of a window the fixed backdrop is not),
// and the structure that lets the title and the close button stay put while only the body scrolls. The measurement itself is the pre-accept's `dialogo`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { REVIEW_DEV_TASK_TITLE, REVIEW_DEV_TICKET_ID } from '../src/client/review/review-dev-sample.ts'
import { KanbanReviewSheet } from '../src/client/review/KanbanReviewSheet.tsx'

installPreviewTheme()
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('persona.devSeed.v1', '1')
  localStorage.setItem('persona.devSeed.review', '1')
})
afterEach(() => { cleanup(); localStorage.clear() })

const reviewDir = join(__dirname, '..', 'src', 'client', 'review')
const read = (path: string): string => readFileSync(join(reviewDir, path), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
const sheetCss = read('KanbanReviewSheet.module.css')
const panelCss = read('simple/DraftReview.module.css')

/** The declarations of the FIRST top-level rule with exactly this selector (outside any @media). */
function rule(css: string, selector: string): string {
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(topLevel)
  expect(found, `rule ${selector}`).not.toBeNull()
  return found?.[1] ?? ''
}

/** The declarations of `selector` inside the first `@media` whose condition contains `condition`. */
function mediaRule(css: string, condition: string, selector: string): string {
  const escapedCondition = condition.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const block = new RegExp(`@media[^{]*${escapedCondition}[^{]*\\{((?:[^{}]*\\{[^{}]*\\})*)[^{}]*\\}`, 'u').exec(css)
  expect(block, `@media ${condition}`).not.toBeNull()
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const found = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(block?.[1] ?? '')
  expect(found, `${selector} in @media ${condition}`).not.toBeNull()
  return found?.[1] ?? ''
}

describe('the sheet is sized by its own backdrop, never by the window', () => {
  it('no viewport unit anywhere: `position: fixed` resolves against the transformed page area (58 px shorter than the window), so vh/dvh is the wrong box', () => {
    expect(sheetCss).not.toMatch(/\d(?:d|s|l)?vh\b/u)
  })

  it('the sheet counts its padding and border in `max-height: 100%` (content-box made 828 + 38 = 866 px) and clips, so only the body scrolls', () => {
    const sheet = rule(sheetCss, '.sheet')
    expect(sheet).toMatch(/box-sizing:\s*border-box/u)
    expect(sheet).toMatch(/max-height:\s*100%/u)
    expect(sheet).toMatch(/display:\s*flex/u)
    expect(sheet).toMatch(/flex-direction:\s*column/u)
    expect(sheet).toMatch(/overflow:\s*hidden/u)
    expect(sheet).toMatch(/min-height:\s*0/u)
  })

  it('the backdrop is border-box too (its padding is the margin around the sheet)', () => {
    expect(rule(sheetCss, '.backdrop')).toMatch(/box-sizing:\s*border-box/u)
  })

  it('the body is the only scroller: it shrinks (min-height 0) and keeps focus rings/shadows inside', () => {
    const body = rule(sheetCss, '.sheetBody')
    expect(body).toMatch(/flex:\s*1 1 auto/u)
    expect(body).toMatch(/min-height:\s*0/u)
    expect(body).toMatch(/overflow:\s*auto/u)
    expect(body).toMatch(/overscroll-behavior:\s*contain/u)
  })

  it('the header never shrinks (the title and the close button stay put)', () => {
    expect(rule(sheetCss, '.sheetHeader')).toMatch(/flex:\s*0 0 auto/u)
  })

  it('the sticky action bar has an opaque skirt in the sheet\'s own colour, so no text shows in the 4 px strip below it', () => {
    expect(rule(sheetCss, '.sheet')).toMatch(/--review-bar-skirt:\s*var\(--persona-active-surface\)/u)
    expect(rule(panelCss, '.bar')).toMatch(/box-shadow:\s*var\(--persona-shadow-sticker\),\s*0 4px 0 0 var\(--review-bar-skirt, transparent\)/u)
  })

  it('short windows (640×360 at 200 % zoom) lose chrome so the body keeps the room', () => {
    expect(mediaRule(sheetCss, 'max-height: 36rem', '.backdrop')).toMatch(/padding:\s*0\.5rem/u)
    expect(mediaRule(sheetCss, 'max-height: 36rem', '.sheet')).toMatch(/padding:\s*0\.5rem 1rem 0\.75rem/u)
  })
})

describe('the success moment keeps its title and "Voltar ao quadro" in reach', () => {
  it('the actions stick to the bottom of the scroller when the moment is taller than it', () => {
    const actions = rule(panelCss, '.done .actions')
    expect(actions).toMatch(/position:\s*sticky/u)
    expect(actions).toMatch(/bottom:\s*0/u)
  })

  it('on a short window the art goes to its small size (88 px, not 240) and the type tightens', () => {
    expect(mediaRule(panelCss, 'max-height: 36rem', '.doneArt')).toMatch(/width:\s*88px/u)
    expect(mediaRule(panelCss, 'max-height: 36rem', '.done')).toMatch(/padding:\s*var\(--persona-space-1\) var\(--persona-space-4\)/u)
    expect(rule(panelCss, '.doneArt')).toMatch(/width:\s*min\(240px, 60%\)/u)
  })
})

function mountSheet(): ReturnType<typeof render> {
  const persona = {} as PersonaRemoteClient
  return render(
    <PreviewFrame brandLabel="Persona">
      <KanbanReviewSheet
        persona={persona}
        scope={{ workspaceId: 'ws', projectId: 'proj-site' }}
        ticketId={REVIEW_DEV_TICKET_ID}
        taskTitle={REVIEW_DEV_TASK_TITLE}
        onClose={() => {}}
        onMutate={() => {}}
      />
    </PreviewFrame>,
  )
}

describe('the sheet structure: the header is fixed, the panel scrolls inside the body', () => {
  it('list, clash and success all live inside the one scroller; the title and the close button never do', async () => {
    mountSheet()
    const dialog = await screen.findByRole('dialog', { name: REVIEW_DEV_TASK_TITLE })
    const body = within(dialog).getByTestId('review-sheet-body')
    const title = within(dialog).getByRole('heading', { name: REVIEW_DEV_TASK_TITLE })
    const close = within(dialog).getByRole('button', { name: 'Fechar' })
    expect(body.contains(title)).toBe(false)
    expect(body.contains(close)).toBe(false)

    // the list, with the action bar (the three actions are inside the scroller, stuck to its bottom)
    await within(body).findByTestId('review-panel', undefined, { timeout: 4000 })
    expect(body.contains(within(dialog).getByTestId('review-bar'))).toBe(true)
    expect(body.contains(within(dialog).getByTestId('review-apply'))).toBe(true)

    // the clash
    fireEvent.click(within(dialog).getByTestId('review-apply'))
    await within(body).findByTestId('review-conflict', undefined, { timeout: 4000 })
    expect(body.contains(within(dialog).getByTestId('review-bar'))).toBe(true)

    // the success: the way out is in the body too, and the title is still outside it
    fireEvent.click(document.querySelector('input[type="radio"][value="both"]') as HTMLInputElement)
    fireEvent.click(within(dialog).getByTestId('review-apply'))
    await within(body).findByTestId('review-applied', undefined, { timeout: 4000 })
    await waitFor(() => { expect(within(body).getByTestId('review-leave')).toBeTruthy() })
    expect(body.contains(within(dialog).getByRole('heading', { name: REVIEW_DEV_TASK_TITLE }))).toBe(false)
  })
})
