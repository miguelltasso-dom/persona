/**
 * W2-1+ UI smoke — assunto chips on #geral (SubjectBar tablist + named Geral).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureGeralComposer } from '../src/real-app-session.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('real gallery — WAVE2 subjects smoke (W2-1+)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      viewport: { width: 1440, height: 900 },
    })
    await session.page.waitForTimeout(2_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('[Prism] #geral mounts subject tablist with named Geral chip (not color-only)', async () => {
    await ensureGeralComposer(session.page)
    const tablist = session.page.getByRole('tablist', { name: 'Assuntos desta conversa' })
    await tablist.waitFor({ state: 'visible', timeout: 60_000 })
    const geralTab = session.page.getByRole('tab', { name: 'Geral', exact: true })
    await geralTab.waitFor({ state: 'visible', timeout: 60_000 })
    expect(await geralTab.innerText()).toMatch(/Geral/u)
    expect(await geralTab.getAttribute('id')).toMatch(/persona-subject-/u)
  }, 120_000)
})
