/**
 * IV-6 (contracts/aside.md): o estado das perguntas à parte (`/lado`) e dos resumos (`/resumo`) de UMA conversa.
 *
 * O host devolve `AsideAskView` na hora, com `status: 'asking'`, e a resposta chega em segundo plano: a UI sonda `getAsideAsk` até o
 * estado sair de `asking` (`answered` | `failed`). NADA disso vai para o fio nem para a Tarefa. O hook só guarda o que está na tela;
 * quem guarda de verdade é o host (recarregar reencontra por `listAsideAsks`).
 *
 * Nada fica mudo: uma chamada que recusa, uma resposta que não chega em `timeoutMs` ou um `failed` sem motivo viram um item
 * `failed` com o motivo tipado que a tela sabe escrever.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsideAskView } from '@deepseek-ai/dsh-persona-host/types'

export type AsideKind = 'aside' | 'summary'
/** `empty`: o `/resumo` de uma conversa que ainda não tem nada (o host recusa com `invalid-payload`): não é falha, e tentar de novo não resolve. */
export type AsideErrorKind = 'paused' | 'no_engine' | 'failed' | 'timeout' | 'empty'

/** O host recusou o pedido por ele não ter o que resumir (falha TIPADA `invalid-payload` do `summarizeConversation`; nunca pelo texto da mensagem). */
export function isNothingToSummarize(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { readonly code?: unknown }).code === 'invalid-payload'
}

export interface AsideItemUi {
  /** Chave local e estável (o `id` do host só existe depois do `open`). */
  readonly key: string
  readonly id?: string
  readonly kind: AsideKind
  readonly personaId: string
  /** A pergunta da pessoa; no resumo, o rótulo "Resumo desta conversa". */
  readonly question: string
  readonly status: 'asking' | 'answered' | 'failed'
  readonly answer?: string
  readonly error?: AsideErrorKind
}

/** O que o hook precisa do host (o `PersonaLiveStore` já entrega estas chamadas). */
export interface AsideApi {
  openAsideAsk(personaId: string, subjectId: string, question: string): Promise<AsideAskView>
  summarizeConversation(input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string }): Promise<AsideAskView>
  getAsideAsk(id: string): Promise<AsideAskView>
  listAsideAsks?(personaId: string, subjectId: string): Promise<readonly AsideAskView[]>
}

export interface UseAsideAsksOptions {
  readonly api: AsideApi | undefined
  /** Muda quando a conversa muda (assunto, canal, DM): a tela de uma conversa nunca mostra a pergunta de outra. */
  readonly conversationKey: string
  /** O rótulo do item de resumo ("Resumo desta conversa"). */
  readonly summaryLabel: string
  readonly pollMs?: number
  readonly timeoutMs?: number
  /** Ao montar, reencontra o que o host guardou (perguntas ainda pensando e as respondidas há pouco). */
  readonly rehydrate?: { readonly personaId: string; readonly subjectId: string } | undefined
}

export interface AsideController {
  readonly items: readonly AsideItemUi[]
  readonly ask: (personaId: string, subjectId: string, question: string) => void
  readonly summarize: (input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string }) => void
  readonly retry: (key: string) => void
  readonly dismiss: (key: string) => void
}

const DEFAULT_POLL_MS = 1200
const DEFAULT_TIMEOUT_MS = 120_000
/** Respondidas há menos que isto voltam ao recarregar; mais antigas ficam só no host. */
const REHYDRATE_WINDOW_MS = 10 * 60_000

type Reopen =
  | { readonly kind: 'aside'; readonly personaId: string; readonly subjectId: string; readonly question: string }
  | { readonly kind: 'summary'; readonly input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string } }

