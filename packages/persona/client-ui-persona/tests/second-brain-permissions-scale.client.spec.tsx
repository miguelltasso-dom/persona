// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BrainGrantView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainPermissionsView } from '../src/client/second-brain/SecondBrainPermissionsView.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function mockGrants(count: number): readonly BrainGrantView[] {
  return Array.from({ length: count }, (_, index): BrainGrantView => ({
    id: `grant-scale-${index}`,
    pageId: `page-${index}`,
    personaId: index % 2 === 0 ? 'atlas' : 'luna',
    action: 'ler',
    target: `Alvo ${index}`,
    validity: '7d',
    useCount: index % 5,
  }))
}

describe('SecondBrainPermissionsView scale (DESEMPENHO)', () => {
  it('virtualizes 80 active grants', () => {
    const grants = mockGrants(80)
    const start = performance.now()
    const { container } = render(
      <PreviewFrame brandLabel="Persona">
        <SecondBrainPermissionsView
          dict={pt}
          grants={grants}
          personaNames={{ atlas: 'Atlas', luna: 'Luna' }}
          onBack={() => {}}
        />
      </PreviewFrame>,
    )
    const ms = performance.now() - start
    const revokeButtons = container.querySelectorAll('button').length
    expect(revokeButtons).toBeLessThan(grants.length)
    expect(revokeButtons).toBeGreaterThan(10)
    expect(ms).toBeLessThan(8_000)
  })
})
