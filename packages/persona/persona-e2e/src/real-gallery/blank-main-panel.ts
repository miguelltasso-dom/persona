import type { Page } from 'playwright'

export interface BlankMainPanelResult {
  readonly blank: boolean
  readonly mainTextLength: number
  readonly visibleBlockCount: number
  readonly detail: string
}

const DEFAULT_MIN_TEXT = 28
const DEFAULT_MIN_BLOCKS = 2

/**
 * Detect "Never blank dashboard" violations in `[data-persona-grain]` (main column only).
 * @param page - Persona shell with a panel selected.
 */
export async function measureMainPanelContent(page: Page): Promise<BlankMainPanelResult> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-persona-shell]')
    const root = shell?.children[1] ?? null
    if (root === null) {
      return { blank: true, mainTextLength: 0, visibleBlockCount: 0, detail: 'missing main column under [data-persona-shell]' }
    }
    const text = (root.textContent ?? '').replace(/\s+/g, ' ').trim()
    const selectors = [
      'h1', 'h2', 'h3', 'h4', 'p', 'button', 'a[href]',
      '[data-persona-surface]', '[data-persona-kanban]', 'article', 'li',
      '[role="tablist"]', '[role="log"]', 'textarea', 'input', 'table',
    ].join(',')
    const nodes = root.querySelectorAll(selectors)
    let visibleBlockCount = 0
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const snippet = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (snippet.length === 0 && node.tagName !== 'TEXTAREA' && node.tagName !== 'INPUT') continue
      visibleBlockCount += 1
    }
    const mainTextLength = text.length
    const detail = `text=${String(mainTextLength)} blocks=${String(visibleBlockCount)}`
    const blank = mainTextLength < 28 && visibleBlockCount < 2
    return { blank, mainTextLength, visibleBlockCount, detail }
  })
}

/**
 * @param result - output from {@link measureMainPanelContent}.
 */
export function isMainPanelBlank(
  result: BlankMainPanelResult,
  minText = DEFAULT_MIN_TEXT,
  minBlocks = DEFAULT_MIN_BLOCKS,
): boolean {
  if (result.blank) return true
  return result.mainTextLength < minText && result.visibleBlockCount < minBlocks
}

/**
 * @param page - current panel.
 * @param panelSlug - for error messages.
 */
export async function assertMainPanelNotBlank(page: Page, panelSlug: string): Promise<BlankMainPanelResult> {
  const result = await measureMainPanelContent(page)
  if (isMainPanelBlank(result)) {
    throw new Error(
      `[${panelSlug}] main panel appears blank (${result.detail}) — UX-GUIDE: never empty cream dashboard`,
    )
  }
  return result
}
