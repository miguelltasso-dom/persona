export type UsageOrigin = 'measured' | 'estimated' | 'official' | 'unavailable' | 'notYet'

export interface UsageMeter {
  readonly id: string
  readonly label: string
  readonly origin: UsageOrigin
  /** 0–100 when known; undefined when unavailable (never show as 0%). */
  readonly percent?: number
}

export interface UsageLimitNotice {
  readonly connection: string
  readonly percent: number
}

export const MOCK_USAGE_METERS: readonly UsageMeter[] = [
  { id: 'u1', label: 'Claude Code (oficial)', origin: 'official', percent: 62 },
  { id: 'u2', label: 'Codex (estimado)', origin: 'estimated', percent: 41 },
  { id: 'u3', label: 'Cursor agent (medido)', origin: 'measured', percent: 78 },
  { id: 'u4', label: 'OpenCode', origin: 'unavailable' },
]

export const MOCK_LIMIT_NOTICE: UsageLimitNotice = {
  connection: 'Cursor agent',
  percent: 82,
}

/** Gallery preview — Claude with 3 seats (T3 §7). */
export { MOCK_USAGE_PROVIDER_POOLS } from './mock-usage-pools.ts'
