/**
 * FL-11 / IV-5: o que a tela precisa do HOST para Parar e Direcionar um turno em andamento (atrás de `persona.flag.workingControl`).
 * A tela só desenha e chama; quem fala com o host é `remote/use-connected-turn-controls.ts`.
 */

export interface HostTurnControls {
  /** Há uma resposta (ou Tarefa) que dá para parar: quem está escrevendo. `null` = nada a parar (o botão continua sendo o de enviar). */
  readonly stoppable: { readonly personaName: string } | null
  /** Parar: cancela o turno aberto; o balão fica com o que já veio ("Você parou aqui · Continuar"). */
  readonly stop: () => void
  /** "Direcionar agora": o texto entra no turno aberto (`mode:'steer'`) ou vai como mensagem normal (`mode:'sent'`, não é erro). */
  readonly steer: (text: string, responder: { readonly id: string; readonly name: string }) => void
  /** A persona que acabou de parar (o leitor de tela diz "{persona} parou."); `null` quando passou. */
  readonly stoppedPersona: string | null
  /** A mensagem pronta do host quando algo falhou; `null` = nada a dizer. */
  readonly error: string | null
  readonly clearError: () => void
}
