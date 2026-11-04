import type { Locator, Page } from 'playwright'
import { chat } from './real-app-locale.pt.ts'

/** #geral / Canais composer (WAVE2 subject placeholder + legacy channel copy). */
export function geralComposerLocator(page: Page): Locator {
  const textarea = page.locator('[data-persona-area="composer"] textarea')
  const byPlaceholder = page.getByPlaceholder(chat.composerPlaceholder)
    .or(page.getByPlaceholder(chat.composerPlaceholderLegacy))
    .or(page.getByPlaceholder(chat.composerPlaceholderInSubject))
  return textarea.or(byPlaceholder)
}

/** Wait until the channels panel mounted {@link ConnectedGeneralChannelView} composer. */
export async function waitForGeralComposer(page: Page, timeoutMs = 90_000): Promise<void> {
  await geralComposerLocator(page).first().waitFor({ state: 'visible', timeout: timeoutMs })
}
