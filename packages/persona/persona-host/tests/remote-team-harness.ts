/** Cordis host lifecycle for the local edge integration suite. */
import { Context } from '@deepseek-ai/cordis'
import PersonaHost from '../src/index.ts'
import PersonaVault from '../../persona-vault/src/plugin.ts'

/** Host services and their single disposal owner. */
export interface RemoteTeamHarness {
  readonly h: PersonaHost
  readonly vault: PersonaVault
  readonly dispose: () => Promise<void>
}

/**
 * Open a SQLite profile with the real Cofre provider; its test cipher requires explicit environment opt-in.
 * @param databasePath - Isolated test database.
 * @param pollMs - Edge polling period; zero (default) leaves the exchange to the test, like the real desk it can be set low.
 * @param live - Keep the live WebSocket to the hub (wake-up + presence); off by default so a test that wants it says so.
 * @returns Services and teardown; no model runner is called by construction.
 */
export function openRemoteTeamHarness(databasePath: string, pollMs: number = 0, live: boolean = false): RemoteTeamHarness {
  const ctx = new Context()
  const vault = new PersonaVault(ctx)
  const h = new PersonaHost(ctx, { databasePath, remoteTeamPollMs: pollMs, remoteTeamLive: live })
  return { h, vault, dispose: async () => { await ctx.fiber.dispose() } }
}
