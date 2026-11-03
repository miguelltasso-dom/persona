/**
 * Inline & Spill + Chain of Recall (D-037 / B4).
 * Authorization is re-checked at every hop.
 */

import { ContextError } from './error.ts'
import type { ContextAuthorize, ContextScope } from './types.ts'

/** One object the compiler may inline or spill. */
export interface RecallNode {
  id: string
  summary: string
  body: string
  neighborIds: readonly string[]
}

/** Inline form: id + summary + neighbor ids. Long body is never inlined. */
export interface InlineRef {
  id: string
  summary: string
  neighbors: string[]
}

const SPILL_PREFIX = 'persona-spill:'

/**
 * @param node - Object with identity and neighbors.
 * @returns Inline payload (no body).
 */
export function inlineRef(node: RecallNode): InlineRef {
  return { id: node.id, summary: node.summary, neighbors: [...node.neighborIds] }
}

/**
 * @param id - Object id whose body spilled out of the budget.
 * @returns Opaque pointer for `persona_recall`.
 */
export function spillPointer(id: string): string {
  return `${SPILL_PREFIX}${id}`
}

/**
 * @param pointer - Value produced by {@link spillPointer}.
 * @returns The id, or undefined when the pointer is not a spill.
 */
export function spillId(pointer: string): string | undefined {
  return pointer.startsWith(SPILL_PREFIX) ? pointer.slice(SPILL_PREFIX.length) : undefined
}

export interface ChainRecallInput {
  startId: string
  scope: ContextScope
  load: (id: string) => RecallNode | undefined
  authorize: ContextAuthorize<RecallNode>
  maxHops: number
}

export interface ChainHop {
  id: string
  summary: string
  body: string
  neighbors: string[]
}

/**
 * Walk neighbor ids from `startId`. Stops at maxHops, missing nodes, or a hop
 * `authorize` does not admit (`!== true`). A denial in the middle cancels the rest.
 * @param input - Trusted loader and authorize; loader does not bypass ACL.
 */
export async function recallChain(input: ChainRecallInput): Promise<ChainHop[]> {
  if (!Number.isInteger(input.maxHops) || input.maxHops < 1 || input.maxHops > 32) {
    throw new ContextError('INVALID_RECALL')
  }
  const hops: ChainHop[] = []
  const seen = new Set<string>()
  const queue = [input.startId]
  while (queue.length > 0 && hops.length < input.maxHops) {
    const id = queue.shift()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const node = input.load(id)
    if (node === undefined) {
      if (hops.length === 0) throw new ContextError('INVALID_RECALL')
      break
    }
    if (await input.authorize(node, input.scope) !== true) {
      if (hops.length === 0) throw new ContextError('REQUIRED_CONTEXT_UNAVAILABLE')
      break
    }
    hops.push({
      id: node.id,
      summary: node.summary,
      body: node.body,
      neighbors: [...node.neighborIds],
    })
    for (const neighbor of node.neighborIds) {
      if (!seen.has(neighbor)) queue.push(neighbor)
    }
  }
  return hops
}
