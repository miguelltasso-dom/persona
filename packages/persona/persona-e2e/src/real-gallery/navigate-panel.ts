import type { Page } from 'playwright'
import type { GalleryPanelSpec } from './panels.ts'

const MORE_PANELS = new Set(['membros', 'perfil', 'importar', 'canvas'])

/**
 * Navigate via Muse grouped rail (expand "Mais" when needed).
 */
export async function navigateGalleryPanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  if (spec.kind !== 'nav' && spec.kind !== 'settings') return

  if (spec.slug === 'busca') {
    await page.getByRole('button', { name: 'Buscar em tudo…' }).click()
    await page.waitForTimeout(600)
    return
  }

  if (MORE_PANELS.has(spec.slug)) {
    const mais = page.getByRole('button', { name: 'Mais', exact: true })
    if (await mais.count() > 0) {
      const expanded = await mais.getAttribute('aria-expanded')
      if (expanded !== 'true') await mais.click()
    }
  }

  if (spec.kind === 'settings') {
    await page.getByRole('button', { name: /configura/i }).first().click()
  } else {
    await page.getByRole('button', { name: spec.navLabel, exact: true }).click()
  }

  if (spec.slug === 'geral' || spec.slug === 'canais') {
    await page.getByPlaceholder('Mensagem para #geral…').waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  } else if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  } else {
    await page.waitForTimeout(800)
  }
}
