// @vitest-environment jsdom
// CV-2 (CONVERSAS-SPEC §2), atrás da flag do A-1: cabeçalho do canal (equipe + rostos), DM com "função · trabalhando em
// «tarefa»", a DM sem "Quem responde" e a linha "Canal criado para…". Sem a flag o app é o de antes.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView, type DmRowUi } from '../src/client/chat/DirectMessagesView.tsx'
import { ChannelTeamFaces } from '../src/client/chat/ChannelTeamFaces.tsx'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { NAV_PLACES_FLAG_KEY } from '../src/client/shell/nav-flag.ts'
import { workingOnFor } from '../src/client/remote/working-on.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as GeneralChannelViewProps['shellT']

const member = (id: string, name: string): ChannelPersonaMember => ({ id: id as ChannelPersonaMember['id'], name, role: 'Função', state: 'resting' })
const TEAM: ChannelPersonaMember[] = [member('atlas', 'Atlas'), member('bento', 'Bento')]

function channel(extra: Partial<GeneralChannelViewProps> = {}) {
  return render(<GeneralChannelView t={t} shellT={shellT} members={TEAM} messages={[]} {...extra} />)
}

describe('cabeçalho do canal', () => {
  it('SEM a flag é o de antes: eyebrow "Conversas", subtítulo do projeto, sem rostos empilhados', () => {
    channel()
    expect(screen.getByText(chatPt['header.section'])).toBeTruthy()
    expect(screen.getByText(chatPt['header.subtitle'])).toBeTruthy()
    expect(screen.queryByRole('list', { name: chatPt['header.teamFaces'] })).toBeNull()
  })

  describe('COM a flag', () => {
    beforeEach(() => { localStorage.setItem(NAV_PLACES_FLAG_KEY, '1') })

    /** A pílula de rostos do cabeçalho só existe com a faixa grande fora de vista (DESIGN-01-MUSE cena 02): rola o fio para cima da faixa. */
    const scrollPastTheStrip = (): void => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const bottom = this.hasAttribute('data-persona-stage') ? -100 : 0
        return { x: 0, y: 0, top: 0, left: 0, right: 0, width: 0, height: 0, bottom, toJSON: () => ({}) }
      })
      fireEvent.scroll(screen.getByRole('region', { name: chatPt['header.channelGeneral'] }))
    }

    it('sem eyebrow ("Conversas" deixou de ser um lugar); "Toda a equipe · N personas"; a pílula de rostos NÃO existe nunca (a faixa ou a barra já os mostram)', () => {
      channel()
      expect(screen.queryByText(chatPt['header.section'])).toBeNull()
      expect(screen.getByRole('heading', { level: 1, name: chatPt['header.channelGeneral'] })).toBeTruthy()
      expect(screen.getByText('Toda a equipe · 2 personas')).toBeTruthy()
      // Muse 11/11 14:10: nem com a faixa grande à vista nem com a barra de 56 px o cabeçalho repete os rostos
      expect(screen.queryByRole('list', { name: chatPt['header.teamFaces'] })).toBeNull()
      scrollPastTheStrip()
      expect(screen.queryByRole('list', { name: chatPt['header.teamFaces'] })).toBeNull()
    })

    it('singular com 1 persona; a lista de rostos (5 + "+N") segue existindo como peça, para os lugares que a usam', () => {
      const { unmount } = channel({ members: [member('atlas', 'Atlas')] })
      expect(screen.getByText('Toda a equipe · 1 persona')).toBeTruthy()
      unmount()
      const many = (['atlas', 'bento', 'nina', 'sol', 'luna', 'capivara', 'cervo'] as const).map(id => member(id, id))
      render(<ChannelTeamFaces members={many} label={chatPt['header.teamFaces']} />)
      const faces = screen.getByRole('list', { name: chatPt['header.teamFaces'] })
      expect(within(faces).getAllByRole('listitem')).toHaveLength(6) // 5 rostos + "+2"
      expect(within(faces).getByText('+2')).toBeTruthy()
    })

    it('canal criado para uma equipe: "A equipe de {equipe} · N personas" e a primeira linha "Canal criado para…"', () => {
      channel({ createdForTeam: 'Marketing' })
      expect(screen.getByText('A equipe de Marketing · 2 personas')).toBeTruthy()
      expect(screen.getByText('Canal criado para a equipe de Marketing')).toBeTruthy()
    })

    it('sem equipe informada não aparece a linha "Canal criado para…"', () => {
      channel()
      expect(screen.queryByText(/Canal criado para/u)).toBeNull()
    })

    it('sem personas o subtítulo cai no texto de antes (nunca "0 personas")', () => {
      channel({ members: [] })
      expect(screen.getByText(chatPt['header.subtitle'])).toBeTruthy()
      expect(document.body.textContent).not.toContain('0 personas')
    })
  })
})

describe('cabeçalho da DM', () => {
  const dm = (extra: Partial<DmRowUi> = {}): DmRowUi => ({ id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa', state: 'working', ...extra })
  const view = (row: DmRowUi) => render(
    <DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[row]} selectedId="dm-nina" messages={[]} onSelect={() => undefined} onSend={() => undefined} />,
  )

  it('SEM a flag mostra só a função', () => {
    view(dm({ workingOn: 'Atualizar o cardápio' }))
    expect(screen.getAllByText('Pesquisa').length).toBeGreaterThan(0)
    expect(screen.queryByText(/trabalhando em/u)).toBeNull()
  })

  it('COM a flag e uma tarefa real: "{função} · trabalhando em «tarefa»"', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    view(dm({ workingOn: 'Atualizar o cardápio' }))
    expect(screen.getByText('Pesquisa · trabalhando em “Atualizar o cardápio”')).toBeTruthy()
  })

  it('COM a flag e sem tarefa conhecida: só a função (nunca "trabalhando em" vazio)', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    view(dm())
    expect(screen.getAllByText('Pesquisa').length).toBeGreaterThan(0)
    expect(screen.queryByText(/trabalhando em/u)).toBeNull()
  })

  it('a DM não tem o seletor "Quem responde" nem a dica dele (quem responde é a própria persona)', () => {
    localStorage.setItem(NAV_PLACES_FLAG_KEY, '1')
    view(dm())
    expect(screen.queryByLabelText(chatPt['composer.modelLabel'])).toBeNull()
    expect(screen.queryByRole('dialog', { name: chatPt['composer.whoRespondsHintTitle'] })).toBeNull()
    expect(screen.getByPlaceholderText('Mensagem para Nina…')).toBeTruthy()
  })
})

describe('workingOnFor', () => {
  const row = (name: string, state: ChannelPersonaMember['state'], currentTask?: string): PersonaNowSnapshot => ({
    member: { id: 'nina', name, role: 'x', state },
    queueCount: 0,
    ...(currentTask === undefined ? {} : { currentTask }),
  })

  it('só com a persona trabalhando e com o título real da tarefa', () => {
    const nina = { id: 'nina' as const, name: 'Nina', role: 'x', state: 'working' as const }
    expect(workingOnFor([row('Nina', 'working', 'Atualizar o cardápio')], nina)).toBe('Atualizar o cardápio')
    expect(workingOnFor([row('Nina', 'working', 'task-9f3a')], nina)).toBeUndefined() // id nunca
    expect(workingOnFor([row('Nina', 'working')], nina)).toBeUndefined()
    expect(workingOnFor([row('Nina', 'working', 'Cardápio')], { ...nina, state: 'resting' })).toBeUndefined()
    expect(workingOnFor([], nina)).toBeUndefined()
  })
})
