import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * D-069 (Muse): uma persona NUNCA é desenhada como letra. As telas da Quill com persona numa lista (Personas, Conexões "Uma persona", sessão do Ensinar)
 * resolvem o rosto por `resolvePersonaFace` (animal conhecido; senão o bicho estável do `personaFaceSrc`). Chamar `personaPortraitSrc` direto devolve
 * `undefined` para uma aparência desconhecida e o Avatar cai na inicial: este guarda impede a volta disso.
 */
const SRC = new URL('../src/client/', import.meta.url).pathname.replace(/^\/(\w:)/u, '$1')

describe('rosto de persona nas telas da Quill', () => {
  it('Personas, Conexões e Ensinar resolvem o rosto por resolvePersonaFace, nunca por personaPortraitSrc direto', () => {
    for (const file of ['settings-personas/PersonasSettingsPanel.tsx', 'connections/ConnectionsView.tsx', 'profile/TeachPersonaSession.tsx']) {
      const text = readFileSync(`${SRC}${file}`, 'utf8')
      expect(text, file).not.toMatch(/\bpersonaPortraitSrc\(/u)
      expect(text, file).toMatch(/\bresolvePersonaFace\(/u)
    }
  })
})
