// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonaTeamFigure } from '../src/client/team/PersonaTeamFigure.tsx'
import { registerPoseUrl } from '../src/client/assets/asset-url.ts'

afterEach(() => { cleanup() })

for (const key of ['atlas-disponivel', 'atlas-descansando', 'atlas-disponivel-blink', 'atlas-disponivel-tail']) registerPoseUrl(key, `data:image/webp;base64,${key}`)

describe('PersonaTeamFigure life frames', () => {
  it('blink/tail only overlay the standing pose (no second animal over a sleeping pose)', () => {
    // Only a persona inside a silence window sleeps (`quiet`); an idle one is "Disponível" and stands (DESIGN-01-MUSE §0.2).
    const resting = render(<PersonaTeamFigure member={{ id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', quiet: true }} breatheDelay="0s" />)
    expect([...resting.container.querySelectorAll('img')].filter(img => img.src.includes('-blink') || img.src.includes('-tail'))).toHaveLength(0)
    resting.unmount()
    const available = render(<PersonaTeamFigure member={{ id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting' }} breatheDelay="0s" />)
    expect(available.container.querySelector('[data-pose="disponivel"]')).not.toBeNull()
    expect([...available.container.querySelectorAll('img')].filter(img => img.src.includes('-blink'))).toHaveLength(1)
    available.unmount()
    const idle = render(<PersonaTeamFigure member={{ id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'idle' as never }} breatheDelay="0s" />)
    expect([...idle.container.querySelectorAll('img')].filter(img => img.src.includes('-blink'))).toHaveLength(1)
  })
})
