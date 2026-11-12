/**
 * DESIGN-01 (Muse, 11/11) #03: a pílula "Modelo · Esforço" do composer mostra a configuração DA PERSONA que responde (a que o cartão dela e Configurações › Personas
 * mostram: "Opus · max", "Sonnet", "Padrão do motor") e abre o diálogo do EFF-1 dela. Não é uma escolha por mensagem (esse contrato não existe): nada aqui envia nem guarda.
 * Sem equipe, sem como abrir o diálogo ou com o EFF-1 desligado, `undefined` e o composer não desenha a pílula (nunca um botão morto).
 */
import { isEngineEffortEnabled } from '../profile/engine-effort-flag.ts'
import { formatEngineEffortChip, nativeEffortName } from '../profile/engine-effort-model.ts'
import { resolveHostPersonaId } from '../remote/map-host-ui.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'

export interface ResponderEngine {
  /** O texto da pílula da persona (o id do composer, o rosto: "nina"). `undefined` = nada a mostrar. */
  readonly label: (memberId: string) => string | undefined
  /** Abre o diálogo do EFF-1 daquela persona. */
  readonly onOpen: (memberId: string) => void
}

export function buildResponderEngine(input: {
  readonly team: TeamView | null
  readonly openEngine: ((hostPersonaId: string) => void) | undefined
  /** "Padrão do motor": o texto quando a persona não escolheu modelo nem esforço. */
  readonly defaultLabel: string
}): ResponderEngine | undefined {
  const { team, openEngine, defaultLabel } = input
  if (team === null || openEngine === undefined || !isEngineEffortEnabled()) return undefined
  return {
    label: (memberId) => {
      const hostId = resolveHostPersonaId(team, memberId)
      const engine = team.personas.find(persona => persona.id === hostId)?.engine
      return formatEngineEffortChip({ runnerModel: engine?.runnerModel ?? null, runnerEffort: engine?.runnerEffort ?? null }, nativeEffortName, defaultLabel)
    },
    onOpen: (memberId) => { openEngine(resolveHostPersonaId(team, memberId)) },
  }
}
