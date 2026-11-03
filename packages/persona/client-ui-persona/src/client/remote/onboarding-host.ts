/** Host onboarding truth vs optimistic client cache (Keel / contract onboarding-remote.md). */

/** Whether the overlay should show after host responded. */
export function overlayOpenFromHost(firstUse: boolean): boolean {
  return firstUse
}

/**
 * First paint before `getOnboarding` returns — cache only avoids a flash when user already finished this browser.
 * @param cacheComplete - optimistic local flag.
 */
export function overlayOpenOptimisticInitial(cacheComplete: boolean): boolean {
  return !cacheComplete
}

/** Sync cache when host confirms onboarding is done. */
export function shouldWriteCacheComplete(firstUse: boolean): boolean {
  return !firstUse
}
