/** Client contract for GOV-5 Remote (Anvil); UI works with mocks until host ships. */

export type OrgChartGroupBy = 'person' | 'sector'

export type OrgPersonaStateView = 'working' | 'reviewing' | 'waiting' | 'resting' | 'stuck' | 'offline'

export interface OrgPersonaView {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly characterId?: string
  readonly sector?: string
  readonly state: OrgPersonaStateView
}

export interface OrgGroupView {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly kind: 'person' | 'sector'
  readonly sectorId?: string
  readonly away?: boolean
  readonly members: readonly OrgPersonaView[]
}

export interface OrgChartView {
  readonly workspaceId: string
  readonly groupBy: OrgChartGroupBy
  readonly rightHand?: OrgPersonaView
  readonly rightHandCaption?: string
  readonly groups: readonly OrgGroupView[]
  readonly personaCount: number
  readonly humanCount: number
}

export type HealthLevelView = 'good' | 'attention' | 'risk'

export type GovernanceFixKind =
  | 'set_substitute'
  | 'set_responsible'
  | 'set_routine_owner'
  | 'raise_autonomy'
  | 'delegate_coordination'

export interface HealthFindingView {
  readonly id: string
  readonly level: HealthLevelView
  readonly title: string
  readonly detail?: string
  readonly fixKind?: GovernanceFixKind
  readonly fixTargetId?: string
}

export interface TeamHealthView {
  readonly workspaceId: string
  readonly level: HealthLevelView
  readonly title: string
  readonly body?: string
  /** 0–100 team grade when the host provides one; omit to hide the meter. */
  readonly score?: number
  readonly findings: readonly HealthFindingView[]
}

export type TwoDayOutcomeView = 'runs' | 'waits' | 'stops'

export interface TwoDayRowView {
  readonly id: string
  readonly label: string
  readonly slots: readonly TwoDayOutcomeView[]
  readonly reason?: string
  readonly fixKind?: HealthFindingView['fixKind']
  readonly fixTargetId?: string
}

export interface TwoDayTestView {
  readonly workspaceId: string
  readonly slotLabels: readonly string[]
  readonly rows: readonly TwoDayRowView[]
}

export interface ApplyGovernanceFixRequest {
  readonly workspaceId: string
  readonly findingId: string
  readonly fixKind: GovernanceFixKind
  readonly targetId?: string
}

export interface WorkspaceScopeRequest {
  readonly workspaceId: string
}
