// @vitest-environment jsdom
/**
 * Dogfood AG-003 — perfil hero has Conversar/Editar but no Ensinar (30-ensinar-ausente).
 * AG-003 — Ensinar no hero do perfil (W2-10).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { MOCK_PROFILE_ATLAS } from '../src/client/profile/mock-data.ts'
import { PersonaProfilePage } from '../src/client/profile/PersonaProfilePage.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('dogfood AG-003 — Ensinar no perfil (Prism)', () => {
  it('hero shows Ensinar next to Conversar / Editar', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <PersonaProfilePage
          dict={profilePt}
          snapshot={MOCK_PROFILE_ATLAS}
          onMessage={() => {}}
          onEdit={() => {}}
          onTeach={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('button', { name: profilePt['action.message'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: profilePt['action.edit'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: profilePt['action.teach'] })).toBeTruthy()
  })
})
