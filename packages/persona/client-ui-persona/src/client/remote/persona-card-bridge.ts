import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { TalkAclView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import { inferPersonaPaused } from '../profile/infer-persona-paused.ts'
import { personaCardFromHost } from '../profile/map-persona-card-from-host.ts'
import { talkAclViewToCardTalk } from '../profile/map-talk-acl.ts'
import type { PersonaCardHostDto } from '../profile/persona-card-host-dto.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import type { PersonaLiveStore } from './persona-live-store.ts'

export interface PersonaCardBridge {
  readonly revision: HostObservable<{ readonly n: number }>
  readonly cardInfo: (personaId: string) => PersonaCardInfo | undefined
  readonly prefetch: (personaId: string) => void
  readonly invalidate: (personaId: string) => void
  readonly togglePause: (personaId: string) => Promise<void>
}

function characterIdForPersona(live: PersonaLiveStore, personaId: string): string | undefined {
  const snap = live.observable.getSnapshot()
  const persona = snap.team?.personas.find(row => row.id === personaId)
  if (persona?.avatarRef !== undefined && persona.avatarRef.length > 0) {
    return normalizeCharacterId(persona.avatarRef)
  }
  return undefined
}

/** Lazy host cards for the rail popover (Anvil `getPersonaCard`). */
export function createPersonaCardBridge(
  client: PersonaRemoteClient,
  live: PersonaLiveStore,
): PersonaCardBridge {
  const cards = new Map<string, PersonaCardInfo>()
  const inflight = new Set<string>()
  const revision = createSnapshotStore({ n: 0 })
  const bump = (): void => {
    revision.set({ n: revision.getSnapshot().n + 1 })
  }

  const loadCard = async (personaId: string): Promise<void> => {
    const tenant = live.observable.getSnapshot().tenant
    if (tenant === null) return
    if (!('getPersonaCard' in client) || typeof client.getPersonaCard !== 'function') return
    const scope = {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId,
    }
    const dto = await unwrapRemote(
      await client.getPersonaCard(scope) as RemoteResult<PersonaCardHostDto>,
    )
    let talk: PersonaCardInfo['talk'] | undefined = undefined
    if ('getPersonaTalkAcl' in client && typeof client.getPersonaTalkAcl === 'function') {
      try {
        const acl = await unwrapRemote(
          await client.getPersonaTalkAcl(scope) as RemoteResult<TalkAclView>,
        )
        talk = talkAclViewToCardTalk(acl)
      } catch {
        talk = undefined
      }
    }
    const base = personaCardFromHost(dto, characterIdForPersona(live, personaId) ?? dto.handle)
    cards.set(personaId, talk === undefined ? base : { ...base, talk })
    bump()
  }

  const reload = (personaId: string): void => {
    cards.delete(personaId)
    bump()
    if (inflight.has(personaId)) return
    inflight.add(personaId)
    void loadCard(personaId).finally(() => {
      inflight.delete(personaId)
    })
  }

  const prefetch = (personaId: string): void => {
    if (cards.has(personaId) || inflight.has(personaId)) return
    inflight.add(personaId)
    void loadCard(personaId).catch(() => {
      /* RailTeam falls back to rail row */
    }).finally(() => {
      inflight.delete(personaId)
    })
  }

  const togglePause = async (personaId: string): Promise<void> => {
    const tenant = live.observable.getSnapshot().tenant
    if (tenant === null) return
    const scope = {
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      personaId,
    }
    const cached = cards.get(personaId)
    const paused = cached?.paused === true
      || (cached !== undefined && inferPersonaPaused(cached.nowKind, cached.nowText ?? ''))
    if (paused) {
      if ('resumePersona' in client && typeof client.resumePersona === 'function') {
        await unwrapRemote(await client.resumePersona(scope) as RemoteResult<PersonaCardHostDto>)
      }
    } else if ('pausePersona' in client && typeof client.pausePersona === 'function') {
      await unwrapRemote(await client.pausePersona(scope) as RemoteResult<PersonaCardHostDto>)
    }
    reload(personaId)
    void live.refresh()
  }

  return {
    revision: {
      getSnapshot: () => revision.getSnapshot(),
      subscribe: listener => revision.subscribe(listener),
    },
    cardInfo: personaId => cards.get(personaId),
    prefetch,
    invalidate: reload,
    togglePause,
  }
}
