import type { PersonaDraft } from '../persona-editor/persona-draft.ts'

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'persona'
  return base.slice(0, 48)
}

function runnerFromHarness(harness: string): { runnerKind: 'dsh' | 'cli'; runnerCli: string } {
  const trimmed = harness.trim()
  if (trimmed === '' || trimmed === 'dsh') return { runnerKind: 'dsh', runnerCli: '' }
  const cli = trimmed.startsWith('oar:') ? trimmed.slice(4) : trimmed
  if (cli === 'dsh') return { runnerKind: 'dsh', runnerCli: '' }
  return { runnerKind: 'cli', runnerCli: cli }
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
  avatarKind: 'gallery' | 'upload' | 'silhouette'
  avatarRef: string
  runnerKind: 'dsh' | 'cli'
  runnerCli: string
  runnerModel: string
  canRecruit: boolean
  createdBy: string
  systemRoles: readonly ('coordination' | 'watchdog' | 'team_manager')[]
} {
  const systemRoles: ('coordination' | 'watchdog' | 'team_manager')[] = []
  if (draft.coordination) systemRoles.push('coordination')
  if (draft.watchdog) systemRoles.push('watchdog')
  if (draft.teamManager) systemRoles.push('team_manager')
  const avatarRef = draft.avatarSource === 'gallery' && draft.avatarRef !== undefined && draft.avatarRef.length > 0
    ? draft.avatarRef
    : draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').slice(0, 32) || 'neutral'
  const avatarKind = draft.avatarSource
  const runner = runnerFromHarness(draft.harness)
  return {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    id: slugId(draft.name),
    name: draft.name.trim(),
    title: draft.jobTitle.trim(),
    description: draft.jobDescription.trim(),
    personality: draft.personality.trim(),
    instructions: draft.instructions.trim(),
    avatarKind,
    avatarRef,
    runnerKind: runner.runnerKind,
    runnerCli: runner.runnerCli,
    runnerModel: draft.model.trim() || 'default',
    canRecruit: draft.coordination,
    createdBy: scope.memberId,
    systemRoles,
  }
}
