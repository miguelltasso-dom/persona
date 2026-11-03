import type { ChannelPersonaMember } from '../team/persona-work-state.ts'

/** Default "Responde:" persona — coordination role, not first roster slot. */
export function defaultChannelResponderId(members: readonly ChannelPersonaMember[]): string {
  if (members.length === 0) return ''
  const coordinator = members.find(member => member.systemRoles?.includes('coordination') === true)
  return coordinator?.id ?? members[0]!.id
}
