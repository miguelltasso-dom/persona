/**
 * Figurinhas das personas — modelo PURO (Muse, UX-BEYOND-T3 §Colheita, item D).
 * Uso com parcimônia: comemorar uma entrega, "bom dia" e fim de expediente; no MÁXIMO 1 por persona por dia (o host também mede o
 * orçamento de atenção; isto é a guarda do cliente); desligável pela pessoa. A legenda é TEXTO VIVO (nunca vai na arte).
 */
import { STICKERS } from '../assets/generated-imports.ts'
import type { ReactionId } from '../primitives/Stickers.tsx'

export type StickerMoment = 'delivery' | 'goodMorning' | 'endOfDay'
export type MomentStickerId = ReactionId | 'bom-dia' | 'ate-amanha'

export const STICKER_MOMENTS: readonly StickerMoment[] = ['delivery', 'goodMorning', 'endOfDay']

/** BR-P5: 'bom-dia' and 'ate-amanha' are persona-moment stickers (not in the 6-reaction picker); 'comemorando' stays for delivery. */
export const MOMENT_REACTION: Readonly<Record<StickerMoment, MomentStickerId>> = {
  delivery: 'comemorando',
  goodMorning: 'bom-dia',
  endOfDay: 'ate-amanha',
}

/** Fallback while an animal does not yet have `<animal>-bom-dia` or `<animal>-ate-amanha` in `STICKERS`. */
export const MOMENT_FALLBACK_REACTION: Readonly<Record<StickerMoment, ReactionId>> = {
  delivery: 'comemorando',
  goodMorning: 'joinha',
  endOfDay: 'feito',
}

/** Sticker URL for a persona moment, preferring the BR-P5 moment key (`bom-dia` / `ate-amanha`) and falling back to `joinha` / `feito` when absent. */
export function momentStickerUrl(
  animal: string | undefined,
  moment: StickerMoment,
  stickers: Readonly<Record<string, string>> = STICKERS,
): string | undefined {
  if (animal === undefined) return undefined
  const base = animal.replace(/-default$/u, '').trim()
  if (base === '') return undefined
  return stickers[`${base}-${MOMENT_REACTION[moment]}`] ?? stickers[`${base}-${MOMENT_FALLBACK_REACTION[moment]}`]
}

export const STICKERS_ENABLED_KEY = 'persona.figurinhas.enabled.v1'
export const STICKERS_SHOWN_KEY = 'persona.figurinhas.shown.v1'

/** O que já foi mostrado: persona → o dia (local, AAAA-MM-DD) da última figurinha dela. */
export type StickersShown = Readonly<Record<string, string>>

/** Local calendar day, "2026-11-04": "per day" is the person's day, not UTC's. */
export function stickerDayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Default is ON once the feature itself is on (the flag): "desligável" means the person can turn it off, not that it starts off. */
export function readStickersEnabled(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(STICKERS_ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeStickersEnabled(enabled: boolean, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(STICKERS_ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    /* storage unavailable: the choice lasts this session only */
  }
}

export function readStickersShown(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): StickersShown {
  try {
    const raw = storage?.getItem(STICKERS_SHOWN_KEY)
    if (raw === null || raw === undefined) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [persona, day] of Object.entries(parsed)) if (typeof day === 'string') out[persona] = day
    return out
  } catch {
    return {}
  }
}

export function writeStickersShown(shown: StickersShown, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(STICKERS_SHOWN_KEY, JSON.stringify(shown))
  } catch {
    /* storage unavailable */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export interface StickerDecisionInput {
  readonly enabled: boolean
  readonly personaId: string
  readonly shown: StickersShown
  readonly now: Date
}

/** A persona gets at most one figurinha per day, and none at all when the person turned them off. */
export function canShowSticker({ enabled, personaId, shown, now }: StickerDecisionInput): boolean {
  if (!enabled || personaId.trim() === '') return false
  return shown[personaId] !== stickerDayKey(now)
}

/** The same record with this persona's figurinha counted for today. */
export function recordStickerShown(shown: StickersShown, personaId: string, now: Date): StickersShown {
  return { ...shown, [personaId]: stickerDayKey(now) }
}

/** Caption keys (live text, translatable, read by the screen reader). `{name}` is the name the person gave the persona. */
export function stickerCaptionKey(moment: StickerMoment): string {
  return `sticker.caption.${moment}`
}
