import type { GetUsagePanelRequest, UsagePanelView } from '@deepseek-ai/dsh-persona-host/types'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'

/** Loads OPT-7 panel when host exposes `getUsagePanel`; otherwise null. */
export async function loadUsagePanelRemote(
  persona: PersonaRemoteClient,
  request: GetUsagePanelRequest,
): Promise<UsagePanelView | null> {
  if (!('getUsagePanel' in persona) || typeof persona.getUsagePanel !== 'function') return null
  try {
    return await unwrapRemote(await persona.getUsagePanel(request) as RemoteResult<UsagePanelView>)
  } catch {
    return null
  }
}
