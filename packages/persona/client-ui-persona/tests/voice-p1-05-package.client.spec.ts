// COLHEITA-S1 · P1-05 (Carbon): o pacote tem de levar o chunk do vosk (import dinâmico de ./vosk-module.ts).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P1-05 · o pacote leva o chunk do transcritor', () => {
  it('files inclui lib/client.vosk-module.js, o módulo que o build gera para o import dinâmico', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[] }
    expect(pkg.files).toContain('lib/client.vosk-module.js')
  })
})
