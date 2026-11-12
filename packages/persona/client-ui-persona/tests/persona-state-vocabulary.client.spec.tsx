// @vitest-environment jsdom
// DESIGN-01-MUSE §0.2 (11/11): UM vocabulário de estado da persona, o mesmo no rail, na faixa, nos cartões, na Visão geral e na DM.
// Captura do Atlas: o rail PESSOAS mostrava bolinha VERDE para 5 bichos que a faixa mostrava dormindo. O rail tinha o próprio mapa
// estado -> bolinha (`resting: 'online'`), a Visão geral outro. Agora `team/persona-state.ts` é a única fonte.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverviewNowStrip } from '../src/client/overview/OverviewNowStrip.tsx'
import { Avatar } from '../src/client/primitives/index.ts'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationPerson } from '../src/client/shell/conversations-model.ts'
import type { ConversationsSource } from '../src/client/shell/conversations-source.ts'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'
import {
  PERSONA_STATE_LABEL,
  derivePersonaState,
  isPersonaStateActive,
  personaStateOf,
  type PersonaStateName,
} from '../src/client/team/persona-state.ts'
import { isPersonaReviewing, markReviewing } from '../src/client/team/persona-reviewing.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const FIVE = ['atlas', 'bento', 'nina', 'sol', 'luna'] as const

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const person = (id: string, over: Partial<ConversationPerson> = {}): ConversationPerson => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  role: 'Equipe',
  teamId: 'eq',
  teamName: 'Equipe',
  unread: 0,
  hasConversation: false,
  state: 'resting',
  ...over,
})

function mountRail(people: readonly ConversationPerson[], variant: 'full' | 'trail' = 'full'): void {
  const source: ConversationsSource = { channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }], people }
  render(<ConversationsRail t={t} source={source} active={null} openConversation={vi.fn()} variant={variant} />)
}

const railDot = (id: string): string | null =>
  document.querySelector(`[data-persona-id="${id}"] [data-persona-state]`)?.getAttribute('data-persona-state') ?? null

describe('derivePersonaState: o nome que todas as telas desenham', () => {
  it('cada atividade e cada fato viram um nome do vocabulário', () => {
    const cases: readonly (readonly [Parameters<typeof derivePersonaState>[0], PersonaStateName])[] = [
      [{ activity: 'working' }, 'working'],
      [{ activity: 'working', draftFiles: 2 }, 'draft'],
      [{ activity: 'reviewing' }, 'reviewing'],
      [{ activity: 'waiting' }, 'waiting'],
      [{ activity: 'stuck' }, 'stuck'],
      [{ activity: 'resting' }, 'available'],
      [{ activity: 'resting', quiet: true }, 'resting'],
      [{ activity: 'resting', paused: true }, 'paused'],
      [{ activity: 'working', paused: true }, 'paused'],
      [{ activity: 'offline' }, 'offline'],
      [{ activity: 'offline', paused: true }, 'offline'],
    ]
    for (const [facts, expected] of cases) expect(derivePersonaState(facts), JSON.stringify(facts)).toBe(expected)
  })

  it('só trabalhando, revisando, esperando, rascunho e precisa de ajuda são pontos cheios; o resto é anel', () => {
    const active: readonly PersonaStateName[] = ['working', 'reviewing', 'waiting', 'draft', 'stuck']
    const idle: readonly PersonaStateName[] = ['available', 'resting', 'paused', 'offline']
    for (const state of active) expect(isPersonaStateActive(state), state).toBe(true)
    for (const state of idle) expect(isPersonaStateActive(state), state).toBe(false)
  })

  it('as palavras da Muse: Esperando você, Disponível, Descansando, Pausada, Sem motor, Num rascunho', () => {
    expect(shellPt[PERSONA_STATE_LABEL.waiting]).toBe('Esperando você')
    expect(shellPt[PERSONA_STATE_LABEL.available]).toBe('Disponível')
    expect(shellPt[PERSONA_STATE_LABEL.resting]).toBe('Descansando')
    expect(shellPt[PERSONA_STATE_LABEL.paused]).toBe('Pausada')
    expect(shellPt[PERSONA_STATE_LABEL.offline]).toBe('Sem motor')
    expect(shellPt[PERSONA_STATE_LABEL.draft]).toBe('Num rascunho')
    expect(shellPt[PERSONA_STATE_LABEL.working]).toBe('Trabalhando')
    expect(shellPt[PERSONA_STATE_LABEL.reviewing]).toBe('Revisando')
  })
})

