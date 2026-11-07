// @vitest-environment jsdom
// P1-6 "Próximo passo" (`NEXT-STEP-SHORTCUTS-SPEC.md` §1 + ajustes de 23:21): função pura `nextStepFor(screen, state)`,
// componente `NextStepBar` atrás de `persona.flag.nextStep`, dispensa por 24 h por tela e deduplicação contra P1-9 / Bom dia.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextStepBar } from '../src/client/next-step/NextStepBar.tsx'
import { NEXT_STEP_FLAG_KEY, isNextStepEnabled } from '../src/client/next-step/next-step-flag.ts'
import {
  NEXT_STEP_DISMISS_TTL_MS,
  dismissNextStep,
  isNextStepDismissed,
  nextStepFor,
} from '../src/client/next-step/next-step-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

beforeEach(() => {
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

afterEach(() => {
  cleanup()
})

describe('nextStepFor(screen, state) — regras de prioridade (função pura)', () => {
  it('regra 1 vence sobre todas: algo bloqueado esperando a pessoa naquela tela', () => {
    const step = nextStepFor('boards', {
      blockedWaitingCount: 3,
      staleReviewCount: 2,
      personaSuggestion: {
        id: 'sug-1',
        personaName: 'Nina',
        text: 'Nina sugere juntar os 3 cartões de preços',
        markedAsNextStep: true,
      },
    })
    expect(step).toEqual({
      screen: 'boards',
      kind: 'blocked',
      actionId: 'view-blocked',
      text: '3 cartões estão esperando você',
      actionLabel: 'Ver',
    })
  })

  it('Aprovações é a lista do que espera: a regra 1 não vale ali; a sugestão de persona continua valendo (Muse, 05/11 05:48)', () => {
    expect(nextStepFor('approvals', { blockedWaitingCount: 5 })).toBeNull()
    expect(nextStepFor('approvals', { blockedWaitingCount: 1 })).toBeNull()
    expect(nextStepFor('boards', { blockedWaitingCount: 1 })?.text).toBe('1 cartão está esperando você')
    expect(nextStepFor('approvals', {
      blockedWaitingCount: 5,
      personaSuggestion: {
        id: 'sug-approvals',
        personaName: 'Nina',
        text: 'Nina sugere revisar as 2 propostas de preço antes de enviar',
        markedAsNextStep: true,
      },
    })).toMatchObject({ screen: 'approvals', kind: 'persona', actionId: 'view-suggestion' })
  })

  it('Aprovações, regra 4: decisão parada há mais de 3 dias vira o hábito "Ver as mais antigas" (Muse, 05/11 05:52)', () => {
    expect(nextStepFor('approvals', { staleDecisionCount: 1 })).toEqual({
      screen: 'approvals',
      kind: 'habit',
      actionId: 'see-oldest',
      text: 'Há 1 decisão parada há mais de 3 dias',
      actionLabel: 'Ver as mais antigas',
    })
    expect(nextStepFor('approvals', { staleDecisionCount: 0 })).toBeNull()
  })

  it('regra 2 (vazio): quando a tela está em EmptyState, retorna null para não repetir a ação do vazio', () => {
    expect(nextStepFor('routines', { isEmpty: true, activeRoutinesCount: 0, blockedWaitingCount: 2 })).toBeNull()
    expect(nextStepFor('boards', { isEmpty: true, staleReviewCount: 2 })).toBeNull()
  })

  it('regra 3: só usa sugestão de persona marcada como próximo passo pelo host, e nunca repete P1-9 nem Bom dia', () => {
    const baseSuggestion = {
      id: 'sug-nina',
      personaName: 'Nina',
      personaCharacterId: 'nina',
      text: 'Nina sugere juntar os 3 cartões de preços',
      markedAsNextStep: true,
    }
    expect(nextStepFor('boards', { personaSuggestion: baseSuggestion })).toEqual({
      screen: 'boards',
      kind: 'persona',
      actionId: 'view-suggestion',
      text: 'Nina sugere juntar os 3 cartões de preços',
      actionLabel: 'Ver sugestão',
      personaName: 'Nina',
      personaCharacterId: 'nina',
      suggestionId: 'sug-nina',
    })

    // Proposta de trabalho comum (sem markedAsNextStep) continua sendo cartão P1-9, nunca vira linha
    expect(nextStepFor('boards', {
      personaSuggestion: { ...baseSuggestion, markedAsNextStep: false },
    })).toBeNull()

    // Já visível num cartão P1-9 ou no Bom dia: não repete
    expect(nextStepFor('boards', {
      personaSuggestion: { ...baseSuggestion, shownInProposalCard: true },
    })).toBeNull()
    expect(nextStepFor('boards', {
      personaSuggestion: { ...baseSuggestion, shownInMorningBrief: true },
    })).toBeNull()
    expect(nextStepFor('boards', {
      personaSuggestion: baseSuggestion,
      visibleProposalIds: ['sug-nina'],
    })).toBeNull()
    expect(nextStepFor('boards', {
      personaSuggestion: baseSuggestion,
      alreadyVisibleOnScreen: true,
    })).toBeNull()
  })

  it('regra 4 (hábito que falta) nas 5 telas do 1º lote: Quadros, Rotinas, Uso e limites, Aprovações e Segundo cérebro', () => {
    // Quadros (plano B, Muse aceitou 06:03): cartões em "Em revisão", a partir de 2; sem "há dias" até o host expor inReviewSince
    expect(nextStepFor('boards', { staleReviewCount: 2 })).toEqual({
      screen: 'boards',
      kind: 'habit',
      actionId: 'review-stale',
      text: 'Há 2 entregas esperando a sua revisão',
      actionLabel: 'Revisar',
    })
    expect(nextStepFor('boards', { staleReviewCount: 1 })).toBeNull()

    // Rotinas: sem nenhuma ativa (quando não está vazia)
    expect(nextStepFor('routines', { activeRoutinesCount: 0 })).toEqual({
      screen: 'routines',
      kind: 'habit',
      actionId: 'create-routine',
      text: 'Uma rotina faz isto toda semana sem você pedir',
      actionLabel: 'Criar rotina',
    })
    expect(nextStepFor('routines', { activeRoutinesCount: 2 })).toBeNull()

    // Uso e limites: janela acima de 80%
    expect(nextStepFor('usage', {
      highUsageWindow: { engineName: 'Claude', percent: 84, untilLabel: '18:30' },
    })).toEqual({
      screen: 'usage',
      kind: 'habit',
      actionId: 'split-quota',
      text: 'Claude está em 84% até 18:30',
      actionLabel: 'Ver como dividir a cota',
    })
    expect(nextStepFor('usage', {
      highUsageWindow: { engineName: 'Claude', percent: 80, untilLabel: '18:30' },
    })).toBeNull()

    // Segundo cérebro: páginas não atualizadas há 30 dias
    expect(nextStepFor('brain', { stalePagesCount: 3 })).toEqual({
      screen: 'brain',
      kind: 'habit',
      actionId: 'ask-librarian',
      text: '3 páginas não são atualizadas há 30 dias',
      actionLabel: 'Pedir revisão ao bibliotecário',
    })

    // Aprovações: regra 1 cobre os cartões esperando você; sem cartões pendentes some
    expect(nextStepFor('approvals', { blockedWaitingCount: 0 })).toBeNull()
  })

  it('respeita as 24 h do "Agora não" por tela', () => {
    const t0 = 1_700_000_000_000
    dismissNextStep('boards', t0)
    expect(isNextStepDismissed('boards', t0 + 1_000)).toBe(true)
    expect(isNextStepDismissed('routines', t0 + 1_000)).toBe(false)
    expect(nextStepFor('boards', { staleReviewCount: 2, nowMs: t0 + 3_600_000 })).toBeNull()
    // Após 24 h volta a aparecer
    expect(nextStepFor('boards', { staleReviewCount: 2, nowMs: t0 + NEXT_STEP_DISMISS_TTL_MS + 1 })?.actionId).toBe('review-stale')
  })
})

describe('NextStepBar (componente atrás de persona.flag.nextStep)', () => {
  it('fica oculto sem a flag; com a flag renderiza Notice info com sparkle, ação secundária e ✕ Agora não', () => {
    expect(isNextStepEnabled()).toBe(false)
    const onAction = vi.fn()
    const { rerender } = render(
      <NextStepBar
        screen="usage"
        state={{ highUsageWindow: { engineName: 'Claude', percent: 84, untilLabel: '18:30' } }}
        onAction={onAction}
      />,
    )
    expect(document.querySelector('[data-persona-next-step]')).toBeNull()

    localStorage.setItem(NEXT_STEP_FLAG_KEY, '1')
    rerender(
      <NextStepBar
        screen="usage"
        state={{ highUsageWindow: { engineName: 'Claude', percent: 84, untilLabel: '18:30' } }}
        onAction={onAction}
      />,
    )
    expect(screen.getByText('Claude está em 84% até 18:30')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como dividir a cota' }))
    expect(onAction).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(document.querySelector('[data-persona-next-step]')).toBeNull()
    expect(isNextStepDismissed('usage')).toBe(true)
  })
})
