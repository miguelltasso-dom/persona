import type { DmRowUi } from '../chat/DirectMessagesView.tsx'
import type { SelectablePersonaOption } from '../chat/NewDmPersonaModal.tsx'

/**
 * A-2 (NAV-SPEC regra 4): a lista de DMs mostra a equipe inteira. Quem já tem conversa vem primeiro, na ordem do host;
 * quem nunca conversou entra depois, na ordem da equipe, como linha "Começar conversa" (o clique abre a DM).
 */
export function appendNotStartedRows(
  rows: readonly DmRowUi[],
  personas: readonly SelectablePersonaOption[],
): readonly DmRowUi[] {
  const waiting: DmRowUi[] = personas
    .filter(persona => !persona.hasExistingDm)
    .map(persona => ({
      id: `start:${persona.id}`,
      peerId: persona.id,
      peerName: persona.name,
      characterId: persona.characterId,
      role: persona.role,
      stateLabel: persona.stateLabel,
      stateTone: persona.stateTone,
      state: persona.state,
      notStarted: true,
    }))
  return waiting.length === 0 ? rows : [...rows, ...waiting]
}
