import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { startWebHost } from '../src/web-host.ts'
import { openPage } from '../src/page-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

describe.skipIf(!runPersonaE2e)('persona-e2e smoke web (Tier 1)', () => {
  it('boots persona profile host, opens UI, captures light/dark screenshots without console errors', async () => {
    const host = await startWebHost()
    try {
      const session = await openPage(host.url)
      try {
        const lightPath = await session.screenshot('smoke-light', {
          theme: 'light',
          viewport: { width: 1280, height: 720 },
        })
        const darkPath = await session.screenshot('smoke-dark', {
          theme: 'dark',
          viewport: { width: 1280, height: 720 },
        })
        expect(existsSync(lightPath)).toBe(true)
        expect(existsSync(darkPath)).toBe(true)
        const snapshot = await session.ariaSnapshot()
        expect(snapshot.length).toBeGreaterThan(0)
        session.assertConsoleClean()
      } finally {
        await session.close()
      }
    } finally {
      await host.stop()
    }
  }, 240_000)
})

describe('persona-e2e smoke web (opt-in guard)', () => {
  it('documents artifact directory when PERSONA_E2E is unset', () => {
    if (runPersonaE2e) return
    expect(ARTIFACTS_DIR).toContain('persona-e2e')
  })
})
