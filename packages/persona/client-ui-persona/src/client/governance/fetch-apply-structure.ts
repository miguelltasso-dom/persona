import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { StructureRecommendationHostDto } from './structure-recommendation-host-dto.ts'
import { structureRecommendRpcAsk } from './structure-rpc-ask.ts'
import type { StructureAssistantInput } from './structure-types.ts'

/** Persist sectors and routine owners from the structure ask (does not hire personas). */
export async function applyStructurePlan(
  client: PersonaRemoteClient | undefined,
  workspaceId: string | undefined,
  input: StructureAssistantInput,
): Promise<boolean> {
  if (workspaceId === undefined || client === undefined) return false
  if (!('applyStructure' in client) || typeof client.applyStructure !== 'function') return false
  try {
    await unwrapRemote(
      await client.applyStructure(structureRecommendRpcAsk(workspaceId, input)) as RemoteResult<StructureRecommendationHostDto>,
    )
    return true
  } catch {
    return false
  }
}
