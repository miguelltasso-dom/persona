/**
 * One process-wide cache for Node internals loaded through `node-addon-require-builtin`.
 *
 * Measured on the packaged Windows app (04/11, P0-25): in Electron-as-node the `--expose-internals` fast path is not available for the private
 * internals, so every `requireBuiltin('internal/…')` goes to the native addon, which costs ~420 ms per call during boot (~65 ms in a quiet
 * process; `internal/bootstrap/realm` ~1.1 s). The Host asked for the same 6 internals twice (resolver install and HMR package hooks):
 * 12 synchronous calls, 5.0 s of a ~10.5 s boot, all of it blocking the Host's event loop (the first vault call waited for it).
 * A Node internal module is a process singleton, so asking again can only return the same object: remember it.
 *
 * The cache lives on `globalThis` under a registered symbol so the two packages that ask share it. This file is copied verbatim into
 * `packages/boot/hmr/src/node-internals.ts` (hmr must stay importable on its own, without loading app-boot): keep the two identical.
 */

const CACHE_KEY = Symbol.for('@deepseek-ai/dsh-app-boot.nodeInternals')

type InternalsCache = Map<string, unknown>

function cache(): InternalsCache {
  const holder = globalThis as unknown as Record<symbol, InternalsCache | undefined>
  holder[CACHE_KEY] ??= new Map()
  return holder[CACHE_KEY]
}

/**
 * Return the Node internal `id`, loading it at most once per process.
 * @param id - Internal module id, e.g. `internal/modules/esm/loader`.
 * @param load - The real loader (the addon's `requireBuiltin`). A throw is not cached: the next call tries again.
 */
export function cachedNodeInternal(id: string, load: (id: string) => unknown): unknown {
  const known = cache()
  if (known.has(id)) return known.get(id)
  const loaded = load(id)
  if (loaded !== undefined) known.set(id, loaded)
  return loaded
}
