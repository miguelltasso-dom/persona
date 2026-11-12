// @vitest-environment jsdom
// DESIGN-01 onda 2 · #09 Visão geral (spec final da Muse §5.2, regras 0.2 e 0.4): banner calmo de 76 px, "Agora" com os Disponíveis
// numa linha só, tarefa sugerida só com perfil da empresa e o botão que pede à Coordenação e abre o fio.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { OverviewNowStrip } from '../src/client/overview/OverviewNowStrip.tsx'
import { groupNowRows } from '../src/client/overview/now-groups.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt, en as shellEn } from '../src/client/locale/shell/locales.ts'
import type { PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const text = (key: string, params?: Readonly<Record<string, string | number>>): string => {
  let out: string = shellPt[key as keyof typeof shellPt] ?? key
  for (const [name, value] of Object.entries(params ?? {})) out = out.replace(`{${name}}`, String(value))
  return out
}
const t = text as never

const coordination: PersonaNowSnapshot = {
  member: { id: 'atlas', name: 'Guia', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  queueCount: 0,
}
const idle = (id: 'bento' | 'nina' | 'sol' | 'luna', name: string): PersonaNowSnapshot => ({
  member: { id, name, role: 'Função', state: 'resting' },
  queueCount: 0,
})
const working: PersonaNowSnapshot = {
  member: { id: 'sol', name: 'Sol', role: 'Engenharia', state: 'working' },
  queueCount: 2,
  currentTask: 'API v2',
}

describe('#09 · "Precisa de você" vazio vira o banner calmo de 76 px', () => {
  it('sem nada esperando: uma faixa com o rosto da Coordenação e "Nada esperando por você" (sem o cartão grande)', () => {
    render(<OverviewView t={t} attentionItems={[]} nowRows={[coordination, idle('bento', 'Bento')]} awayEvents={[]} />)
    const banner = document.querySelector('[data-persona-calm-banner]')
    expect(banner).not.toBeNull()
    expect(within(banner as HTMLElement).getByText('Nada esperando por você')).toBeTruthy()
    expect(banner?.getAttribute('data-face')).toBe('atlas')
    // regra 0.4: forma única, sem a frase antiga nem o corpo explicativo do cartão grande
    expect(screen.queryByText('a bancada está em dia')).toBeNull()
    expect(screen.queryByText('Quando alguém precisar de uma decisão, aparece aqui primeiro.')).toBeNull()
    expect(document.querySelector('[data-persona-calm-banner] svg')).not.toBeNull() // o selo ✓
  })

  it('o rosto é o de quem exerce a Coordenação, nunca um Atlas fixo', () => {
    const rows: readonly PersonaNowSnapshot[] = [
      { member: { id: 'nina', name: 'Nina', role: 'Gestão', state: 'resting', systemRoles: ['coordination'] }, queueCount: 0 },
      idle('bento', 'Bento'),
    ]
    render(<OverviewView t={t} attentionItems={[]} nowRows={rows} awayEvents={[]} />)
    expect(document.querySelector('[data-persona-calm-banner]')?.getAttribute('data-face')).toBe('nina')
  })

  it('sem ninguém na Coordenação o banner continua e fica só com o selo (sem inventar um rosto)', () => {
    render(<OverviewView t={t} attentionItems={[]} nowRows={[idle('bento', 'Bento')]} awayEvents={[]} />)
    const banner = document.querySelector('[data-persona-calm-banner]')
    expect(banner).not.toBeNull()
    expect(banner?.hasAttribute('data-face')).toBe(false)
  })

  it('com decisões do host a regra é a mesma: nenhuma bloqueando = banner; uma bloqueando = a lista de sempre', () => {
    render(<OverviewView t={t} decisions={[]} nowRows={[coordination]} awayEvents={[]} />)
    expect(document.querySelector('[data-persona-calm-banner]')).not.toBeNull()
  })

  it('com algo esperando não há banner: o cartão "Precisa de você" lista o pedido', () => {
    render(<OverviewView t={t} attentionItems={['Aprovar a proposta de contratação']} nowRows={[coordination]} awayEvents={[]} />)
    expect(document.querySelector('[data-persona-calm-banner]')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: shellPt['overview.attentionTitle'] })).toBeTruthy()
    expect(screen.getByText('Aprovar a proposta de contratação')).toBeTruthy()
  })
})

