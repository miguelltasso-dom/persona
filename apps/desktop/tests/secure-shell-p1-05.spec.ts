/**
 * COLHEITA-S1 · P1-05 (Carbon) · D-114: a CSP do desktop libera só o que o transcritor de voz local (Vosk em Worker) precisa, e nada mais.
 * Autorizado pelo Miguel (12/11 10:00; desenho do Atlas 04:00): worker-src 'self' blob:; script-src + 'wasm-unsafe-eval'; media-src + blob:; connect-src + blob:.
 * NUNCA 'unsafe-eval' nem 'unsafe-inline' em script, e nenhum host novo. O teste do TEXTO EXATO abaixo quebra qualquer afrouxamento futuro.
 */
import { describe, expect, it } from 'vitest'
import { PERSONA_CSP } from '../src/secure-shell.ts'

function directive(name: string): string {
  return PERSONA_CSP.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `)) ?? ''
}

describe('P1-05 · CSP do desktop: só o necessário para a voz', () => {
  it('trava a CSP INTEIRA como texto exato (qualquer afrouxamento futuro precisa mudar este teste de propósito)', () => {
    expect(PERSONA_CSP).toBe([
      "default-src 'self' dsh-app:",
      "script-src 'self' blob: dsh-app: http://127.0.0.1:* 'wasm-unsafe-eval'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' dsh-app:",
      "img-src 'self' data: dsh-app:",
      "font-src 'self' data: dsh-app:",
      "media-src 'self' blob: dsh-app:",
      "connect-src 'self' dsh-app: http://127.0.0.1:* ws://127.0.0.1:* blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-src 'none'",
      "form-action 'none'",
    ].join('; '))
  })

  it('o áudio gravado toca de blob: (media-src) e o modelo do vosk chega por blob: (connect-src)', () => {
    expect(directive('media-src')).toContain('blob:')
    expect(directive('connect-src')).toContain('blob:')
  })

  it("o worker do vosk compila WASM com 'wasm-unsafe-eval' (só WebAssembly) e nunca com 'unsafe-eval'", () => {
    expect(directive('script-src')).toContain("'wasm-unsafe-eval'")
    expect(PERSONA_CSP).not.toContain("'unsafe-eval'")
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(directive('worker-src')).toBe("worker-src 'self' blob:")
  })

  it('connect-src ganha só blob:, nenhum host novo (nada de CDN nem https)', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' dsh-app: http://127.0.0.1:* ws://127.0.0.1:* blob:")
    expect(PERSONA_CSP).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/u)
  })
})
