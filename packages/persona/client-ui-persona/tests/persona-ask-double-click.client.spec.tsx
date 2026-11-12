// @vitest-environment jsdom
// S1 P1-06 (Carbon): "duplo clique rápido numa opção" must not send the answer twice (the 2nd RPC would come back as a conflict and show
// "Não enviado · Tentar de novo" for a choice that already opened a turn). Both answer cards: the end-of-turn choice and the ask/Continuar card.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaAskCard } from '../src/client/ask/PersonaAskCard.tsx'
import { PersonaChoiceCard, type PersonaChoiceCardProps } from '../src/client/ask/PersonaChoiceCard.tsx'
import type { PersonaAskUi } from '../src/client/ask/persona-ask-model.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as PersonaChoiceCardProps['t']

const OPTIONS = [{ id: 'a', label: 'Post para o Instagram' }, { id: 'b', label: 'Post para o Facebook' }]
const ask = (extra: Partial<PersonaAskUi> = {}): PersonaAskUi => ({
  kind: 'fimDoTurno', askId: 'choice:m-1', ticketId: '', personaId: 'p-bia', personaName: 'Bia', question: 'Qual delas publicamos?', options: OPTIONS, multiple: false, ...extra,
})

/** An answer the host has not accepted yet: the card stays "sending" until the test lets it go. */
function pending() {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  const onAnswer = vi.fn((_ask: PersonaAskUi, _optionIds: readonly string[]): Promise<void> => promise.then(() => undefined))
  return { onAnswer, settle: async (): Promise<void> => { await act(async () => { resolve(undefined); await promise }) } }
}

describe('a double click sends ONE answer', () => {
  it('the end-of-turn choice card: two quick clicks on the same option', async () => {
    const { onAnswer, settle } = pending()
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    const option = screen.getByRole('radio', { name: /Post para o Instagram/u })
    fireEvent.click(option)
    fireEvent.click(option)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    await settle()
  })

  it('the end-of-turn choice card: a click on A and, at once, on B', async () => {
    const { onAnswer, settle } = pending()
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('radio', { name: /Post para o Instagram/u }))
    fireEvent.click(screen.getByRole('radio', { name: /Post para o Facebook/u }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    await settle()
  })

  it('the end-of-turn choice card: a letter key pressed twice', async () => {
    const { onAnswer, settle } = pending()
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    const option = screen.getByRole('radio', { name: /Post para o Instagram/u })
    option.focus()
    fireEvent.keyDown(option, { key: 'a' })
    fireEvent.keyDown(option, { key: 'a' })
    expect(onAnswer).toHaveBeenCalledTimes(1)
    await settle()
  })

  it('the ask / Continuar card: two quick clicks on "Continuar"', async () => {
    const { onAnswer, settle } = pending()
    const card: PersonaAskUi = { askId: 'att-9', ticketId: 'tk-9', personaId: 'p-nina', personaName: 'Nina', question: 'Quer que eu continue?', options: [{ id: 'continuar', label: 'Continuar' }, { id: 'parar', label: 'Parar por aqui' }], multiple: false }
    render(<PersonaAskCard t={t} ask={card} onAnswer={onAnswer} />)
    const go = screen.getByRole('radio', { name: 'Continuar' })
    fireEvent.click(go)
    fireEvent.click(go)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    await settle()
  })

  it('after a failure the same card can be tried again (the guard does not stick)', async () => {
    let calls = 0
    const onAnswer = vi.fn(() => { calls += 1; return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve() })
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /Post para o Instagram/u })) })
    expect(await screen.findByText(/Não enviado/u)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/u })) })
    expect(onAnswer).toHaveBeenCalledTimes(2)
  })
})