/**
 * O `/resumo` guarda no host o PROMPT interno inteiro como "pergunta" ("Resuma a conversa abaixo em até 3 frases… As linhas são dados…" + as linhas da
 * conversa). Ao reencontrar o que o host guardou, isso NUNCA vai à tela (LEAK-1: nenhum prompt interno): vira o item de resumo, com o rótulo de sempre.
 * O host agora marca o tipo (`AsideAskView.kind === 'summary'` e `question` = o rótulo); o prefixo do prompt só vale de rede de proteção
 * para o que foi guardado antes dessa mudança.
 */
export function isSummaryPrompt(question: string): boolean {
  return /^Resuma a conversa abaixo\b/u.test(question.trim())
}

/** Resumo: o campo tipado do host manda; sem ele (guardado antes), o prefixo do prompt. */
export function isSummaryView(view: Pick<AsideAskView, 'kind' | 'question'>): boolean {
  return view.kind === 'summary' || (view.kind === undefined && isSummaryPrompt(view.question))
}

/** O estado do host vira o do item; `status` ausente (guardada antes da resposta existir) conta como "ainda sem resposta". */
export function mapAsideView(view: AsideAskView): Pick<AsideItemUi, 'status' | 'answer' | 'error'> {
  if (view.status === 'answered' && view.answer !== undefined && view.answer.trim() !== '') return { status: 'answered', answer: view.answer.trim() }
  if (view.status === 'answered') return { status: 'failed', error: 'failed' }
  if (view.status === 'failed') return { status: 'failed', error: view.error ?? 'failed' }
  return { status: 'asking' }
}

