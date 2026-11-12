/**
 * ACHADO do e2e de VOZ no app real (12/11 13:11, `mandatory-voz.spec.ts`): gravar → "Enviar áudio" → o app TRANSCREVE (o modelo estava `installed`, nenhum "Não consegui transcrever") e depois sobe o áudio
 * como anexo (`voz-6s.webm`) — e o Host recusa: `PersonaRemoteError … "attachFile" (gateway/internal): type-rejected`. Nada é postado. A causa está no classificador de anexos
 * (`persona-host/src/media-detect.ts` `detectUpload`): só reconhece PNG, JPEG, WebP, GIF, PDF, DOCX e texto; o áudio que o `MediaRecorder` do Chromium grava (WebM/EBML, ou OGG) cai em `type-rejected`.
 * Resultado: a mensagem de voz NÃO PODE SER ENVIADA hoje, apesar do transcritor real (a mensagem nunca chega ao fio).
 *
 * Este teste é o RED do HOST, sem navegador: um áudio WebM e um OGG (as assinaturas reais) devem ser ACEITOS como anexo (`audio/webm`, `audio/ogg`), e o que continua barrado (SVG, HTML, executável)
 * continua barrado. Vermelho enquanto o dono não corrigir (`it.fails`; `PERSONA_SHOW_RED=1` mostra a falha); quando corrigir, troque `expectedRed` por `it`. A OBSERVAÇÃO normal (antes do vermelho) prova que a
 * recusa é do tipo de arquivo e não de um erro do teste: um PNG passa, o mesmo áudio sai como `type-rejected`.
 */
import { describe, expect, it } from 'vitest'
import { detectUpload } from '../../persona-host/src/media-detect.ts'

// Corrigido (Keel 13:17): o WebM e o OGG são anexos aceitos por assinatura (media-audio.ts); os dois testes viraram `it`.
const expectedRed = it

/** The first bytes of what Chromium's `MediaRecorder` writes for `audio/webm;codecs=opus` (an EBML header), padded: not text, not an image, not an executable. */
const WEBM = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, ...Array.from({ length: 96 }, (_, index) => 0x80 + (index % 40))])
/** An Ogg page header (`OggS`), what Firefox/Chromium write for `audio/ogg;codecs=opus`. */
const OGG = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, ...Array.from({ length: 120 }, (_, index) => 0x80 + (index % 40))])

/** O veredito, PURO: o que o classificador responde para um áudio gravado (vazio = aceitou como o tipo certo). */
export function audioUploadProblems(accepted: { readonly mime?: string; readonly error?: string }, expectedMime: string): string[] {
  if (accepted.error !== undefined) return [`o Host recusou o áudio (${accepted.error}) em vez de aceitá-lo como ${expectedMime}`]
  return accepted.mime === expectedMime ? [] : [`o Host aceitou o áudio como ${String(accepted.mime)}, esperava ${expectedMime}`]
}

const classify = (bytes: Uint8Array, name: string): { mime?: string; error?: string } => {
  try { return { mime: detectUpload(bytes, name, 'attachment').mime } } catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
}

describe('voz — o anexo de áudio no classificador do Host (veredito puro)', () => {
  it('aceitar como o tipo certo passa; recusar ou aceitar como outro tipo são acusados', () => {
    expect(audioUploadProblems({ mime: 'audio/webm' }, 'audio/webm')).toEqual([])
    expect(audioUploadProblems({ error: 'type-rejected' }, 'audio/webm')).toHaveLength(1)
    expect(audioUploadProblems({ mime: 'text/plain' }, 'audio/webm')).toHaveLength(1)
  })
})

describe('voz — o Host aceita o áudio que o app grava (RED do achado do e2e de voz)', () => {
  it('OBSERVAÇÃO: a recusa é do TIPO do arquivo — o mesmo classificador aceita um PNG e hoje devolve type-rejected para o WebM e o OGG; SVG, HTML e executável seguem barrados', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
    expect(classify(png, 'foto.png').mime, 'o controle (um PNG) devia passar').toBe('image/png')
    expect(classify(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.svg').error).toBe('svg-rejected')
    expect(classify(new TextEncoder().encode('<!doctype html><p>x'), 'a.html').error).toBe('html-rejected')
    expect(classify(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]), 'a.exe').error).toBe('executable-rejected')
  })

  expectedRed('VERMELHO — o WebM do MediaRecorder (voz-6s.webm) é aceito como anexo audio/webm', () => {
    expect(audioUploadProblems(classify(WEBM, 'voz-6s.webm'), 'audio/webm')).toEqual([])
  })

  expectedRed('VERMELHO — o OGG (voz-6s.ogg) é aceito como anexo audio/ogg', () => {
    expect(audioUploadProblems(classify(OGG, 'voz-6s.ogg'), 'audio/ogg')).toEqual([])
  })
})
