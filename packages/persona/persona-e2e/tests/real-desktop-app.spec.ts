/**
 * B8 Tier 2 — desktop (Electron via CDP): onboarding → equipe → #geral (envia e recebe) → Quadros, com a ponte nativa
 * (`window.personaDesktop`: seletor de pasta do BYC-3c) e capturas do renderer e do SO. Sem IA real (CLI fake).
 *
 * Dois alvos, o mesmo roteiro:
 *   - **Setup instalado** quando `PERSONA_INSTALLED_EXE=<Persona.exe>` existe (é o que o aceite do instalador precisa: o
 *     binário NSIS de verdade, via `startInstalledDesktop`, o mesmo lançador do Probe);
 *   - **Electron de desenvolvimento** (`startDesktop`) como reserva. Pula limpo se o binário do Electron não estiver instalado.
 * O onboarding escolhe a equipe em branco, e uma equipe em branco não responde: o teste contrata a equipe sugerida como um usuário faz.
 * Uma instância pesada: rode sob a trava `build`.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertConsoleClean, watchConsole } from '../src/console-tripwire.ts'
import { osScreenshot, resolveElectronBinary, startDesktop } from '../src/desktop-host.ts'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { blockingAxe, captureDir, hireSuggestedTeam } from '../src/gauge-app.ts'
import { scanAccessibility } from '../src/axe-check.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { completeOnboardingOverlay } from '../src/real-app-session.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'

const run = process.env.PERSONA_E2E === '1'
const installedExe = process.env.PERSONA_INSTALLED_EXE
const useInstalled = installedExe !== undefined && installedExe !== '' && existsSync(installedExe)

describe.skipIf(!run)(`B8 Tier 2 — desktop (${useInstalled ? 'Setup instalado' : 'Electron de dev'}): onboarding + equipe + #geral + Quadros + ponte nativa`, () => {
  it('[B8-5] o app abre no onboarding, termina, contrata a equipe, conversa no #geral, abre os Quadros e expõe o seletor de pasta nativo', async (ctx) => {
    if (!useInstalled && resolveElectronBinary() === undefined) ctx.skip('Electron não instalado (pnpm --filter @deepseek-ai/dsh-desktop exec install-electron) e PERSONA_INSTALLED_EXE ausente')
    const dir = await captureDir(useInstalled ? 'desktop-installed' : 'desktop')
    const scope = withFakeCliOnPath({ turnMs: 800 })
    const desktop = useInstalled ? await startInstalledDesktop({ exe: installedExe! }) : await startDesktop()
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

      await hireSuggestedTeam(desktop.page)
      await navigateGalleryPanel(desktop.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!)
      const composer = desktop.page.getByPlaceholder(/Mensagem em|Escreva uma mensagem/u).first()
      await composer.fill('preciso de um README no projeto desktop')
      await desktop.page.keyboard.press('Enter')
      await desktop.page.getByText('preciso de um README no projeto desktop').first().waitFor({ state: 'visible', timeout: 20_000 })
      await expect.poll(async () => await desktop.page.locator('li[data-message-id]').count(), { timeout: 60_000, message: 'sem resposta no desktop' }).toBeGreaterThanOrEqual(3)
      await desktop.page.screenshot({ path: join(dir, 'desktop-geral-resposta.png') })

      await navigateGalleryPanel(desktop.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'kanban')!)
      await desktop.page.locator('[data-persona-surface="boards"]').waitFor({ state: 'visible', timeout: 60_000 })
      await desktop.page.screenshot({ path: join(dir, 'desktop-quadros-renderer.png') })
      expect(existsSync(join(dir, 'desktop-quadros-renderer.png'))).toBe(true)
      assertConsoleClean(tripwire)
    } finally {
      await desktop.stop()
      scope.restore()
    }
  }, 900_000)
})

/** The theme the INSTALLED app really renders: pinned by the app (PERSONA_THEME -> nativeTheme), never overridden by the test. */
const MEASURE_THEME = `(() => {
  const shell = document.querySelector('[data-persona-shell]')
  return {
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    bodyAttr: document.body.getAttribute('data-ds-dark-theme'),
    htmlHasAttr: document.documentElement.hasAttribute('data-ds-dark-theme'),
    shellBg: shell ? getComputedStyle(shell).backgroundColor : '',
  }
})()`

