import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { voiceModelArchive, VOICE_MODEL_ARCHIVE, VOICE_MODEL_ENTRY } from '../src/index.ts'

describe('o arquivo do modelo de voz', () => {
  it('o componente fixado é o tar.gz publicado pelo projeto do vosk-browser, com tamanho e sha medidos', () => {
    expect(VOICE_MODEL_ENTRY.kind).toBe('stt')
    expect(VOICE_MODEL_ENTRY.url).toBe('https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz')
    expect(VOICE_MODEL_ENTRY.bytes).toBe(32_440_432)
    expect(VOICE_MODEL_ENTRY.sha256).toBe('499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c')
    expect(VOICE_MODEL_ENTRY.format).toBe('tar.gz')
  })

  it('serve o arquivo que o instalador guardou ao lado do componente', () => {
    const root = mkdtempSync(join(tmpdir(), 'persona-stt-component-'))
    try {
      const component = join(root, 'stt', 'vosk-model-small-pt-0.3')
      mkdirSync(component, { recursive: true })
      writeFileSync(join(component, VOICE_MODEL_ARCHIVE), 'compactado')
      expect(voiceModelArchive(component).toString('utf8')).toBe('compactado')
      expect(readFileSync(join(component, VOICE_MODEL_ARCHIVE)).toString('utf8')).toBe('compactado')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sem o arquivo, falha alto em vez de servir bytes vazios', () => {
    const root = mkdtempSync(join(tmpdir(), 'persona-stt-empty-'))
    try {
      expect(() => voiceModelArchive(root)).toThrow(/model archive is missing/u)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
