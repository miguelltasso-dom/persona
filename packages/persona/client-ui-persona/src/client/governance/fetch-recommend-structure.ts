import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { mapHostStructureRecommendation } from './map-host-structure-recommendation.ts'
import { recommendStructure } from './recommend-structure.ts'
import type { StructureRecommendationHostDto } from './structure-recommendation-host-dto.ts'
import { structureRecommendRpcAsk } from './structure-rpc-ask.ts'
import type { StructureAssistantInput, StructurePlan } from './structure-types.ts'

/** Host GOV-5 `recommendStructure` with deterministic local fallback. */
export async function resolveStructurePlan(
  client: PersonaRemoteClient | undefined,
  workspaceId: string | undefined,
  input: StructureAssistantInput,
): Promise<StructurePlan> {
  const local = recommendStructure(input)
  if (workspaceId === undefined || client === undefined) return local
  if (!('recommendStructure' in client) || typeof client.recommendStructure !== 'function') return local
  try {
    const view = await unwrapRemote(
      await client.recommendStructure(structureRecommendRpcAsk(workspaceId, input)) as RemoteResult<StructureRecommendationHostDto>,
    )
    if (view.personas.length === 0) return local
    return mapHostStructureRecommendation(view, input.companyModel, input.activeSectorIds)
  } catch {
    return local
  }
}
