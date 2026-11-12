/**
 * What the gate a runner opened ON ITS OWN refused (Carbon P1-04). A Task with no connector has no host gate: the runner opens one itself (`nativeGateFor`), and the host used to
 * have no way to read what it refused, so a `Write` outside the draft that the gate denied still counted as proof of work ("Salvei o arquivo!").
 *
 * A small registry, not a field on the runner: the host wraps the runner several times, and the runner object it holds is the one `resolveRunner` returned.
 */

/** Anything that can say which calls it refused since it was last asked (a `PermissionGate`). */
export interface RefusalSource {
  takeRefusals(): readonly { readonly tool: string }[]
}

const sources = new WeakMap<object, RefusalSource>()

/**
 * @param runner - The runner `resolveRunner` returns.
 * @param source - The gate the runner opened itself.
 */
export function registerRefusalSource(runner: object, source: RefusalSource): void {
  sources.set(runner, source)
}

/**
 * @param runner - A runner `resolveRunner` returned.
 * @returns The tools its own gate refused since the last call (drained); empty when it has no gate of its own.
 */
export function takeRunnerRefusals(runner: object): string[] {
  return (sources.get(runner)?.takeRefusals() ?? []).map(item => item.tool)
}
