// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ABOUT_LABELS_PT } from '../src/client/primitives/About.tsx'
import { PersonaAboutSettingsSection } from '../src/client/shell/PersonaAboutSettingsSection.tsx'
import { globalStandardProps } from './global-standard-props.client.ts'

afterEach(cleanup)

describe('PersonaAboutSettingsSection', () => {
  it('renders AboutPersona with injected host callbacks', () => {
    const onOpenUrl = vi.fn()
    const onOpenNotices = vi.fn()
    render(
      <PersonaAboutSettingsSection
        {...globalStandardProps}
        labels={ABOUT_LABELS_PT}
        version="1.2.3"
        onOpenUrl={onOpenUrl}
        onOpenNotices={onOpenNotices}
        close={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sobre a Persona' })).toBeTruthy()
    expect(screen.getByText('Versão 1.2.3')).toBeTruthy()
  })
})
