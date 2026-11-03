import type { Page } from 'playwright'

export interface KeyboardTraversalResult {
  readonly focusTags: string[]
  readonly pass: boolean
  readonly reason?: string
}

/**
 * Sample Tab order (12 stops) and fail when focus stays on `body` only or repeats one trap.
 * @param page - panel loaded.
 */
export async function probeKeyboardTraversal(page: Page, tabStops = 12): Promise<KeyboardTraversalResult> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible' })
  const focusTags: string[] = []
  for (let i = 0; i < tabStops; i += 1) {
    await page.keyboard.press('Tab')
    const tag = await page.evaluate(() => {
      const el = document.activeElement
      if (el === null || el === document.body) return 'body'
      const id = el.id ? `#${el.id}` : ''
      const name = el.getAttribute('aria-label') ?? el.getAttribute('name') ?? ''
      return `${el.tagName.toLowerCase()}${id}${name ? `[${name.slice(0, 40)}]` : ''}`
    })
    focusTags.push(tag)
  }
  const unique = new Set(focusTags.filter(t => t !== 'body'))
  if (unique.size === 0) {
    return { focusTags, pass: false, reason: 'Tab never left body — no focusable controls' }
  }
  const lastThree = focusTags.slice(-3)
  if (lastThree.every(t => t === lastThree[0]) && lastThree[0] !== 'body') {
    return { focusTags, pass: false, reason: `possible focus trap on ${lastThree[0]}` }
  }
  return { focusTags, pass: true }
}
