/**
 * P1 voz (Keel 13:17): o áudio que o MediaRecorder grava é anexo legítimo. Reconhecido POR ASSINATURA (os bytes do arquivo), nunca pelo
 * nome nem pelo tipo que o navegador declara. Só vale para anexo (o avatar não aceita áudio). SVG, HTML e executável continuam barrados
 * antes, em `detectUpload`; o teto de tamanho também é o de sempre.
 */

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3] as const // cabeçalho EBML: WebM (o que o Chromium grava com opus)
const OGG_PAGE = [0x4f, 0x67, 0x67, 0x53] as const // "OggS": página Ogg (o que Firefox/Chromium gravam com opus)

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
}

/**
 * @param bytes - O início do arquivo enviado.
 * @returns `audio/webm` ou `audio/ogg` quando a assinatura bate; `undefined` para qualquer outra coisa.
 */
export function audioMimeBySignature(bytes: Uint8Array): 'audio/webm' | 'audio/ogg' | undefined {
  if (startsWith(bytes, EBML_HEADER)) return 'audio/webm'
  if (startsWith(bytes, OGG_PAGE)) return 'audio/ogg'
  return undefined
}
