/**
 * Team governance domain (BRIEFING 16 / D-054).
 */

export {
  assertPersonaCharge,
  assertSector,
  assignPersonaCharge,
  autonomyRank,
  autonomyWithinCeiling,
  chargeOf,
  confirmPersonaCharge,
  defaultSectorPolicy,
  humanName,
  humanPresence,
  inheritPersonaCharge,
  routineAutonomy,
  sectorOf,
  sectorRequiresApproval,
} from './model.ts'
export type {
  AwayWindow,
  GovernanceAutonomy,
  GovernancePersona,
  GovernanceSnapshot,
  HumanMember,
  HumanPresence,
  PersonaCharge,
  RoutineCharge,
  Sector,
  SectorPolicy,
} from './model.ts'

export {
  escalationChain,
  recordApprovalAudit,
  resolveApproval,
  rightHand,
} from './escalate.ts'
export type { ApprovalAudit, ApprovalRoute, EscalationHop } from './escalate.ts'

export { orgChart } from './org.ts'
export type { OrgChart, OrgGroup, OrgPersonaCard } from './org.ts'

export {
  applyGovernanceFix,
  assessTeamHealth,
  isHumanOut,
  runTwoDayTest,
  foldTwoDayLines,
} from './health.ts'
export type {
  GovernanceFix,
  HealthItem,
  HealthKind,
  HealthReport,
  TimelineFate,
  TwoDayEvent,
  TwoDayLine,
  TwoDayLineKind,
  TwoDayResult,
} from './health.ts'

export {
  COMPANY_MODELS,
  companyModelById,
  parseStructureAsk,
  recommendStructure,
} from './recommend.ts'
export type {
  CompanyFunction,
  CompanyKind,
  CompanyModel,
  RecommendedPersona,
  RecommendedRoutine,
  StructureAsk,
  StructureRecommendation,
} from './recommend.ts'
