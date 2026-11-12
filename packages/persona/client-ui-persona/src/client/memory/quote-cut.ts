/**
 * The owner's quote, cut. A quote that does not fit closes the way a quote closes: the last whole word, "…" and the closing mark.
 * Never doubled punctuation ("ninguém.…") and never a lost closing quote (what a CSS line clamp does to the last line).
 */

/** Punctuation that must not sit right before the "…": the cut already says "there is more". */
const TRAILING = /[\s.,;:!?…\-–—]+$/u

/** The whole quote in curly quotes. */
export const wholeQuote = (text: string): string => `“${text}”`

/** The quote cut at `at` (a character index): `“first words…”`. */
export function cutQuote(text: string, at: number): string {
  return `“${text.slice(0, at).replace(TRAILING, '')}…”`
}

/** Where a cut may fall: the start of each run of spaces/newlines (after the first word), ascending. */
export function cutStops(text: string): number[] {
  return [...text.matchAll(/\s+/gu)].map(match => match.index ?? 0).filter(at => at > 0)
}

/** The largest cut position no later than `limit` (a whole word); the first stop if none fits, the limit itself if there are no stops. */
export function stopWithin(stops: readonly number[], limit: number): number {
  let best = -1
  for (const stop of stops) {
    if (stop <= limit) best = stop
    else break
  }
  return best >= 0 ? best : (stops[0] ?? Math.max(1, limit))
}

/**
 * Without layout (a hidden panel, a test) the cut is by characters and line breaks: `chars` characters or `lines` lines, whichever comes first.
 * `null` = the whole quote stays.
 */
export function cutWithoutLayout(text: string, lines: number, chars: number): number | null {
  const parts = text.split('\n')
  if (text.length <= chars && parts.length <= lines) return null
  const lineLimit = parts.length > lines ? parts.slice(0, lines).join('\n').length : Number.POSITIVE_INFINITY
  return stopWithin(cutStops(text), Math.min(chars, lineLimit))
}

/**
 * With layout: the longest cut whose `“…”` fits in `lines` lines. `fits(candidate)` measures one candidate text in a hidden copy of the box.
 * `null` = the whole quote already fits.
 */
export function cutToFit(text: string, fits: (candidate: string) => boolean): number | null {
  if (fits(wholeQuote(text))) return null
  const stops = cutStops(text)
  let low = 0
  let high = stops.length - 1
  let best = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (fits(cutQuote(text, stops[mid]!))) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best >= 0 ? stops[best]! : (stops[0] ?? Math.max(1, Math.floor(text.length / 2)))
}
