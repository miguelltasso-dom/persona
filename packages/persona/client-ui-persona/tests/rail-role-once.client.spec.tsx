// @vitest-environment jsdom
// Muse L2-resto (passada de leigo nº 2): no rail, em Pessoas, "Probe Probe": o nome e a função eram a mesma palavra e apareciam duas vezes. Agora a função só aparece quando diz
// algo além do nome (a mesma regra do cabeçalho da DM e da linha do fio: `roleAfterName`).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationPerson } from '../src/client/shell/conversations-model.ts'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

afterEach(() => { cleanup(); localStorage.clear() })

const person = (id: string, name: string, role: string): ConversationPerson => ({ id, name, role, teamId: null, teamName: null, unread: 0, hasConversation: false })

function mount(people: readonly ConversationPerson[]) {
  const source: ConversationsSource = { channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }], people }
  return render(<ConversationsRail t={t} source={source} active={null} openConversation={vi.fn()} />)
}

describe('a função no rail', () => {
  it('nome e função iguais ("Probe" / "Probe"): a palavra aparece uma vez, na linha e no nome acessível', () => {
    mount([person('probe', 'Probe', 'Probe')])
    const row = screen.getByRole('button', { name: /Conversar com Probe/u })
    // (o rosto decorativo traz a inicial "P"; o que não pode haver é a palavra duas vezes)
    expect((row.textContent ?? '').match(/Probe/gu)).toHaveLength(1)
    expect(row.getAttribute('aria-label')).not.toMatch(/Probe · Probe/u)
  })

  it('a função que diz algo além do nome continua lá', () => {
    mount([person('nina', 'Nina', 'Pesquisa')])
    const row = screen.getByRole('button', { name: /Conversar com Nina/u })
    expect(row.textContent).toContain('Pesquisa')
    expect(row.getAttribute('aria-label')).toMatch(/Nina · Pesquisa/u)
  })

  it('"probe" com função "PROBE" (só a caixa muda) também conta como repetida', () => {
    mount([person('probe', 'probe', 'PROBE')])
    const row = screen.getByRole('button', { name: /Conversar com probe/u })
    expect(row.textContent).not.toMatch(/PROBE/u)
    expect((row.textContent ?? '').match(/probe/giu)).toHaveLength(1)
  })
})
