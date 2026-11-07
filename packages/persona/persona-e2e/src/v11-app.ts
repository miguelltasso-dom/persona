/**
 * Session for the E2E-V11 web specs (fake CLI, 0 AI): the REAL `persona` profile in Chrome, the LIVE runner (stubs answer turns), onboarding finished, the
 * first delivery settled and — when asked — the suggested team hired, so a channel HAS personas. The v1.1 functions that are still opt-in in the host are
 * switched on through the host's environment (the app does not pass `Config` to the host; default OFF until TEAM-15): `PERSONA_TEAMWORK=1`, `PERSONA_FANOUT=1`.
 */
import type { Page } from 'playwright'
import { hireSuggestedTeam, settleFirstDelivery } from './gauge-app.ts'
import type { FakeCliOptions } from './fake-cli.ts'
import { completeOnboardingOverlay, openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'

export interface V11SessionOptions {
  /** `PERSONA_TEAMWORK=1` in the host (opinion, handoff lines, morning brief, review). */
  readonly teamwork?: boolean
  /** `PERSONA_FANOUT=1` in the host ("Toda a equipe" / "Quem tiver algo a dizer" fan-out). */
  readonly fanout?: boolean
  /** `PERSONA_START_ON_BOARD=1`: the person moves a card to Fazendo → the owner persona starts (HT-3). */
  readonly startOnBoard?: boolean
  /** `PERSONA_PRODUCT_TOOLS=1`: the product tools (persona_ask, board/sprints/routines, hire, ask for opinion) are offered to CLI workers (HT-14, D-079 b). */
  readonly productTools?: boolean
  /**
   * Switch a v1.1 function OFF in the host (`PERSONA_<FLAG>=0`) to prove the OFF path. TEAM-15 (Anvil, 05/11 02:25): the four switches come ON in a real host (not under Vitest, where the
   * default stays off — `liveRunner` clears VITEST), so `teamwork`/`fanout`/`startOnBoard`/`productTools` are only needed for a host that inherited VITEST; `disable` is the way to turn one off.
   */
  readonly disable?: ReadonlyArray<'teamwork' | 'fanout' | 'startOnBoard' | 'productTools'>
  /** The single lilac bar (`persona.flag.navPlaces`): ON by default since bundle 3, as in the product. `false` = the old rail. */
  readonly navPlaces?: boolean
  readonly viewport?: { width: number; height: number }
  /** Fake CLI behaviour (turn latency, rules, reply). */
  readonly engine?: FakeCliOptions
  /** Hire the suggested team after onboarding (default true). */
  readonly hireTeam?: boolean
}

export interface V11Session {
  readonly session: RealPersonaSession
  readonly page: Page
  /** Model turns the stub has answered so far. */
  turns(): number
  close(): Promise<void>
}

export async function openV11Session(options: V11SessionOptions = {}): Promise<V11Session> {
  const hostEnv: Record<string, string> = {
    ...(options.teamwork === true ? { PERSONA_TEAMWORK: '1' } : {}),
    ...(options.fanout === true ? { PERSONA_FANOUT: '1' } : {}),
    ...(options.startOnBoard === true ? { PERSONA_START_ON_BOARD: '1' } : {}),
    ...(options.productTools === true ? { PERSONA_PRODUCT_TOOLS: '1' } : {}),
    ...Object.fromEntries((options.disable ?? []).map(flag => [{ teamwork: 'PERSONA_TEAMWORK', fanout: 'PERSONA_FANOUT', startOnBoard: 'PERSONA_START_ON_BOARD', productTools: 'PERSONA_PRODUCT_TOOLS' }[flag], '0'])),
  }
  const session = await openRealPersonaApp({
    engine: { kind: 'fake', turnMs: 1_500, ...(options.engine ?? {}) },
    liveRunner: true,
    keepOnboarding: true,
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
    ...(Object.keys(hostEnv).length === 0 ? {} : { hostEnv }),
  })
  await completeOnboardingOverlay(session.page)
  await settleFirstDelivery(session.page)
  // Bundle 3 (Keel 02:48): every v1.1 client flag is born ON, `navPlaces` included — the product's rail IS the single lilac bar now. The hiring assistant of the
  // helper (`hireSuggestedTeam`) is reached through the OLD rail's "Contratar persona", so the hire runs with the flag at '0' and the session then goes back to the
  // product default (or stays old with `navPlaces: false`). The flag is read at load: every switch is a reload.
  const setNavPlaces = async (value: '0' | '1'): Promise<void> => {
    await session.page.evaluate((flag: string) => { try { localStorage.setItem('persona.flag.navPlaces', flag) } catch { /* storage blocked */ } }, value)
    await session.page.reload({ waitUntil: 'load' })
    await session.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await session.page.waitForTimeout(1_500)
  }
  if (options.hireTeam !== false) {
    await setNavPlaces('0')
    await settleFirstDelivery(session.page)
    // The assistant can lose its page when the first delivery finishes under it (the app returns to #geral): retry from a clean page (hiring is idempotent).
    for (let attempt = 1; ; attempt += 1) {
      try {
        await hireSuggestedTeam(session.page)
        break
      } catch (error) {
        if (attempt >= 3) throw error
        await session.page.waitForTimeout(8_000)
        await session.page.reload({ waitUntil: 'load' })
        await session.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
        await settleFirstDelivery(session.page)
      }
    }
  }
  // After hiring (or right away when nobody is hired) the session runs on the rail the options ask for; the default is the product's (the single lilac bar).
  if (options.hireTeam !== false || options.navPlaces === false) await setNavPlaces(options.navPlaces === false ? '0' : '1')
  return {
    session,
    page: session.page,
    turns: () => session.fakeCli.invocations().filter(call => call.event === 'turn').length,
    close: () => session.close(),
  }
}
