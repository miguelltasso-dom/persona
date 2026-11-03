import type { PersonaDraft } from '../persona-editor/persona-draft.ts'

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'persona'
  return base.slice(0, 48)
}

/** Host `createPersona` payload from editor draft (hire path). */
export function draftToCreatePersonaRequest(
  draft: PersonaDraft,
  scope: { workspaceId: string; projectId: string; memberId: string },
): {
  workspaceId: string
  projectId: string
  id: string
  name: string
  title: string
  description: string
  personality: string
  instructions: string
  avatarKind: 'gallery'
  avatarRef: string
  runnerKind: 'dsh'
  runnerCli: string
  runnerModel: string
  canRecruit: boolean
  createdBy: string
  systemRoles: readonly ('coordination' | 'watchdog')[]
} {
  const systemRoles: ('coordination' | 'watchdog')[] = []
  if (draft.coordination) systemRoles.push('coordination')
  if (draft.watchdog) systemRoles.push('watchdog')
  const avatarRef = draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').slice(0, 32) || 'neutral'
  return {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    id: slugId(draft.name),
    name: draft.name.trim(),
    title: draft.jobTitle.trim(),
    description: draft.jobDescription.trim(),
    personality: draft.personality.trim(),
    instructions: draft.instructions.trim(),
    avatarKind: 'gallery',
    avatarRef,
    runnerKind: 'dsh',
    runnerCli: draft.harness.trim(),
    runnerModel: draft.model.trim() || 'default',
    canRecruit: draft.coordination,
    createdBy: scope.memberId,
    systemRoles,
  }
}
