import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { resolveElectronBinary, startDesktop, osScreenshot } from '../src/desktop-host.ts'
import { watchConsole, assertConsoleClean } from '../src/console-tripwire.ts'
import { assertNotHarnessShell } from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

describe.skipIf(!runPersonaE2e)('persona-e2e smoke desktop (Tier 2)', () => {
  it('launches Electron via CDP or skips when the binary is missing', async (ctx) => {
    if (resolveElectronBinary() === undefined) {
      ctx.skip(
        'Electron binary not installed — run `pnpm --filter @deepseek-ai/dsh-desktop exec install-electron` (Rivet A3a)',
      )
    }
    await mkdir(ARTIFACTS_DIR, { recursive: true })
    const desktop = await startDesktop()
    try {
      const tripwire = watchConsole(desktop.page)
      await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await assertNotHarnessShell(desktop.page)
      const rendererPath = join(ARTIFACTS_DIR, 'smoke-desktop-renderer.png')
      await desktop.page.screenshot({ path: rendererPath, animations: 'disabled' })
      expect(existsSync(rendererPath)).toBe(true)
      const osPath = join(ARTIFACTS_DIR, 'smoke-desktop-os.png')
      await osScreenshot(osPath)
      expect(existsSync(osPath)).toBe(true)
      assertConsoleClean(tripwire)
    } finally {
      await desktop.stop()
    }
  }, 600_000)
})
