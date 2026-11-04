// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/hire/locales.ts'
import { HirePersonaCard } from '../src/client/hire/HirePersonaCard.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('hire persona card preview', () => {
  it('shows contratar proposal with primary hire action', () => {
    render(<HirePersonaCard dict={pt} onApprove={() => undefined} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contratar Sol?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['action.approve'] })).toBeTruthy()
    expect(screen.getByText(pt['policy.note'])).toBeTruthy()
  })

  it('o motor aparece em português, nunca como id cru ("oar:codex")', () => {
    render(<HirePersonaCard dict={pt} />)
    expect(screen.queryByText(/oar:|:codex/u)).toBeNull()
    expect(screen.getAllByText('Codex').length).toBeGreaterThan(0)
  })

  it('o retrato é do bicho (avatarRef), não do nome da proposta', () => {
    const { container, rerender } = render(
      <HirePersonaCard dict={pt} proposal={{ name: 'Pipoca', avatarRef: 'capivara', creator: 'Atlas', role: 'Design', harness: 'claude', toolsSummary: 'Arquivos: leitura' }} />,
    )
    const byAnimal = container.querySelector('img')?.getAttribute('src')
    rerender(<HirePersonaCard dict={pt} proposal={{ name: 'Capivara', creator: 'Atlas', role: 'Design', harness: 'claude', toolsSummary: 'Arquivos: leitura' }} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(byAnimal)
    expect(byAnimal).toBeTruthy()
  })
})
