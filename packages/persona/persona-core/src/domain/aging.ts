/**
 * LLM-free memory aging (AI-MEMORY-DECISION 3b): decay, use reinforcement,
 * near-duplicate collapse, contradiction flags, supersede + restore.
 * Nothing is deleted for real.
 */

export type MemoryLayer = 'working' | 'episodic' | 'semantic'

export interface AgedMemory {
  id: string
  layer: MemoryLayer
  body: string
  score: number
  uses: number
  supersededBy?: string
  restoredFrom?: string
  contradictionOf?: string
  archived: boolean
}

const DECAY: Record<MemoryLayer, number> = {
  working: 0.45,
  episodic: 0.15,
  semantic: 0.04,
}

/**
 * @param memory - Memory to age by one tick.
 */
export function decayMemory(memory: AgedMemory): AgedMemory {
  const next = Math.max(0, memory.score * (1 - DECAY[memory.layer]))
  return { ...memory, score: next, archived: next < 0.05 ? true : memory.archived }
}

/**
 * @param memory - Memory that was used.
 */
export function reinforceMemory(memory: AgedMemory): AgedMemory {
  return { ...memory, uses: memory.uses + 1, score: Math.min(1, memory.score + 0.2), archived: false }
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(part => part.length > 2))
}

/**
 * Jaccard overlap; ≥ 0.8 is a near-duplicate.
 * @param a - First body.
 * @param b - Second body.
 */
export function nearDuplicate(a: string, b: string): boolean {
  const left = tokens(a), right = tokens(b)
  if (left.size === 0 || right.size === 0) return false
  let inter = 0
  for (const token of left) if (right.has(token)) inter += 1
  const union = left.size + right.size - inter
  return inter / union >= 0.8
}

/**
 * @param existing - Memories in the same layer.
 * @param candidate - Incoming memory.
 * @returns Id of a near-duplicate to collapse into, if any.
 */
export function findNearDuplicate(existing: readonly AgedMemory[], candidate: AgedMemory): string | undefined {
  return existing.find(item =>
    !item.archived && item.layer === candidate.layer && nearDuplicate(item.body, candidate.body))?.id
}

const NEGATION = /\b(não|nao|never|not)\b/i

/**
 * @param a - First body.
 * @param b - Second body.
 */
export function contradicts(a: string, b: string): boolean {
  if (!nearDuplicate(a.replace(NEGATION, ''), b.replace(NEGATION, ''))) return false
  return NEGATION.test(a) !== NEGATION.test(b)
}

/**
 * Supersede without deleting.
 * @param current - Memory being replaced.
 * @param newerId - Replacement id.
 */
export function supersedeMemory(current: AgedMemory, newerId: string): AgedMemory {
  return { ...current, supersededBy: newerId, archived: true }
}

/**
 * Restore a superseded memory.
 * @param archived - Previously superseded memory.
 */
export function restoreMemory(archived: AgedMemory): AgedMemory {
  const { supersededBy, ...rest } = archived
  return {
    ...rest,
    archived: false,
    ...(supersededBy === undefined ? {} : { restoredFrom: supersededBy }),
    score: Math.max(archived.score, 0.4),
  }
}
