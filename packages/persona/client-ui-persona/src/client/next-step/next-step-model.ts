/**
 * Pure model for P1-6 "Próximo passo" (`NEXT-STEP-SHORTCUTS-SPEC.md` §1, adjustments of 23:21).
 *
 * Rules (first match wins):
 * 1. Blocked items waiting on the person on that screen: "{n} cartões estão esperando você · Ver". Never on Aprovações (that screen is the list itself).
 * 2. Empty screen (`isEmpty === true`): returns `null` so it never repeats the `EmptyState` primary action.
 * 3. Real suggestion from a persona marked by the host as `markedAsNextStep === true` (and not already shown in P1-9 or Morning Brief).
 * 4. Missing habit derived from screen state (1st batch: Quadros, Rotinas, Uso e limites, Aprovações, Segundo cérebro).
 */

export type NextStepScreenId = 'boards' | 'routines' | 'usage' | 'approvals' | 'brain'

export const NEXT_STEP_DISMISS_TTL_MS = 24 * 60 * 60 * 1000
const DISMISS_PREFIX = 'persona.nextStep.dismissed.'
const MAX_TEXT_CHARS = 90

export interface NextStepPersonaSuggestionInput {
  readonly id: string
  readonly personaName: string
  readonly personaCharacterId?: string | undefined
  readonly personaAvatarSrc?: string | undefined
  /** One present-tense sentence (up to 90 chars), e.g. "Nina sugere juntar os 3 cartões de preços". */
  readonly text: string
  /** Rule 3 only uses a suggestion that the host explicitly marks as "next step" (work proposals remain P1-9 cards). */
  readonly markedAsNextStep: boolean
  /** True when the same suggestion is already visible in a P1-9 proposal card or the Morning Brief. */
  readonly shownInProposalCard?: boolean | undefined
  readonly shownInMorningBrief?: boolean | undefined
}

export interface NextStepHighUsageWindowInput {
  readonly engineName: string
  /** Usage percentage (0-100); triggers Rule 4 on `usage` when `> 80`. */
  readonly percent: number
  /** Human time label, e.g. "18:30". */
  readonly untilLabel: string
}

export interface NextStepState {
  /** Rule 2: when the screen is in its `EmptyState`, the line never appears so it doesn't repeat the empty action. */
  readonly isEmpty?: boolean | undefined
  /** Rule 1: number of blocked cards/items waiting for the person on this screen. */
  readonly blockedWaitingCount?: number | undefined
  /** True if the Morning Brief or another visible card on screen already states the same recommendation. */
  readonly alreadyVisibleOnScreen?: boolean | undefined
  /** IDs of P1-9 proposals currently visible on screen (never repeat them). */
  readonly visibleProposalIds?: readonly string[] | undefined
  /** Rule 3: host-provided persona next-step suggestion. */
  readonly personaSuggestion?: NextStepPersonaSuggestionInput | undefined
  /** Rule 4 (Quadros), plano B until the host exposes `inReviewSince`: cards in "Em revisão", shown from 2 on. The "> 2 dias" rule is v1.2. */
  readonly staleReviewCount?: number | undefined
  /** Rule 4 (Rotinas): number of active routines (0 = suggest creating a routine, when screen is not in EmptyState). */
  readonly activeRoutinesCount?: number | undefined
  /** Rule 4 (Uso e limites): window above 80%. */
  readonly highUsageWindow?: NextStepHighUsageWindowInput | undefined
  /** Rule 4 (Segundo cérebro): pages not updated for 30+ days. */
  readonly stalePagesCount?: number | undefined
  /** Rule 4 (Aprovações): open decisions waiting for more than 3 days (Muse, 05/11 05:52). */
  readonly staleDecisionCount?: number | undefined
  /** Optional clock override for deterministic 24h dismissal tests. */
  readonly nowMs?: number | undefined
}

export type NextStepActionId =
  | 'view-blocked'
  | 'view-suggestion'
  | 'review-stale'
  | 'create-routine'
  | 'split-quota'
  | 'ask-librarian'
  | 'see-oldest'

export interface NextStepCopy {
  readonly blockedOne: string
  readonly blockedMany: (count: number) => string
  readonly blockedAction: string
  readonly personaAction: string
  readonly boardsStaleMany: (count: number) => string
  readonly boardsStaleAction: string
  readonly routinesNoActive: string
  readonly routinesNoActiveAction: string
  readonly usageHighWindow: (engine: string, percent: number, until: string) => string
  readonly usageHighWindowAction: string
  readonly brainStaleOne: string
  readonly brainStaleMany: (count: number) => string
  readonly brainStaleAction: string
  readonly approvalsStaleOne: string
  readonly approvalsStaleMany: (count: number) => string
  readonly approvalsStaleAction: string
}

