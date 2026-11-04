// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/persona-editor/locales.ts'
import { PersonaEditor } from '../src/client/persona-editor/PersonaEditor.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

describe('PersonaEditor avatar upload gate', () => {
  it('blocks upload source until host is ready', () => {
    render(<PersonaEditor dict={pt} />)
    // Muse editor: avatar source is a tablist; the upload tab stays visible but disabled until the host supports it.
    const upload = screen.getByRole('tab', { name: pt['field.avatarUploadSoon'] })
    expect(upload.getAttribute('aria-disabled')).toBe('true')
    expect((upload as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(upload)
    expect(screen.getByRole('tab', { name: pt['field.avatarGallery'], selected: true })).toBeTruthy()
  })
})
