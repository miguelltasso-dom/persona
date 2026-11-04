import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineScope } from './engine-status.ts'
import {
  ENGINE_LIMITS_LOADING,
  ENGINE_LIMITS_UNAVAILABLE,
  loadEngineLimits,
  type EngineLimitsRemote,
  type EngineLimitsUi,
} from './engine-limits.ts'

export interface UseEngineLimitsResult {
  readonly limits: EngineLimitsUi
  /** Lê as cotas agora (ao abrir o `/limites` ou a gaveta); mostra "lendo" até a resposta chegar. */
  readonly load: () => void
}

/**
 * Limites reais do motor sob demanda: nada é consultado até `load()` (o painel abriu). Antes disso o estado é
 * "indisponível", que nunca aparece como número. Sem remote ou sem escopo, continua indisponível.
 */
export function useEngineLimits(remote: EngineLimitsRemote | undefined, scope: EngineScope | null): UseEngineLimitsResult {
  const [limits, setLimits] = useState<EngineLimitsUi>(ENGINE_LIMITS_UNAVAILABLE)
  const alive = useRef(true)
  const ticket = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback((): void => {
    if (remote === undefined || workspaceId === undefined || projectId === undefined) {
      setLimits(ENGINE_LIMITS_UNAVAILABLE)
      return
    }
    ticket.current += 1
    const mine = ticket.current
    setLimits(ENGINE_LIMITS_LOADING)
    void loadEngineLimits(remote, { workspaceId, projectId }).then((next) => {
      if (alive.current && mine === ticket.current) setLimits(next)
    })
  }, [remote, workspaceId, projectId])
  return { limits, load }
}
