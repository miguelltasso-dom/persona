/** Cordis plugin: `ctx.personaUsage` (D-025). */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { foldUsage } from './book.ts'
import {
  labelledEstimate,
  readCodexRolloutLimits,
  readDeepSeekBalance,
  readOarAccountUsage,
} from './official.ts'
import type { OfficialQuota, UsageEstimate, UsageFold, UsageRecord } from './types.ts'

export interface Config {
  /** Codex sessions root for official rollouts. Empty means unset. */
  sessionsRoot: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Usage book and official quota readers. */
    personaUsage: PersonaUsage
  }
}

/**
 * Host-side usage ledger. Lumen reads this through Anvil Remote.
 */
export default class PersonaUsage extends Service {
  static inject: string[] = []
  static Config: z<Config> = z.object({
    sessionsRoot: z.string().default(''),
  })

  readonly config: Config
  readonly foldUsage: (records: readonly UsageRecord[]) => UsageFold[]
  readonly readOarAccountUsage: (provider: string, raw: unknown) => OfficialQuota
  readonly readCodexRolloutLimits: (raw: unknown) => OfficialQuota
  readonly readDeepSeekBalance: (raw: unknown) => OfficialQuota
  readonly labelledEstimate: (input: {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    basis: string
  }) => UsageEstimate

  /**
   * @param ctx - Host context.
   * @param config - Optional Codex sessions root.
   */
  constructor(ctx: Context, config: Config = { sessionsRoot: '' }) {
    super(ctx, 'personaUsage')
    this.config = config
    this.foldUsage = foldUsage
    this.readOarAccountUsage = readOarAccountUsage
    this.readCodexRolloutLimits = readCodexRolloutLimits
    this.readDeepSeekBalance = readDeepSeekBalance
    this.labelledEstimate = labelledEstimate
  }
}
