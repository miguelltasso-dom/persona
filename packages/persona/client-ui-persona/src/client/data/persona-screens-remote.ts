import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  GetOfficialQuotaRequest,
  GetUsageRequest,
  MemoryView,
  OfficialQuotaView,
  ProjectScopeRequest,
  SkillView,
  UsageView,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'

/** Usage + Lumen screen RPCs (Anvil); Typert client may lag until regen. */
export interface PersonaScreensRemote {
  getUsage(request: GetUsageRequest): Promise<RemoteResult<UsageView>>
  getOfficialQuota(request: GetOfficialQuotaRequest): Promise<RemoteResult<OfficialQuotaView[]>>
  listMemory(request: ProjectScopeRequest): Promise<RemoteResult<MemoryView[]>>
  listSkills(request: ProjectScopeRequest): Promise<RemoteResult<SkillView[]>>
}

type ScreensWire = PersonaScreensRemote

const screensRemoteCache = new WeakMap<PersonaRemoteClient, PersonaScreensRemote>()

function hasScreensWire(persona: PersonaRemoteClient): persona is PersonaRemoteClient & ScreensWire {
  const candidate = persona as PersonaRemoteClient & Partial<ScreensWire>
  return typeof candidate.getUsage === 'function'
    && typeof candidate.getOfficialQuota === 'function'
    && typeof candidate.listMemory === 'function'
    && typeof candidate.listSkills === 'function'
}

/** Narrow host screen methods without widening every consumer of {@link PersonaRemoteClient}. */
export function personaScreensRemote(persona: PersonaRemoteClient): PersonaScreensRemote {
  const cached = screensRemoteCache.get(persona)
  if (cached !== undefined) return cached
  if (!hasScreensWire(persona)) {
    const missing = (): Promise<never> => Promise.reject(new Error('screens-unavailable'))
    const stub: PersonaScreensRemote = {
      getUsage: missing,
      getOfficialQuota: missing,
      listMemory: missing,
      listSkills: missing,
    }
    screensRemoteCache.set(persona, stub)
    return stub
  }
  const wire = persona as PersonaRemoteClient & ScreensWire
  const facade: PersonaScreensRemote = {
    getUsage: request => wire.getUsage(request),
    getOfficialQuota: request => wire.getOfficialQuota(request),
    listMemory: request => wire.listMemory(request),
    listSkills: request => wire.listSkills(request),
  }
  screensRemoteCache.set(persona, facade)
  return facade
}
