/**
 * CV-8 (CONVERSAS-SPEC §A; host behind `Config.fanout`): liga o seletor "Toda a equipe ({n})" / "Quem tiver algo a dizer" do composer ao host.
 *
 * A UI não tem como "ler" a flag do host, e não deve inventá-la: ela PERGUNTA. `estimateAsk({ audience: 'everyone' })` devolve `fanout`
 * só quando a flag está ligada E há 2+ personas a endereçar; sem `fanout`, o seletor continua o de sempre e nada aparece. Os números do
 * chip ("Toda a equipe · {n} respostas · ≈ {c} chamadas") são os que o host MEDIU nessa resposta, lidos de novo quando a pessoa escolhe
 * "Toda a equipe" (os limites mudam); sem medida, o chip diz só o que é certo.
 */
import { useCallback, useEffect, useState } from 'react'
import { fanoutEstimateFromWire, type FanoutChoice, type FanoutEstimateUi } from '../chat/fanout/fanout-rules.ts'
import type { PersonaTenantScope } from './persona-remote-types.ts'

interface FanoutRemote {
  estimateAsk?(request: {
    readonly workspaceId: string
    readonly projectId: string
    readonly texto: string
    readonly streamKind: 'channel' | 'dm'
    readonly ownerId: string
    readonly audience: 'everyone' | 'relevant'
  }): unknown
}

export interface ConnectedFanoutInput {
  /** O Remote do host (`ctx.remote.persona`); sem `estimateAsk`, nada muda na tela. */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  /** O id do canal; `null` enquanto o host não respondeu. */
  readonly ownerId: string | null
}

export interface ConnectedFanout {
  /** Presença = o host tem o fan-out ligado e há 2+ personas: o composer mostra as 2 linhas extras. */
  readonly fanoutChoices?: { readonly teamCount: number }
  readonly onFanoutChoiceChange?: (choice: FanoutChoice | undefined) => void
  readonly fanoutEstimate?: FanoutEstimateUi
}

export function useConnectedFanout({ remote, tenant, ownerId }: ConnectedFanoutInput): ConnectedFanout {
  const [estimate, setEstimate] = useState<FanoutEstimateUi | null>(null)
  const [choice, setChoice] = useState<FanoutChoice | undefined>(undefined)
  const wire = remote as FanoutRemote | undefined
  const canAsk = wire !== undefined && typeof wire.estimateAsk === 'function' && tenant !== null && ownerId !== null && ownerId !== ''
  const workspaceId = tenant?.workspaceId
  const projectId = tenant?.projectId

  const ask = useCallback(async (): Promise<FanoutEstimateUi | null> => {
    if (wire?.estimateAsk === undefined || workspaceId === undefined || projectId === undefined || ownerId === null || ownerId === '') return null
    try {
      const view = await Promise.resolve(wire.estimateAsk({ workspaceId, projectId, texto: '', streamKind: 'channel', ownerId, audience: 'everyone' }))
      const read = fanoutEstimateFromWire(view)
      // One persona alone is not a team: the host already omits `fanout` then, but never show "Toda a equipe (1)".
      return read !== undefined && read.replies >= 2 ? read : null
    } catch {
      return null
    }
  }, [wire, workspaceId, projectId, ownerId])

  // The probe: does this host have "Toda a equipe"? Asked once per channel.
  useEffect(() => {
    if (!canAsk) { setEstimate(null); return }
    let cancelled = false
    void ask().then((read) => { if (!cancelled) setEstimate(read) })
    return () => { cancelled = true }
  }, [canAsk, ask])

  // The numbers are read again when the person actually picks "Toda a equipe": the limits of the day move.
  useEffect(() => {
    if (!canAsk || choice !== 'everyone') return
    let cancelled = false
    void ask().then((read) => { if (!cancelled && read !== null) setEstimate(read) })
    return () => { cancelled = true }
  }, [canAsk, ask, choice])

  const onFanoutChoiceChange = useCallback((next: FanoutChoice | undefined) => { setChoice(next) }, [])

  if (!canAsk || estimate === null) return {}
  return {
    fanoutChoices: { teamCount: estimate.replies },
    onFanoutChoiceChange,
    ...(choice === 'everyone' ? { fanoutEstimate: estimate } : {}),
  }
}
