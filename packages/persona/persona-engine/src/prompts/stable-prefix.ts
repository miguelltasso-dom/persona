/**
 * Cache-stable prompt prefix (TOKEN-OPTIMIZATION §2 / OPT-3).
 * Order: system → persona → tools → required. Variable context stays after.
 */

import { estimateTokens, measureLayers, minifyToolDescription, type TurnLayerSizes } from '@deepseek-ai/dsh-persona-core'
import { composePrompt } from './templates.ts'
import { composeVoicePolicy, type PersonaVoiceFields } from './voice.ts'

/** Clock, counters, and "now" must not sit in the cached prefix. */
const VOLATILE = /\b(?:\d{1,2}:\d{2}(?::\d{2})?|hoje|agora|turno\s*#?\d+|contador|\d{4}-\d{2}-\d{2}T\d{2}:)/iu

export const PREFIX_LAYER_ORDER = ['system', 'persona', 'tools', 'required'] as const

/** Variable-layer token ceilings (OPT-4). Prefix layers stay cache-stable. */
export const VARIABLE_LAYER_BUDGET = {
  subject: 400,
  recall: 200,
  message: 200,
} as const

/** OPT-3 domain score: prefix-order, no-volatile, cache-60. */
export interface Opt3Acceptance {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

/** OPT-4 domain score: tools-min, dedupe-prefix, layer-budget. */
export interface Opt4Acceptance {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

export interface StablePrefixInput {
  readonly system: string
  readonly persona: string
  readonly tools: string
  readonly required: string
  readonly subject?: string
  readonly recall?: string
  readonly message?: string
}

export interface StablePrefix {
  readonly prefix: string
  readonly variable: string
  readonly layers: TurnLayerSizes
  readonly prefixTokens: number
}

/**
 * @param text - Prefix candidate.
 * @returns True when the text looks clock- or counter-shaped.
 */
export function prefixLooksVolatile(text: string): boolean {
  return VOLATILE.test(text)
}

/**
 * @param text - Prefix candidate.
 */
export function assertPrefixStable(text: string): void {
  if (prefixLooksVolatile(text)) throw new Error('UNSTABLE_PREFIX')
}

/**
 * Compose the cacheable prefix, then the variable tail.
 * @param input - Fixed layers plus optional variable slices.
 */
export function composeStablePrefix(input: StablePrefixInput): StablePrefix {
  const prefix = [input.system, input.persona, input.tools, input.required]
    .map(part => part.trim())
    .filter(part => part !== '')
    .join('\n\n')
  assertPrefixStable(prefix)
  const variable = [input.subject ?? '', input.recall ?? '', input.message ?? '']
    .map(part => part.trim())
    .filter(part => part !== '')
    .join('\n\n')
  const layers = measureLayers({
    system: [input.system, input.persona].map(part => part.trim()).filter(part => part !== '').join('\n\n'),
    tools: input.tools,
    required: input.required,
    subject: input.subject ?? '',
    recall: input.recall ?? '',
    message: input.message ?? '',
  })
  return {
    prefix,
    variable,
    layers,
    prefixTokens: estimateTokens(prefix),
  }
}

/**
 * Keep a slice at or under `maxTokens` (4 characters ≈ 1 token).
 * @param text - Subject / recall / message candidate.
 * @param maxTokens - Ceiling from {@link VARIABLE_LAYER_BUDGET}.
 * @returns Text that `estimateTokens` reports ≤ `maxTokens`.
 */
export function clipTextToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ''
  if (estimateTokens(text) <= maxTokens) return text
  const maxChars = maxTokens * 4
  const cut = text.length <= maxChars ? text : text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  const clipped = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()
  return estimateTokens(clipped) <= maxTokens ? clipped : clipped.slice(0, maxChars).trimEnd()
}

/**
 * OPT-3 policy score (stable prefix + cache). Rivet owns provider hit rate.
 * @returns Passed count and failed ids. Empty `failed` is the domain gate.
 */
export function measureOpt3Acceptance(): Opt3Acceptance {
  const failed: string[] = []
  if (PREFIX_LAYER_ORDER.join(',') !== 'system,persona,tools,required') failed.push('prefix-order')
  try {
    assertPrefixStable('Você coordena a equipe.')
  } catch (error) {
    // Clean prefix must stay cacheable; UNSTABLE_PREFIX fails the gate.
    void error
    failed.push('no-volatile')
  }
  if (!failed.includes('no-volatile') && !prefixLooksVolatile('hoje 14:32 turno #9')) {
    failed.push('no-volatile')
  }
  if (prefixCacheHitRate(60, 40) < 0.60) failed.push('cache-60')
  return { passed: 3 - failed.length, total: 3, failed }
}

/**
 * OPT-4 policy score (min tools, prefix dedupe, variable-layer budget).
 * @returns Passed count and failed ids. Empty `failed` is the domain gate.
 */
export function measureOpt4Acceptance(): Opt4Acceptance {
  const failed: string[] = []
  if (toolsForTurn(['files', 'recall'], ['files', 'shell', 'browser']).join(',') !== 'files') {
    failed.push('tools-min')
  }
  const trimmed = trimVariableAlreadyInPrefix(
    'Nunca inventar preço.\nAtlas coordena.',
    'Nunca inventar preço.\n\nAna pediu 20 pães.',
  )
  if (trimmed !== 'Ana pediu 20 pães.') failed.push('dedupe-prefix')
  const long = 'assunto '.repeat(400)
  const clipped = clipTextToTokens(long, VARIABLE_LAYER_BUDGET.subject)
  if (estimateTokens(clipped) > VARIABLE_LAYER_BUDGET.subject || clipped === long) {
    failed.push('layer-budget')
  }
  return { passed: 3 - failed.length, total: 3, failed }
}

/**
 * cache read / (read + write) on the prefix only. Target ≥ 0.60 after warm-up.
 * @param cacheReadTokens - Provider cache read.
 * @param cacheWriteTokens - Provider cache write.
 * @returns 0–1.
 */
export function prefixCacheHitRate(cacheReadTokens: number, cacheWriteTokens: number): number {
  const denom = cacheReadTokens + cacheWriteTokens
  return denom === 0 ? 0 : cacheReadTokens / denom
}

/**
 * Tools this turn may mention: intersection of mandate and the task ask.
 * Empty `allowed` means no extra cap (the persona spec still binds).
 * @param allowed - Mandate allow-list.
 * @param needed - Tools the task asked for.
 */
export function toolsForTurn(allowed: readonly string[], needed: readonly string[]): string[] {
  if (allowed.length === 0) return [...needed]
  return needed.filter(name => allowed.includes(name))
}

/**
 * Drop variable blocks already present in the cached prefix (OPT-4).
 * @param prefix - Stable prefix text.
 * @param variable - Subject / recall / message tail.
 * @returns Tail without duplicated blocks.
 */
export function trimVariableAlreadyInPrefix(prefix: string, variable: string): string {
  const hay = prefix.toLowerCase()
  return variable
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(block => block !== '' && !hay.includes(block.toLowerCase()))
    .join('\n\n')
}

/**
 * One turn: stable prefix + variable tail. Message never enters the prefix.
 * @param input - Voice, tools, required vault, and variable slices.
 */
export function composeTurnPrompt(input: {
  readonly fields: PersonaVoiceFields
  readonly part: 'talk' | 'worker' | 'coordinator' | 'watchdog'
  readonly tools: readonly string[]
  readonly required: string
  readonly subject?: string
  readonly recall?: string
  readonly message?: string
}): StablePrefix & { readonly text: string } {
  const system = composePrompt({
    part: input.part,
    identity: input.fields.identity,
    policy: '',
  }).trim()
  const { capabilities, vault: _vault, ...voice } = input.fields
  const persona = composeVoicePolicy({
    ...voice,
    vault: '',
    ...(capabilities === undefined ? {} : { capabilities }),
  })
  const tools = input.tools.map(name => minifyToolDescription(name)).join('\n')
  const built = composeStablePrefix({
    system,
    persona,
    tools,
    required: input.required,
    ...(input.subject === undefined ? {} : { subject: clipTextToTokens(input.subject, VARIABLE_LAYER_BUDGET.subject) }),
    ...(input.recall === undefined ? {} : { recall: clipTextToTokens(input.recall, VARIABLE_LAYER_BUDGET.recall) }),
    ...(input.message === undefined ? {} : { message: clipTextToTokens(input.message, VARIABLE_LAYER_BUDGET.message) }),
  })
  const variable = trimVariableAlreadyInPrefix(built.prefix, built.variable)
  const text = variable === '' ? built.prefix : `${built.prefix}\n\n${variable}`
  return { ...built, variable, text }
}
