/**
 * "Seus números" (colheita item 19a): the client side of the host calls. It only calls the host and translates: the test, the pin, the schedule, the
 * silence and the alert are the host's rules. Any call may be missing on an old host or a fake: then there is no "Fixar" and no section.
 */
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import type { IndicatorTestUi, IndicatorUi } from './indicators-model.ts'

export interface IndicatorsRemote {
  listIndicators?(request: Record<string, unknown>): unknown
  testIndicator?(request: Record<string, unknown>): unknown
  pinIndicator?(request: Record<string, unknown>): unknown
  unpinIndicator?(request: Record<string, unknown>): unknown
  refreshIndicator?(request: Record<string, unknown>): unknown
}

export interface IndicatorsScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** The Remote as "Seus números" sees it, or `undefined` when any of the calls is missing (the screen stays as it was). */
export function indicatorsRemoteFrom(remote: object | undefined): IndicatorsRemote | undefined {
  if (remote === undefined) return undefined
  const wire = remote as Record<string, unknown>
  const all = ['listIndicators', 'testIndicator', 'pinIndicator', 'unpinIndicator', 'refreshIndicator']
  return all.every(name => typeof wire[name] === 'function') ? (remote as IndicatorsRemote) : undefined
}

async function call<T>(remote: IndicatorsRemote, method: keyof IndicatorsRemote, request: Record<string, unknown>): Promise<T> {
  const fn = remote[method]
  if (typeof fn !== 'function') throw new Error(method)
  const result = await Promise.resolve(fn.call(remote, request))
  if (!isRemoteResult(result)) return result as T
  if (result.ok) return result.value as T
  const error = (result.error ?? {}) as { readonly code?: unknown; readonly message?: unknown }
  throw new Error(typeof error.message === 'string' && error.message.length > 0 ? error.message : typeof error.code === 'string' ? error.code : method)
}

/** @param scope - Tenant. @returns The pinned numbers, oldest first. */
export async function listIndicators(remote: IndicatorsRemote, scope: IndicatorsScope): Promise<readonly IndicatorUi[]> {
  return (await call<readonly IndicatorUi[] | undefined>(remote, 'listIndicators', { ...scope })) ?? []
}

/** "Testar agora": the real number, or a throw with the host's sentence. */
export async function testIndicator(remote: IndicatorsRemote, scope: IndicatorsScope, messageId: string): Promise<IndicatorTestUi> {
  return call<IndicatorTestUi>(remote, 'testIndicator', { ...scope, messageId })
}

/** "Fixar": pins what the test showed. */
export async function pinIndicator(
  remote: IndicatorsRemote,
  scope: IndicatorsScope,
  input: { readonly testId: string; readonly name: string; readonly schedule: 'hourly' | 'daily'; readonly alertDropPct?: number },
): Promise<IndicatorUi> {
  return call<IndicatorUi>(remote, 'pinIndicator', { ...scope, ...input })
}

/** Takes a number off the Visão geral. */
export async function unpinIndicator(remote: IndicatorsRemote, scope: IndicatorsScope, id: string): Promise<void> {
  await call<boolean>(remote, 'unpinIndicator', { ...scope, id })
}

/** "Atualizar agora" (quiet). */
export async function refreshIndicator(remote: IndicatorsRemote, scope: IndicatorsScope, id: string): Promise<IndicatorUi> {
  return call<IndicatorUi>(remote, 'refreshIndicator', { ...scope, id })
}
