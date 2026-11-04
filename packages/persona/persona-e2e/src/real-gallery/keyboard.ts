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
  const identities: string[] = []
  for (let i = 0; i < tabStops; i += 1) {
    await page.keyboard.press('Tab')
    // Identity, not tag: three unlabeled `button`s in a row are three different stops, not a trap.
    const stop = await page.evaluate(() => {
      const el = document.activeElement
      if (el === null || el === document.body) return { tag: 'body', identity: 'body' }
      let identity = el.getAttribute('data-gauge-tab')
      if (identity === null) {
        identity = `g${String(Math.random()).slice(2, 10)}`
        el.setAttribute('data-gauge-tab', identity)
      }
      const id = el.id ? `#${el.id}` : ''
      const name = el.getAttribute('aria-label') ?? el.getAttribute('name') ?? ''
      return { tag: `${el.tagName.toLowerCase()}${id}${name ? `[${name.slice(0, 40)}]` : ''}`, identity }
    })
    focusTags.push(stop.tag)
    identities.push(stop.identity)
  }
  const unique = new Set(identities.filter(item => item !== 'body'))
  if (unique.size === 0) {
    return { focusTags, pass: false, reason: 'Tab never left body — no focusable controls' }
  }
  const lastThree = identities.slice(-3)
  if (lastThree.every(item => item === lastThree[0]) && lastThree[0] !== 'body') {
    return { focusTags, pass: false, reason: `possible focus trap on ${focusTags[focusTags.length - 1] ?? '?'}` }
  }
  return { focusTags, pass: true }
}
