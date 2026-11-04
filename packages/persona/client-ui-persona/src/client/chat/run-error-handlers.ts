/** Prism wiring for RUN-ERRORS-SPEC action ids → shell / live. */

import type { MainPanelId } from '../shell/create-shell-store.ts'
import type { RunErrorAction } from '../primitives/run-errors.ts'

export interface RunErrorHandlerContext {
  readonly openHelpConnections: () => void
  readonly openEngineForPersona: (hostPersonaId: string) => void
  readonly selectPanel: (panel: MainPanelId) => void
  readonly swapAccount: () => void
  readonly retryRun: () => void
  readonly resumeWhenQuotaBack: () => void
}

/** Run the primary or secondary action from a run-error card. */
export function runRunErrorAction(
  action: RunErrorAction,
  ctx: RunErrorHandlerContext,
  hostPersonaId: string | undefined,
): void {
  switch (action) {
    case 'howToConnect':
    case 'howToInstall':
      ctx.openHelpConnections()
      break
    case 'pickEngine':
    case 'pickModel':
    case 'otherEngine':
      if (hostPersonaId !== undefined) ctx.openEngineForPersona(hostPersonaId)
      break
    case 'swapAccount':
      ctx.swapAccount()
      break
    case 'adjustLimit':
      ctx.selectPanel('rules')
      break
    case 'seeUsage':
      ctx.selectPanel('usage')
      break
    case 'waitAndResume':
      ctx.resumeWhenQuotaBack()
      break
    case 'retry':
    case 'retryNow':
    case 'reconnect':
      ctx.retryRun()
      break
  }
}
