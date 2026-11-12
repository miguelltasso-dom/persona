// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11) "Fio real" (c): os rostos da linha de passagem sobem de 24 para 28 px, com o anel de cor da ORDEM DE CONTRATAÇÃO (decisão da Muse 13:40:
// a mesma fonte do tom da moldura do Avatar, #17: índice de contratação mod 7 em --persona-subject-{0..6}; o hash do cargo colidia justo no caso que importa, duas personas
// de Design). Se mesmo assim os dois rostos forem iguais (o mesmo bicho e o mesmo tom), o NOME vem antes da seta. Nunca um id na tela.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HandoffLine, ReviewLine } from '../src/client/chat/TeamLine.tsx'
import { personaTintIndex } from '../src/client/primitives/persona-tint.ts'
import { mapMessageHandoff } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { HandoffLineUi, ReviewLineUi, TeamPersonaUi } from '../src/client/teamwork/team-lines-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const BIA: TeamPersonaUi = { id: 'p-bia', name: 'Bia', characterId: 'nina', tint: 2 }
const TEO: TeamPersonaUi = { id: 'p-teo', name: 'Téo', characterId: 'bento', tint: 5 }
const handoff = (from: TeamPersonaUi, to: TeamPersonaUi): HandoffLineUi => ({ mode: 'help', status: 'asked', from, to, taskId: 'tk-1', title: 'Arte do bolo' })

const faces = (container: HTMLElement): HTMLElement[] => Array.from(container.querySelectorAll('[data-team-line] [data-team-face]'))

describe('personaTintIndex: a ORDEM DE CONTRATAÇÃO mod 7 (a fonte do tom, #17)', () => {
  const roster = ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-7', 'p-8']

  it('o índice na ordem de contratação, de 0 a 6, e a 8ª persona volta ao 0', () => {
    expect(personaTintIndex('p-0', roster)).toBe(0)
    expect(personaTintIndex('p-6', roster)).toBe(6)
    expect(personaTintIndex('p-7', roster)).toBe(0)
    expect(personaTintIndex('p-8', roster)).toBe(1)
  })

  it('quem não está na equipe não tem tom (nunca um tom inventado)', () => {
    expect(personaTintIndex('p-fantasma', roster)).toBeUndefined()
    expect(personaTintIndex('p-0', [])).toBeUndefined()
  })
})

describe('rostos da linha de passagem: 28 px com o anel da contratação (Fio real c)', () => {
  it('cada rosto tem 28 px (não mais 24)', () => {
    const { container } = render(<HandoffLine t={t} line={handoff(BIA, TEO)} />)
    const found = faces(container)
    expect(found).toHaveLength(2)
    for (const face of found) expect((face.querySelector('[class*="avatar"]') as HTMLElement).style.width).toBe('28px')
  })

  it('o anel é o tom da persona (0 a 6) e aparece no rosto', () => {
    const { container } = render(<HandoffLine t={t} line={handoff(BIA, TEO)} />)
    const [left, right] = faces(container)
    expect(left?.getAttribute('data-tint')).toBe('2')
    expect(right?.getAttribute('data-tint')).toBe('5')
  })

  it('sem tom conhecido não há anel inventado', () => {
    const noTint: TeamPersonaUi = { id: 'p-x', name: 'Xis', characterId: 'sol' }
    const { container } = render(<HandoffLine t={t} line={handoff(noTint, TEO)} />)
    expect(faces(container)[0]?.hasAttribute('data-tint')).toBe(false)
    expect(faces(container)[1]?.hasAttribute('data-tint')).toBe(true)
  })

  it('o caso que importa: duas personas de DESIGN (o mesmo cargo) têm anéis DIFERENTES (o hash do cargo colidia)', () => {
    const team = { members: [], personas: [
      { id: 'p-a', name: 'Ana', title: 'Design', avatarRef: 'nina' },
      { id: 'p-b', name: 'Bruno', title: 'Design', avatarRef: 'nina' },
    ] } as unknown as TeamView
    const line = mapMessageHandoff({ handoff: { fromPersonaId: 'p-a', toPersonaId: 'p-b', taskId: 'tk-9', title: 'Arte do bolo', mode: 'help', status: 'asked' } } as unknown as MessageView, team)
    expect(line?.from.tint).toBe(0)
    expect(line?.to.tint).toBe(1)
    const { container } = render(<HandoffLine t={t} line={line as HandoffLineUi} />)
    const [left, right] = faces(container)
    expect(left?.getAttribute('data-tint')).not.toBe(right?.getAttribute('data-tint'))
  })

  it('rostos diferentes: só os rostos e a seta (o nome está na frase); nenhum nome extra', () => {
    const { container } = render(<HandoffLine t={t} line={handoff(BIA, TEO)} />)
    expect(container.querySelectorAll('[data-team-face-name]')).toHaveLength(0)
  })

  it('rostos IGUAIS (o mesmo bicho e o mesmo tom): o nome de cada um vem antes da seta/depois do rosto', () => {
    const lia: TeamPersonaUi = { id: 'p-lia', name: 'Lia', characterId: 'nina', tint: 2 }
    const { container } = render(<HandoffLine t={t} line={handoff(BIA, lia)} />)
    const names = Array.from(container.querySelectorAll('[data-team-face-name]')).map(node => node.textContent)
    expect(names).toEqual(['Bia', 'Lia'])
    const html = (container.querySelector('[class*="faces"]') as HTMLElement).innerHTML
    // o nome do que age vem ANTES da seta
    expect(html.indexOf('Bia')).toBeLessThan(html.indexOf('data-team-arrow'))
  })

  it('o mesmo bicho com tons diferentes já se distingue pelo anel: sem nome extra', () => {
    const lia: TeamPersonaUi = { id: 'p-lia', name: 'Lia', characterId: 'nina', tint: 3 }
    const { container } = render(<HandoffLine t={t} line={handoff(BIA, lia)} />)
    expect(container.querySelectorAll('[data-team-face-name]')).toHaveLength(0)
  })

  it('a linha de revisão usa a mesma regra', () => {
    const review: ReviewLineUi = { kind: 'reviewed', reviewer: BIA, author: { ...BIA, id: 'p-lia', name: 'Lia' }, taskId: 'tk-1', title: 'Arte', round: 1, maxRounds: 2 }
    const { container } = render(<ReviewLine t={t} line={review} />)
    expect(faces(container)).toHaveLength(2)
    expect(Array.from(container.querySelectorAll('[data-team-face-name]')).map(node => node.textContent)).toEqual(['Bia', 'Lia'])
  })

  it('o CSS tem os 7 anéis com os tokens --persona-subject-0..6 (nenhuma cor solta)', () => {
    const style = readFileSync(join(__dirname, '..', 'src', 'client', 'chat', 'TeamLine.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
    for (let tone = 0; tone <= 6; tone += 1) {
      expect(style).toMatch(new RegExp(`\\[data-tint='${String(tone)}'\\][^}]*var\\(--persona-subject-${String(tone)}\\)`, 'u'))
    }
    expect(style).not.toMatch(/\[data-tint[^}]*#[0-9a-f]{3,8}/iu)
  })
})
