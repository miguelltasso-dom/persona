// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ABOUT_LABELS_EN, ABOUT_LABELS_PT, AboutPersona, PERSONA_CREDITS } from '../src/client/primitives/About.tsx'

afterEach(cleanup)

describe('AboutPersona (kit de lançamento)', () => {
  it('credits the three upstreams with their licenses', () => {
    render(<AboutPersona version="0.1.0" labels={ABOUT_LABELS_PT} />)
    expect(screen.getByRole('heading', { name: 'Sobre o Persona' })).toBeTruthy()
    expect(screen.getByText('Versão 0.1.0')).toBeTruthy()
    for (const credit of PERSONA_CREDITS) expect(screen.getByText(credit.name)).toBeTruthy()
    expect(screen.getAllByText('Licença MIT')).toHaveLength(2)
    expect(screen.getByText('Licença Apache-2.0')).toBeTruthy()
  })

  it('opens upstream links and notices through the host, never by navigating', () => {
    const onOpenUrl = vi.fn()
    const onOpenNotices = vi.fn()
    render(<AboutPersona version="0.1.0" labels={ABOUT_LABELS_EN} onOpenUrl={onOpenUrl} onOpenNotices={onOpenNotices} />)
    fireEvent.click(screen.getByRole('button', { name: 'OAR' }))
    expect(onOpenUrl).toHaveBeenCalledWith('https://github.com/botiverse/oar')
    fireEvent.click(screen.getByRole('button', { name: 'See third-party notices' }))
    expect(onOpenNotices).toHaveBeenCalled()
    expect(document.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('pt and en labels cover the same credits', () => {
    expect(Object.keys(ABOUT_LABELS_PT.creditWhat).sort()).toEqual(Object.keys(ABOUT_LABELS_EN.creditWhat).sort())
    expect(Object.keys(ABOUT_LABELS_PT.creditWhat).sort()).toEqual(PERSONA_CREDITS.map(c => c.id).sort())
  })
})
