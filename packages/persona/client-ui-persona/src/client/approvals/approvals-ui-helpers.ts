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
