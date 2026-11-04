import { AVATAR_96 } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import type { ApprovalItem } from './mock-data.ts'
import type { ProactiveCostEstimate, ProactiveProposal } from './proactivity-mock-data.ts'

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

export function proactiveCountLabel(dict: LocaleDict, count: number): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return count === 1 ? t('proactive.countChipOne') : t('proactive.countChipMany', { count })
}

export function proactiveCostLine(dict: LocaleDict, cost: ProactiveCostEstimate | undefined): {
  readonly text: string
  readonly muted: boolean
} {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  if (cost === undefined || (cost.tokens <= 0 && cost.runs <= 0)) {
    return { text: t('proactive.costUnknown'), muted: true }
  }
  return {
    text: t('proactive.costLine', {
      tokens: cost.tokens.toLocaleString('pt-BR'),
      runs: cost.runs,
    }),
    muted: false,
  }
}

/**
 * Heading of a hire card (A-4): "Contratar uma persona para {role}?" when the host named the role; otherwise the
 * proposed name, "Contratar {name}?". A name is never dressed up as a role.
 */
export function hireHeading(dict: LocaleDict, item: ApprovalItem): string {
  const role = item.hireRoleTitle?.trim() ?? ''
  if (role.length > 0) return bindLocale(dict, 'hire.titleRole', { role })
  return bindLocale(dict, 'hire.title', { name: item.title })
}

/** Title of any approval, as the list row and the detail heading say it. A task that needs the person is its own title. */
export function approvalTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'hire') return hireHeading(dict, item)
  if (item.kind === 'vault') return vaultHeading(dict, item)
  if (item.kind === 'attention') return item.title
  return bindLocale(dict, `${item.kind}.title`)
}

/** Heading of a Cofre card (A-4b): "Atualizar no Cofre: {campo}" when the host named the record, else "Atualizar Cofre". */
export function vaultHeading(dict: LocaleDict, item: ApprovalItem): string {
  const field = item.vaultField?.trim() ?? ''
  if (field.length > 0) return bindLocale(dict, 'vault.titleField', { field })
  return bindLocale(dict, 'vault.title')
}

/**
 * What changes, in one line ("Preço do pão: R$ 12 → R$ 14"). Needs the field AND both values from the host; with less it
 * says nothing rather than guess.
 */
export function vaultChangeLine(dict: LocaleDict, item: ApprovalItem): string | undefined {
  const field = item.vaultField?.trim() ?? ''
  const before = item.vaultBefore?.trim() ?? ''
  const after = item.vaultAfter?.trim() ?? ''
  if (field.length === 0 || before.length === 0 || after.length === 0) return undefined
  return bindLocale(dict, 'vault.change', { field, before, after })
}

/** "≈ 12 tarefas médias por mês": only when the host measured it; no number, no line. */
export function hireMonthlyTasksLine(dict: LocaleDict, item: ApprovalItem): string | undefined {
  const count = item.hireMonthlyTasks
  if (count === undefined || !Number.isFinite(count) || count <= 0) return undefined
  return bindLocale(dict, count === 1 ? 'hire.cost.one' : 'hire.cost', { count })
}

/**
 * "Por quê" line: the host's own motive, never the persona's description. A host that still sends the description as
 * its reason would label a presentation as a motive, so a reason equal to the description is not shown as one.
 */
export function hireWhyLine(dict: LocaleDict, item: ApprovalItem): string | undefined {
  const why = item.hireWhy?.trim() ?? ''
  if (why.length === 0) return undefined
  if (why.toLowerCase() === (item.hireDescription?.trim().toLowerCase() ?? '')) return undefined
  return bindLocale(dict, 'hire.why', { reason: why })
}

export function reactiveApprovalContext(dict: LocaleDict, item: ApprovalItem): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  if (item.contextBody !== undefined && item.contextBody.trim().length > 0) {
    return item.contextBody.trim()
  }
  if (item.kind === 'hire' && item.proposerName !== undefined && item.proposerName.trim().length > 0) {
    return t('hire.context', { proposer: item.proposerName })
  }
  const heading = item.kind === 'hire'
    ? t('hire.title', { name: item.title })
    : item.question
  if (item.question.trim() !== heading.trim()) return item.question
  return item.question
}

export type ApprovalHireVisual =
  | { readonly kind: 'portrait'; readonly src: string }
  | { readonly kind: 'invite' }

function hireCharacterKey(item: ApprovalItem): string | undefined {
  const fromProposal = item.hireProposal?.spec.avatar.kind === 'gallery'
    ? normalizeCharacterId(item.hireProposal.spec.avatar.ref)
    : undefined
  return normalizeCharacterId(item.hirePortraitKey ?? fromProposal ?? item.title)
}

/** Hire card avatar: gallery portrait or convidar seal (never initials on overlay URL). */
export function approvalHireVisual(item: ApprovalItem): ApprovalHireVisual | undefined {
  if (item.kind !== 'hire') return undefined
  const key = hireCharacterKey(item)
  if (key !== undefined && PORTRAITS[key] !== undefined) return { kind: 'portrait', src: PORTRAITS[key]! }
  return { kind: 'invite' }
}

/** @deprecated Use {@link approvalHireVisual}. */
export function approvalCardPortraitSrc(item: ApprovalItem): string | undefined {
  const visual = approvalHireVisual(item)
  return visual?.kind === 'portrait' ? visual.src : undefined
}

export function personaPortraitSrc(characterId: string | undefined, personaName: string): string | undefined {
  const key = normalizeCharacterId(characterId ?? personaName)
  if (key === undefined) return undefined
  return PORTRAITS[key]
}

export function proactiveImpactDetail(proposal: ProactiveProposal): string {
  return proposal.impactDetail.trim().length > 0 ? proposal.impactDetail : proposal.oneQuestion
}
