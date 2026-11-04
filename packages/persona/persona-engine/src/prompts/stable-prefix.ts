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
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.recall === undefined ? {} : { recall: input.recall }),
    ...(input.message === undefined ? {} : { message: input.message }),
  })
  const text = built.variable === '' ? built.prefix : `${built.prefix}\n\n${built.variable}`
  return { ...built, text }
}
