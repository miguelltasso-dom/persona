/**
 * FL-11 / P0-18: a fila por item do HOST como estado da tela (atrás de `persona.flag.workingControl`). A fila é por (persona, conversa): o
 * canal pode ter filas de várias personas, então o hook lê as de `personaIds` (a que responde agora, as que estão trabalhando e as que
 * a pessoa usou nesta sessão: uma persona ociosa já teve a fila enviada pelo agendador do host). Recarrega quando `refreshKey` muda
 * (mensagem nova no fio) e depois de cada operação; nunca inventa texto de erro: mostra o que o host mandou.
 *
 * Fila PENDENTE de quem não trabalha: o Parar MANTÉM a fila (contracts/working-control.md: ela só sai com "Mandar agora" ou com uma mensagem nova)
 * e o balão "por cota" espera a cota, não a persona. Por isso (1) quem já mostrou balões continua sendo lida mesmo depois de sair de
 * `personaIds` e (2) ao abrir uma conversa (ou recarregar a tela) `discoverIds` (todas as personas dela) são lidas UMA vez por `discoverKey`:
 * sem isso os itens pendentes ficavam invisíveis para a pessoa (vermelho esperado do E2E-V11 "a fila é visível").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QueuedMessageView } from '@deepseek-ai/dsh-persona-host/types'
import type { QueuedMessageItem } from '../chat/QueuedMessageBubble.tsx'
import {
  dropQueued,
  editQueued,
  enqueueMessage,
  flushQueue,
  listQueue,
  queuedViewToItem,
  restoreQueued,
  workingErrorText,
  type WorkingControlRemote,
  type WorkingScope,
} from './working-control.ts'

export interface UseWorkingQueueInput {
  readonly remote: WorkingControlRemote | undefined
  readonly enabled: boolean
  readonly scopeFor: (personaId: string) => WorkingScope | null
  readonly personaIds: readonly string[]
  readonly nameOf: (personaId: string) => string
  /** Muda quando o fio muda: a fila pode ter saído sozinha (o agendador do host envia quando a persona fica ociosa). */
  readonly refreshKey: string | number
  /** Todas as personas da conversa: quem PODE ter fila pendente mesmo ociosa/parada. Lidas uma vez por `discoverKey`. */
  readonly discoverIds?: readonly string[]
  /** Identifica a conversa aberta (e quem está nela): quando muda, a leitura de descoberta roda de novo. */
  readonly discoverKey?: string
}

export interface WorkingQueueApi {
  readonly items: readonly QueuedMessageItem[]
  /** O que o host respondeu de errado (a mensagem pronta dele), ou `null`. */
  readonly error: string | null
  readonly clearError: () => void
  /** O último balão tirado: o "Desfazer" do Tirar o devolve com o MESMO id e na posição original. */
  readonly removed: QueuedMessageItem | null
  readonly enqueue: (personaId: string, text: string, reason?: 'quota') => Promise<boolean>
  /** "Mandar agora": só aquele balão. */
  readonly sendNow: (itemId: string) => Promise<void>
  /** "Editar": troca o texto do balão no host. */
  readonly edit: (itemId: string, text: string) => Promise<boolean>
  /** "Tirar". */
  readonly drop: (itemId: string) => Promise<void>
  readonly undoDrop: () => Promise<void>
  /** Esconde o Toast do Tirar (passou o tempo do Desfazer). */
  readonly dismissRemoved: () => void
}

type Views = ReadonlyMap<string, readonly QueuedMessageView[]>

const EMPTY: Views = new Map()

