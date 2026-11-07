/**
 * HT-3 · "Você moveu para Fazendo e a {nome} começou" NO CARTÃO DO QUADRO (PERSONA-POWERS-SPEC §4; Muse 01:31): o cartão mostra "{nome} começou agora" e o
 * rosto da persona com o anel pulsando 1×. A derivação é LOCAL ao quadro e nunca afirma o que não é verdade — duas travas:
 *   1. só vale se a tarefa ATUAL da persona for o PRÓPRIO cartão movido (`currentTaskId` = o id do cartão); "trabalhando" sozinho não basta;
 *   2. só se a PESSOA moveu o cartão nesta sessão para "Fazendo" e a persona começou em até 2 min.
 * Fora disso, nada: com o host segurando (pausa, silêncio, entrega pendente) a persona não começa e a linha não existe; com o `startOnBoardMove`
 * desligado no host a persona nem começa. Some sozinho 8 s depois, ou quando a pessoa sai do quadro. Atrás de `persona.flag.teamwork`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** A persona tem até 2 min depois do movimento para começar; depois disso o movimento é esquecido. */
export const STARTED_NOW_WINDOW_MS = 120_000
/** De quanto em quanto tempo o host é perguntado enquanto se espera a persona começar. */
export const STARTED_NOW_POLL_MS = 2_000
/** O aviso "começou agora" fica 8 s e some sozinho. */
export const STARTED_NOW_VISIBLE_MS = 8_000

/** A linha da persona como o host a manda em `getOverviewNow` (só o que esta regra lê). */
export interface NowPersonaRow {
  readonly personaId: string
  readonly name: string
  readonly state: string
  readonly currentTaskId: string
}

export interface StartedNow {
  readonly cardId: string
  readonly personaId: string
  readonly personaName: string
}

/** Trava 1: a persona que está TRABALHANDO no próprio cartão (o id da tarefa atual = o id do cartão). */
export function findStarter(rows: readonly NowPersonaRow[], cardId: string): NowPersonaRow | undefined {
  if (cardId === '') return undefined
  return rows.find(row => row.state === 'working' && row.currentTaskId === cardId && row.name.trim() !== '')
}

export interface UseStartedNowInput {
  /** Atrás de `persona.flag.teamwork`: desligado, nada é observado nem desenhado. */
  readonly enabled: boolean
  /** Lê as personas de agora (`getOverviewNow`); rejeitar = tentar de novo no próximo ciclo. */
  readonly readNow: () => Promise<readonly NowPersonaRow[]>
  /** Relógio injetável (testes). */
  readonly now?: (() => number) | undefined
}

export interface StartedNowApi {
  /** A PESSOA moveu este cartão para "Fazendo" agora: observa por até 2 min se a persona começa NELE. */
  readonly watch: (cardId: string) => void
  /** O aviso vivo deste cartão, ou `undefined`. */
  readonly startedFor: (cardId: string) => StartedNow | undefined
}

export function useStartedNow({ enabled, readNow, now = Date.now }: UseStartedNowInput): StartedNowApi {
  const [watching, setWatching] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [shown, setShown] = useState<ReadonlyMap<string, StartedNow>>(() => new Map())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const readRef = useRef(readNow)
  readRef.current = readNow

  const watch = useCallback((cardId: string): void => {
    if (!enabled || cardId === '') return
    setWatching(current => new Map(current).set(cardId, now() + STARTED_NOW_WINDOW_MS))
  }, [enabled, now])

  // Enquanto há cartão a observar, pergunta ao host de 2 em 2 s; cada cartão sai da lista ao começar ou ao passar dos 2 min.
  const watchingKey = [...watching.keys()].sort().join('|')
  useEffect(() => {
    if (!enabled || watching.size === 0) return undefined
    let cancelled = false
    const tick = async (): Promise<void> => {
      let rows: readonly NowPersonaRow[] = []
      try { rows = await readRef.current() } catch { /* sem leitura agora: tenta de novo no próximo ciclo */ }
      if (cancelled) return
      const at = now()
      const started: StartedNow[] = []
      const finished: string[] = []
      for (const [cardId, deadline] of watching) {
        const starter = findStarter(rows, cardId)
        if (starter !== undefined) { started.push({ cardId, personaId: starter.personaId, personaName: starter.name.trim() }); finished.push(cardId) }
        else if (at > deadline) finished.push(cardId)
      }
      if (finished.length === 0) return
      setWatching((current) => { const next = new Map(current); for (const id of finished) next.delete(id); return next })
      if (started.length === 0) return
      setShown((current) => { const next = new Map(current); for (const item of started) next.set(item.cardId, item); return next })
      for (const item of started) {
        const timer = setTimeout(() => {
          timers.current.delete(item.cardId)
          setShown((current) => { const next = new Map(current); next.delete(item.cardId); return next })
        }, STARTED_NOW_VISIBLE_MS)
        timers.current.set(item.cardId, timer)
      }
    }
    void tick()
    const interval = setInterval(() => { void tick() }, STARTED_NOW_POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
    // `watching` muda só quando um cartão entra ou sai; a chave abaixo evita recriar o ciclo por mudança de identidade.
  }, [enabled, watchingKey, now])

  // Sair do quadro (desmontar) apaga os avisos e os temporizadores.
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); timers.current.clear() }, [])

  const startedFor = useCallback((cardId: string): StartedNow | undefined => (enabled ? shown.get(cardId) : undefined), [enabled, shown])
  return useMemo(() => ({ watch, startedFor }), [watch, startedFor])
}
