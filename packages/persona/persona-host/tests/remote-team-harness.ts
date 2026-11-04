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
 * @returns Services and teardown; no model runner is called by construction.
 */
export function openRemoteTeamHarness(databasePath: string): RemoteTeamHarness {
  const ctx = new Context()
  const vault = new PersonaVault(ctx)
  const h = new PersonaHost(ctx, { databasePath, remoteTeamPollMs: 0 })
  return { h, vault, dispose: async () => { await ctx.fiber.dispose() } }
}
