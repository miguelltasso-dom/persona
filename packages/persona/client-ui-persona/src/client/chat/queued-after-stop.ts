/**
 * Muse 07/11 16:37: depois que a pessoa aperta Parar, a fila da persona fica GUARDADA (working-control.md: não sai sozinha; só com "Mandar agora" ou uma mensagem nova). O balão não pode dizer
 * "sai quando {name} terminar o passo atual" (ela está parada). O host não manda esse dado (`reason` só tem `quota`), então a evidência é a do PRÓPRIO FIO: a ÚLTIMA mensagem da persona-alvo
 * está parada ("Você parou aqui · Continuar"). Se ela voltou a falar (outra resposta, mesmo em curso), a última deixa de ser a parada e o texto volta ao de sempre. Quem espera a cota
 * (`heldForQuota`) mantém o texto da cota.
 */
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { QueuedMessageItem } from './QueuedMessageBubble.tsx'

/**
 * @param item - O balão da fila.
 * @param messages - O fio da conversa aberta, em ordem.
 * @returns `true` quando a persona-alvo do balão foi parada pela pessoa e ainda não voltou a falar.
 */
export function isHeldAfterStop(item: QueuedMessageItem, messages: readonly ChannelMessageUi[]): boolean {
  const personaId = item.targetPersonaId
  if (item.heldForQuota === true || personaId === undefined) return false
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index]
    if (row === undefined || (row.authorPersonaId !== personaId && row.authorId !== personaId)) continue
    return row.stopped === true
  }
  return false
}
