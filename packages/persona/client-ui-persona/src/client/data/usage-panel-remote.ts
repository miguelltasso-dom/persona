import type { GetUsagePanelRequest, UsagePanelView } from '@deepseek-ai/dsh-persona-host/types'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { personaScreensRemote } from './persona-screens-remote.ts'
import { unwrapRemote } from './remote-call.ts'

type UsagePanelCaller = (request: GetUsagePanelRequest) => Promise<RemoteResult<UsagePanelView>>

function resolveUsagePanelCall(persona: PersonaRemoteClient): UsagePanelCaller | undefined {
  const fromScreens = personaScreensRemote(persona).getUsagePanel
  if (fromScreens !== undefined) return fromScreens
  const legacy = persona as PersonaRemoteClient & { getUsagePanel?: UsagePanelCaller }
  return typeof legacy.getUsagePanel === 'function' ? legacy.getUsagePanel : undefined
}

/** Loads OPT-7 panel when host exposes `getUsagePanel`; otherwise null. */
export async function loadUsagePanelRemote(
  persona: PersonaRemoteClient,
  request: GetUsagePanelRequest,
): Promise<UsagePanelView | null> {
  const call = resolveUsagePanelCall(persona)
  if (call === undefined) return null
  try {
    return await unwrapRemote(await call(request))
  } catch {
    return null
  }
}
