/**
 * D-090 / TEAM-8 (c): a imagem de um anexo do fio (o rascunho de um pedido de opinião). O host entrega os bytes em base64
 * (`getAttachmentBytes`, ACL no servidor); aqui vira uma `data:` URL, e SÓ de tipo de imagem conhecido (o host já recusa SVG/HTML; esta checagem
 * é a segunda barreira). Qualquer falha vira `null` e a tela mostra o `alt` no lugar da imagem (nunca um quadro quebrado).
 */

export interface AttachmentBytesRemote {
  getAttachmentBytes?(request: Record<string, unknown>): unknown
}

export interface AttachmentScope {
  readonly workspaceId: string
  readonly projectId: string
}

const IMAGE_MIME = /^image\/(png|jpeg|webp|gif)$/u
/** Maior imagem que a tela decodifica (o host já limita a 8 MB por arquivo; base64 incha ~33%). */
const MAX_BASE64_CHARS = 12 * 1024 * 1024

export function attachmentBytesRemoteFrom(remote: object | undefined): AttachmentBytesRemote | undefined {
  if (remote === undefined) return undefined
  return typeof (remote as AttachmentBytesRemote).getAttachmentBytes === 'function' ? (remote as AttachmentBytesRemote) : undefined
}

/** O resultado do Remote pode vir puro ou embrulhado em `{ ok, value }`. */
function unwrap(result: unknown): unknown {
  if (typeof result === 'object' && result !== null && 'ok' in result) {
    const row = result as { ok: unknown; value?: unknown }
    return row.ok === true ? row.value : undefined
  }
  return result
}

const cache = new Map<string, Promise<string | null>>()

/** `null` quando não dá para mostrar (sem host, bytes inválidos, tipo que não é imagem). Guarda o resultado por anexo. */
export function resolveAttachmentImage(remote: AttachmentBytesRemote, scope: AttachmentScope, attachmentId: string): Promise<string | null> {
  const key = `${scope.workspaceId}|${scope.projectId}|${attachmentId}`
  const known = cache.get(key)
  if (known !== undefined) return known
  const pending = (async (): Promise<string | null> => {
    try {
      const view = unwrap(await Promise.resolve(remote.getAttachmentBytes?.({ workspaceId: scope.workspaceId, projectId: scope.projectId, attachmentId })))
      if (typeof view !== 'object' || view === null) return null
      const { mime, bytesBase64 } = view as { mime?: unknown; bytesBase64?: unknown }
      if (typeof mime !== 'string' || !IMAGE_MIME.test(mime)) return null
      if (typeof bytesBase64 !== 'string' || bytesBase64 === '' || bytesBase64.length > MAX_BASE64_CHARS) return null
      return `data:${mime};base64,${bytesBase64}`
    } catch {
      return null
    }
  })()
  cache.set(key, pending)
  // Falha não fica guardada: tentar de novo na próxima vez que a tela pedir.
  void pending.then((url) => { if (url === null) cache.delete(key) })
  return pending
}

/** Só para teste. */
export function clearAttachmentImageCache(): void {
  cache.clear()
}