describe('#09 · "Agora" separa quem trabalha dos Disponíveis', () => {
  it('groupNowRows: só o que está ativo ganha cartão; quem está Disponível vai para a linha única', () => {
    const waiting: PersonaNowSnapshot = { member: { id: 'luna', name: 'Luna', role: 'Pesquisa', state: 'waiting' }, queueCount: 0, currentTask: 'Pesquisa' }
    const stuck: PersonaNowSnapshot = { member: { id: 'nina', name: 'Nina', role: 'Design', state: 'stuck' }, queueCount: 1, currentTask: 'Landing' }
    const groups = groupNowRows([coordination, working, waiting, stuck, idle('bento', 'Bento')])
    expect(groups.cards.map(row => row.member.name)).toEqual(['Sol', 'Luna', 'Nina'])
    expect(groups.available.map(row => row.member.name)).toEqual(['Guia', 'Bento'])
  })

  it('1 trabalhando + 4 disponíveis: 1 cartão e UMA linha "4 prontos para começar" com 4 rostos de 28 px', () => {
    const rows = [working, coordination, idle('bento', 'Bento'), idle('nina', 'Nina'), idle('luna', 'Luna')]
    const { container } = render(<OverviewNowStrip t={t} rows={rows} />)
    expect(container.querySelectorAll('[data-now-card]')).toHaveLength(1)
    const ready = container.querySelector('[data-now-ready]') as HTMLElement
    expect(ready).not.toBeNull()
    expect(within(ready).getByText('4 prontos para começar')).toBeTruthy()
    const faces = [...ready.querySelectorAll<HTMLElement>('[data-ready-face]')]
    expect(faces).toHaveLength(4)
    expect(faces.every(face => face.style.width === '28px' && face.style.height === '28px')).toBe(true)
    // as 15 frases repetidas de antes não voltam
    expect(screen.queryByText(shellPt['overview.nowNoTask'])).toBeNull()
    expect(screen.queryByText(shellPt['overview.queueEmpty'])).toBeNull()
    expect(screen.queryByText(shellPt['team.statusResting'])).toBeNull()
  })

  it('o cartão de quem trabalha usa o vocabulário único: "Trabalhando" e, com rascunho, "Num rascunho"', () => {
    const draft: PersonaNowSnapshot = { ...working, member: { ...working.member, draftFiles: 3 } }
    render(<OverviewNowStrip t={t} rows={[draft]} />)
    expect(screen.getByText(shellPt['team.statusDraft'])).toBeTruthy()
    expect(screen.queryByText(shellPt['team.statusWorking'])).toBeNull()
    expect(screen.getByText('API v2')).toBeTruthy()
    expect(screen.getByText(text('overview.nowQueue', { count: 2 }))).toBeTruthy()
  })

  it('quem espera por você e quem precisa de ajuda ganham cartão, com o texto de cada estado', () => {
    const waiting: PersonaNowSnapshot = { member: { id: 'luna', name: 'Luna', role: 'Pesquisa', state: 'waiting' }, queueCount: 0, currentTask: 'Revisar' }
    const stuck: PersonaNowSnapshot = { member: { id: 'nina', name: 'Nina', role: 'Design', state: 'stuck' }, queueCount: 1, currentTask: 'Landing' }
    const { container } = render(<OverviewNowStrip t={t} rows={[waiting, stuck]} />)
    expect(container.querySelectorAll('[data-now-card]')).toHaveLength(2)
    expect(screen.getByText(shellPt['team.statusWaiting'])).toBeTruthy()
    expect(screen.getByText(shellPt['team.statusStuck'])).toBeTruthy()
    expect(container.querySelector('[data-now-ready]')).toBeNull()
  })

  it('todos disponíveis: nenhum cartão, só a linha; um só disponível lê no singular', () => {
    const many = render(<OverviewNowStrip t={t} rows={[coordination, idle('bento', 'Bento'), idle('nina', 'Nina')]} />)
    expect(many.container.querySelectorAll('[data-now-card]')).toHaveLength(0)
    expect(screen.getByText('3 prontos para começar')).toBeTruthy()
    cleanup()
    render(<OverviewNowStrip t={t} rows={[coordination]} />)
    expect(screen.getByText('1 pronto para começar')).toBeTruthy()
  })

  it('quem está revisando (o quadro diz) ganha cartão com "Revisando", não "Trabalhando"', () => {
    const reviewing: PersonaNowSnapshot = { member: { id: 'nina', name: 'Nina', role: 'Design', state: 'working', reviewing: true }, queueCount: 0, currentTask: 'Landing' }
    const { container } = render(<OverviewNowStrip t={t} rows={[reviewing]} />)
    expect(container.querySelectorAll('[data-now-card]')).toHaveLength(1)
    expect(container.querySelector('[data-now-card]')?.getAttribute('data-state')).toBe('reviewing')
    expect(screen.getByText(shellPt['team.statusReviewing'])).toBeTruthy()
    expect(screen.queryByText(shellPt['team.statusWorking'])).toBeNull()
  })

  it('Janela de silêncio: quem descansa vai para a sua própria linha calma (sem 5 cartões iguais); Pausada segue com cartão', () => {
    const quiet = (id: 'bento' | 'nina' | 'sol' | 'luna', name: string): PersonaNowSnapshot => ({ member: { id, name, role: 'Função', state: 'resting', quiet: true }, queueCount: 0 })
    const pausedOne: PersonaNowSnapshot = { member: { id: 'luna', name: 'Luna', role: 'Pesquisa', state: 'resting', paused: true }, queueCount: 0 }
    const groups = groupNowRows([working, quiet('bento', 'Bento'), quiet('nina', 'Nina'), pausedOne, idle('sol', 'Sol')])
    expect(groups.cards.map(row => row.member.name)).toEqual(['Sol', 'Luna'])
    expect(groups.resting.map(row => row.member.name)).toEqual(['Bento', 'Nina'])
    expect(groups.available.map(row => row.member.name)).toEqual(['Sol'])
    const { container } = render(<OverviewNowStrip t={t} rows={[working, quiet('bento', 'Bento'), quiet('nina', 'Nina'), pausedOne]} />)
    expect(within(container.querySelector('[data-now-resting]') as HTMLElement).getByText('2 descansando')).toBeTruthy()
    expect(screen.getByText(shellPt['team.statusPaused'])).toBeTruthy()
    expect(container.querySelector('[data-now-ready]')).toBeNull()
  })

  it('o texto do grupo existe em pt e en', () => {
    for (const dict of [shellPt, shellEn]) {
      expect(dict['overview.nowReady'], 'overview.nowReady').toBeTruthy()
      expect(dict['overview.nowReady.one'], 'overview.nowReady.one').toBeTruthy()
      expect(dict['overview.nowResting'], 'overview.nowResting').toBeTruthy()
      expect(dict['overview.nowResting.one'], 'overview.nowResting.one').toBeTruthy()
    }
  })

  it('sem personas: o vazio de sempre; carregando: o esqueleto, sem a linha de prontos', () => {
    const empty = render(<OverviewNowStrip t={t} rows={[]} />)
    expect(screen.getByText(shellPt['team.emptyTitle'])).toBeTruthy()
    expect(empty.container.querySelector('[data-now-ready]')).toBeNull()
    cleanup()
    const loading = render(<OverviewNowStrip t={t} rows={[]} loading />)
    expect(loading.container.querySelector('[data-loading]')).not.toBeNull()
  })
})

