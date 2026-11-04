/**
 * OPT-3: stable prefix for provider cache. Volatile text stays off the prefix.
 */

import { createHash } from 'node:crypto'

/** Layers that may sit in the cached prefix. Variable context is last and uncached. */
export const STABLE_PREFIX_LAYERS = ['system', 'persona', 'tools', 'required'] as const

const VOLATILE = /\d{4}-\d{2}-\d{2}T|\bhoje\b|\bagora\b|\bDate\.now\b|\bcontador\b|\b\d{1,2}:\d{2}\b/iu

/** Ordered prefix parts. */
export interface PrefixLayers {
  readonly system: string
  readonly persona: string
  readonly tools: string
  readonly required: string
  readonly variable: string
}

/** Stable block + fingerprint + leftover variable context. */
export interface ComposedPrefix {
  readonly stable: string
  readonly variable: string
  readonly fingerprint: string
}

/**
 * Compose the cacheable prefix in fixed order. Variable is not fingerprinted.
 * @param layers - Prompt layers.
 */
export function composeStablePrefix(layers: PrefixLayers): ComposedPrefix {
  const stable = STABLE_PREFIX_LAYERS.map(name => layers[name].trim()).filter(part => part.length > 0).join('\n\n')
  return {
    stable,
    variable: layers.variable,
    fingerprint: createHash('sha256').update(stable).digest('hex'),
  }
}

/**
 * Clocks, "hoje", counters — must not sit in the stable prefix.
 * @param text - Candidate prefix.
 */
export function volatilePrefixHits(text: string): string[] {
  return [...text.matchAll(new RegExp(VOLATILE, 'giu'))].map(match => match[0])
}

/**
 * True when the stable prefix is unchanged (provider cache can hit).
 * @param previous - Last fingerprint.
 * @param next - Current fingerprint.
 */
export function prefixCacheHit(previous: string | undefined, next: string): boolean {
  return previous !== undefined && previous === next
}
