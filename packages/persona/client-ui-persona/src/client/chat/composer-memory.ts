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

/**
 * O histórico e o bolso sobrevivem à troca de tela e ao reinício do app (P0-17): `localStorage`, por conversa.
 * Storage bloqueado ou cheio nunca quebra o composer: tudo aqui degrada para "sem memória".
 */
function storage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** "48 mil caracteres" do cartão de colagem grande: o número em milhares, arredondado, nunca menos de 1. */
export function pastedThousands(chars: number): number {
  return Math.max(1, Math.round(chars / 1000))
}

export function pushSentHistory(conversationKey: string, text: string): void {
  const trimmed = text.trim()
  if (trimmed.length === 0) return
  const store = storage()
  if (store === null) return
  const key = HISTORY_PREFIX + conversationKey
  const prior = readSentHistory(conversationKey)
  const next = [trimmed, ...prior.filter(row => row !== trimmed)].slice(0, HISTORY_CAP)
  try {
    store.setItem(key, JSON.stringify(next))
  } catch {
    /* cheio ou bloqueado: sem histórico, mas o envio segue */
  }
}

export function readSentHistory(conversationKey: string): readonly string[] {
  const store = storage()
  if (store === null) return []
  try {
    const raw = store.getItem(HISTORY_PREFIX + conversationKey)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(row => typeof row === 'string') : []
  } catch {
    return []
  }
}

/** `false` quando não deu para guardar (storage cheio ou bloqueado): a tela nunca diz "guardado" sem estar. */
export function saveComposerPocket(conversationKey: string, pocket: ComposerPocket): boolean {
  const store = storage()
  if (store === null) return false
  try {
    store.setItem(POCKET_PREFIX + conversationKey, JSON.stringify(pocket))
    return true
  } catch {
    return false
  }
}

export function readComposerPocket(conversationKey: string): ComposerPocket | null {
  const store = storage()
  if (store === null) return null
  try {
    const raw = store.getItem(POCKET_PREFIX + conversationKey)
    if (raw === null) return null
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
  try {
    storage()?.removeItem(POCKET_PREFIX + conversationKey)
  } catch {
    /* storage bloqueado: nada a limpar */
  }
}

export function formatPocketTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
