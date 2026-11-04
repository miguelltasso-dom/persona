/**
 * Fila local do composer que sobrevive a recarregar a janela (Muse, 04/11: as mensagens na fila NÃO podem sumir caladas).
 * Vale só até o host guardar a fila (IV-5, Bolt): quando existir, ela substitui isto. Por conversa, em `localStorage`, sempre
 * em try/catch (storage bloqueado ou cheio = sem persistência, nunca um erro na tela). Só texto e quem responde: nada de anexo.
 */
import type { QueuedMessageItem } from './QueuedMessageBubble.tsx'

const PREFIX = 'persona.composer.queue.v1:'
const CAP = 20

interface StoredItem {
  readonly id: string
  readonly text: string
  readonly targetPersonaName: string
  readonly targetPersonaId?: string
  readonly heldForQuota?: boolean
  /** Só os NOMES dos anexos: os ids e o conteúdo nunca vão para o storage. Ao voltar, o balão avisa que o anexo não ficou guardado. */
  readonly attachmentNames?: readonly string[]
}

/** Os nomes dos anexos do item: os desta sessão e os que já tinham se perdido (continuam avisando até a pessoa decidir). */
function attachmentNamesOf(item: QueuedMessageItem): readonly string[] {
  return [...(item.attachments ?? []).map(file => file.name), ...(item.lostAttachmentNames ?? [])]
}

function storage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** Lê a fila guardada desta conversa; cada item volta marcado `restored` (o balão diz "Ainda na fila"). */
export function readQueuedMessages(conversationKey: string): readonly QueuedMessageItem[] {
  const store = storage()
  if (store === null) return []
  try {
    const raw = store.getItem(PREFIX + conversationKey)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((row): QueuedMessageItem[] => {
      const item = row as Partial<StoredItem> | null
      if (item === null || typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.targetPersonaName !== 'string') return []
      return [{
        id: item.id,
        text: item.text,
        targetPersonaName: item.targetPersonaName,
        ...(typeof item.targetPersonaId === 'string' ? { targetPersonaId: item.targetPersonaId } : {}),
        ...(item.heldForQuota === true ? { heldForQuota: true } : {}),
        ...(Array.isArray(item.attachmentNames) && item.attachmentNames.length > 0
          ? { lostAttachmentNames: item.attachmentNames.filter((name): name is string => typeof name === 'string') }
          : {}),
        restored: true,
      }]
    }).slice(0, CAP)
  } catch {
    return []
  }
}

/** Guarda a fila desta conversa (vazia apaga a chave). Falha de storage é silenciosa de propósito: a tela não depende disto. */
export function writeQueuedMessages(conversationKey: string, items: readonly QueuedMessageItem[]): void {
  const store = storage()
  if (store === null) return
  try {
    if (items.length === 0) {
      store.removeItem(PREFIX + conversationKey)
      return
    }
    const rows: StoredItem[] = items.slice(0, CAP).map(item => ({
      id: item.id,
      text: item.text,
      targetPersonaName: item.targetPersonaName,
      ...(item.targetPersonaId === undefined ? {} : { targetPersonaId: item.targetPersonaId }),
      ...(item.heldForQuota === true ? { heldForQuota: true } : {}),
      ...(attachmentNamesOf(item).length > 0 ? { attachmentNames: attachmentNamesOf(item) } : {}),
    }))
    store.setItem(PREFIX + conversationKey, JSON.stringify(rows))
  } catch {
    /* cheio ou bloqueado: sem persistência */
  }
}

/** Próximo número para `queued-N`, sem repetir os ids dos itens recuperados. */
export function nextQueueSeq(items: readonly QueuedMessageItem[]): number {
  let max = 0
  for (const item of items) {
    const match = /^queued-(\d+)$/u.exec(item.id)
    if (match !== null) max = Math.max(max, Number.parseInt(match[1] ?? '0', 10))
  }
  return max
}
