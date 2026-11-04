/**
 * "Estou fora" no HOST (Gauge GOV-10): o interruptor do rail era só estado do cliente — o organograma não mostrava
 * "Fora" e o host/engine não sabia, então "as aprovações vão para X" era só texto. Agora a mudança vai para
 * `setAvailability` (janela, com início e fim), e ao voltar/expirar vai `available`.
 */
import type { SetAvailabilityRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { UserAwayState } from './UserAwayControl.tsx'

export const AWAY_STORAGE_KEY = 'persona.user.away'

/** Sem prazo conhecido (estado antigo), o host recebe uma janela de 24 h: nunca fica "fora" para sempre. */
const DEFAULT_AWAY_MS = 24 * 60 * 60 * 1000

export interface AvailabilityTenant {
  readonly workspaceId: string
  /** O membro humano (a própria pessoa) que se marca fora. */
  readonly memberId: string
}

/** Pedido do host para o estado do interruptor. */
export function availabilityRequest(tenant: AvailabilityTenant, state: UserAwayState, now = Date.now()): SetAvailabilityRequest {
  const from = new Date(now).toISOString()
  if (!state.isAway) {
    return { workspaceId: tenant.workspaceId, humanId: tenant.memberId, kind: 'available', from, until: from }
  }
  const until = new Date(state.untilAt !== undefined && state.untilAt > now ? state.untilAt : now + DEFAULT_AWAY_MS).toISOString()
  return { workspaceId: tenant.workspaceId, humanId: tenant.memberId, kind: 'away', from, until }
}

export interface AvailabilityWire {
  setAvailability?(request: SetAvailabilityRequest): unknown
}

/**
 * Manda o estado ao host. Falha de rede/permissão não derruba a tela (o interruptor continua valendo no cliente e a
 * próxima mudança tenta de novo); host antigo sem o método = no-op. Devolve se o host aceitou.
 */
export async function syncAvailability(
  remote: AvailabilityWire | undefined,
  tenant: AvailabilityTenant | null,
  state: UserAwayState,
  now = Date.now(),
): Promise<boolean> {
  if (remote?.setAvailability === undefined || tenant === null) return false
  try {
    const result = await Promise.resolve(remote.setAvailability(availabilityRequest(tenant, state, now)))
    return !(typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false)
  } catch {
    return false
  }
}

/** Estado guardado no navegador (o mesmo que o rail usa), sem lançar. */
export function readStoredAway(): UserAwayState | null {
  try {
    const raw = localStorage.getItem(AWAY_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<UserAwayState>
    return typeof parsed.isAway === 'boolean' ? (parsed as UserAwayState) : null
  } catch {
    return null
  }
}
