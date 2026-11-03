export type MemberRole = 'admin' | 'member' | 'viewer'
export type MemberStatus = 'pending' | 'active'

export interface WorkspaceMember {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: MemberRole
  readonly status: MemberStatus
}

export const MOCK_MEMBERS: readonly WorkspaceMember[] = [
  { id: 'm1', name: 'Miguel', email: 'miguel@example.com', role: 'admin', status: 'active' },
  { id: 'm2', name: 'Ana', email: 'ana@example.com', role: 'member', status: 'pending' },
]
