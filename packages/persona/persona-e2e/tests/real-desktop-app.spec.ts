/**
 * B8 Tier 2 — desktop (Electron via CDP, dev): onboarding → #geral (envia e recebe) → Quadros, com a ponte nativa
 * (`window.personaDesktop`: seletor de pasta do BYC-3c) e capturas do renderer e do SO. Sem IA real (CLI fake / scriptado).
 * Pula limpo se o binário do Electron não estiver instalado. Uma instância pesada: rode sob a trava `build`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertConsoleClean, watchConsole } from '../src/console-tripwire.ts'
import { osScreenshot, resolveElectronBinary, startDesktop } from '../src/desktop-host.ts'
import { captureDir } from '../src/gauge-app.ts'
import { completeOnboardingOverlay } from '../src/real-app-session.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('B8 Tier 2 — desktop: onboarding + #geral + Quadros + ponte nativa', () => {
  it('[B8-5] o app Electron abre no onboarding, termina, conversa no #geral, abre os Quadros e expõe o seletor de pasta nativo', async (ctx) => {
    if (resolveElectronBinary() === undefined) ctx.skip('Electron não instalado (pnpm --filter @deepseek-ai/dsh-desktop exec install-electron)')
    const dir = await captureDir('desktop')
    const desktop = await startDesktop()
    try {
      const tripwire = watchConsole(desktop.page)
      await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await completeOnboardingOverlay(desktop.page)
      await desktop.page.screenshot({ path: join(dir, 'desktop-geral-renderer.png') })
      await osScreenshot(join(dir, 'desktop-geral-os.png'))

      const bridge = await desktop.page.evaluate(() => {
        const api = (window as unknown as { personaDesktop?: { pickDirectory?: unknown } }).personaDesktop
        return { present: api !== undefined, pickDirectory: typeof api?.pickDirectory }
      })
      expect(bridge.present, 'window.personaDesktop (preload) ausente no Electron').toBe(true)
      expect(bridge.pickDirectory, 'seletor de pasta nativo (BYC-3c)').toBe('function')

      const composer = desktop.page.getByPlaceholder(/Mensagem em|Escreva uma mensagem/u).first()
      await composer.fill('preciso de um README no projeto desktop')
      await desktop.page.keyboard.press('Enter')
      await desktop.page.getByText('preciso de um README no projeto desktop').first().waitFor({ state: 'visible', timeout: 20_000 })
      await expect.poll(async () => await desktop.page.locator('li[data-message-id]').count(), { timeout: 60_000, message: 'sem resposta no desktop' }).toBeGreaterThanOrEqual(3)

      await navigateGalleryPanel(desktop.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'kanban')!)
      await desktop.page.locator('[data-persona-surface="boards"]').waitFor({ state: 'visible', timeout: 60_000 })
      await desktop.page.screenshot({ path: join(dir, 'desktop-quadros-renderer.png') })
      expect(existsSync(join(dir, 'desktop-quadros-renderer.png'))).toBe(true)
      assertConsoleClean(tripwire)
    } finally {
      await desktop.stop()
    }
  }, 900_000)
})