export const DEFAULT_NEXT_STEP_COPY_PT: NextStepCopy = {
  blockedOne: '1 cartão está esperando você',
  blockedMany: count => `${count} cartões estão esperando você`,
  blockedAction: 'Ver',
  personaAction: 'Ver sugestão',
  boardsStaleMany: count => `Há ${count} entregas esperando a sua revisão`,
  boardsStaleAction: 'Revisar',
  routinesNoActive: 'Uma rotina faz isto toda semana sem você pedir',
  routinesNoActiveAction: 'Criar rotina',
  usageHighWindow: (engine, percent, until) => `${engine} está em ${percent}% até ${until}`,
  usageHighWindowAction: 'Ver como dividir a cota',
  brainStaleOne: '1 página não é atualizada há 30 dias',
  brainStaleMany: count => `${count} páginas não são atualizadas há 30 dias`,
  brainStaleAction: 'Pedir revisão ao bibliotecário',
  approvalsStaleOne: 'Há 1 decisão parada há mais de 3 dias',
  approvalsStaleMany: count => `Há ${count} decisões paradas há mais de 3 dias`,
  approvalsStaleAction: 'Ver as mais antigas',
}

/** Rascunho em inglês (Muse, 05/11 05:52 para o hábito de Aprovações; o resto ainda não foi revisto pela Muse). */
export const DEFAULT_NEXT_STEP_COPY_EN: NextStepCopy = {
  blockedOne: '1 card is waiting for you',
  blockedMany: count => `${count} cards are waiting for you`,
  blockedAction: 'See',
  personaAction: 'See suggestion',
  boardsStaleMany: count => `${count} deliveries are waiting for your review`,
  boardsStaleAction: 'Review',
  routinesNoActive: 'A routine does this every week without you asking',
  routinesNoActiveAction: 'Create routine',
  usageHighWindow: (engine, percent, until) => `${engine} is at ${percent}% until ${until}`,
  usageHighWindowAction: 'See how to split the quota',
  brainStaleOne: '1 page has not been updated in 30 days',
  brainStaleMany: count => `${count} pages have not been updated in 30 days`,
  brainStaleAction: 'Ask the librarian for a review',
  approvalsStaleOne: 'There is 1 decision waiting more than 3 days',
  approvalsStaleMany: count => `There are ${count} decisions waiting more than 3 days`,
  approvalsStaleAction: 'See the oldest',
}

export interface NextStepRecommendation {
  readonly screen: NextStepScreenId
  readonly kind: 'blocked' | 'persona' | 'habit'
  readonly actionId: NextStepActionId
  readonly text: string
  readonly actionLabel: string
  readonly personaName?: string | undefined
  readonly personaCharacterId?: string | undefined
  readonly personaAvatarSrc?: string | undefined
  readonly suggestionId?: string | undefined
}

