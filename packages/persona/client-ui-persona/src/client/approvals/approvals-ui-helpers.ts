import { AVATAR_96 } from '../assets/generated-imports.ts'
import { dropMoneySegments, usageSuffix } from '../chat/quota-text.ts'
import { pt as chatDict } from '../locale/chat/locales.ts'
import { connectorQuestion, connectorTitle, connectorText } from './connector-ask.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import { personaFaceSrc } from '../hire/persona-face.ts'
import type { ApprovalItem } from './mock-data.ts'
import type { ProactiveCostEstimate, ProactiveProposal } from './proactivity-mock-data.ts'

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

export function proactiveCountLabel(dict: LocaleDict, count: number): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return count === 1 ? t('proactive.countChipOne') : t('proactive.countChipMany', { count })
}

/** The quota phrases live in the chat dictionary (one wording for the composer chip, the opinion footer and here). */
const quotaT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatDict, key, params)) as Parameters<typeof usageSuffix>[0]

export function proactiveCostLine(dict: LocaleDict, cost: ProactiveCostEstimate | undefined): {
  readonly text: string
  readonly muted: boolean
} {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  if (cost === undefined || (cost.tokens <= 0 && cost.runs <= 0)) {
    return { text: t('proactive.costUnknown'), muted: true }
  }
  const base = t('proactive.costLine', {
    tokens: cost.tokens.toLocaleString('pt-BR'),
    runs: cost.runs,
  })
  // D-092: a subscription says how much of its WINDOW this uses (", cerca de 4% da janela"); only an API key says dollars (" · ≈ US$ x–y").
  const official = cost.usage?.billing === 'api' ? undefined : cost.usage?.official
  // The request has no % of its own (pct = null) but the engine reports the window's use: say THAT ("você já usou 42% da semana"), neutral until 80%.
  const officialClause = usageSuffix(quotaT, cost.usage) !== undefined || official === undefined
    ? undefined
    : official.window === 'week'
      ? connectorText(dict, 'proactive.usedOfWeek', 'você já usou {used}% da semana', { used: String(official.usedPct) })
      : connectorText(dict, 'proactive.usedOfWindow', 'você já usou {used}% da janela de 5 h', { used: String(official.usedPct) })
  const suffix = usageSuffix(quotaT, cost.usage) ?? officialClause
  const line = suffix === undefined ? base : cost.usage?.billing === 'api' ? `${base} · ${suffix}` : `${base}, ${suffix}`
  // Safety net: outside an API key no money segment survives, wherever it came from.
  return { text: dropMoneySegments(line, cost.usage?.billing), muted: false }
}

/**
 * Heading of a hire card (A-4): "Contratar uma persona para {role}?" when the host named the role; otherwise the
 * proposed name, "Contratar {name}?". A name is never dressed up as a role.
 */
/**
 * The role goes in the MIDDLE of "Contratar uma persona para {função}?": a host that sends "Aprovar envio do contrato" gets it lowered
 * ("para aprovar envio do contrato?"). Only when the 2nd letter is lower too, so acronyms and names ("SDR de vendas", "UX Writer") stay.
 */
export function midSentenceRole(role: string): string {
  const first = role.charAt(0)
  const second = role.charAt(1)
  const upper = first !== '' && first === first.toLocaleUpperCase('pt-BR') && first !== first.toLocaleLowerCase('pt-BR')
  const lower = second !== '' && second === second.toLocaleLowerCase('pt-BR') && second !== second.toLocaleUpperCase('pt-BR')
  return upper && lower ? first.toLocaleLowerCase('pt-BR') + role.slice(1) : role
}

export function hireHeading(dict: LocaleDict, item: ApprovalItem): string {
  const role = midSentenceRole(item.hireRoleTitle?.trim() ?? '')
  if (role.length > 0) return bindLocale(dict, 'hire.titleRole', { role })
  return bindLocale(dict, 'hire.title', { name: item.title })
}

/** Title of any approval, as the list row and the detail heading say it. A task that needs the person is its own title. */
export function approvalTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'connector') return item.connector === undefined ? item.title : connectorTitle(dict, item.connector, item.proposerName ?? '')
  if (item.kind === 'hire') return hireHeading(dict, item)
  if (item.kind === 'vault') return vaultHeading(dict, item)
  // An external action is titled by the host's own words ("Enviar um email"): there is no `action.title` copy to fall back on.
  if (item.kind === 'attention' || item.kind === 'action') return item.title
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
  if (item.kind === 'connector' && item.connector !== undefined) return connectorQuestion(dict, item.connector, item.proposerName ?? '')
  // A task that needs the person is titled by its name; if the host's question is only that name again, ask the question in words.
  if (item.kind === 'attention' && (item.question.trim() === '' || item.question.trim() === item.title.trim())) {
    const key = 'attention.question'
    const text = t(key)
    return text === key ? 'Esta tarefa está esperando uma decisão sua.' : text
  }
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

/**
 * D-069 (Muse): a persona is NEVER drawn as a letter. The face of a persona a screen knows only by id and/or name: its own portrait when the id, the character id
 * or the name is a known character; otherwise the stable gallery animal of {@link personaFaceSrc} (the same one the plan card and the profile use).
 * A caller with NO persona id (the system "Equipe") gets `undefined` and draws the team icon instead; this function never guesses an animal for a name alone.
 */
export function resolvePersonaFace(who: {
  readonly id?: string | undefined
  readonly characterId?: string | undefined
  readonly name: string
  /** The REAL portrait, when a store already resolved it from the team (`requester.avatarSrc`): it wins over every guess. */
  readonly avatarSrc?: string | undefined
}): string | undefined {
  if (who.avatarSrc !== undefined && who.avatarSrc !== '') return who.avatarSrc
  const known = personaPortraitSrc(who.id, who.name)
    ?? personaPortraitSrc(who.characterId, who.name)
    ?? personaPortraitSrc(undefined, who.name)
  if (known !== undefined) return known
  const personaId = who.id ?? ''
  return personaId === '' ? undefined : personaFaceSrc(who.characterId, personaId)
}

export function proactiveImpactDetail(proposal: ProactiveProposal): string {
  return proposal.impactDetail.trim().length > 0 ? proposal.impactDetail : proposal.oneQuestion
}
