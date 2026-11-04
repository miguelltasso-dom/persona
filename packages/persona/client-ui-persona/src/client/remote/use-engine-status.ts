import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ENGINE_STATUS_UNKNOWN,
  fetchEngineStatus,
  retryEngineStatus,
  sameEngineStatus,
  type EngineRemoteWire,
  type EngineScope,
  type EngineStatusUi,
} from './engine-status.ts'

export interface UseEngineStatusOptions {
  /** Só lê (e faz polling) quando ligado. */
  readonly enabled: boolean
  /** Intervalo do polling enquanto a IA não está pronta; quando pronta, relê só a cada `readyPollMs` (0 = para). */
  readonly pollMs?: number
  readonly readyPollMs?: number
}

export interface UseEngineStatusResult {
  readonly status: EngineStatusUi
  /** A 1ª leitura já voltou (ou não há o que ler). Antes disso o estado é "não sei", não "tem IA". */
  readonly settled: boolean
  /** Força uma checagem agora (botão "Conferir de novo" / voltar do login). */
  readonly recheck: () => Promise<void>
}

/**
 * Estado real da IA para a faixa "Falta uma IA" e para o passo 5. Polling barato (cache do host): quando a IA
 * conecta, os pedidos retidos retomam no host e a faixa some sozinha (FR-3). Também relê ao voltar o foco da janela,
 * que é o momento em que a pessoa volta do terminal onde fez o login.
 */
export function useEngineStatus(
  remote: EngineRemoteWire | undefined,
  scope: EngineScope | null,
  { enabled, pollMs = 4_000, readyPollMs = 0 }: UseEngineStatusOptions,
): UseEngineStatusResult {
  const [status, setStatus] = useState<EngineStatusUi>(ENGINE_STATUS_UNKNOWN)
  const [settled, setSettled] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId

  const apply = useCallback((next: EngineStatusUi): void => {
    if (!sameEngineStatus(statusRef.current, next)) setStatus(next)
  }, [])

  const recheck = useCallback(async (): Promise<void> => {
    if (remote === undefined || workspaceId === undefined || projectId === undefined) return
    apply(await retryEngineStatus(remote, { workspaceId, projectId }))
  }, [apply, remote, workspaceId, projectId])

  useEffect(() => {
    if (!enabled || remote === undefined || workspaceId === undefined || projectId === undefined) return undefined
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      const next = await fetchEngineStatus(remote, { workspaceId, projectId })
      if (cancelled) return
      apply(next)
      setSettled(true)
      const delay = next.readiness === 'ready' ? readyPollMs : pollMs
      if (delay > 0) timer = setTimeout(() => { void tick() }, delay)
    }
    const onFocus = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      if (statusRef.current.readiness === 'ready') { void tick(); return }
      // Voltou do terminal onde fez o login: força uma checagem nova (o cache do host dura 60 s).
      void retryEngineStatus(remote, { workspaceId, projectId }).then((next) => {
        if (cancelled) return
        apply(next)
        if (pollMs > 0) timer = setTimeout(() => { void tick() }, pollMs)
      })
    }
    void tick()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, remote, workspaceId, projectId, pollMs, readyPollMs, apply])

  return { status, settled, recheck }
}
