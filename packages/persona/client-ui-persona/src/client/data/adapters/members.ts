import type { TeamView } from '@deepseek-ai/dsh-persona-host/types'
import type { WorkspaceMember } from '../../members/mock-data.ts'

/** Maps host team roster to members table rows. */
export function teamToMembers(team: TeamView): readonly WorkspaceMember[] {
  return team.members.map(member => ({
    id: member.id,
    name: member.displayName,
    email: member.handle.includes('@') ? member.handle : `${member.handle}@workspace.local`,
    role: member.role === 'owner' ? 'admin' : member.role === 'member' ? 'member' : 'viewer',
    status: 'active',
  }))
}
