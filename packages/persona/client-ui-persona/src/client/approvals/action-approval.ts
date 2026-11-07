/**
 * HT-9 / D-095 (the permission-gated send ships in v1.1): an external action a persona wants to take (an e-mail, a post, a payment, a delete)
 * waits in Aprovações as `ApprovalView.kind: 'action'` with `actionPreview` — the REAL content. The card is the same one the thread shows
 * (`chat/ActionPreviewCard`): everything that leaves the company is seen first, and a preview that is cut, masked or missing what it must
 * show is `blind`: no Enviar ("não dá para enviar às cegas"). This file only turns the host's approval into the card's model — the
 * validation is `mapActionPreview`'s, once.
 */

import type { ApprovalView, MessageView } from '@deepseek-ai/dsh-persona-host/types'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import { mapActionPreview, type ActionPreviewUi } from '../remote/map-host-ui.ts'
import type { TeamView } from '../remote/persona-remote-types.ts'
import type { ApprovalItem } from './mock-data.ts'

/** What the generic Aceitar / Dispensar of an inbox detail does for a card, by its kind (the pure rule behind `decideItem`). */
export type GenericDecisionRoute =
  | 'ignore' // a capture-only example: never reaches the host
  | 'connector' // Aceitar = "só desta vez", Dispensar = "Agora não"
  | 'action-cancel' // an external action: Dispensar is the contract's cancel
  | 'action-refused' // an external action: Aceitar is refused here, the detail does not show what would leave the company
  | 'generic'

export function genericDecisionRoute(
  item: { readonly kind: ApprovalItem['kind']; readonly example?: boolean | undefined; readonly blindAction?: boolean | undefined },
  accept: boolean,
): GenericDecisionRoute {
  if (item.example === true) return 'ignore'
  // An external action that arrived without its preview (degraded to a plain card) is cancel-only, exactly like one with a preview.
  if (item.blindAction === true) return accept ? 'action-refused' : 'action-cancel'
  if (item.kind === 'connector') return 'connector'
  if (item.kind === 'action') return accept ? 'action-refused' : 'action-cancel'
  return 'generic'
}

/** The approval has no team to look the persona up in; the face comes from the name (the same way the other cards do). */
const NO_TEAM = { personas: [], members: [] } as unknown as TeamView

/**
 * @param view - The host's approval (`kind: 'action'`).
 * @returns The card's model, or `undefined` when the approval carries no usable preview (the card then degrades to the host's own words).
 */
export function actionPreviewFromApproval(view: ApprovalView): ActionPreviewUi | undefined {
  const preview = view.actionPreview
  if (preview === undefined) return undefined
  // The thread's mapper wants the message shape: the approval IS the id and the persona of the card.
  const asMessage = { actionPreview: { ...preview, approvalId: view.id, personaId: view.personaId, personaName: view.personaName } } as unknown as MessageView
  const ui = mapActionPreview(asMessage, NO_TEAM)
  if (ui === undefined) return undefined
  const characterId = normalizeCharacterId(view.personaName)
  return {
    ...ui,
    // A part that is hidden (a secret) is the same rule as a cut preview: it cannot be approved blind.
    blind: ui.blind || preview.masked === true,
    ...(characterId === undefined ? {} : { characterId: characterId as Exclude<ActionPreviewUi['characterId'], undefined> }),
  }
}
