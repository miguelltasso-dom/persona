/**
 * Ollama / LM Studio — OpenAI-compatible, local, no cost.
 */

export const LOCAL_LABEL = 'local, sem custo'

export const LOCAL_BASE: Readonly<Record<'ollama' | 'lmstudio', string>> = {
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
}

export interface LocalModelCard {
  id: 'ollama' | 'lmstudio'
  label: typeof LOCAL_LABEL
  installed: boolean
  models: readonly string[]
  baseUrl: string
}

function idsOf(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  return data
    .map(item => (item !== null && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : ''))
    .filter(id => id.length > 0)
}

/**
 * Probe one local OpenAI-compat endpoint. Missing server → not installed.
 * @param id - ollama or lmstudio.
 * @param baseUrl - `/v1` root.
 * @param fetchImpl - Injected fetch (fake in tests).
 * @param timeoutMs - Probe budget.
 */
export async function probeLocalModels(
  id: 'ollama' | 'lmstudio',
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<LocalModelCard> {
  const root = baseUrl.replace(/\/$/u, '')
  const empty: LocalModelCard = { id, label: LOCAL_LABEL, installed: false, models: [], baseUrl: root }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const work = (async (): Promise<LocalModelCard> => {
    const response = await fetchImpl(`${root}/models`, { signal: ac.signal })
    if (!response.ok) return empty
    return { id, label: LOCAL_LABEL, installed: true, models: idsOf(await response.json()), baseUrl: root }
  })()
  try {
    return await Promise.race([
      work,
      new Promise<LocalModelCard>((resolve) => {
        setTimeout(() => resolve(empty), timeoutMs)
      }),
    ])
  } catch {
    return empty
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Detect Ollama and LM Studio. Never logs a key (there is none).
 * @param options - Fetch, optional base URLs, timeout.
 */
export async function detectLocalProviders(options: {
  fetch?: typeof fetch
  ollama?: string
  lmstudio?: string
  timeoutMs?: number
} = {}): Promise<readonly LocalModelCard[]> {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 400
  return [
    await probeLocalModels('ollama', options.ollama ?? LOCAL_BASE.ollama, fetchImpl, timeoutMs),
    await probeLocalModels('lmstudio', options.lmstudio ?? LOCAL_BASE.lmstudio, fetchImpl, timeoutMs),
  ]
}

export function isLocalProvider(provider: string): provider is 'ollama' | 'lmstudio' {
  return provider === 'ollama' || provider === 'lmstudio'
}