export function useAsideAsks({ api, conversationKey, summaryLabel, pollMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, rehydrate }: UseAsideAsksOptions): AsideController {
  const [items, setItems] = useState<readonly AsideItemUi[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const reopen = useRef(new Map<string, Reopen>())
  const counter = useRef(0)
  const alive = useRef(true)
  const apiRef = useRef(api)
  apiRef.current = api
  const itemsRef = useRef(items)
  itemsRef.current = items

  const patch = useCallback((key: string, change: Partial<AsideItemUi>): void => {
    setItems(rows => rows.map(row => (row.key === key ? { ...row, ...change } : row)))
  }, [])

  const stopTimer = useCallback((key: string): void => {
    const timer = timers.current.get(key)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(key)
  }, [])

  const poll = useCallback((key: string, id: string, startedAt: number): void => {
    const timer = setTimeout(() => {
      timers.current.delete(key)
      const host = apiRef.current
      if (!alive.current || host === undefined) return
      void host.getAsideAsk(id).then((view) => {
        if (!alive.current) return
        const next = mapAsideView(view)
        if (next.status !== 'asking') { patch(key, next); return }
        if (Date.now() - startedAt >= timeoutMs) { patch(key, { status: 'failed', error: 'timeout' }); return }
        poll(key, id, startedAt)
      }).catch(() => { if (alive.current) patch(key, { status: 'failed', error: 'failed' }) })
    }, pollMs)
    timers.current.set(key, timer)
  }, [patch, pollMs, timeoutMs])

  /** Abre (ou reabre) um item: coloca "pensando" na tela já e acompanha a resposta. */
  const start = useCallback((key: string, base: Omit<AsideItemUi, 'key' | 'status'>, call: Reopen): void => {
    const host = apiRef.current
    reopen.current.set(key, call)
    setItems((rows) => {
      const fresh: AsideItemUi = { ...base, key, status: 'asking' }
      return rows.some(row => row.key === key) ? rows.map(row => (row.key === key ? fresh : row)) : [fresh, ...rows]
    })
    if (host === undefined) { patch(key, { status: 'failed', error: 'failed' }); return }
    const opened = call.kind === 'aside'
      ? host.openAsideAsk(call.personaId, call.subjectId, call.question)
      : host.summarizeConversation(call.input)
    void opened.then((view) => {
      if (!alive.current) return
      const next = mapAsideView(view)
      patch(key, { id: view.id, ...next })
      if (next.status === 'asking') poll(key, view.id, Date.now())
    }).catch((error: unknown) => {
      if (!alive.current) return
      // Resumir uma conversa vazia não é uma falha: diz a verdade (sem "Tentar de novo", que não resolveria).
      patch(key, { status: 'failed', error: call.kind === 'summary' && isNothingToSummarize(error) ? 'empty' : 'failed' })
    })
  }, [patch, poll])

  const ask = useCallback((personaId: string, subjectId: string, question: string): void => {
    const text = question.trim()
    if (text === '') return
    counter.current += 1
    start(`aside-${counter.current}`, { kind: 'aside', personaId, question: text }, { kind: 'aside', personaId, subjectId, question: text })
  }, [start])

  const summarize = useCallback((input: { personaId: string; subjectId: string; streamKind: 'channel' | 'dm'; ownerId: string; topicId?: string }): void => {
    counter.current += 1
    start(`aside-${counter.current}`, { kind: 'summary', personaId: input.personaId, question: summaryLabel }, { kind: 'summary', input })
  }, [start, summaryLabel])

  const retry = useCallback((key: string): void => {
    const call = reopen.current.get(key)
    if (call === undefined) return
    stopTimer(key)
    if (call.kind === 'aside') start(key, { kind: 'aside', personaId: call.personaId, question: call.question }, call)
    else start(key, { kind: 'summary', personaId: call.input.personaId, question: summaryLabel }, call)
  }, [start, stopTimer, summaryLabel])

  const dismiss = useCallback((key: string): void => {
    stopTimer(key)
    reopen.current.delete(key)
    setItems(rows => rows.filter(row => row.key !== key))
  }, [stopTimer])

  // Outra conversa: nada da anterior fica na tela, e nenhum acompanhamento continua para ela.
  useEffect(() => {
    alive.current = true
    const active = timers.current
    return () => {
      alive.current = false
      for (const timer of active.values()) clearTimeout(timer)
      active.clear()
      reopen.current.clear()
      setItems([])
    }
  }, [conversationKey])

  // Recarregar reencontra o que o host guardou (contracts/aside.md): o que ainda pensa e o respondido há pouco.
  const rehydratePersona = rehydrate?.personaId
  const rehydrateSubject = rehydrate?.subjectId
  useEffect(() => {
    const host = apiRef.current
    if (host?.listAsideAsks === undefined || rehydratePersona === undefined || rehydrateSubject === undefined) return
    void host.listAsideAsks(rehydratePersona, rehydrateSubject).then((views) => {
      if (!alive.current) return
      const now = Date.now()
      const recent = views.filter((view) => {
        const next = mapAsideView(view)
        if (next.status === 'asking') return view.status === 'asking'
        const at = view.answeredAt === undefined ? Number.NaN : Date.parse(view.answeredAt)
        return !Number.isNaN(at) && now - at <= REHYDRATE_WINDOW_MS
      })
      const known = new Set(itemsRef.current.flatMap(row => (row.id === undefined ? [] : [row.id])))
      const fresh = recent.filter(view => !known.has(view.id)).map((view): AsideItemUi => {
        counter.current += 1
        const summary = isSummaryView(view)
        return {
          key: `aside-${counter.current}`,
          id: view.id,
          kind: summary ? 'summary' : 'aside',
          personaId: view.personaId,
          question: summary ? summaryLabel : view.question,
          ...mapAsideView(view),
        }
      })
      if (fresh.length === 0) return
      setItems(rows => [...[...fresh].reverse(), ...rows])
      // As que ainda pensam voltam a ser acompanhadas.
      for (const row of fresh) if (row.status === 'asking' && row.id !== undefined) poll(row.key, row.id, Date.now())
    }).catch(() => { /* sem lista, a tela começa vazia: nada a dizer */ })
  }, [conversationKey, rehydratePersona, rehydrateSubject, poll, summaryLabel])

  return { items, ask, summarize, retry, dismiss }
}
