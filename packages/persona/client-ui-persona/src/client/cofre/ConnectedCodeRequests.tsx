/**
 * Item 15 (colheita) — os cartões "Precisa de um código" no TOPO de Aprovações (Muse 12/11: o prazo de 10 min manda). Lê os pedidos do
 * Cofre e a equipe (nome e rosto de quem pediu), reabre a lista a cada poucos segundos enquanto a tela está aberta e devolve os dígitos
 * ao host. Os dígitos passam por aqui só até o `fillCofreCode`; não ficam em estado nenhum deste componente.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { personaFaceSrc } from '../hire/persona-face.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as cofreDict, type CofreKey } from '../locale/cofre/locales.ts'
import { CodeRequestCard, type CodeRequestRow } from './CodeRequestCard.tsx'
import styles from './CodeRequestCard.module.css'

/** How often the open screen asks the host for new requests. */
export const CODE_REQUESTS_REFRESH_MS = 5_000

/** An expired request stays visible (with "Tentar de novo") for this long, then it is history. */
const EXPIRED_VISIBLE_MS = 30 * 60_000

/** One request as the host sends it (`listCofreCodes`). */
export interface HostCodeRequest {
  readonly id: string
  readonly personaId: string
  readonly reason: string
  readonly state: 'pending' | 'filled' | 'taken' | 'cancelled' | 'expired'
  readonly createdAt: string
  readonly expiresAt: string
}

/** The persona of a request, as `listTeam` sends it. */
export interface HostCodePersona {
  readonly id: string
  readonly name: string
  readonly avatarRef: string
}

/**
 * Which requests the top of Aprovações shows: the ones waiting, and the ones that expired in the last half hour (so "Tentar de novo" is there).
 * @param requests - The host's list.
 * @param nowMs - The clock.
 */
export function visibleCodeRequests(requests: readonly HostCodeRequest[], nowMs: number): readonly HostCodeRequest[] {
  return requests.filter((request) => {
    if (request.state === 'pending') return true
    if (request.state === 'expired') return nowMs - Date.parse(request.expiresAt) < EXPIRED_VISIBLE_MS
    return false
  })
}

/**
 * The rows the card draws, with the persona's name and face.
 * @param requests - The visible requests.
 * @param people - The team.
 */
export function codeRequestRows(requests: readonly HostCodeRequest[], people: readonly HostCodePersona[]): readonly CodeRequestRow[] {
  return requests.map((request) => {
    const who = people.find(person => person.id === request.personaId)
    return {
      id: request.id,
      personaName: who?.name ?? request.personaId,
      faceSrc: personaFaceSrc(who?.avatarRef, request.personaId),
      reason: request.reason,
      state: request.state,
      expiresAt: request.expiresAt,
    }
  })
}

export interface ConnectedCodeRequestsProps {
  readonly persona: PersonaRemoteClient
  readonly scope: { readonly workspaceId: string; readonly projectId: string } | null
  /** Asks the persona to open the request again ("Tentar de novo"). Absent = no such button. */
  readonly onRetry?: ((personaId: string) => void) | undefined
}

export function ConnectedCodeRequests({ persona, scope, onRetry }: ConnectedCodeRequestsProps): ReactNode {
  const [requests, setRequests] = useState<readonly HostCodeRequest[]>([])
  const [people, setPeople] = useState<readonly HostCodePersona[]>([])
  const [delivered, setDelivered] = useState<ReadonlySet<string>>(new Set())
  const alive = useRef(true)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId

  const reload = useCallback(async (): Promise<void> => {
    if (workspaceId === undefined || projectId === undefined) return
    try {
      const list = await unwrapRemote(await persona.listCofreCodes({ workspaceId, projectId }))
      if (alive.current) setRequests(list)
    } catch (failure) {
      void failure // the band is an extra: a failed read leaves what was there and tries again on the next tick
    }
  }, [persona, workspaceId, projectId])

  useEffect(() => {
    alive.current = true
    if (workspaceId === undefined || projectId === undefined) return undefined
    void (async () => {
      try {
        const team = await unwrapRemote(await persona.listTeam({ workspaceId, projectId }))
        if (alive.current) setPeople(team.personas.map(item => ({ id: item.id, name: item.name, avatarRef: item.avatarRef })))
      } catch (failure) {
        void failure // without the team the card names the persona by id
      }
    })()
    void reload()
    const id = window.setInterval(() => { void reload() }, CODE_REQUESTS_REFRESH_MS)
    return () => { alive.current = false; window.clearInterval(id) }
  }, [persona, workspaceId, projectId, reload])

  if (scope === null) return null
  const t = (key: CofreKey, params?: Readonly<Record<string, string | number>>): string => bindLocale(cofreDict, key, params)
  const rows = codeRequestRows(visibleCodeRequests(requests, Date.now()), people)
  const confirmed = requests.filter(request => delivered.has(request.id) && (request.state === 'filled' || request.state === 'taken'))
  if (rows.length === 0 && confirmed.length === 0) return null

  return (
    <ul className={styles.stack} aria-live="polite">
      {rows.map(row => (
        <CodeRequestCard
          key={row.id}
          row={row}
          t={t}
          onFill={async (code) => {
            await unwrapRemote(await persona.fillCofreCode({ workspaceId: scope.workspaceId, projectId: scope.projectId, id: row.id, code }))
            setDelivered(current => new Set([...current, row.id]))
            await reload()
          }}
          onCancel={async () => {
            await unwrapRemote(await persona.cancelCofreCode({ workspaceId: scope.workspaceId, projectId: scope.projectId, id: row.id }))
            await reload()
          }}
          {...(onRetry === undefined ? {} : { onRetry: () => { onRetry(requests.find(request => request.id === row.id)?.personaId ?? '') } })}
        />
      ))}
      {codeRequestRows(confirmed, people).map(row => (
        <CodeRequestCard key={`done-${row.id}`} row={row} t={t} />
      ))}
    </ul>
  )
}
