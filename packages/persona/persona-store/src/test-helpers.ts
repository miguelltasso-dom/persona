/**
 * Temporary on-disk stores for tests. Always pass a throwaway home.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Migration } from './migrations.ts'
import { openPersonaStore, type PersonaStore } from './store.ts'

/** Open handle plus the directory that owns the file. */
export interface TempStore {
  readonly store: PersonaStore
  readonly dir: string
  readonly path: string
  /** Close the connection and delete the directory. */
  dispose(): Promise<void>
}

/** Overrides for {@link openTempStore}. */
export interface OpenTempStoreOptions {
  readonly migrations?: readonly Migration[]
}

/**
 * Create a unique temp directory and open `persona.db` inside it.
 * @param options - Optional injected migrations.
 * @returns The store, paths, and a disposer.
 */
export async function openTempStore(options: OpenTempStoreOptions = {}): Promise<TempStore> {
  const dir = await mkdtemp(join(tmpdir(), 'persona-store-'))
  const path = join(dir, 'db', 'persona.db')
  const store = openPersonaStore({
    path,
    ...(options.migrations === undefined ? {} : { migrations: options.migrations }),
  })
  return {
    store,
    dir,
    path,
    async dispose() {
      store.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Open a temp store, run `fn`, then dispose.
 * @param fn - Test body.
 * @param options - Optional injected migrations.
 */
export async function withTempStore(
  fn: (store: PersonaStore, ctx: TempStore) => Promise<void> | void,
  options: OpenTempStoreOptions = {},
): Promise<void> {
  const ctx = await openTempStore(options)
  try {
    await fn(ctx.store, ctx)
  } finally {
    await ctx.dispose()
  }
}
