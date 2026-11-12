import type { ShellKey } from '../locale/shell/locales.ts'
import type { DmRowUi } from '../chat/DirectMessagesView.tsx'
import { PERSONA_STATE_CHIP_TONE, PERSONA_STATE_LABEL, personaStateOf } from '../team/persona-state.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'

/**
 * Carbon P1-11: the conversation row of a persona, with what the team strip already knows about her. The row used to copy only the activity, so a paused
 * persona, one inside a Janela de silêncio and one working in a draft all read "Disponível"/"Trabalhando" in the DM header. The label and tone come from
 * the one state vocabulary (`team/persona-state.ts`), the same words as the rail and the strip.
 *
 * @param row The host's conversation row.
 * @param member The persona on the strip with that name, when there is one.
 * @param workingOn The title of the task she is on right now (real title, never an id).
 * @param shellT The shell translator.
 * @returns The row the presentation draws.
 */
export function dmRowOf(
  row: { readonly id: string; readonly peerId: string; readonly peerName: string },
  member: ChannelPersonaMember | undefined,
  workingOn: string | undefined,
  shellT: (key: ShellKey) => string,
): DmRowUi {
  if (member === undefined) return { id: row.id, peerId: row.peerId, peerName: row.peerName }
  const named = personaStateOf(member)
  return {
    id: row.id,
    peerId: row.peerId,
    peerName: row.peerName,
    characterId: member.id,
    role: member.role,
    stateLabel: shellT(PERSONA_STATE_LABEL[named]),
    stateTone: PERSONA_STATE_CHIP_TONE[named],
    state: member.state,
    ...(member.draftFiles === undefined ? {} : { draftFiles: member.draftFiles }),
    ...(member.quiet === true ? { quiet: true } : {}),
    ...(member.paused === true ? { paused: true } : {}),
    ...(member.step === undefined ? {} : { step: member.step }),
    ...(workingOn === undefined ? {} : { workingOn }),
  }
}
