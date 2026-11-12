/**
 * DESIGN-01 (Muse, 11/11) "Fio real" (d): a miniatura do cartão de entrega é a ARTE FINAL do pedido. O host não manda uma imagem no cartão: a arte já está no fio,
 * nos arquivos que as personas salvaram no rascunho ("{persona} salvou {arquivo} no rascunho") e no rascunho da opinião, de cada Tarefa da entrega. A mais nova
 * (a última do fio) que seja imagem e tenha miniatura é a arte final; o `.svg` e o `.png` irmão contam como UMA arte. Sem arquivo, sem miniatura (nada inventado).
 */
import type { ChannelMessageUi, DeliveryCardUi } from '../remote/map-host-ui.ts'
import { groupArt, type DraftFileUi } from './draft-files/draft-files-model.ts'

export function deliveryArt(messages: readonly ChannelMessageUi[], delivery: DeliveryCardUi): DraftFileUi | undefined {
  const tasks = new Set(delivery.parts.map(part => part.taskId))
  let found: DraftFileUi | undefined
  for (const message of messages) {
    const files = [...(message.filesSaved?.files ?? []), ...(message.opinion?.files ?? [])].filter(file => tasks.has(file.taskId))
    const art = groupArt(files).filter(file => file.type === 'image' && file.thumb !== undefined)
    const last = art[art.length - 1]
    if (last !== undefined) found = last
  }
  return found
}
