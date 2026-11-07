/**
 * team-real.md §12 (Forge): a ação da PESSOA "Incluir só pelo texto" num pedido de opinião com imagem. `includeOpinionTextOnly({ workspaceId, projectId, requestId, personaId })`
 * → `{ replyId, mark, failed? }`; a persona (de `noVision`) opina sobre a pergunta e o texto, nunca sobre a imagem, e a resposta volta com `reply.textOnly`.
 * Os NOMES do fio moram só aqui e em `opinion-model.ts`. Recusa = a frase pt-BR do host (a tela não inventa texto); host sem a chamada = a ação não existe (sem botão morto).
 */
import { isRemoteResult } from './persona-remote-unwrap.ts'

export interface OpinionTextOnlyRemote {
  includeOpinionTextOnly(request: Record<string, unknown>): unknown
}

/** O Remote do host como esta ação o enxerga, ou `undefined` se ele não tem a chamada (host antigo ou fake). */
export function opinionTextOnlyRemoteFrom(remote: object | undefined): OpinionTextOnlyRemote | undefined {
  if (remote === undefined) return undefined
  return typeof (remote as Record<string, unknown>).includeOpinionTextOnly === 'function' ? (remote as OpinionTextOnlyRemote) : undefined
}

export interface IncludeTextOnlyResult {
  readonly replyId: string
  readonly mark: string
  /** A persona não conseguiu responder agora (pausa, limite…): a linha com o motivo entra no fio; não é erro da ação. */
  readonly failed: boolean
}

/** A frase pt-BR que o host mandou, quando há (`hostMessage` do erro tipado do proxy, ou `error.message` de um `RemoteResult`). */
function hostPhrase(failure: unknown): string {
  if (typeof failure !== 'object' || failure === null) return ''
  const row = failure as { readonly hostMessage?: unknown; readonly message?: unknown }
  if (typeof row.hostMessage === 'string' && row.hostMessage !== '') return row.hostMessage
  return typeof row.message === 'string' ? row.message : ''
}

/**
 * Inclui `personaId` só pelo texto. Resolve com o resultado do host; rejeita com `Error(frase do host)` (vazia se o host não mandou uma).
 * @param remote - O Remote com `includeOpinionTextOnly`.
 * @param scope - O projeto do cartão.
 * @param request - `requestId` do cartão e a persona (tem de estar em `noVision`).
 */
export async function includeOpinionTextOnly(
  remote: OpinionTextOnlyRemote,
  scope: { readonly workspaceId: string; readonly projectId: string },
  request: { readonly requestId: string; readonly personaId: string },
): Promise<IncludeTextOnlyResult> {
  let value: unknown
  try {
    const result = await Promise.resolve(remote.includeOpinionTextOnly({ workspaceId: scope.workspaceId, projectId: scope.projectId, requestId: request.requestId, personaId: request.personaId }))
    if (isRemoteResult(result)) {
      if (!result.ok) throw new Error(hostPhrase(result.error))
      value = result.value
    } else {
      value = result
    }
  } catch (failure) {
    throw new Error(hostPhrase(failure))
  }
  const row = (typeof value === 'object' && value !== null ? value : {}) as { readonly replyId?: unknown; readonly mark?: unknown; readonly failed?: unknown }
  return {
    replyId: typeof row.replyId === 'string' ? row.replyId : '',
    mark: typeof row.mark === 'string' ? row.mark : '',
    failed: row.failed === true,
  }
}