describe('"Revisando" vem do quadro e vale igual no rail, na faixa e no "Agora"', () => {
  const inReview = [{ column: 'in_review' as const, title: 'Contrato' }]

  it('revisando = a tarefa dela está na coluna de revisão; ou ela trabalha enquanto algo espera revisão, com tarefa atual', () => {
    expect(isPersonaReviewing('working', 'Contrato', inReview)).toBe(true)
    expect(isPersonaReviewing('waiting', 'Contrato', inReview)).toBe(true)
    expect(isPersonaReviewing('working', 'Outra', inReview)).toBe(true)
    expect(isPersonaReviewing('working', undefined, inReview)).toBe(false)
    expect(isPersonaReviewing('resting', 'Outra', inReview)).toBe(false)
    expect(isPersonaReviewing('working', 'Outra', [])).toBe(false)
  })

  it('markReviewing marca a linha do "Agora" e o membro da faixa (pelo nome); quem não revisa fica como está', () => {
    const rows: PersonaNowSnapshot[] = [
      { member: { id: 'atlas', name: 'Atlas', role: 'Coord', state: 'working' }, queueCount: 0, currentTask: 'Contrato' },
      { member: { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting' }, queueCount: 0 },
    ]
    const members: ChannelPersonaMember[] = rows.map(row => row.member)
    const marked = markReviewing(rows, members, inReview)
    expect(marked.members.find(member => member.name === 'Atlas')?.reviewing).toBe(true)
    expect(marked.rows[0]?.member.reviewing).toBe(true)
    expect(marked.members.find(member => member.name === 'Nina')?.reviewing).toBeUndefined()
    // nada a marcar: devolve os mesmos objetos
    expect(markReviewing(rows, members, []).rows).toBe(rows)
  })

  it('um membro "trabalhando" marcado como revisando é Revisando em toda parte (faixa e rail)', () => {
    expect(personaStateOf({ state: 'working', reviewing: true })).toBe('reviewing')
    expect(personaStateOf({ state: 'resting', reviewing: true })).toBe('available')
    const stage = render(<TeamChannelStrip t={t} members={[{ id: 'atlas', name: 'Atlas', role: 'Coord', state: 'working', reviewing: true }]} />)
    expect(stage.container.textContent).toContain(shellPt['team.statusReviewing'])
    expect(stage.container.querySelector('li[data-persona-state="reviewing"]')).not.toBeNull()
  })
})

describe('Avatar: a bolinha de estado da persona', () => {
  it('desenha o nome do vocabulário e não o `data-presence` antigo', () => {
    const view = render(<Avatar name="Atlas" size={32} state="available" decorative />)
    const dot = view.container.querySelector('[data-persona-state]')
    expect(dot?.getAttribute('data-persona-state')).toBe('available')
    expect(view.container.querySelector('[data-presence]')).toBeNull()
  })
})

describe('rail PESSOAS × palco × Visão geral: a mesma bolinha e as mesmas palavras', () => {
  it('a captura do Atlas: 5 bichos sem tarefa NÃO têm bolinha verde no rail (são Disponível) e a faixa diz o mesmo', () => {
    const members: ChannelPersonaMember[] = FIVE.map(id => ({ id, name: id, role: 'Equipe', state: 'resting' as const }))
    const stage = render(<TeamChannelStrip t={t} members={members} />)
    expect(stage.container.querySelectorAll('[data-persona-state="available"]').length).toBeGreaterThanOrEqual(5)
    expect(stage.container.textContent).toContain(shellPt['team.statusAvailable'])
    expect(stage.container.querySelector('[data-pose="descansando"]')).toBeNull()
    stage.unmount()

    mountRail(FIVE.map(id => person(id)))
    for (const id of FIVE) expect(railDot(id), id).toBe('available')
    expect(document.querySelectorAll('[data-persona-state="working"]')).toHaveLength(0)
  })

  it('dentro de uma Janela de silêncio a faixa dorme e o rail e a Visão geral dizem Descansando', () => {
    const members: ChannelPersonaMember[] = FIVE.map(id => ({ id, name: id, role: 'Equipe', state: 'resting' as const, quiet: true }))
    const stage = render(<TeamChannelStrip t={t} members={members} />)
    expect(stage.container.textContent).toContain(shellPt['team.statusResting'])
    expect(stage.container.querySelectorAll('[data-pose="descansando"]').length).toBeGreaterThanOrEqual(1)
    stage.unmount()

    mountRail(FIVE.map(id => person(id, { quiet: true })))
    for (const id of FIVE) expect(railDot(id), id).toBe('resting')
  })

  it('cada estado tem UMA bolinha: rail, trilho de 64 px e Visão geral concordam, com o mesmo texto', () => {
    const inputs: readonly { readonly name: PersonaStateName; readonly rail: Partial<ConversationPerson>; readonly member: Partial<ChannelPersonaMember> & Pick<ChannelPersonaMember, 'state'> }[] = [
      { name: 'working', rail: { state: 'working' }, member: { state: 'working' } },
      { name: 'reviewing', rail: { state: 'reviewing' }, member: { state: 'working' } },
      { name: 'waiting', rail: { state: 'waiting' }, member: { state: 'waiting' } },
      { name: 'draft', rail: { state: 'working', draftFiles: 2 }, member: { state: 'working', draftFiles: 2 } },
      { name: 'stuck', rail: { state: 'stuck' }, member: { state: 'stuck' } },
      { name: 'available', rail: { state: 'resting' }, member: { state: 'resting' } },
      { name: 'resting', rail: { state: 'resting', quiet: true }, member: { state: 'resting', quiet: true } },
      { name: 'paused', rail: { state: 'resting', paused: true }, member: { state: 'resting', paused: true } },
    ]
    const rows: readonly PersonaNowSnapshot[] = inputs.map(input => ({
      member: { id: `p-${input.name}`, name: input.name, role: 'Equipe', ...input.member } as ChannelPersonaMember,
      queueCount: 0,
    }))
    // A Visão geral desenha um cartão por quem tem algo a dizer e UMA linha de rostos para quem está Disponível; "Revisando" vem só do rail.
    const overview = render(<OverviewNowStrip t={t} rows={rows} />)
    for (const input of inputs) {
      if (input.name === 'reviewing' || input.name === 'available' || input.name === 'resting' || input.name === 'paused') continue
      const row = overview.container.querySelector(`li[data-now-card][data-state="${input.name}"]`)
      expect(row, `Visão geral ${input.name}`).not.toBeNull()
      expect(row?.textContent).toContain(shellPt[PERSONA_STATE_LABEL[input.name]])
      expect(row?.querySelector('[data-persona-state]')?.getAttribute('data-persona-state')).toBe(input.name)
    }
    expect(overview.container.querySelector('[data-now-ready]'), 'Visão geral available').not.toBeNull()
    overview.unmount()

    mountRail(inputs.map(input => person(`p-${input.name}`, input.rail)))
    for (const input of inputs) expect(railDot(`p-${input.name}`), `rail ${input.name}`).toBe(input.name)
    cleanup()

    // O trilho de 64 px mostra TODAS as pessoas (ordem estável), cada uma com a mesma bolinha.
    mountRail(inputs.map((input, index) => person(`p-${input.name}`, { ...input.rail, hasConversation: true, recentRank: index })), 'trail')
    for (const input of inputs) expect(railDot(`p-${input.name}`), `trilho ${input.name}`).toBe(input.name)
  })

  it('sem motor: anel tracejado com as palavras "Sem motor"', () => {
    mountRail([person('mia', { state: 'offline' })])
    expect(railDot('mia')).toBe('offline')
    expect(document.querySelector('[data-persona-id="mia"]')?.getAttribute('aria-label')).toContain('Sem motor')
  })

  it('o rótulo acessível de uma linha do rail usa as mesmas palavras da faixa', () => {
    mountRail([person('ana', { state: 'waiting' }), person('bia', { state: 'resting' })])
    expect(document.querySelector('[data-persona-id="ana"]')?.getAttribute('aria-label')).toContain('Esperando você')
    expect(document.querySelector('[data-persona-id="bia"]')?.getAttribute('aria-label')).toContain('Disponível')
  })

  it('a Visão geral e o rail não guardam o próprio mapa estado -> bolinha ou estado -> texto', () => {
    for (const file of ['shell/ConversationsRail.tsx', 'overview/OverviewNowStrip.tsx']) {
      const source = readFileSync(join(__dirname, '..', 'src', 'client', file), 'utf8')
      expect(source, file).not.toMatch(/Record<[^>]*,\s*AvatarPresence>/u)
      expect(source, file).not.toMatch(/Record<[^>]*,\s*ShellKey>/u)
      expect(source, file).toMatch(/persona-state\.ts/u)
    }
  })
})