const luminanceOf = (rgb: string): number => {
  const [r = 0, g = 0, b = 0] = (/rgba?\((\d+),\s*(\d+),\s*(\d+)/u.exec(rgb) ?? []).slice(1).map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

describe.skipIf(!run)(`B8 Tier 2 — tema REAL do app (${useInstalled ? 'Setup instalado' : 'Electron de dev'}): claro e escuro pelo próprio app + axe`, () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`[B8-6] tema ${theme} REAL: prefers-color-scheme resolvido pelo app, atributo no <body> (${theme === 'dark' ? '"true"' : 'ausente'}), fundo do shell ${theme === 'dark' ? 'escuro' : 'creme'} e axe sem crítico/sério em #geral, Quadros, Conexões e Configurações`, async (ctx) => {
      if (!useInstalled && resolveElectronBinary() === undefined) ctx.skip('Electron não instalado e PERSONA_INSTALLED_EXE ausente')
      const dir = await captureDir(useInstalled ? 'desktop-installed' : 'desktop')
      const scope = withFakeCliOnPath({ turnMs: 800 })
      const env = { PERSONA_THEME: theme }
      const desktop = useInstalled ? await startInstalledDesktop({ exe: installedExe!, env }) : await startDesktop({ env })
      try {
        const { page } = desktop
        await page.emulateMedia({ colorScheme: null }) // Playwright emulates LIGHT by default: never override the app's own theme
        await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
        await completeOnboardingOverlay(page)
        await page.emulateMedia({ colorScheme: null })
        await page.waitForTimeout(1_000)
        const seen = await page.evaluate(MEASURE_THEME) as { prefersDark: boolean; bodyAttr: string | null; htmlHasAttr: boolean; shellBg: string }
        // The evidence of HOW the app was launched and what it printed (the theme pin is the main process's: `PERSONA_THEME` in its env -> `nativeTheme.themeSource`): kept beside the captures.
        writeFileSync(join(dir, `theme-${theme}-boot.log`), `PERSONA_THEME=${env.PERSONA_THEME} home=${desktop.home} userData=${desktop.userData}\nseen=${JSON.stringify(seen)}\n---\n${desktop.log().slice(-8_000)}\n`)
        expect(seen.prefersDark, `o app resolveu prefers-color-scheme ${theme}`).toBe(theme === 'dark')
        if (theme === 'dark') expect(seen.bodyAttr, 'data-ds-dark-theme no <body>').toBe('true')
        else expect(seen.bodyAttr, 'no claro o atributo fica AUSENTE').toBeNull()
        expect(seen.htmlHasAttr, 'o atributo vive no <body>, não no <html>').toBe(false)
        if (theme === 'dark') expect(luminanceOf(seen.shellBg), `fundo do shell escuro (${seen.shellBg})`).toBeLessThan(0.2)
        else expect(luminanceOf(seen.shellBg), `fundo do shell creme (${seen.shellBg})`).toBeGreaterThan(0.85)
        const blocking: string[] = []
        const scan = async (name: string): Promise<void> => {
          await page.screenshot({ path: join(dir, `theme-${theme}-${name}.png`) })
          const axe = await scanAccessibility(page)
          expect(axe.skipped, `axe rodou em ${name} (${axe.reason ?? axe.via ?? ''})`).toBe(false)
          blocking.push(...blockingAxe(axe).map(row => `${name}: ${row}`))
        }
        await scan('geral')
        for (const slug of ['kanban', 'conexoes', 'configuracoes'] as const) {
          await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === slug)!)
          await page.waitForTimeout(1_200)
          await scan(slug)
        }
        expect(blocking, `axe crítico/sério no tema ${theme}`).toEqual([])
      } finally {
        await desktop.stop()
        scope.restore()
      }
    }, 900_000)
  }
})