describe('#09 · tarefa sugerida vem do perfil da empresa', () => {
  const suggestion = { title: 'Sobre “Padaria da Ana”: crie cinco ideias para atrair mais clientes.' }

  it('sem perfil (nem tarefa viva) o bloco não aparece e o exemplo jurídico fixo não existe mais', () => {
    render(<OverviewView t={t} attentionItems={[]} nowRows={[coordination]} awayEvents={[]} onAskCoordination={() => undefined} />)
    expect(screen.queryByText(shellPt['overview.suggestedTaskTitle'])).toBeNull()
    expect(screen.queryByText('Revisar cláusulas de rescisão no contrato')).toBeNull()
    expect(shellPt['overview.suggestedTaskBody' as keyof typeof shellPt]).toBeUndefined()
    expect(shellEn['overview.suggestedTaskBody' as keyof typeof shellEn]).toBeUndefined()
  })

  it('com o perfil: o título é a sugestão e o botão é "Pedir a {Coordenação} agora"; clicar envia o pedido uma vez', () => {
    const onAsk = vi.fn()
    render(<OverviewView t={t} attentionItems={[]} nowRows={[coordination]} awayEvents={[]} companySuggestion={suggestion} onAskCoordination={onAsk} />)
    expect(screen.getByRole('heading', { level: 2, name: suggestion.title })).toBeTruthy()
    // a frase antiga que mandava a pessoa montar a equipe que já está montada saiu
    expect(screen.queryByText('Monte sua equipe e peça algo no #geral. A Coordenação responde lá.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir a Guia agora' }))
    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith(suggestion.title)
  })

  it('sem quem pedir (nenhuma Coordenação) ou sem o envio ligado, não há botão morto: o bloco some', () => {
    render(<OverviewView t={t} attentionItems={[]} nowRows={[idle('bento', 'Bento')]} awayEvents={[]} companySuggestion={suggestion} onAskCoordination={() => undefined} />)
    expect(screen.queryByText(suggestion.title)).toBeNull()
    cleanup()
    render(<OverviewView t={t} attentionItems={[]} nowRows={[coordination]} awayEvents={[]} companySuggestion={suggestion} />)
    expect(screen.queryByText(suggestion.title)).toBeNull()
  })

  it('com algo esperando por você ou alguém trabalhando, a sugestão não compete (como antes)', () => {
    render(<OverviewView t={t} attentionItems={['Aprovar']} nowRows={[coordination]} awayEvents={[]} companySuggestion={suggestion} onAskCoordination={() => undefined} />)
    expect(screen.queryByText(suggestion.title)).toBeNull()
    cleanup()
    render(<OverviewView t={t} attentionItems={[]} nowRows={[working, coordination]} awayEvents={[]} companySuggestion={suggestion} onAskCoordination={() => undefined} />)
    expect(screen.queryByText(suggestion.title)).toBeNull()
  })

  it('uma tarefa viva do quadro segue abrindo no quadro (o caminho que já existia)', () => {
    const onOpen = vi.fn()
    render(<OverviewView t={t} attentionItems={[]} nowRows={[coordination]} awayEvents={[]} suggestedTask={{ id: 't1', title: 'Revisar contrato' }} onOpenAwayTask={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: shellPt['overview.suggestedTaskOpenBoard'] }))
    expect(onOpen).toHaveBeenCalledWith('t1')
  })
})

