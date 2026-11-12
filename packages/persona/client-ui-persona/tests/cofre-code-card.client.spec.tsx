// @vitest-environment jsdom
// Item 15 (colheita), o cartão "Precisa de um código" (Muse 12/11): seis caixas de 48 px, selo de prazo âmbar, os dígitos nunca ficam na tela.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeRequestCard, digitsOf, type CodeRequestRow } from '../src/client/cofre/CodeRequestCard.tsx'
import { codeRequestRows, visibleCodeRequests, type HostCodeRequest } from '../src/client/cofre/ConnectedCodeRequests.tsx'
import { pt as cofrePt } from '../src/client/locale/cofre/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(cofrePt, key, params)) as Parameters<typeof CodeRequestCard>[0]['t']

const NOW = Date.parse('2026-11-12T12:00:00Z')

function row(over: Partial<CodeRequestRow> = {}): CodeRequestRow {
  return {
    id: 'r1', personaName: 'Bia', site: 'Mercado Livre', reason: 'O site mandou um código por WhatsApp para entrar na conta da loja.',
    state: 'pending', expiresAt: new Date(NOW + 9 * 60_000).toISOString(), ...over,
  }
}

function boxes(): HTMLInputElement[] {
  return Array.from({ length: 6 }, (_, index) => screen.getByLabelText(`Dígito ${String(index + 1)} de 6`) as HTMLInputElement)
}

function paste(target: HTMLElement, text: string): void {
  fireEvent.paste(target, { clipboardData: { getData: () => text } })
}

