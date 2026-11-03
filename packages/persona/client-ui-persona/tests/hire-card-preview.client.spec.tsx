// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/hire/locales.ts'
import { HirePersonaCard } from '../src/client/hire/HirePersonaCard.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('hire persona card preview', () => {
  it('shows contratar proposal with primary hire action', () => {
    render(<HirePersonaCard dict={pt} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Contratar Sol?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['action.approve'] })).toBeTruthy()
    expect(screen.getByText(pt['policy.note'])).toBeTruthy()
  })
})
