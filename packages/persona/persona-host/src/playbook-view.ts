/**
 * The playbook as the tab "Como ela trabalha" reads it: one row per kind of work, with how far it is from being a skill. Read-only apart from
 * "Esquecer". The notes themselves are kept by playbook.ts; nothing here calls a model.
 */

import { PRIVATE_DM_TASK_TITLE } from './dm-ticket-view.ts'
import type { ScreensHost } from './screens.ts'
import { listPlaybook, OFFER_DAYS, OFFER_USES, PLAYBOOK_KIND, type PlaybookNote } from './playbook.ts'
import type { ApprovalView, PlaybookNoteView, SkillView } from './types.ts'

/**
 * D-119: a note that learned from a Task born in a DM holds that DM's words (the Task's title, what it asked, what the owner asked to change): only the people in ALL of its DMs read it.
 * A note with no DM (a channel, or one made before this was kept) is the project's.
 * @param note - The note.
 * @param inDm - Whether the reader is in a DM (`dmSeenByActor`).
 */
export function mayReadNote(note: { readonly dms?: readonly string[] }, inDm: (dmId: string) => boolean): boolean {
  return (note.dms ?? []).every(inDm)
}

/** What a reader who is not in the DM of a note gets in place of the card "Virar skill?" and of the skill made from it: no title, no request, no body. */
export interface PlaybookPrivacy {
  readonly card: (card: ApprovalView) => ApprovalView
  readonly skill: (skill: SkillView) => SkillView
}

/**
 * D-119: the card in Aprovações ("<Ela> aprendeu: <title>") and the candidate skill (name, and a body with the request and the adjustments) are made from a note, so they carry the same words.
 * @param host - The screens host (the notes).
 * @param projectId - Tenant.
 * @param inDm - Whether the reader is in a DM.
 * @returns The two masks, for ONE reader.
 */
export function playbookPrivacy(host: ScreensHost, projectId: string, inDm: (dmId: string) => boolean): PlaybookPrivacy {
  // Only the notes this reader may NOT read matter; none (the common case) leaves everything as it is.
  const hidden = listPlaybook(host.screens, projectId).filter(note => !mayReadNote(note, inDm))
  if (hidden.length === 0) return { card: card => card, skill: skill => skill }
  return {
    // The offer's id is `skill-offer-<note>` or `skill-offer-<note>-<n>`; a note whose id is the start of another's is ambiguous, so ANY hidden note that could be it hides the title.
    card: card => (card.kind === 'skill' && hidden.some(note => card.id === `skill-offer-${note.id}` || card.id.startsWith(`skill-offer-${note.id}-`))
      ? { ...card, title: `${card.personaName} aprendeu: ${PRIVATE_DM_TASK_TITLE.toLowerCase()}` }
      : card),
    skill: skill => (hidden.some(note => skill.id === `learned-${note.id}`) ? { ...skill, name: PRIVATE_DM_TASK_TITLE, body: '' } : skill),
  }
}

function stageOf(host: ScreensHost, projectId: string, note: PlaybookNote): PlaybookNoteView['stage'] {
  if (note.offered !== undefined) {
    if (host.getSkillRecord(projectId, note.offered.skillId)?.enabled === true) return 'skill'
    if (note.declined === undefined) return 'offered'
  }
  // Three uses are not enough while they are all on one day in one conversation: it waits for another day or conversation.
  const days = new Set(note.uses.map(use => use.day)).size
  const conversations = new Set(note.uses.flatMap(use => (use.conversation === undefined ? [] : [use.conversation]))).size
  return note.declined === undefined && note.uses.length >= OFFER_USES && days < OFFER_DAYS && conversations < OFFER_DAYS ? 'ready' : 'learning'
}

/**
 * @param host - The screens host (notes, skills).
 * @param projectId - Tenant.
 * @param personaId - Only hers; omit for every persona.
 * @param inDm - Whether the reader is in a DM (D-119): a note that learned from a DM is for those in it. Absent = in none (the notes of a DM are left out: it fails closed).
 * @returns Newest use first; a note with no use yet (only what the owner asked to change) goes last.
 */
export function playbookViews(host: ScreensHost, projectId: string, personaId?: string, inDm: (dmId: string) => boolean = () => false): PlaybookNoteView[] {
  return listPlaybook(host.screens, projectId, personaId)
    .filter(note => mayReadNote(note, inDm))
    .map((note): PlaybookNoteView => ({
      id: note.id,
      personaId: note.personaId,
      title: note.title,
      uses: note.uses.length,
      lastAt: note.uses.at(-1)?.at ?? note.createdAt,
      stage: stageOf(host, projectId, note),
      // After "Agora não" the count starts again: three more uses before it is offered once more.
      progress: Math.min(OFFER_USES, note.uses.length - (note.declined?.uses ?? 0)),
      goal: OFFER_USES,
      adjustments: note.adjustments,
      ...(note.offered === undefined ? {} : { approvalId: note.offered.approvalId }),
    }))
    .sort((left, right) => (right.uses > 0 ? 1 : 0) - (left.uses > 0 ? 1 : 0) || right.lastAt.localeCompare(left.lastAt))
}

/**
 * Forget one note ("Esquecer"). A skill already made from it stays: it has its own screen.
 * @param host - The screens host.
 * @param projectId - Tenant.
 * @param id - The note.
 * @param inDm - Whether the reader is in a DM (D-119). A note of a DM they are not in is answered as if it did not exist: it is neither forgotten nor confirmed.
 * @returns Whether there was a note to forget.
 */
export function forgetPlaybookNote(host: ScreensHost, projectId: string, id: string, inDm: (dmId: string) => boolean = () => false): boolean {
  const note = host.screens.get<PlaybookNote>(projectId, PLAYBOOK_KIND, id)
  if (note === undefined || !mayReadNote(note, inDm)) return false
  host.screens.delete(projectId, PLAYBOOK_KIND, id)
  return true
}
