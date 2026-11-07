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
import { hostModeToAutonomyLevel } from '../persona-editor/autonomy-map.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import { readFileTools } from '../settings-personas/file-tools.ts'
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

  /**
   * SW-7: o rascunho vem do live (o host re-mede enquanto a tarefa roda), não do cartão carregado antes: um cartão
   * aberto quando a persona estava parada passa a dizer "mudando N arquivos num rascunho" assim que o host avisa.
   */
  const withDraft = (personaId: string, base: PersonaCardInfo | undefined): PersonaCardInfo | undefined => {
    if (base === undefined) return base
    const characterId = characterIdForPersona(live, personaId)
    if (characterId === undefined) return base
    const files = live.observable.getSnapshot().stripMembers.find(member => member.id === characterId && member.state === 'working')?.draftFiles
    if (files === undefined || files < 1) return base
    return { ...base, nowKind: 'working', draftFiles: files }
  }
  /** O interruptor "Pode salvar arquivos no rascunho" vem da persona do time (host `PersonaView`), não do cartão carregado antes. */
  const withFileTools = (personaId: string, base: PersonaCardInfo | undefined): PersonaCardInfo | undefined => {
    if (base === undefined) return base
    const row = live.observable.getSnapshot().team?.personas.find(item => item.id === personaId)
    const canSaveFiles = row === undefined ? undefined : readFileTools(row).canSaveFiles
    return canSaveFiles === undefined ? base : { ...base, canSaveFiles }
  }
  // O cartão aberto acompanha o rascunho: só avisa quando a contagem muda (não a cada leitura do live).
  let draftSignature = ''
  live.observable.subscribe(() => {
    const snapshot = live.observable.getSnapshot()
    const next = snapshot.stripMembers.map(member => `${member.id}:${member.state === 'working' ? (member.draftFiles ?? 0) : 0}`).join('|')
      + '#' + (snapshot.team?.personas ?? []).map(row => `${row.id}:${String(readFileTools(row).canSaveFiles)}`).join('|')
    if (next === draftSignature) return
    draftSignature = next
    bump()
  })

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
    let autonomyLevel: PersonaCardInfo['autonomyLevel'] | undefined = undefined
    if ('getAutonomy' in client && typeof client.getAutonomy === 'function') {
      try {
        const row = await unwrapRemote(
          await client.getAutonomy(scope) as RemoteResult<{ readonly mode: 'asked' | 'propose' | 'act' }>,
        )
        autonomyLevel = hostModeToAutonomyLevel(row.mode)
      } catch {
        autonomyLevel = undefined
      }
    }
    const base = personaCardFromHost(dto, characterIdForPersona(live, personaId) ?? dto.handle)
    cards.set(personaId, {
      ...base,
      ...(talk === undefined ? {} : { talk }),
      ...(autonomyLevel === undefined ? {} : { autonomyLevel }),
    })
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
    cardInfo: personaId => withFileTools(personaId, withDraft(personaId, cards.get(personaId))),
    prefetch,
    invalidate: reload,
    togglePause,
  }
}
