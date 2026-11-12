// @vitest-environment jsdom
// Item 16 (memory that proves itself): a memory the owner asked for shows the message that said it, word for word, and who/where/when
// (Muse's copy: "Você disse no #geral hoje:", curly quotes, four lines then "ver tudo", "Toda a equipe" / "Só a Bia").
import type { MemoryView } from '@deepseek-ai/dsh-persona-host/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryViewsToRows } from '../src/client/data/adapters/memory.ts'
import { pt } from '../src/client/locale/memory/locales.ts'
import { friendlyWhen, MemoryPanel } from '../src/client/memory/MemoryPanel.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

afterEach(cleanup)

const t = (key: string, params?: Readonly<Record<string, string>>): string => bindLocale(pt, key, params)
// Calendar days at noon, never "now − N hours": near midnight that lands on the wrong day.
const TODAY = (() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString() })()
const YESTERDAY = (() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12).toISOString() })()

const OWNED: MemoryView = {
  id: 'owner-mem-m1', body: 'A padaria abre às 7h.', status: 'active', origin: 'vault', scope: 'team', rule: false,
  source: { quote: 'Pessoal, lembrem disso: a padaria abre às 7h', by: 'Ana', mine: true, at: TODAY, where: 'channel', place: 'geral' },
}
const RULE: MemoryView = {
  id: 'owner-mem-m2', body: 'Nunca prometer entrega no mesmo dia.', status: 'active', origin: 'vault', scope: 'team', rule: true,
  source: { quote: 'Regra da casa: nunca prometer entrega no mesmo dia', by: 'Ana', mine: true, at: TODAY, where: 'channel', place: 'geral' },
}
const DM_BIA: MemoryView = {
  id: 'owner-mem-d1', body: 'A Ana Souza prefere pão sem sal.', status: 'active', origin: 'vault', scope: 'persona', rule: false,
  to: { name: 'Bia' },
  source: { quote: 'Lembra que a Ana Souza prefere pão sem sal', by: 'Ana', mine: true, at: TODAY, where: 'dm', place: '' },
}
const DM_BENTO: MemoryView = { ...DM_BIA, id: 'owner-mem-d2', to: { name: 'Bento' } }
const PLAIN: MemoryView = { id: 'v1', body: 'Cliente X não quer menção a concorrentes.', status: 'active', origin: 'vault' }

describe('memoryViewsToRows', () => {
  it('carries the proof, who/where, whom it was said to, and leaves plain rows exactly as before', () => {
    const [owned, rule, dm, plain] = memoryViewsToRows([OWNED, RULE, DM_BIA, PLAIN], 'ws', 'pp')
    expect(owned).toMatchObject({ uiOrigin: 'conversation', authorId: 'Ana', visibility: { kind: 'workspace' }, ownerSource: { by: 'Ana', mine: true, where: 'channel', place: 'geral', quote: 'Pessoal, lembrem disso: a padaria abre às 7h' } })
    expect(owned?.ownerRule).toBeUndefined()
    expect(rule?.ownerRule).toBe(true)
    expect(dm).toMatchObject({ visibility: { kind: 'persona' }, ownerSource: { where: 'dm' }, ownerTo: { name: 'Bia' } })
    expect(plain).toMatchObject({ uiOrigin: 'vault', authorId: '—', visibility: { kind: 'project', projectId: 'pp' } })
    expect(plain?.ownerSource).toBeUndefined()
  })
})

describe('friendlyWhen', () => {
  const now = new Date(2026, 10, 11, 18, 0)
  it('says hoje and ontem, then the day, and the year only when it is not this one', () => {
    expect(friendlyWhen(new Date(2026, 10, 11, 9, 0).toISOString(), t, now)).toBe('hoje')
    expect(friendlyWhen(new Date(2026, 10, 10, 23, 0).toISOString(), t, now)).toBe('ontem')
    expect(friendlyWhen(new Date(2026, 2, 4, 12, 0).toISOString(), t, now)).toBe('em 04/03')
    expect(friendlyWhen(new Date(2025, 2, 4, 12, 0).toISOString(), t, now)).toBe('em 04/03/2025')
    expect(friendlyWhen('ontem à noite', t, now)).toBe('')
  })
})

