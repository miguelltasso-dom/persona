// @vitest-environment jsdom
// IV-10 · "Responder" a uma pergunta em palavras (DECISIONS-SPEC): a loja do alvo, o rótulo do chip "Respondendo a {persona}: {pergunta}" e a ponta
// que chama `answerAttention` com texto e arquivos. O composer (Flint) desenha o chip e troca o postMessage por esta ponta quando há alvo.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { answerRemoteFrom, answerWithText } from '../src/client/answer/answer-remote.ts'
import { createReplyTargetStore, summarizeQuestion, targetFor, useReplyTarget, type ReplyTarget } from '../src/client/answer/reply-target.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = (key: string, params?: Readonly<Record<string, string | number>>): string => bindLocale(chatPt, key, params)
const TARGET: ReplyTarget = { ticketId: 'tk-1', personaId: 'p-nina', personaName: 'Nina', question: 'Qual preço eu uso para o bolo de cenoura na tabela de sexta?', streamKind: 'channel', ownerId: 'geral' }
const SCOPE = { workspaceId: 'ws', projectId: 'proj' }

describe('o rótulo do chip (o composer o desenha)', () => {
  it('"Respondendo a {persona}: {pergunta resumida}"', () => {
    expect(t('reply.chip', { name: TARGET.personaName, question: summarizeQuestion(TARGET.question) })).toBe('Respondendo a Nina: Qual preço eu uso para o bolo de cenoura na tabela de sexta?')
    expect(t('reply.action')).toBe('Responder')
    expect(t('reply.clear')).toBe('Cancelar a resposta')
  })
})

describe('a loja do alvo', () => {
  it('um alvo por vez: set troca, clear limpa, quem assina é avisado e pode parar', () => {
    const store = createReplyTargetStore()
    const listener = vi.fn()
    const stop = store.subscribe(listener)
    expect(store.get()).toBeUndefined()
    store.set(TARGET)
    expect(store.get()).toEqual(TARGET)
    store.set({ ...TARGET, ticketId: 'tk-2' })
    expect(store.get()?.ticketId).toBe('tk-2')
    store.clear()
    store.clear()
    expect(store.get()).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    store.set(TARGET)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('o alvo só vale na conversa onde a pergunta foi feita', () => {
    expect(targetFor(TARGET, 'channel', 'geral')).toBe(TARGET)
    expect(targetFor(TARGET, 'dm', 'geral')).toBeUndefined()
    expect(targetFor(TARGET, 'channel', 'outro')).toBeUndefined()
    expect(targetFor(undefined, 'channel', 'geral')).toBeUndefined()
  })

  it('o hook acompanha a loja', () => {
    const store = createReplyTargetStore()
    function Probe(): ReactNode {
      const target = useReplyTarget(store)
      return <span data-testid="who">{target?.personaName ?? 'ninguém'}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('who').textContent).toBe('ninguém')
    act(() => { store.set(TARGET) })
    expect(screen.getByTestId('who').textContent).toBe('Nina')
    act(() => { store.clear() })
    expect(screen.getByTestId('who').textContent).toBe('ninguém')
  })

  it('a pergunta resumida: espaços juntos, corte numa palavra inteira com "…", nunca no meio da palavra', () => {
    expect(summarizeQuestion('  Qual   preço\n eu uso?  ')).toBe('Qual preço eu uso?')
    const long = summarizeQuestion(TARGET.question, 40)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(41)
    expect(TARGET.question.startsWith(long.slice(0, -1))).toBe(true)
    expect(long.slice(0, -1).endsWith(' ')).toBe(false)
    expect(summarizeQuestion('x'.repeat(200), 20)).toBe(`${'x'.repeat(20)}…`)
  })
})

describe('a ponta: answerAttention com texto e arquivos', () => {
  it('só enxerga o host com answerAttention', () => {
    expect(answerRemoteFrom(undefined)).toBeUndefined()
    expect(answerRemoteFrom({})).toBeUndefined()
    expect(answerRemoteFrom({ answerAttention: () => true })).toBeDefined()
  })

  it('manda o texto aparado e os arquivos já subidos; true libera o worker, false = a sequência avançou', async () => {
    const answerAttention = vi.fn().mockResolvedValueOnce({ ok: true, value: true }).mockResolvedValueOnce(false)
    const remote = answerRemoteFrom({ answerAttention })!
    expect(await answerWithText(remote, SCOPE, 'tk-1', '  R$ 14  ', ['att-1', 'att-2'])).toBe(true)
    expect(answerAttention).toHaveBeenNthCalledWith(1, { workspaceId: 'ws', projectId: 'proj', ticketId: 'tk-1', text: 'R$ 14', attachmentIds: ['att-1', 'att-2'] })
    expect(await answerWithText(remote, SCOPE, 'tk-1', 'ok')).toBe(false)
    expect(answerAttention.mock.calls[1]![0]).not.toHaveProperty('attachmentIds')
  })

  it('só arquivo vale (o host escreve "Segue o arquivo."); sem texto e sem arquivo nem chama o host', async () => {
    const answerAttention = vi.fn().mockResolvedValue(true)
    const remote = answerRemoteFrom({ answerAttention })!
    await answerWithText(remote, SCOPE, 'tk-1', '   ', ['att-1'])
    expect(answerAttention.mock.calls[0]![0]).toMatchObject({ text: '', attachmentIds: ['att-1'] })
    await expect(answerWithText(remote, SCOPE, 'tk-1', '  ')).rejects.toThrow('Escreva a resposta, escolha uma opção ou anexe um arquivo.')
    expect(answerAttention).toHaveBeenCalledTimes(1)
  })

  it('a falha sobe com a frase pt-BR do host (já respondida, arquivo grande demais…)', async () => {
    const remote = answerRemoteFrom({ answerAttention: () => ({ ok: false, error: { code: 'conflict', message: 'Essa pergunta já foi respondida.' } }) })!
    await expect(answerWithText(remote, SCOPE, 'tk-1', 'oi')).rejects.toThrow('Essa pergunta já foi respondida.')
    const bare = answerRemoteFrom({ answerAttention: () => ({ ok: false, error: { code: 'forbidden' } }) })!
    await expect(answerWithText(bare, SCOPE, 'tk-1', 'oi')).rejects.toThrow('forbidden')
  })
})
