// @vitest-environment jsdom
// D-069 (Muse): uma persona NUNCA é desenhada como letra. As telas da Quill (Personas, Conexões "Uma persona", sessão do Ensinar) usam `resolvePersonaFace`:
// o animal conhecido sai como antes; uma persona de aparência desconhecida ganha o bicho ESTÁVEL do cartão do plano e do perfil, não a inicial.
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePersonaFace } from '../src/client/approvals/approvals-ui-helpers.ts'
import { personaFaceSrc } from '../src/client/hire/persona-face.ts'
import { PersonasSettingsPanel } from '../src/client/settings-personas/PersonasSettingsPanel.tsx'
import { pt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never

function rowOf(container: HTMLElement, name: string): HTMLElement {
  const row = [...container.querySelectorAll<HTMLElement>('li[data-persona-id]')].find(li => within(li).queryByText(name) !== null)
  if (row === undefined) throw new Error(`row of ${name} not found`)
  return row
}

describe('Personas (Configurações): o rosto nunca é inicial', () => {
  it('animal conhecido sai como antes; aparência desconhecida ganha o bicho estável (o mesmo do plano e do perfil), sem a inicial', () => {
    const { container } = render(
      <PersonasSettingsPanel
        t={t}
        personas={[
          { id: 'p-luna', name: 'Luna', title: 'Vigia', characterId: 'luna' },
          { id: 'p-probe', name: 'Probe Real', title: 'Teste', characterId: 'nao-e-um-animal-da-galeria' },
        ]}
      />,
    )
    const luna = rowOf(container, 'Luna').querySelector('img')
    expect(luna).not.toBeNull()
    expect(luna?.getAttribute('src')).toBe(resolvePersonaFace({ id: 'p-luna', characterId: 'luna', name: 'Luna' }))

    const probeRow = rowOf(container, 'Probe Real')
    const probe = probeRow.querySelector('img')
    expect(probe).not.toBeNull()
    expect(probe?.getAttribute('src')).toBe(personaFaceSrc('nao-e-um-animal-da-galeria', 'p-probe'))
    // Nenhuma inicial desenhada no lugar do rosto.
    expect(within(probeRow).queryByText('PR')).toBeNull()
    expect(within(probeRow).queryByText('P')).toBeNull()
  })

  it('resolvePersonaFace: ator sem id (o sistema) não ganha bicho inventado; com id, o bicho é sempre o mesmo', () => {
    expect(resolvePersonaFace({ name: 'Equipe' })).toBeUndefined()
    const a = resolvePersonaFace({ id: 'onb-9', characterId: 'x', name: 'Pipa' })
    const b = resolvePersonaFace({ id: 'onb-9', characterId: 'x', name: 'Pipa' })
    expect(a).toBeDefined()
    expect(a).toBe(b)
  })

})
