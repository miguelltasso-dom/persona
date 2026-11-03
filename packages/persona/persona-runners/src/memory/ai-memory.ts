/**
 * Optional ai-memory adapter (AI-MEMORY-DECISION). Default off.
 * Real binary/session is opt-in; tests use a fake client.
 */

export const AI_MEMORY_FLAG = 'PERSONA_AI_MEMORY'

export type AiMemorySource = 'dm' | 'channel' | 'task'

/**
 * Namespace for one workspace+project. DMs never share this.
 * @param workspaceId - Tenant.
 * @param projectId - Project.
 */
export function memoryNamespace(workspaceId: string, projectId: string): string {
  return `${workspaceId}/${projectId}`
}

/**
 * Capture is off by default, and always skipped for DM-originated work.
 * @param input - Source + optional force-enable (tests).
 */
export function shouldCaptureAiMemory(input: {
  source?: AiMemorySource
  enabled?: boolean
  env?: NodeJS.ProcessEnv
} = {}): boolean {
  if (input.source === 'dm') return false
  return input.enabled === true || aiMemoryEnabled(input.env)
}

export interface AiMemoryCapture {
  kind: string
  text: string
  at?: string
}

export interface AiMemoryHandoff {
  claimed: boolean
  summary: string
}

export interface AiMemoryClient {
  capture(event: AiMemoryCapture): Promise<void>
  handoff(fromCli: string, toCli: string): Promise<AiMemoryHandoff>
}

/**
 * @param env - process env; default `process.env`.
 * @returns true only when the operator set `PERSONA_AI_MEMORY=1`.
 */
export function aiMemoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[AI_MEMORY_FLAG] === '1'
}

/**
 * No-op client used when the flag is off (product default).
 */
export function createDisabledAiMemory(): AiMemoryClient {
  return {
    capture: async () => undefined,
    handoff: async () => ({ claimed: false, summary: 'ai-memory disabled' }),
  }
}

export interface FakeAiMemoryOptions {
  now?: () => Date
}

/**
 * In-memory fake for contract tests (no binary, no quota).
 * @param options - clock.
 */
export function createFakeAiMemory(options: FakeAiMemoryOptions = {}): AiMemoryClient & { captures: AiMemoryCapture[] } {
  const captures: AiMemoryCapture[] = []
  const now = options.now ?? (() => new Date())
  return {
    captures,
    capture: async (event) => {
      captures.push({ ...event, at: event.at ?? now().toISOString() })
    },
    handoff: async (fromCli, toCli) => {
      const last = captures.at(-1)
      return {
        claimed: last !== undefined,
        summary: last === undefined
          ? `no capture to hand off from ${fromCli} to ${toCli}`
          : last.text,
      }
    },
  }
}

/**
 * Bind the optional integration. Off unless the flag is set.
 * @param options - real or fake client when enabled.
 */
export function createAiMemory(options: { enabled?: boolean; client?: AiMemoryClient } = {}): AiMemoryClient {
  const enabled = options.enabled ?? aiMemoryEnabled()
  if (!enabled) return createDisabledAiMemory()
  return options.client ?? createFakeAiMemory()
}
