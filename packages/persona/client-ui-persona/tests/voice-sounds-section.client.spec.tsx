// @vitest-environment jsdom
/**
 * Item 20 (Muse §4): o interruptor "Sons discretos" e o volume Baixo · Médio em Configurações › Aparência.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SoundsSection } from '../src/client/voice/SoundsSection.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

const t = (key: string) => bindLocale(shellPt, key)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Configurações › Aparência › Sons discretos', () => {
  it('mostra o interruptor ligado e o volume baixo por padrão', () => {
    render(<SoundsSection t={t} />)
    expect(screen.getByRole('heading', { name: t('sounds.title') })).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: t('sounds.label') })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: t('sounds.low') }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: t('sounds.medium') }).getAttribute('aria-pressed')).toBe('false')
  })

  it('desliga e guarda a escolha', () => {
    render(<SoundsSection t={t} />)
    fireEvent.click(screen.getByRole('switch', { name: t('sounds.label') }))
    expect(localStorage.getItem('persona.sounds.enabled.v1')).toBe('0')
    expect(screen.getByRole('switch', { name: t('sounds.label') }).getAttribute('aria-checked')).toBe('false')
  })

  it('troca o volume para médio e guarda a escolha', () => {
    render(<SoundsSection t={t} />)
    fireEvent.click(screen.getByRole('button', { name: t('sounds.medium') }))
    expect(localStorage.getItem('persona.sounds.volume.v1')).toBe('medium')
    expect(screen.getByRole('button', { name: t('sounds.medium') }).getAttribute('aria-pressed')).toBe('true')
  })
})