function clampSentence(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= MAX_TEXT_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_TEXT_CHARS - 1).trimEnd()}…`
}

export function isNextStepDismissed(screen: NextStepScreenId, nowMs: number = Date.now()): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(`${DISMISS_PREFIX}${screen}`)
    if (raw === null || raw.trim() === '') return false
    const dismissedAt = Number(raw)
    if (!Number.isFinite(dismissedAt)) return false
    return nowMs - dismissedAt < NEXT_STEP_DISMISS_TTL_MS && nowMs >= dismissedAt
  }
  catch {
    return false
  }
}

export function dismissNextStep(screen: NextStepScreenId, nowMs: number = Date.now()): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(`${DISMISS_PREFIX}${screen}`, String(nowMs))
  }
  catch {
    // storage blocked
  }
}

/**
 * Pure decision function `nextStepFor(screen, state)` (`NEXT-STEP-SHORTCUTS-SPEC.md` §1).
 * Never returns more than one recommendation; returns `null` when empty, dismissed in the last 24h, or nothing applies.
 */
export function nextStepFor(
  screen: NextStepScreenId,
  state: NextStepState,
  copy: NextStepCopy = DEFAULT_NEXT_STEP_COPY_PT,
): NextStepRecommendation | null {
  if (state.alreadyVisibleOnScreen === true) return null
  if (isNextStepDismissed(screen, state.nowMs)) return null

  // Rule 2: an empty screen already has its primary step inside EmptyState — never repeat it here.
  if (state.isEmpty === true) return null

  // Rule 1: blocked items waiting for the person on that screen. Not on Aprovações: that screen IS the list of what waits,
  // so a bar above it would repeat the list ("5 cartões estão esperando você · Ver" over the 5 cards; Muse, 05/11 05:48).
  const blocked = typeof state.blockedWaitingCount === 'number' && Number.isFinite(state.blockedWaitingCount)
    ? Math.floor(state.blockedWaitingCount)
    : 0
  if (blocked > 0 && screen !== 'approvals') {
    return {
      screen,
      kind: 'blocked',
      actionId: 'view-blocked',
      text: clampSentence(blocked === 1 ? copy.blockedOne : copy.blockedMany(blocked)),
      actionLabel: copy.blockedAction,
    }
  }

  // Rule 3: a real persona suggestion explicitly marked by the host as "next step" (and not duplicated in P1-9 or Morning Brief).
  const suggestion = state.personaSuggestion
  if (
    suggestion !== undefined
    && suggestion.markedAsNextStep === true
    && suggestion.shownInProposalCard !== true
    && suggestion.shownInMorningBrief !== true
    && !(state.visibleProposalIds ?? []).includes(suggestion.id)
    && suggestion.personaName.trim() !== ''
    && suggestion.text.trim() !== ''
  ) {
    return {
      screen,
      kind: 'persona',
      actionId: 'view-suggestion',
      text: clampSentence(suggestion.text),
      actionLabel: copy.personaAction,
      personaName: suggestion.personaName.trim(),
      ...(suggestion.personaCharacterId === undefined ? {} : { personaCharacterId: suggestion.personaCharacterId }),
      ...(suggestion.personaAvatarSrc === undefined ? {} : { personaAvatarSrc: suggestion.personaAvatarSrc }),
      suggestionId: suggestion.id,
    }
  }

  // Rule 4: a missing habit derived from state (per screen of the 1st batch).
  if (screen === 'boards') {
    const stale = typeof state.staleReviewCount === 'number' && Number.isFinite(state.staleReviewCount)
      ? Math.floor(state.staleReviewCount)
      : 0
    // Plano B (Keel 06:03, Muse aceitou): from 2 cards in review on; a single one is not a habit.
    if (stale >= 2) {
      return {
        screen,
        kind: 'habit',
        actionId: 'review-stale',
        text: clampSentence(copy.boardsStaleMany(stale)),
        actionLabel: copy.boardsStaleAction,
      }
    }
  }

  if (screen === 'routines') {
    if (state.activeRoutinesCount === 0) {
      return {
        screen,
        kind: 'habit',
        actionId: 'create-routine',
        text: clampSentence(copy.routinesNoActive),
        actionLabel: copy.routinesNoActiveAction,
      }
    }
  }

  if (screen === 'usage') {
    const win = state.highUsageWindow
    if (
      win !== undefined
      && win.engineName.trim() !== ''
      && win.untilLabel.trim() !== ''
      && Number.isFinite(win.percent)
      && win.percent > 80
    ) {
      const pct = Math.round(win.percent)
      return {
        screen,
        kind: 'habit',
        actionId: 'split-quota',
        text: clampSentence(copy.usageHighWindow(win.engineName.trim(), pct, win.untilLabel.trim())),
        actionLabel: copy.usageHighWindowAction,
      }
    }
  }

  // Rule 4 (Aprovações, Muse 05/11 05:52): decisions still open for more than 3 days. The action orders the list oldest first.
  if (screen === 'approvals') {
    const stale = typeof state.staleDecisionCount === 'number' && Number.isFinite(state.staleDecisionCount)
      ? Math.floor(state.staleDecisionCount)
      : 0
    if (stale > 0) {
      return {
        screen,
        kind: 'habit',
        actionId: 'see-oldest',
        text: clampSentence(stale === 1 ? copy.approvalsStaleOne : copy.approvalsStaleMany(stale)),
        actionLabel: copy.approvalsStaleAction,
      }
    }
  }

  if (screen === 'brain') {
    const stalePages = typeof state.stalePagesCount === 'number' && Number.isFinite(state.stalePagesCount)
      ? Math.floor(state.stalePagesCount)
      : 0
    if (stalePages > 0) {
      return {
        screen,
        kind: 'habit',
        actionId: 'ask-librarian',
        text: clampSentence(stalePages === 1 ? copy.brainStaleOne : copy.brainStaleMany(stalePages)),
        actionLabel: copy.brainStaleAction,
      }
    }
  }

  return null
}
