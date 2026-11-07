// @vitest-environment jsdom
// IV-10 · "Responder" na Visão geral (a linha da pergunta em palavras em "Precisa de você") e o gesto compartilhado com Aprovações
// (`startReply`: alvo na loja → abre a conversa → foco do composer depois que ela monta).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReplyTargetStore, type ReplyTarget } from '../src/client/answer/reply-target.ts'
import { COMPOSER_MOUNT_MS, startReply } from '../src/client/answer/start-reply.ts'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import { OverviewView, type OverviewViewProps } from '../src/client/overview/OverviewView.tsx'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as OverviewViewProps['t']

const decision = (id: string, extra: Partial<Decision> = {}): Decision => ({
  id, kind: 'blocker', title: `Qual preço eu uso? (${id})`, requester: { personaId: 'p-nina', name: 'Nina' }, blocking: true, risk: 'normal',
  createdAt: '2026-11-05T01:00:00.000Z', state: 'pending', ...extra,
})
const TARGET: ReplyTarget = { ticketId: 'tk-1', personaId: 'p-nina', personaName: 'Nina', question: 'Qual preço eu uso?', streamKind: 'channel', ownerId: 'geral' }

function overview(props: Partial<OverviewViewProps> = {}): ReturnType<typeof render> {
  return render(
    <PreviewFrame brandLabel="Persona">
      <OverviewView t={t} decisions={[decision('tk-1'), decision('tk-2')]} nowRows={[]} awayEvents={[]} onNavigate={vi.fn()} onDecide={vi.fn()} {...props} />
    </PreviewFrame>,
  )
}

describe('a linha da Visão geral', () => {
  it('com o alvo e o handler: a pergunta em palavras tem "Responder" (primário) no lugar de "Revisar"; as outras linhas seguem como eram', () => {
    const onReply = vi.fn()
    overview({ replyTargets: new Map([['tk-1', TARGET]]), onReply })
    const item = document.querySelector('[data-decision-id="tk-1"]') as HTMLElement
    fireEvent.click(item.querySelector('button') as HTMLButtonElement)
    expect(onReply).toHaveBeenCalledWith(TARGET)
    expect(item.textContent).toContain('Responder')
    expect(item.textContent).not.toContain('Revisar')
    const other = document.querySelector('[data-decision-id="tk-2"]') as HTMLElement
    expect(other.textContent).toContain('Revisar')
    expect(other.textContent).not.toContain('Responder')
  })

  it('sem o handler ou sem o alvo desta decisão: nenhum "Responder" (nada de botão morto)', () => {
    overview({ replyTargets: new Map([['tk-1', TARGET]]) })
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    cleanup()
    overview({ replyTargets: new Map(), onReply: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
    cleanup()
    overview({ onReply: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull()
  })

  it('a linha de risco baixo com alvo também vira "Responder" (responder não é aprovar)', () => {
    overview({ decisions: [decision('tk-1', { risk: 'low' })], replyTargets: new Map([['tk-1', TARGET]]), onReply: vi.fn() })
    expect(screen.getByRole('button', { name: 'Responder' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull()
  })
})

describe('startReply: o gesto de Aprovações e da Visão geral', () => {
  it('põe o alvo, abre a conversa e só depois que ela monta pede o foco do composer', () => {
    vi.useFakeTimers()
    const store = createReplyTargetStore()
    const open = vi.fn()
    const focus = vi.fn()
    startReply(TARGET, open, store, focus)
    expect(store.get()).toBe(TARGET)
    expect(open).toHaveBeenCalledWith('channel', 'geral')
    expect(focus).not.toHaveBeenCalled()
    vi.advanceTimersByTime(COMPOSER_MOUNT_MS - 1)
    expect(focus).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('sem o handler do shell o alvo fica escolhido e não quebra', () => {
    vi.useFakeTimers()
    const store = createReplyTargetStore()
    const focus = vi.fn()
    startReply({ ...TARGET, streamKind: 'dm', ownerId: 'dm-nina' }, undefined, store, focus)
    expect(store.get()?.ownerId).toBe('dm-nina')
    vi.advanceTimersByTime(COMPOSER_MOUNT_MS)
    expect(focus).toHaveBeenCalledTimes(1)
  })
})