describe('o cartão esperando o código', () => {
  it('rótulo com o site, o motivo na voz da persona, o selo âmbar "Vence em 9 min" e seis caixas', () => {
    render(<CodeRequestCard row={row()} t={t} now={() => NOW} onFill={vi.fn(async () => undefined)} onCancel={vi.fn(async () => undefined)} rowTag="div" />)
    expect(screen.getByRole('article').getAttribute('aria-label')).toBe('Precisa de um código · Mercado Livre')
    expect(screen.getByText('O site mandou um código por WhatsApp para entrar na conta da loja.')).toBeTruthy()
    const chip = screen.getByText('Vence em 9 min').closest('p')
    expect(chip?.getAttribute('data-deadline')).toBe('soon')
    expect(boxes()).toHaveLength(6)
    expect(screen.getByRole('group', { name: 'Código de 6 dígitos' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar código' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('digitar avança sozinho; colar o código inteiro preenche as seis; só dígitos entram', () => {
    render(<CodeRequestCard row={row()} t={t} now={() => NOW} onFill={vi.fn(async () => undefined)} rowTag="div" />)
    const all = boxes()
    fireEvent.change(all[0] as HTMLInputElement, { target: { value: '4' } })
    expect(all[0]?.value).toBe('4')
    expect(document.activeElement).toBe(all[1])
    fireEvent.change(all[1] as HTMLInputElement, { target: { value: 'x' } })
    expect(all[1]?.value).toBe('')
    paste(all[3] as HTMLElement, '12 34-56')
    expect(boxes().map(box => box.value).join('')).toBe('123456')
    expect((screen.getByRole('button', { name: 'Enviar código' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Backspace numa caixa vazia volta para a anterior e a limpa', () => {
    render(<CodeRequestCard row={row()} t={t} now={() => NOW} onFill={vi.fn(async () => undefined)} rowTag="div" />)
    const all = boxes()
    fireEvent.change(all[0] as HTMLInputElement, { target: { value: '7' } })
    fireEvent.keyDown(all[1] as HTMLInputElement, { key: 'Backspace' })
    expect(all[0]?.value).toBe('')
    expect(document.activeElement).toBe(all[0])
  })

  it('Enviar manda os seis dígitos UMA vez, apaga as caixas e nada do código fica no texto da tela', async () => {
    const onFill = vi.fn(async () => undefined)
    const { container } = render(<CodeRequestCard row={row()} t={t} now={() => NOW} onFill={onFill} rowTag="div" />)
    paste(boxes()[0] as HTMLElement, '482915')
    fireEvent.submit(screen.getByRole('group', { name: 'Código de 6 dígitos' }).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(onFill).toHaveBeenCalledTimes(1) })
    expect(onFill).toHaveBeenCalledWith('482915')
    await waitFor(() => { expect(boxes().every(box => box.value === '')).toBe(true) })
    expect(container.textContent).not.toContain('482915')
  })

  it('uma falha aparece em palavras e os dígitos continuam nas caixas para tentar de novo', async () => {
    render(<CodeRequestCard row={row()} t={t} now={() => NOW} onFill={vi.fn(async () => { throw new Error('O pedido já foi usado.') })} rowTag="div" />)
    paste(boxes()[0] as HTMLElement, '111222')
    fireEvent.submit(screen.getByRole('group', { name: 'Código de 6 dígitos' }).closest('form') as HTMLFormElement)
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('O pedido já foi usado.') })
    expect(boxes().map(box => box.value).join('')).toBe('111222')
  })

  it('Cancelar chama o host; sem handler, o botão não existe', async () => {
    const onCancel = vi.fn(async () => undefined)
    const { unmount } = render(<CodeRequestCard row={row()} t={t} now={() => NOW} onCancel={onCancel} rowTag="div" />)
    expect(screen.queryByRole('button', { name: 'Enviar código' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(onCancel).toHaveBeenCalledTimes(1) })
    unmount()
    render(<CodeRequestCard row={row()} t={t} now={() => NOW} rowTag="div" />)
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })
})

describe('o cartão que não espera mais', () => {
  it('vencido (pelo host ou pelo relógio): só leitura, "Passou do prazo." e "Tentar de novo" só com handler; sem caixas', () => {
    const onRetry = vi.fn()
    const { unmount } = render(<CodeRequestCard row={row({ state: 'expired' })} t={t} now={() => NOW} onRetry={onRetry} rowTag="div" />)
    expect(screen.getByText('Passou do prazo.')).toBeTruthy()
    expect(screen.queryByLabelText('Dígito 1 de 6')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    unmount()
    render(<CodeRequestCard row={row({ expiresAt: new Date(NOW - 1000).toISOString() })} t={t} now={() => NOW} rowTag="div" />)
    expect(screen.getByText('Passou do prazo.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('entregue vira uma linha: "Código entregue ao site. A equipe não vê."; cancelado também', () => {
    const { unmount } = render(<CodeRequestCard row={row({ state: 'filled' })} t={t} rowTag="div" />)
    expect(screen.getByText('Código entregue ao site. A equipe não vê.')).toBeTruthy()
    expect(screen.queryByLabelText('Dígito 1 de 6')).toBeNull()
    unmount()
    render(<CodeRequestCard row={row({ state: 'cancelled' })} t={t} rowTag="div" />)
    expect(screen.getByText('Pedido cancelado.')).toBeTruthy()
  })
})

describe('o que o topo de Aprovações mostra', () => {
  const host = (over: Partial<HostCodeRequest>): HostCodeRequest => ({
    id: 'a', personaId: 'bia', reason: 'preciso do código', state: 'pending', createdAt: new Date(NOW - 60_000).toISOString(), expiresAt: new Date(NOW + 9 * 60_000).toISOString(), ...over,
  })

  it('pendentes sempre; vencidos só na última meia hora; entregues e cancelados não voltam', () => {
    const list = [
      host({ id: 'p' }),
      host({ id: 'e-recent', state: 'expired', expiresAt: new Date(NOW - 5 * 60_000).toISOString() }),
      host({ id: 'e-old', state: 'expired', expiresAt: new Date(NOW - 3 * 3600_000).toISOString() }),
      host({ id: 'f', state: 'filled' }),
      host({ id: 'c', state: 'cancelled' }),
    ]
    expect(visibleCodeRequests(list, NOW).map(item => item.id)).toEqual(['p', 'e-recent'])
  })

  it('nomeia a persona e dá um rosto; persona desconhecida aparece pelo id', () => {
    const rows = codeRequestRows([host({ id: 'x', personaId: 'bia' }), host({ id: 'y', personaId: 'fantasma' })], [{ id: 'bia', name: 'Bia', avatarRef: 'capivara' }])
    expect(rows.map(item => item.personaName)).toEqual(['Bia', 'fantasma'])
    expect(rows.every(item => item.faceSrc !== undefined)).toBe(true)
  })

  it('Carbon P1-02: o site que a persona nomeou chega ao cartão ("Precisa de um código · Banco"); sem site, só o rótulo curto', () => {
    const rows = codeRequestRows([host({ id: 'a', site: 'Banco' }), host({ id: 'b' })], [{ id: 'bia', name: 'Bia', avatarRef: 'capivara' }])
    expect(rows.map(item => item.site)).toEqual(['Banco', undefined])
    render(<CodeRequestCard row={rows[0]!} t={t} now={() => NOW} rowTag="div" />)
    expect(screen.getByText('Precisa de um código · Banco')).toBeTruthy()
  })

  it('só os dígitos de um texto, no máximo seis', () => {
    expect(digitsOf('12 34-56 78')).toBe('123456')
    expect(digitsOf('abc')).toBe('')
  })
})

describe('o painel de uma persona vazia', () => {
  it('um cartão pendente sem nome de site usa só o rótulo curto', () => {
    render(<CodeRequestCard row={row({ site: undefined })} t={t} now={() => NOW} rowTag="div" />)
    expect(within(screen.getByRole('article')).getByLabelText('Dígito 1 de 6')).toBeTruthy()
    expect(screen.getByRole('article').getAttribute('aria-label')).toBe('Precisa de um código')
  })
})
