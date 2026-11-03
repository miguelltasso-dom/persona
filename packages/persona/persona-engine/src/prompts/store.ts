/**
 * Versioned prompt snapshots. The host persists; this is the in-memory port.
 */

import { composePrompt, type ComposePromptInput, type PromptPart } from './templates.ts'

export interface PromptSnapshot {
  revision: number
  part: PromptPart
  text: string
  identityName: string
}

export interface PromptStore {
  /**
   * @param part - Prompt part.
   * @param revision - Existing revision, or 0 for none.
   */
  get(part: PromptPart, revision: number): PromptSnapshot | undefined
  /**
   * @param snapshot - New snapshot (revision must be next).
   */
  save(snapshot: PromptSnapshot): void
  /**
   * @param part - Prompt part.
   */
  latest(part: PromptPart): PromptSnapshot | undefined
}

/** In-memory PromptStore for tests and ephemeral hosts. */
export class MemoryPromptStore implements PromptStore {
  private readonly rows = new Map<string, PromptSnapshot>()

  get(part: PromptPart, revision: number): PromptSnapshot | undefined {
    return this.rows.get(`${part}:${String(revision)}`)
  }

  save(snapshot: PromptSnapshot): void {
    this.rows.set(`${snapshot.part}:${String(snapshot.revision)}`, snapshot)
  }

  latest(part: PromptPart): PromptSnapshot | undefined {
    let found: PromptSnapshot | undefined
    for (const row of this.rows.values()) {
      if (row.part !== part) continue
      if (found === undefined || row.revision > found.revision) found = row
    }
    return found
  }
}

/**
 * Compose and persist the next revision.
 * @param store - Prompt store.
 * @param input - Compose input.
 */
export function publishPrompt(store: PromptStore, input: ComposePromptInput): PromptSnapshot {
  const latest = store.latest(input.part)
  const snapshot: PromptSnapshot = {
    revision: (latest?.revision ?? 0) + 1,
    part: input.part,
    text: composePrompt(input),
    identityName: input.identity.name,
  }
  store.save(snapshot)
  return snapshot
}
