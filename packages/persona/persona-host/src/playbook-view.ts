/**
 * The playbook as the tab "Como ela trabalha" reads it: one row per kind of work, with how far it is from being a skill. Read-only apart from
 * "Esquecer". The notes themselves are kept by playbook.ts; nothing here calls a model.
 */

import type { ScreensHost } from './screens.ts'
import { listPlaybook, OFFER_DAYS, OFFER_USES, PLAYBOOK_KIND, type PlaybookNote } from './playbook.ts'
import type { PlaybookNoteView } from './types.ts'

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
 * @returns Newest use first; a note with no use yet (only what the owner asked to change) goes last.
 */
export function playbookViews(host: ScreensHost, projectId: string, personaId?: string): PlaybookNoteView[] {
  return listPlaybook(host.screens, projectId, personaId)
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
 * @returns Whether there was a note to forget.
 */
export function forgetPlaybookNote(host: ScreensHost, projectId: string, id: string): boolean {
  if (host.screens.get(projectId, PLAYBOOK_KIND, id) === undefined) return false
  host.screens.delete(projectId, PLAYBOOK_KIND, id)
  return true
}
