/**
 * LEAK-1 (Gauge 05/11 03:06): o host guarda alguns cartões NO CORPO da mensagem: a frase simples primeiro (um cliente que não conhece o cartão ainda mostra algo
 * verdadeiro) e o marcador por último — `[[task-proposal:{json}]]`, `[[persona-ask:…]]`, `[[handoff:…]]`, `[[review:…]]`, `[[account-ask:…]]`, `[[account-swap:…]]`.
 * Os dados do cartão chegam também em campos próprios da mensagem (`taskProposal`, `personaAsk`, `handoff`…), então o marcador NUNCA é para a tela: com o cartão
 * desligado (flag), a pessoa lê só a frase simples. O `run-error` e o `gestor-plan` têm o seu próprio leitor (`run-error-message.ts`, `gestor-plan-message.ts`).
 */

const WIRE_MARKER = /\s*\[\[(?:task-proposal|persona-ask|account-ask|account-swap|handoff|review|run-error):[\s\S]*?\]\]\s*$/u

/** O corpo sem o marcador do host no fim; corpo sem marcador volta igual. */
export function stripWireMarkers(body: string): string {
  return body.replace(WIRE_MARKER, '')
}
