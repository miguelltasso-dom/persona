/**
 * Muse 05/11 04:01 (achado do Bolt, CV-9): um CARTÃO, uma LINHA DE EVENTO ou uma LINHA DE EQUIPE quebra o grupo de balões. A mensagem seguinte sempre abre um grupo novo,
 * com o rosto e o "Nome · função · hora". Antes, só alguns cartões contavam: a proposta, a pergunta com chips, a passagem de trabalho, a revisão e a linha de estado
 * eram "mensagens comuns" do autor, então a mensagem seguinte se juntava ao que veio ANTES do cartão e perdia o cabeçalho.
 * Vale para qualquer mensagem que traga o campo, mesmo com a flag do cartão desligada (aí o texto simples ganha um cabeçalho a mais, nunca perde o seu).
 */
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'

/** A mensagem NÃO é um balão comum: é um cartão, uma linha de evento ou uma linha de equipe (ou traz a ficha de uma tarefa). */
export function breaksGroup(message: ChannelMessageUi): boolean {
  return message.gestorPlanId !== undefined
    || message.runError !== undefined
    || message.harness !== undefined
    || message.dailyBrief !== undefined
    || message.actionPreview !== undefined
    || message.actionEvent !== undefined
    || message.initiativeAsk !== undefined
    || message.teamPlan !== undefined
    || message.deliveryCard !== undefined
    || message.fanout !== undefined
    || message.opinion !== undefined
    || message.taskProposal !== undefined
    || message.personaAsk !== undefined
    || message.teamHandoff !== undefined
    || message.teamReview !== undefined
    || message.filesSaved !== undefined
    || message.stateLine !== undefined
    || (message.taskTitle !== undefined && message.taskTitle.length > 0)
}
