/**
 * "Seus números" (colheita item 19a) · liga os números fixados ao HOST e devolve o que a tela precisa. Sem as cinco chamadas no host, sem escopo
 * ou sem host, devolve `undefined` e a tela fica como era (nem seção, nem "Fixar"). A lista é relida ao montar, a cada minuto (o host atualiza
 * em silêncio; reler é uma chamada local) e depois de cada ação.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PersonaTenantScope } from '../remote/persona-remote-types.ts'
import type { IndicatorTestUi, IndicatorUi } from './indicators-model.ts'
import { indicatorsRemoteFrom, listIndicators, pinIndicator, refreshIndicator, testIndicator, unpinIndicator } from './indicators-remote.ts'

const POLL_MS = 60_000

export interface IndicatorsBinding {
  readonly items: readonly IndicatorUi[]
  /** The first read of the host has arrived (before it, the section shows a skeleton, never "nada fixado"). */
  readonly loaded: boolean
  /** The ids of the persona messages whose number is already pinned. */
  readonly pinnedMessageIds: ReadonlySet<string>
  /** "Testar agora": the real number, or a throw with the host's sentence. */
  test(messageId: string): Promise<IndicatorTestUi>
  /** "Fixar" what the test showed. */
  pin(input: { readonly testId: string; readonly name: string; readonly schedule: 'hourly' | 'daily'; readonly alertDropPct?: number }): Promise<void>
  unpin(id: string): Promise<void>
  /** "Atualizar agora": the value stays while it updates. */
  refresh(id: string): Promise<void>
}

export interface UseIndicatorsInput {
  /** The host Remote (`ctx.remote.persona`). */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
}

export function useIndicators({ remote, tenant }: UseIndicatorsInput): IndicatorsBinding | undefined {
  const host = indicatorsRemoteFrom(remote)
  const workspaceId = tenant?.workspaceId ?? ''
  const projectId = tenant?.projectId ?? ''
  const ready = host !== undefined && workspaceId !== '' && projectId !== ''
  const [items, setItems] = useState<readonly IndicatorUi[]>([])
  const [loaded, setLoaded] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (!ready || host === undefined) return undefined
    let cancelled = false
    const read = (): void => {
      void listIndicators(host, { workspaceId, projectId })
        .then((next) => { if (!cancelled) { setItems(next); setLoaded(true) } })
        .catch(() => { if (!cancelled) setLoaded(true) /* sem a leitura o que já está na tela continua */ })
    }
    read()
    const timer = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') read() }, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
    // `host` é o próprio Remote (estável); o que refaz a leitura é o escopo e uma ação.
  }, [ready, host, workspaceId, projectId, bump])

  const test = useCallback((messageId: string): Promise<IndicatorTestUi> => {
    if (host === undefined) return Promise.reject(new Error('sem host'))
    return testIndicator(host, { workspaceId, projectId }, messageId)
  }, [host, workspaceId, projectId])

  const pin = useCallback(async (input: { readonly testId: string; readonly name: string; readonly schedule: 'hourly' | 'daily'; readonly alertDropPct?: number }): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    const made = await pinIndicator(host, { workspaceId, projectId }, input)
    setItems(current => [...current.filter(item => item.id !== made.id), made])
    setBump(value => value + 1)
  }, [host, workspaceId, projectId])

  const unpin = useCallback(async (id: string): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    await unpinIndicator(host, { workspaceId, projectId }, id)
    setItems(current => current.filter(item => item.id !== id))
    setBump(value => value + 1)
  }, [host, workspaceId, projectId])

  const refresh = useCallback(async (id: string): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    setItems(current => current.map(item => (item.id === id ? { ...item, status: 'updating' as const } : item)))
    try {
      const fresh = await refreshIndicator(host, { workspaceId, projectId }, id)
      setItems(current => current.map(item => (item.id === id ? fresh : item)))
    } catch (error: unknown) {
      setBump(value => value + 1) // the host knows the real state
      throw error
    }
  }, [host, workspaceId, projectId])

  const pinnedMessageIds = useMemo(() => new Set(items.map(item => item.sourceMessageId)), [items])
  return useMemo(() => (ready ? { items, loaded, pinnedMessageIds, test, pin, unpin, refresh } : undefined), [ready, items, loaded, pinnedMessageIds, test, pin, unpin, refresh])
}

const IndicatorsContext = createContext<IndicatorsBinding | undefined>(undefined)

/** Gives the thread the numbers binding ("Fixar na Visão geral" under a persona's number). Mount it once around a conversation. */
export function IndicatorsProvider({ remote, tenant, children }: UseIndicatorsInput & { readonly children: ReactNode }): ReactNode {
  const binding = useIndicators({ remote, tenant })
  return <IndicatorsContext.Provider value={binding}>{children}</IndicatorsContext.Provider>
}

/** The numbers binding of the nearest provider (`undefined` = no "Fixar" here). */
export function useIndicatorsContext(): IndicatorsBinding | undefined {
  return useContext(IndicatorsContext)
}
