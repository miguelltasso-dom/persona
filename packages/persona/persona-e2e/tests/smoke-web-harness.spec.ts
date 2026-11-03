import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startWebHost } from '../src/web-host.ts'
import { openPage } from '../src/page-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

/** Regression gate until persona profile boot (B9) mounts `[data-persona-shell]` reliably. */
describe.skipIf(!runPersonaE2e)('persona-e2e smoke web harness profile (Tier 1 fallback)', () => {
  it('boots web profile host and reaches composer', async () => {
    const host = await startWebHost({ profile: 'web' })
    try {
      const session = await openPage(host.url)
      try {
        await session.page.locator('[data-composer-input]').first().waitFor({ state: 'visible', timeout: 120_000 })
        const path = await session.screenshot('smoke-harness-web', {
          theme: 'light',
          viewport: { width: 1280, height: 720 },
        })
        expect(existsSync(path)).toBe(true)
        session.assertConsoleClean()
      } finally {
        await session.close()
      }
    } finally {
      await host.stop()
    }
  }, 300_000)
})
