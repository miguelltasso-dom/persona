/**
 * Composer sent-history and draft pocket (T3-UX-HARVEST §3; pattern from t3code docs/user/composer.md, MIT).
 */

export const COMPOSER_LARGE_PASTE_BYTES = 32 * 1024

const HISTORY_PREFIX = 'persona.composer.history.v1:'
const POCKET_PREFIX = 'persona.composer.pocket.v1:'
const HISTORY_CAP = 40

export interface ComposerPocket {
  readonly text: string
  readonly savedAt: string
  readonly attachmentNames: readonly string[]
}

function storage(): Storage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

export function pushSentHistory(conversationKey: string, text: string): void {
  const trimmed = text.trim()
  if (trimmed.length === 0) return
  const store = storage()
  if (store === null) return
  const key = HISTORY_PREFIX + conversationKey
  const prior = readSentHistory(conversationKey)
  const next = [trimmed, ...prior.filter(row => row !== trimmed)].slice(0, HISTORY_CAP)
  store.setItem(key, JSON.stringify(next))
}

export function readSentHistory(conversationKey: string): readonly string[] {
  const store = storage()
  if (store === null) return []
  const raw = store.getItem(HISTORY_PREFIX + conversationKey)
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(row => typeof row === 'string') : []
  } catch {
    return []
  }
}

export function saveComposerPocket(conversationKey: string, pocket: ComposerPocket): void {
  const store = storage()
  if (store === null) return
  store.setItem(POCKET_PREFIX + conversationKey, JSON.stringify(pocket))
}

export function readComposerPocket(conversationKey: string): ComposerPocket | null {
  const store = storage()
  if (store === null) return null
  const raw = store.getItem(POCKET_PREFIX + conversationKey)
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as ComposerPocket
    if (typeof parsed.text !== 'string' || typeof parsed.savedAt !== 'string') return null
    return {
      text: parsed.text,
      savedAt: parsed.savedAt,
      attachmentNames: Array.isArray(parsed.attachmentNames)
        ? parsed.attachmentNames.filter(row => typeof row === 'string')
        : [],
    }
  } catch {
    return null
  }
}

export function clearComposerPocket(conversationKey: string): void {
  storage()?.removeItem(POCKET_PREFIX + conversationKey)
}

export function formatPocketTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
