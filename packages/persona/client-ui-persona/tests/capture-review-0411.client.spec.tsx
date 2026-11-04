// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { firstDeliveryFromHost, pickFirstDelivery } from '../src/client/overview/derive-first-delivery.ts'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { Notice } from '../src/client/primitives/index.ts'
import { pt as shellPt, en as shellEn } from '../src/client/locale/shell/locales.ts'
import { pt as onboardingPt } from '../src/client/locale/onboarding/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

describe('revisão por captura 04/11 — Muse', () => {
  it('(1) plural: "1 pendente" / "3 pendentes" na Visão geral', () => {
    const decision = (id: string) => ({
      id, kind: 'approval', title: `Pedido ${id}`, requester: { personaId: 'p', name: 'Atlas' },
      blocking: true, risk: 'normal', createdAt: '', state: 'pending',
    }) as never
    const { rerender } = render(<OverviewView t={t} attentionItems={[]} nowRows={[]} awayEvents={[]} decisions={[decision('a')]} />)
    expect(screen.getByText('1 pendente')).toBeTruthy()
    expect(screen.queryByText('1 pendentes')).toBeNull()
    rerender(<OverviewView t={t} attentionItems={[]} nowRows={[]} awayEvents={[]} decisions={[decision('a'), decision('b'), decision('c')]} />)
    expect(screen.getByText('3 pendentes')).toBeTruthy()
  })

  it('(1) os textos têm forma para 1 e para vários, nos dois idiomas', () => {
    expect(shellPt['overview.attentionCount.one']).toBe('1 pendente')
    expect(shellPt['overview.attentionCount']).toBe('{count} pendentes')
    expect(shellPt['sidebar.approvalsPending.one']).toBe('1 pendente')
    expect(shellEn['overview.attentionCount.one']).toBe('1 pending')
    expect(shellEn['sidebar.approvalsPending.one']).toBe('1 pending')
  })

  it('(2) "Descansando" sem "zzz" no texto (o desenho já tem; o leitor lia "zê zê zê")', () => {
    expect(shellPt['team.statusResting']).toBe('Descansando')
    expect(shellPt['team.statusResting']).not.toMatch(/zzz/iu)
    expect(shellEn['team.statusResting']).not.toMatch(/zzz/iu)
  })

  it('(4) o marco credita a persona que entregou, com retrato; "Equipe" só sem ninguém', () => {
    const host = { status: 'ready', ticketId: 't1', title: 'Resumo da empresa', personaId: 'p-nina', personaName: 'Nina' }
    const members = [{ id: 'nina', name: 'Nina' }, { id: 'atlas', name: 'Atlas' }]
    const fromHost = firstDeliveryFromHost(host, members)
    expect(fromHost).toEqual({ taskId: 't1', title: 'Resumo da empresa', personaName: 'Nina', characterId: 'nina' })
    // o cartão do quadro não tem responsável ("Equipe"): vale o que o host sabe
    const kanbanNoOwner = { taskId: 'k1', title: 'Resumo da empresa', personaName: 'Equipe' }
    expect(pickFirstDelivery(kanbanNoOwner, fromHost)).toMatchObject({ personaName: 'Nina', characterId: 'nina', taskId: 'k1' })
    // quando o quadro sabe quem entregou, ele manda
    const kanbanOwner = { taskId: 'k1', title: 'x', personaName: 'Atlas', characterId: 'atlas' }
    expect(pickFirstDelivery(kanbanOwner, fromHost)).toBe(kanbanOwner)
    // ninguém sabe: segue "Equipe"
    expect(pickFirstDelivery(kanbanNoOwner, undefined)).toBe(kanbanNoOwner)
    expect(firstDeliveryFromHost({ ...host, status: 'working' }, members)).toBeUndefined()
    expect(firstDeliveryFromHost(null, members)).toBeUndefined()
  })

  it('(9) o aviso "a caminho" usa o relógio, não a interrogação de ajuda', () => {
    const { container, rerender } = render(<Notice tone="info">ajuda</Notice>)
    const help = container.querySelector('svg')?.outerHTML
    rerender(<Notice tone="info" icon="clock">a caminho</Notice>)
    const clock = container.querySelector('svg')?.outerHTML
    expect(clock).toBeDefined()
    expect(clock).not.toBe(help)
    render(<OverviewView t={t} attentionItems={[]} nowRows={[]} awayEvents={[]} firstDeliveryPending />)
    expect(screen.getByRole('region', { name: shellPt['overview.firstDeliveryOnTheWay'] })).toBeTruthy()
  })
})

describe('passo 5 (revisão 04/11)', () => {
  function step5(roster?: { name: string; role: string }[]) {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 5, displayName: 'Miguel', ...(roster === undefined ? {} : { roster }) })
    return render(
      <OnboardingWizard
        dict={onboardingPt}
        structureDict={onboardingPt}
        store={store}
        actions={actions}
        harnesses={[{ id: 'claude', label: 'Claude', ready: true }]}
        firstDelivery={{
          shellT: key => shellPt[key as keyof typeof shellPt] as string,
          phase: 'intro',
          onRequest: () => undefined,
          onEnterApp: () => undefined,
          onCelebrateContinue: () => undefined,
        }}
      />,
    )
  }

  it('(6) a apresentação vem da equipe contratada (nome + função), não de Atlas/Bento/Nina fixos', () => {
    step5([{ name: 'Capivara', role: 'Atendimento' }, { name: 'Tucano', role: 'Marketing' }])
    const list = screen.getByRole('list', { name: onboardingPt['step5.introLabel'] })
    expect(list.textContent).toContain('Capivara')
    expect(list.textContent).toContain('Atendimento. Pode contar comigo.')
    expect(list.textContent).toContain('Tucano')
    expect(list.textContent).not.toMatch(/Bento|Nina|Cuido de código/u)
  })

  it('(6) sem equipe ("Em branco") não há lista de exemplo', () => {
    step5([])
    expect(screen.queryByRole('list', { name: onboardingPt['step5.introLabel'] })).toBeNull()
  })

  it('(5) no passo 5 a banda é compacta (cabe em 1440×900, balão e bichos inteiros)', () => {
    const { container } = step5()
    expect(container.querySelector('[data-compact]')).not.toBeNull()
  })

  it('(5) nos passos anteriores a banda segue cheia', () => {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 2 })
    const { container } = render(<OnboardingWizard dict={onboardingPt} structureDict={onboardingPt} store={store} actions={actions} />)
    expect(container.querySelector('[data-compact]')).toBeNull()
  })
})
