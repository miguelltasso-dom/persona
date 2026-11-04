/**
 * Passo 5 do onboarding ligado ao estado REAL do host (FR-2, FIRST-DELIVERY-SPEC): a fase nunca é adivinhada,
 * sai da combinação "IA pronta?" (getEngineStatus) + "marco da primeira entrega" (getFirstDelivery) + erro tipado
 * do #geral. Puro e sem React, para a máquina de estados ser testada sem montar a tela.
 *
 *   intro ──(IA indisponível)──▶ needsEngine ──(IA pronta)──▶ intro
 *   intro ──Pedir agora──▶ working ──(marco ready)──▶ celebrate
 *   working ──45 s──▶ slow ──(marco ready)──▶ celebrate
 *   working|slow ──(marco failed | erro novo)──▶ failed ──Tentar de novo──▶ working
 *   working|slow ──(IA some com o pedido retido)──▶ needsEngine ──(IA volta)──▶ working
 */
import type { RunErrorPayload } from '../primitives/index.ts'
import type { EngineStatusUi } from '../remote/engine-status.ts'
import type { FirstDeliveryView } from '../remote/persona-remote-types.ts'
import type { FirstDeliveryPhase } from './OnboardingFirstDeliveryStep.tsx'

export interface FirstDeliveryPhaseInput {
  readonly phase: FirstDeliveryPhase
  /** A pessoa já tocou em "Pedir agora" (o pedido existe no host). */
  readonly requested: boolean
  readonly engine: EngineStatusUi
  readonly delivery: FirstDeliveryView | null | undefined
  /** Cartão da entrega já chegou em Concluído no quadro (derivado do snapshot live). */
  readonly milestoneDone: boolean
  /** Existe um erro tipado NOVO no #geral desde o pedido (já descontado o baseline). */
  readonly freshRunError: boolean
  /** Passaram 45 s esperando. */
  readonly slowElapsed: boolean
  /** Janela logo após "Tentar de novo": o `failed` do host ainda é o antigo. */
  readonly retryGrace: boolean
  /** O próprio pedido não chegou ao host (completeOnboarding falhou): a pessoa não pode ficar sem saída. */
  readonly startFailed?: boolean
}

/** Próxima fase. `celebrate` é terminal (a pessoa decide: aceitar ou pedir ajuste). */
export function nextFirstDeliveryPhase(input: FirstDeliveryPhaseInput): FirstDeliveryPhase {
  const { phase, requested, engine, delivery, milestoneDone, freshRunError, slowElapsed, retryGrace } = input
  if (phase === 'celebrate') return 'celebrate'
  if (requested && input.startFailed === true) return 'failed'

  const deliveryStatus = delivery?.status ?? 'idle'
  if (requested && (deliveryStatus === 'ready' || milestoneDone)) return 'celebrate'

  if (!requested) {
    return engine.readiness === 'unavailable' ? 'needsEngine' : 'intro'
  }

  const hostFailed = deliveryStatus === 'failed' && !retryGrace
  if (engine.readiness === 'unavailable' && !hostFailed) return 'needsEngine'
  if (hostFailed || freshRunError) return 'failed'
  return slowElapsed ? 'slow' : 'working'
}

/**
 * O erro tipado a mostrar no `failed`: o MAIS RECENTE do #geral (não o primeiro da lista, que pode ser de um
 * pedido antigo). Sem erro no fio, descreve pelo motivo real do host em vez de inventar "não logado no Claude".
 */
export function runErrorForFailed(
  latest: RunErrorPayload | undefined,
  engine: EngineStatusUi,
  options: { readonly startFailed?: boolean; readonly providerLabel?: string } = {},
): RunErrorPayload {
  if (options.startFailed === true) return { code: 'app_offline' }
  if (latest !== undefined) return latest
  const provider = options.providerLabel
  const base = provider === undefined ? {} : { provider }
  if (engine.readiness === 'unavailable') {
    if (engine.reason === 'quota_exhausted') return { code: 'quota_exhausted', ...base }
    if (engine.reason === 'login_required') return { code: 'not_logged_in', ...base }
    return { code: 'cli_not_found', ...base }
  }
  return { code: 'engine_unavailable', ...base }
}