export function useWorkingQueue({ remote, enabled, scopeFor, personaIds, nameOf, refreshKey, discoverIds, discoverKey }: UseWorkingQueueInput): WorkingQueueApi {
  const [views, setViews] = useState<Views>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [removedView, setRemovedView] = useState<{ readonly view: QueuedMessageView; readonly personaId: string } | null>(null)
  // As personas que a pessoa usou aqui continuam sendo lidas mesmo ociosas (o balão "por cota" espera a cota, não a persona).
  const touched = useRef<Set<string>>(new Set())
  // Quem JÁ mostrou balões na última leitura: o Parar mantém a fila, então ela segue pendente (e visível) mesmo fora de `personaIds`.
  const known = useRef<Set<string>>(new Set())
  // A conversa cujas personas já foram todas lidas (leitura de descoberta); '' = nenhuma ainda.
  const discovered = useRef('')
  // LEITURAS CONCORRENTES: a tela relê a cada mensagem nova e a 1ª leitura (a de descoberta) pode terminar DEPOIS de uma mais nova. Antes a última a TERMINAR sobrescrevia tudo e a persona era
  // esquecida: o host devolvia os itens e a tela mostrava 0 (achado no host REAL, 07/11). Agora cada resultado entra por ordem de INÍCIO da leitura, persona a persona (`appliedSeq`), e uma rodada só
  // mexe em quem ela leu: quem não entrou na rodada fica como estava.
  const readSeq = useRef(0)
  const appliedSeq = useRef(new Map<string, number>())
  const idsKey = [...new Set(personaIds)].sort().join('|')
  // `scopeFor`, `nameOf` e a lista de descoberta mudam de identidade a cada render do chamador: ficam em ref para não reler a fila em loop.
  const scopeRef = useRef(scopeFor)
  scopeRef.current = scopeFor
  const nameRef = useRef(nameOf)
  nameRef.current = nameOf
  const discoverRef = useRef({ ids: discoverIds, key: discoverKey })
  discoverRef.current = { ids: discoverIds, key: discoverKey }

  const readAll = useCallback(async (): Promise<void> => {
    if (!enabled || remote === undefined) return
    const { ids: discoverList, key: discoverNow } = discoverRef.current
    const wantsDiscovery = discoverNow !== undefined && discoverNow !== '' && discovered.current !== discoverNow
    const ids = new Set<string>([
      ...idsKey.split('|').filter(id => id.length > 0),
      ...touched.current,
      ...known.current,
      ...(wantsDiscovery ? (discoverList ?? []) : []),
    ])
    readSeq.current += 1
    const mySeq = readSeq.current
    const outcomes = await Promise.all([...ids].map(async (personaId): Promise<{ readonly personaId: string; readonly rows: readonly QueuedMessageView[] | null } | null> => {
      const scope = scopeRef.current(personaId)
      if (scope === null) return null
      try {
        return { personaId, rows: await listQueue(remote, scope) }
      } catch {
        /* host sem a fila (ou ocupado): essa persona NÃO é tocada (fica como estava); a próxima leitura tenta de novo */
        return { personaId, rows: null }
      }
    }))
    const answered: { readonly personaId: string; readonly rows: readonly QueuedMessageView[] }[] = []
    for (const outcome of outcomes) {
      if (outcome === null || outcome.rows === null) continue
      // Uma leitura que COMEÇOU depois já respondeu por esta persona: este resultado é velho e não entra.
      if ((appliedSeq.current.get(outcome.personaId) ?? 0) > mySeq) continue
      appliedSeq.current.set(outcome.personaId, mySeq)
      answered.push({ personaId: outcome.personaId, rows: outcome.rows })
    }
    for (const { personaId, rows } of answered) {
      if (rows.length > 0) known.current.add(personaId)
      else known.current.delete(personaId)
    }
    // A descoberta só vale quando o host respondeu a alguma leitura (host ocupado ou sem membros ainda: tenta de novo na próxima) e a chave ainda é a atual.
    if (wantsDiscovery && answered.length > 0 && discoverRef.current.key === discoverNow) discovered.current = discoverNow
    setViews((current) => {
      const next = new Map(current)
      for (const { personaId, rows } of answered) {
        if (rows.length > 0) next.set(personaId, rows)
        else next.delete(personaId)
      }
      return next
    })
  }, [enabled, remote, idsKey])

  useEffect(() => { void readAll() }, [readAll, refreshKey, discoverKey])

  const run = useCallback(async (personaId: string, work: (scope: WorkingScope, host: WorkingControlRemote) => Promise<unknown>): Promise<boolean> => {
    const scope = scopeRef.current(personaId)
    if (remote === undefined || scope === null) return false
    try {
      await work(scope, remote)
      setError(null)
      return true
    } catch (failure) {
      // "Essa mensagem já saiu da fila." e afins: o texto é do host; a fila é relida (o balão já pode ter saído).
      setError(workingErrorText(failure))
      return false
    } finally {
      await readAll()
    }
  }, [remote, readAll])

  const items = useMemo(() => [...views.entries()]
    .flatMap(([personaId, rows]) => rows.map(row => ({ row, name: nameRef.current(personaId) })))
    .sort((a, b) => a.row.createdAt.localeCompare(b.row.createdAt) || a.row.id.localeCompare(b.row.id))
    .map(({ row, name }) => queuedViewToItem(row, name)), [views])

  // Identidades estáveis: a tela põe temporizadores (Toast do Tirar, aviso do host) que reiniciariam a cada render.
  const clearError = useCallback(() => { setError(null) }, [])
  const dismissRemoved = useCallback(() => { setRemovedView(null) }, [])
  const removed = useMemo(
    () => (removedView === null ? null : queuedViewToItem(removedView.view, nameRef.current(removedView.personaId))),
    [removedView],
  )

  const find = (itemId: string): { readonly personaId: string; readonly view: QueuedMessageView } | undefined => {
    for (const [personaId, rows] of views) {
      const view = rows.find(row => row.id === itemId)
      if (view !== undefined) return { personaId, view }
    }
    return undefined
  }

  return {
    items,
    error,
    clearError,
    removed,
    enqueue: async (personaId, text, reason) => {
      touched.current.add(personaId)
      return run(personaId, (scope, host) => enqueueMessage(host, scope, text, reason))
    },
    sendNow: async (itemId) => {
      const hit = find(itemId)
      if (hit === undefined) return
      await run(hit.personaId, (scope, host) => flushQueue(host, scope, itemId))
    },
    edit: async (itemId, text) => {
      const hit = find(itemId)
      if (hit === undefined) return false
      return run(hit.personaId, (scope, host) => editQueued(host, scope, itemId, text))
    },
    drop: async (itemId) => {
      const hit = find(itemId)
      if (hit === undefined) return
      const done = await run(hit.personaId, (scope, host) => dropQueued(host, scope, itemId))
      if (done) setRemovedView(hit)
    },
    dismissRemoved,
    undoDrop: async () => {
      const gone = removedView
      if (gone === null) return
      setRemovedView(null)
      await run(gone.personaId, (scope, host) => restoreQueued(host, scope, gone.view))
    },
  }
}
