// @vitest-environment jsdom
// Keel 01:48 (captura de Conexões, axe do escopo): o medidor da cota oficial é role=progressbar com nome e limites 0–100.
// role=meter falhava no axe das capturas (aria-roles, aria-allowed-attr); este teste guarda o papel e os atributos aria-value*.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QuotaMeter } from '../src/client/primitives/PersonaCard.tsx'

afterEach(cleanup)

describe('QuotaMeter (cota oficial): progressbar com nome e limites', () => {
  it('expõe nome, mínimo 0, máximo 100, valor e texto; nunca usa role=meter', () => {
    render(<QuotaMeter label="5h" pct={100} />)
    const bar = screen.getByRole('progressbar', { name: '5h' })
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(bar.getAttribute('aria-valuetext')).toBe('100%')
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('o valor em aria-valuenow fica entre 0 e 100 mesmo com a cota acima de 100%', () => {
    render(<QuotaMeter label="Semana" pct={140} />)
    expect(screen.getByRole('progressbar', { name: 'Semana' }).getAttribute('aria-valuenow')).toBe('100')
  })
})