describe('MemoryPanel: the source line and the quote', () => {
  it('says "Você disse no #geral hoje:" for what the person said, then their words in curly quotes; the chip reads "Toda a equipe"', () => {
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([OWNED], 'ws', 'pp')} />)
    const proof = container.querySelector('[data-memory-proof]') as HTMLElement
    expect(proof.querySelector('figcaption')?.textContent).toBe('Você disse no #geral hoje:')
    expect(proof.querySelector('blockquote')?.textContent).toBe('“Pessoal, lembrem disso: a padaria abre às 7h”')
    expect(screen.getByText('A padaria abre às 7h.')).toBeTruthy()
    expect(screen.getByText('Toda a equipe')).toBeTruthy()
    expect(screen.queryByText('Regra da casa')).toBeNull()
    expect(screen.queryByText('Ver tudo')).toBeNull() // a short quote is never cut
  })

  it('the name only when another member said it, and "ontem" when it was yesterday', () => {
    const other: MemoryView = { ...OWNED, source: { ...OWNED.source!, mine: false, at: YESTERDAY } }
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([other], 'ws', 'pp')} />)
    expect(container.querySelector('figcaption')?.textContent).toBe('Ana disse no #geral ontem:')
  })

  it('a rule is marked "Regra da casa"', () => {
    render(<MemoryPanel rows={memoryViewsToRows([RULE], 'ws', 'pp')} />)
    expect(screen.getByText('Regra da casa')).toBeTruthy()
  })

  it('a DM memory says whom it was said to, by name and with no article (the product keeps no gender), and the chip names her', () => {
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([DM_BIA, DM_BENTO], 'ws', 'pp')} />)
    expect([...container.querySelectorAll('figcaption')].map(node => node.textContent)).toEqual([
      'Você disse numa conversa direta com Bia hoje:', 'Você disse numa conversa direta com Bento hoje:',
    ])
    expect(screen.getByText('Só para Bia')).toBeTruthy()
    expect(screen.getByText('Só para Bento')).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b(?:à|ao|a|o) (?:Bia|Bento)\b/u)
  })

  it('a long quote (more than four lines) is cut with "Ver tudo", opens by click and closes again', () => {
    const long: MemoryView = { ...OWNED, source: { ...OWNED.source!, quote: ['Pessoal, lembrem:', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis'].join('\n') } }
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([long], 'ws', 'pp')} />)
    const quote = container.querySelector('blockquote') as HTMLElement
    expect(quote.hasAttribute('data-expanded')).toBe(false)
    const more = screen.getByRole('button', { name: 'Ver tudo' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    // Cut by us, closed like a quote: the last whole word, "…" and the closing mark.
    expect(quote.textContent).toBe('“Pessoal, lembrem:\num\ndois\ntrês…”')
    fireEvent.click(more)
    expect(quote.hasAttribute('data-expanded')).toBe(true)
    expect(quote.textContent).toBe('“Pessoal, lembrem:\num\ndois\ntrês\nquatro\ncinco\nseis”') // the words are all there, never cut in the data
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(quote.hasAttribute('data-expanded')).toBe(false)
    expect(quote.textContent?.endsWith('…”')).toBe(true)
  })

  it('a cut quote always closes with …” and never doubles the punctuation ("ninguém.…", "....")', () => {
    const sentence = 'Pessoal, lembrem disso: nunca prometer entrega no mesmo dia, avisar o cliente com um dia de antecedência, conferir o endereço duas vezes, '
      + 'registrar o pedido na planilha, mandar a foto do bolo antes de fechar e não esquecer de ninguém. Obrigado a todos pela atenção de sempre. '
      + 'Se o cliente reclamar, peça desculpas, ofereça o troco em pão e avise a Ana no mesmo instante, sem discutir.'
    expect(sentence.length).toBeGreaterThan(300) // longer than the 280-character cut used without layout
    const long: MemoryView = { ...OWNED, source: { ...OWNED.source!, quote: sentence } }
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([long], 'ws', 'pp')} />)
    const shown = container.querySelector('blockquote')?.textContent ?? ''
    expect(shown.startsWith('“')).toBe(true)
    expect(shown.endsWith('…”')).toBe(true)
    expect(shown).not.toMatch(/[.,;:!?]…/u)
    expect(shown).not.toMatch(/\.{2,}/u)
    expect(shown.length).toBeLessThanOrEqual(284)
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
    expect(container.querySelector('blockquote')?.textContent).toBe(`“${sentence}”`)
  })

  it('the visibility and rule chips are neutral like "Conversa" (amber is "waiting for you"), and "rev N" is not shown on what the owner asked for', () => {
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([RULE], 'ws', 'pp')} />)
    const chips = [...container.querySelectorAll('[class*="chip"]')].filter(node => ['Conversa', 'Toda a equipe', 'Regra da casa'].includes(node.textContent ?? ''))
    expect(chips).toHaveLength(3)
    expect(new Set(chips.map(node => node.className)).size).toBe(1) // all the same style as "Conversa"
    expect(container.textContent).not.toMatch(/\brev \d/u)
  })

  it('"rev N" is on no card at all, and no card says "Cofre" (the vault of passwords leaves Memória): a plain memory reads "Memória"', () => {
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([PLAIN, OWNED, RULE], 'ws', 'pp')} />)
    expect(container.textContent).not.toMatch(/\brev\s*\d/iu)
    expect(container.textContent).not.toContain('Cofre')
    expect(screen.getAllByText('Memória').length).toBeGreaterThan(0)
  })

  it('the title says "Memória da equipe" (the closed vocabulary), not a persona\'s', () => {
    render(<MemoryPanel rows={memoryViewsToRows([OWNED], 'ws', 'pp')} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Memória da equipe' })).toBeTruthy()
  })

  it('when the memory already says what the quote says (the long case) the quote opens on one line, and "Ver tudo" opens it', () => {
    const body = 'A promoção de sábado é 2 pães de queijo por R$ 9, vale só para retirada no balcão, não vale em feriado, não soma com nenhum outro desconto e o cliente precisa mostrar a mensagem do WhatsApp na hora de pagar.'
    const long: MemoryView = { ...OWNED, body, source: { ...OWNED.source!, quote: `Pessoal, lembrem disso: ${body.charAt(0).toLowerCase()}${body.slice(1)}` } }
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([long], 'ws', 'pp')} />)
    const quote = container.querySelector('blockquote') as HTMLElement
    expect(quote.hasAttribute('data-compact')).toBe(true)
    expect(quote.textContent?.endsWith('…”')).toBe(true) // one line, still closed like a quote
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
    expect(quote.hasAttribute('data-compact')).toBe(false)
    // a short memory is never compact
    cleanup()
    const short = render(<MemoryPanel rows={memoryViewsToRows([OWNED], 'ws', 'pp')} />)
    expect(short.container.querySelector('blockquote')?.hasAttribute('data-compact')).toBe(false)
  })

  it('a memory nobody asked for in words has no proof block (nothing invented), and the team chip says the same "Toda a equipe" as the others', () => {
    const rows = memoryViewsToRows([PLAIN], 'ws', 'pp')
    const { container } = render(<MemoryPanel rows={[{ ...rows[0]!, visibility: { kind: 'workspace' } }]} />)
    expect(container.querySelector('[data-memory-proof]')).toBeNull()
    expect(screen.getByText('Toda a equipe')).toBeTruthy()
    expect(screen.queryByText('Equipe')).toBeNull()
  })

  it('every card the whole team can read says "Toda a equipe", with or without the owner\'s words (same meaning, same term)', () => {
    const rows = memoryViewsToRows([PLAIN, OWNED, RULE], 'ws', 'pp').map(row => ({ ...row, visibility: { kind: 'workspace' } as const }))
    const { container } = render(<MemoryPanel rows={rows} />)
    expect([...container.querySelectorAll('[class*="chip"]')].filter(node => node.textContent === 'Toda a equipe')).toHaveLength(3)
    expect(container.textContent).not.toMatch(/(?<!Toda a )\bEquipe\b/u)
  })

  it('an unreadable date never shows "Invalid Date"', () => {
    const odd: MemoryView = { ...OWNED, source: { ...OWNED.source!, at: 'ontem' } }
    const { container } = render(<MemoryPanel rows={memoryViewsToRows([odd], 'ws', 'pp')} />)
    expect(container.textContent).not.toMatch(/Invalid/u)
    expect(container.querySelector('figcaption')?.textContent).toBe('Você disse no #geral:')
  })
})
