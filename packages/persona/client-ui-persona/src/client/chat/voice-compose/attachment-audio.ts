/**
 * COLHEITA-S1 · P1-05 (Carbon) · Keel 04:11: o áudio de um anexo do fio. O TIPO (mime) vem de `getAttachment` e é pedido quando a
 * mensagem aparece (é o que decide mostrar a bolha); os BYTES (base64, `getAttachmentBytes`) só quando a pessoa aperta tocar.
 * Cache por id; falha não fica guardada (a próxima vez que a tela pedir, tenta de novo). Sem host, sem remote, `null`.
 */

export interface AttachmentRemote {
  getAttachment?(request: Record<string, unknown>): unknown
  getAttachmentBytes?(request: Record<string, unknown>): unknown
}

export interface AttachmentScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** Só os tipos de áudio que o navegador toca (o host já restringe; esta é a segunda barreira). */
const AUDIO_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav)$/u

/** O remote da loja é um tipo largo: aqui vira o pedaço que o áudio usa (sem conversão de dados). */
export function attachmentRemoteOf(remote: object): AttachmentRemote {
  return remote as AttachmentRemote
}

export function isAudioMime(mime: string): boolean {
  return AUDIO_MIME.test(mime)
}

export interface AudioAttachment {
  readonly mime: string
  readonly bytesBase64: string
}

/** O resultado do Remote pode vir puro ou embrulhado em `{ ok, value }`. */
function unwrap(result: unknown): unknown {
  if (typeof result === 'object' && result !== null && 'ok' in result) {
    const row = result as { ok: unknown; value?: unknown }
    return row.ok === true ? row.value : undefined
  }
  return result
}

function keyOf(scope: AttachmentScope, attachmentId: string): string {
  return `${scope.workspaceId}|${scope.projectId}|${attachmentId}`
}

const metaCache = new Map<string, Promise<AudioMeta | null>>()
const bytesCache = new Map<string, Promise<string | null>>()

function remember<T>(cache: Map<string, Promise<T | null>>, key: string, pending: Promise<T | null>): Promise<T | null> {
  cache.set(key, pending)
  // Falha não fica guardada: a próxima vez que a tela pedir, tenta de novo.
  void pending.then((value) => { if (value === null) cache.delete(key) })
  return pending
}

/** Metadado de um anexo de áudio: o tipo e o nome (o nome leva a duração: `voz-<segundos>s.webm`). */
export interface AudioMeta {
  readonly mime: string
  readonly name: string
}

/** Duração (ms) que a gravação escreveu no nome do anexo (`voz-<segundos>s.webm|ogg`); `undefined` para qualquer outro nome. */
export function durationFromAttachmentName(name: string): number | undefined {
  const match = /^voz-(\d{1,4})s\.(?:webm|ogg|mp4|wav)$/u.exec(name)
  if (match === null) return undefined
  return Number(match[1]) * 1000
}

/** Quando a mensagem aparece: o tipo e o nome do anexo se for áudio; `null` se não for (ou se não der para saber). */
export function audioMetaOf(remote: AttachmentRemote, scope: AttachmentScope, attachmentId: string): Promise<AudioMeta | null> {
  const key = keyOf(scope, attachmentId)
  const known = metaCache.get(key)
  if (known !== undefined) return known
  const pending = (async (): Promise<AudioMeta | null> => {
    try {
      const meta = unwrap(await Promise.resolve(remote.getAttachment?.({ workspaceId: scope.workspaceId, projectId: scope.projectId, attachmentId })))
      if (typeof meta !== 'object' || meta === null) return null
      const { mime, name } = meta as { mime?: unknown; name?: unknown }
      if (typeof mime !== 'string' || !isAudioMime(mime)) return null
      return { mime, name: typeof name === 'string' ? name : '' }
    } catch {
      return null
    }
  })()
  return remember(metaCache, key, pending)
}

/** Quando a mensagem aparece: só o tipo (`null` se não for áudio). */
export async function audioMimeOf(remote: AttachmentRemote, scope: AttachmentScope, attachmentId: string): Promise<string | null> {
  const meta = await audioMetaOf(remote, scope, attachmentId)
  return meta === null ? null : meta.mime
}

/** Quando a pessoa aperta tocar: os bytes em base64 (só se o tipo for áudio). */
export function audioBytesOf(remote: AttachmentRemote, scope: AttachmentScope, attachmentId: string): Promise<string | null> {
  const key = keyOf(scope, attachmentId)
  const known = bytesCache.get(key)
  if (known !== undefined) return known
  const pending = (async (): Promise<string | null> => {
    try {
      const view = unwrap(await Promise.resolve(remote.getAttachmentBytes?.({ workspaceId: scope.workspaceId, projectId: scope.projectId, attachmentId })))
      if (typeof view !== 'object' || view === null) return null
      const bytesBase64 = (view as { bytesBase64?: unknown }).bytesBase64
      return typeof bytesBase64 === 'string' && bytesBase64 !== '' ? bytesBase64 : null
    } catch {
      return null
    }
  })()
  return remember(bytesCache, key, pending)
}

/** Os bytes base64 viram uma URL de objeto (quem chama revoga ao desmontar). `null` se o conteúdo não for decodificável. */
export function audioObjectUrl(audio: AudioAttachment): string | null {
  try {
    const binary = atob(audio.bytesBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return URL.createObjectURL(new Blob([bytes], { type: audio.mime }))
  } catch {
    return null
  }
}

/** Ao tocar: confere o tipo (metadado) e então pega os bytes. `null` quando não é áudio ou não dá para tocar. */
export async function resolveAudioAttachment(remote: AttachmentRemote, scope: AttachmentScope, attachmentId: string): Promise<AudioAttachment | null> {
  const mime = await audioMimeOf(remote, scope, attachmentId)
  if (mime === null) return null
  const bytesBase64 = await audioBytesOf(remote, scope, attachmentId)
  if (bytesBase64 === null) return null
  return { mime, bytesBase64 }
}

/** Só para teste. */
export function clearAudioAttachmentCache(): void {
  metaCache.clear()
  bytesCache.clear()
}
