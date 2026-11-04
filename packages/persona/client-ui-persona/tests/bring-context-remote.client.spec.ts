import { describe, expect, it } from 'vitest'
import { mergeBringOrganizePreview } from '../src/client/data/bring-context-remote.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

const SAMPLE = `## Sobre mim
Miguel — fundador.

## Regras e restrições
Nunca publicar sem revisão (incerto).`

describe('mergeBringOrganizePreview', () => {
  it('falls back to client parser when host paste RPC is missing', async () => {
    const persona = {} as PersonaRemoteClient
    const preview = await mergeBringOrganizePreview(persona, {
      workspaceId: 'ws',
      projectId: 'proj',
    }, [{ source: 'claude', text: SAMPLE }], null)
    expect(preview.proposals.length).toBeGreaterThan(0)
  })
})
