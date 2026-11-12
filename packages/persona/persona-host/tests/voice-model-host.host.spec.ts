/**
 * Item 20: the Host side of the voice model — the renderer asks for state and bytes, and the component store is the only source.
 * The installed directory is seeded by hand, so no test touches the network.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonaComponents } from '@deepseek-ai/dsh-persona-components'
import { ensureVoiceModelBytes, voiceModelStateOf } from '../src/voice-model-host.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function workspace(): { root: string; manifestPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'voice-host-'))
  roots.push(root)
  const manifestPath = join(root, 'components.json')
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    components: [{
      kind: 'stt',
      version: 'v1',
      url: 'https://example.invalid/model.tar.gz',
      sha256: 'a'.repeat(64),
      bytes: 4,
      format: 'tar.gz',
    }],
  }))
  return { root, manifestPath }
}

function context(components: PersonaComponents): Context {
  const ctx = new Context()
  ctx.provide('personaComponents', components)
  return ctx
}

describe('o modelo de voz no Host', () => {
  it('sem manifesto o componente é inerte e o renderer recebe unavailable', async () => {
    const ctx = context(new PersonaComponents(new Context(), { manifestPath: '', root: '' }))
    expect(voiceModelStateOf(ctx)).toEqual({ state: 'unavailable' })
    expect(await ensureVoiceModelBytes(ctx)).toEqual({ state: 'unavailable' })
  })

  it('com manifesto e nada instalado, o estado é absent', () => {
    const { root, manifestPath } = workspace()
    const ctx = context(new PersonaComponents(new Context(), { manifestPath, root }))
    expect(voiceModelStateOf(ctx)).toEqual({ state: 'absent' })
  })

  it('instalado sem o arquivo é instalação corrompida, não erro cru', async () => {
    const { root, manifestPath } = workspace()
    mkdirSync(join(root, 'stt', 'v1'), { recursive: true })
    const ctx = context(new PersonaComponents(new Context(), { manifestPath, root }))
    expect(await ensureVoiceModelBytes(ctx)).toEqual({ state: 'failed', reason: 'checksum' })
  })

  it('instalado, devolve a versão e os bytes do model.tar.gz', async () => {
    const { root, manifestPath } = workspace()
    const installed = join(root, 'stt', 'v1')
    mkdirSync(installed, { recursive: true })
    const bytes = Buffer.from([31, 139, 8, 0])
    writeFileSync(join(installed, 'model.tar.gz'), bytes)
    const ctx = context(new PersonaComponents(new Context(), { manifestPath, root }))
    expect(voiceModelStateOf(ctx)).toEqual({ state: 'installed', version: 'v1' })
    expect(await ensureVoiceModelBytes(ctx)).toEqual({
      state: 'ready',
      version: 'v1',
      base64: bytes.toString('base64'),
      bytes: bytes.byteLength,
    })
  })
})
