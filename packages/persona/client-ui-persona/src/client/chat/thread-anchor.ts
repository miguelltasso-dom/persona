/**
 * Casa da Equipe, microdetalhe 11 (COLHEITA-MUSE §29b): cada canal lembra ONDE a pessoa estava, pelo id da mensagem âncora (a primeira que aparecia
 * no alto do fio), na sessão e no `localStorage`, e o fio volta exatamente ali, sem animação. O fim do fio é o padrão só para quem estava no fim:
 * quem estava no fim não guarda âncora (ao voltar, o fio abre no fim e a linha "Novas" manda se houver novidade).
 *
 * Só ids de canal e de mensagem (nada de texto). Storage bloqueado não quebra nada: a lembrança fica só na sessão.
 */

/** Chave do `localStorage`: `{ [channelId]: messageId }` na ordem de uso (a mais recente por último). */
export const THREAD_ANCHORS_KEY = 'persona.thread.anchors.v1'
/** Quantos canais lembram a posição (os mais antigos saem primeiro). */
export const THREAD_ANCHORS_MAX = 60

type AnchorStorage = Pick<Storage, 'getItem' | 'setItem'>

const session = new Map<string, string>()

function defaultStorage(): AnchorStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function readAll(storage: AnchorStorage | undefined): Map<string, string> {
  const rows = new Map<string, string>()
  try {
    const raw = storage?.getItem(THREAD_ANCHORS_KEY)
    const parsed: unknown = raw === null || raw === undefined ? null : JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const [channelId, messageId] of Object.entries(parsed)) {
        if (typeof messageId === 'string' && messageId !== '') rows.set(channelId, messageId)
      }
    }
  } catch {
    /* storage bloqueado ou conteúdo estragado: começa vazio */
  }
  return rows
}

function writeAll(storage: AnchorStorage | undefined, rows: Map<string, string>): void {
  try {
    storage?.setItem(THREAD_ANCHORS_KEY, JSON.stringify(Object.fromEntries(rows)))
  } catch {
    /* só um conforto */
  }
}

/** A mensagem em que a pessoa parou neste canal, ou `undefined` (abre no fim). A da sessão vale mais que a do disco. */
export function readThreadAnchor(channelId: string, storage: AnchorStorage | undefined = defaultStorage()): string | undefined {
  return session.get(channelId) ?? readAll(storage).get(channelId)
}

/**
 * Guarda (ou, com `messageId === undefined`, esquece) onde a pessoa está neste canal. Quem está no fim do fio não tem âncora.
 * @param channelId - O canal.
 * @param messageId - O id da primeira mensagem visível no alto do fio, ou `undefined` quando a pessoa está no fim.
 */
export function rememberThreadAnchor(
  channelId: string,
  messageId: string | undefined,
  storage: AnchorStorage | undefined = defaultStorage(),
): void {
  if (channelId === '') return
  const rows = readAll(storage)
  if (messageId === undefined || messageId === '') {
    session.delete(channelId)
    if (!rows.delete(channelId)) return
  } else {
    if (session.get(channelId) === messageId) return // a sessão espelha a última escrita: nada mudou
    session.set(channelId, messageId)
    rows.delete(channelId) // reinsere por último: a mais usada fica
    rows.set(channelId, messageId)
    while (rows.size > THREAD_ANCHORS_MAX) rows.delete(rows.keys().next().value as string)
  }
  writeAll(storage, rows)
}

/** Para os testes: a lembrança da sessão começa vazia. */
export function clearThreadAnchorSession(): void {
  session.clear()
}

/**
 * A primeira mensagem visível no alto do fio: a âncora. Procura as linhas `[data-message-id]` dentro do contêiner de rolagem.
 * @param container - O contêiner que rola.
 * @returns O id da mensagem, ou `undefined` sem linhas.
 */
export function firstVisibleMessageId(container: HTMLElement): string | undefined {
  const top = container.getBoundingClientRect().top
  const rows = container.querySelectorAll<HTMLElement>('[data-message-id]')
  for (const row of rows) {
    if (row.getBoundingClientRect().bottom > top + 1) return row.dataset.messageId
  }
  return undefined
}

/** Rola o contêiner até a mensagem âncora, sem animação. @returns `true` se a mensagem existe no fio. */
export function restoreThreadAnchor(container: HTMLElement, messageId: string): boolean {
  const row = [...container.querySelectorAll<HTMLElement>('[data-message-id]')].find(candidate => candidate.dataset.messageId === messageId)
  if (row === undefined) return false
  container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top
  return true
}
