/**
 * CV-8 (CONVERSAS-SPEC §A): the rules of "Toda a equipe" / "Quem tiver algo a dizer" that live in the UI, not in the host.
 * The host sends data (`MessageView.fanout`, `EstimateAskView.fanout`); the person-facing words and the "are you sure?" threshold are here.
 */

import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { parseUsage, type UsageUi } from '../quota-text.ts'

export type FanoutChoice = 'everyone' | 'relevant'

/** With more than this many personas, "Toda a equipe" asks once before sending (the cost that surprises most: 30 calls without noticing). */
export const FANOUT_CONFIRM_ABOVE = 5

/** Only "Toda a equipe" to MORE than 5 personas asks for a confirmation; "Quem tiver algo a dizer" costs 1 + at most 5 calls and never asks. */
export function needsFanoutConfirm(choice: FanoutChoice | undefined, teamCount: number): boolean {
  return choice === 'everyone' && teamCount > FANOUT_CONFIRM_ABOVE
}

/** What the chip shows before sending: only MEASURED numbers (never a guess). */
export interface FanoutEstimateUi {
  /** Personas that will have a line. */
  readonly replies: number
  /** Calls to the person's AI, when the host measured them (exact for "Toda a equipe"). */
  readonly calls?: { readonly min: number; readonly max: number }
  /** D-092: o tipo de conta e o impacto na cota (assinatura: % da janela) ou o US$ (SÓ chave de API). Ausente = só o que é certo (as respostas e as chamadas). */
  readonly usage?: UsageUi
}

/**
 * Reads the `fanout` part of the host's `EstimateAskView`. Anything strange is "no estimate" (the chip then says only what is certain).
 * @param view - The host's answer (unknown on the wire).
 */
export function fanoutEstimateFromWire(view: unknown): FanoutEstimateUi | undefined {
  if (typeof view !== 'object' || view === null) return undefined
  const fanout = (view as { fanout?: unknown }).fanout
  if (typeof fanout !== 'object' || fanout === null) return undefined
  const row = fanout as { replies?: unknown; chamadas?: unknown }
  if (typeof row.replies !== 'number' || !Number.isFinite(row.replies) || row.replies < 1) return undefined
  const calls = row.chamadas
  let measured: { min: number; max: number } | undefined
  if (typeof calls === 'object' && calls !== null) {
    const { min, max } = calls as { min?: unknown; max?: unknown }
    if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min) {
      measured = { min: Math.floor(min), max: Math.floor(max) }
    }
  }
  const usage = parseUsage(view)
  return { replies: Math.floor(row.replies), ...(measured === undefined ? {} : { calls: measured }), ...(usage === undefined ? {} : { usage }) }
}

/** "≈ 7 chamadas" for exact numbers, "≈ 1–6 chamadas" for a range. */
export function fanoutCallsLabel(calls: { readonly min: number; readonly max: number }): string {
  return calls.min === calls.max ? String(calls.min) : `${String(calls.min)}–${String(calls.max)}`
}

type ChatT = PropsLocale<'persona.chat'>['t']

/**
 * Copy for this build: the generated locale may not carry the new keys yet (the locale pipeline runs in an agreed window), and the
 * screen must never show a raw key. The fallback is the same words as the source JSON.
 */
export function fanoutText(
  t: ChatT,
  key: string,
  fallback: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const text = (t as (key: string, params?: Readonly<Record<string, string | number>>) => string)(key, params)
  if (text !== key && text.length > 0) return text
  return Object.entries(params).reduce((line, [name, value]) => line.split(`{${name}}`).join(String(value)), fallback)
}