describe('#09 · o rosto de quem pede no cartão "Precisa de você" nunca é uma letra (D-069/D-103c, pré-aceite do Ember)', () => {
  const decision = (requester: { personaId: string; name: string; avatarSrc?: string }) => ({
    id: 'd1', kind: 'blocker' as const, title: 'Fechar a proposta até amanhã', requester, blocking: true, risk: 'normal' as const,
    createdAt: '2026-11-11T12:00:00.000Z', state: 'pending' as const,
  })

  it('o autor do sistema ("Equipe", sem persona) ganha o disco com o ícone da equipe, não a inicial', () => {
    render(<OverviewView t={t} decisions={[decision({ personaId: '', name: 'Equipe' })]} nowRows={[coordination]} awayEvents={[]} />)
    const item = document.querySelector('[data-decision-id="d1"]') as HTMLElement
    const face = item.querySelector('[data-icon]')
    expect(face).not.toBeNull()
    expect(item.querySelector('[data-tone]')).toBeNull()
    expect(face?.textContent?.trim()).toBe('')
  })

  it('uma persona conhecida mostra o próprio rosto; uma persona com id e sem retrato ganha um animal da galeria (nunca a letra)', () => {
    render(<OverviewView t={t} decisions={[decision({ personaId: 'p-nina', name: 'Nina', avatarSrc: 'nina-portrait.png' })]} nowRows={[coordination]} awayEvents={[]} />)
    expect((document.querySelector('[data-decision-id="d1"] img') as HTMLImageElement | null)?.getAttribute('src')).toBe('nina-portrait.png')
    cleanup()
    render(<OverviewView t={t} decisions={[decision({ personaId: 'p-nova', name: 'Bia' })]} nowRows={[coordination]} awayEvents={[]} />)
    const item = document.querySelector('[data-decision-id="d1"]') as HTMLElement
    expect(item.querySelector('img')).not.toBeNull()
    expect(item.querySelector('[data-tone]')).toBeNull()
  })
})
