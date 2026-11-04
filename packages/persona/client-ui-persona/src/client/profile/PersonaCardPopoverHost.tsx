/** Single popover instance for rail, #geral, organograma (PERSONA-CARD-SPEC §5). */

import { useSyncExternalStore, type ReactNode } from 'react'
import { PersonaCardPopover, usePersonaCardController, type PersonaCardController } from '../primitives/index.ts'
import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'
import { PersonaInfoCard, type PersonaCardInfo } from './PersonaInfoCard.tsx'

export interface PersonaCardPopoverHostProps {
  readonly card: PersonaCardController
  readonly bridge: PersonaCardShellBridge
  readonly openPersonaProfile: (personaId: string) => void
  readonly cardData: PersonaCardInfo | undefined
}

export function PersonaCardPopoverHost({
  card,
  bridge,
  openPersonaProfile,
  cardData,
}: PersonaCardPopoverHostProps): ReactNode {
  useSyncExternalStore(bridge.revision.subscribe, bridge.revision.getSnapshot, bridge.revision.getSnapshot)
  if (cardData === undefined) return null
  return (
    <PersonaCardPopover {...card.popoverProps} label={cardData.name}>
      <PersonaInfoCard
        info={cardData}
        dict={bridge.cardDict}
        onOpenProfile={() => { card.close(); openPersonaProfile(cardData.personaId) }}
        onEdit={() => { card.close(); bridge.editPersona(cardData.personaId) }}
        onSendMessage={(text) => { card.close(); bridge.sendToPersona(cardData.personaId, text) }}
        onTogglePause={() => { card.close(); bridge.togglePause(cardData.personaId) }}
        onSwitchEngine={() => { card.close(); bridge.switchEngine(cardData.personaId) }}
        onEditTalk={() => { card.close(); bridge.editTalk(cardData.personaId) }}
        onTeach={() => { card.close(); bridge.teachPersona(cardData.personaId) }}
      />
    </PersonaCardPopover>
  )
}

/** Resolve card row for the open persona id. */
export function usePersonaCardData(
  bridge: PersonaCardShellBridge | undefined,
  hostPersonaId: string | null,
): PersonaCardInfo | undefined {
  useSyncExternalStore(
    bridge?.revision.subscribe ?? (() => () => {}),
    () => bridge?.revision.getSnapshot() ?? { n: 0 },
    () => bridge?.revision.getSnapshot() ?? { n: 0 },
  )
  if (bridge === undefined || hostPersonaId === null) return undefined
  return bridge.cardInfo(hostPersonaId)
}

export { usePersonaCardController }
