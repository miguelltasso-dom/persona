import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TEAM_AI_EMPTY,
  TEAM_CONNECT_IDLE,
  fetchTeamAi,
  fetchTeamConnect,
  retryTeamPersona,
  sameTeamConnect,
  startTeamConnect,
  type StartUi,
  type TeamAiUi,
  type TeamConnectRemoteWire,
  type TeamConnectUi,
  type TeamScope,
} from './team-connect-wire.ts'

export interface UseTeamConnectOptions {
  /** Só lê (e faz polling) quando ligado. */
  readonly enabled: boolean
  /** Releitura de "quem está sem IA" (barata: lê o cache de conexões do host). */
  readonly pollMs?: number
  /** Leitura do progresso enquanto a ligação roda: é o que faz a lista andar de verdade, uma persona por vez. */
  readonly progressMs?: number
}

export interface UseTeamConnectResult {
  readonly ai: TeamAiUi
  readonly connect: TeamConnectUi
  /** A 1ª leitura já voltou. Antes disso não há banner (não afirma nada). */
  readonly settled: boolean
  readonly open: boolean
  readonly openDialog: () => void
  readonly closeDialog: () => void
  /** A conta marcada no modal (a 1ª por folga é a padrão). */
  readonly accountId: string | undefined
  readonly chooseAccount: (id: string) => void
  /** Está pedindo ao host (entre o clique e a 1ª visão). */
  readonly starting: boolean
  /** O host recusou (ninguém sem IA, sem conta…): o modal diz em palavras. */
  readonly refused: Extract<StartUi, { ok: false }>['code'] | null
  readonly start: () => Promise<void>
  readonly retryOne: (personaId: string) => Promise<void>
}

/**
 * Estado real de "Ligar a IA para a equipe toda". Nada é encenado: a lista só muda quando o host diz que aquela persona conectou. Relê ao voltar o foco da janela
 * (a pessoa volta do terminal onde entrou na conta) e, ao fim de uma ligação, relê quem está sem IA para o banner sumir sozinho.
 */
export function useTeamConnect(
  remote: TeamConnectRemoteWire | undefined,
  scope: TeamScope | null,
  { enabled, pollMs = 8_000, progressMs = 600 }: UseTeamConnectOptions,
): UseTeamConnectResult {
  const [ai, setAi] = useState<TeamAiUi>(TEAM_AI_EMPTY)
  const [connect, setConnect] = useState<TeamConnectUi>(TEAM_CONNECT_IDLE)
  const [settled, setSettled] = useState(false)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [refused, setRefused] = useState<UseTeamConnectResult['refused']>(null)
  const connectRef = useRef(connect)
  connectRef.current = connect
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId

  const applyConnect = useCallback((next: TeamConnectUi): void => {
    if (!sameTeamConnect(connectRef.current, next)) setConnect(next)
  }, [])

  const readAi = useCallback(async (): Promise<void> => {
    if (remote === undefined || workspaceId === undefined || projectId === undefined) return
    setAi(await fetchTeamAi(remote, { workspaceId, projectId }))
    setSettled(true)
  }, [remote, workspaceId, projectId])

  // Quem está sem IA: lê ao abrir, a cada `pollMs` e ao voltar o foco da janela.
  useEffect(() => {
    if (!enabled || remote === undefined || workspaceId === undefined || projectId === undefined) return undefined
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      await readAi()
      if (!cancelled && pollMs > 0) timer = setTimeout(() => { void tick() }, pollMs)
    }
    const onFocus = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      void tick()
    }
    void tick()
    void fetchTeamConnect(remote, { workspaceId, projectId }).then((next) => { if (!cancelled) applyConnect(next) })
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, remote, workspaceId, projectId, pollMs, readAi, applyConnect])

  // O progresso: enquanto roda, lê a cada `progressMs`; quando termina, relê quem está sem IA (o banner some sozinho).
  useEffect(() => {
    if (!enabled || remote === undefined || workspaceId === undefined || projectId === undefined || connect.state !== 'running') return undefined
    let cancelled = false
    const timer = setInterval(() => {
      void fetchTeamConnect(remote, { workspaceId, projectId }).then((next) => {
        if (cancelled) return
        applyConnect(next)
        if (next.state !== 'running') void readAi()
      })
    }, progressMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [enabled, remote, workspaceId, projectId, connect.state, progressMs, applyConnect, readAi])

  const accountId = picked !== undefined && ai.choices.some(choice => choice.id === picked) ? picked : ai.choices[0]?.id

  const start = useCallback(async (): Promise<void> => {
    if (remote === undefined || workspaceId === undefined || projectId === undefined || starting) return
    setStarting(true)
    setRefused(null)
    try {
      const result = await startTeamConnect(remote, { workspaceId, projectId }, accountId)
      if (result.ok) applyConnect(result.view)
      else setRefused(result.code)
    } finally {
      setStarting(false)
    }
  }, [remote, workspaceId, projectId, accountId, starting, applyConnect])

  const retryOne = useCallback(async (personaId: string): Promise<void> => {
    if (remote === undefined || workspaceId === undefined || projectId === undefined) return
    applyConnect(await retryTeamPersona(remote, { workspaceId, projectId }, personaId))
    void readAi()
  }, [remote, workspaceId, projectId, applyConnect, readAi])

  const openDialog = useCallback((): void => { setRefused(null); setOpen(true) }, [])
  const closeDialog = useCallback((): void => {
    setOpen(false)
    // Fechar depois do fim: a próxima vez que abrir volta a lista de quem falta, não o "Pronto" antigo.
    if (connectRef.current.state === 'done') setConnect(TEAM_CONNECT_IDLE)
  }, [])

  return { ai, connect, settled, open, openDialog, closeDialog, accountId, chooseAccount: setPicked, starting, refused, start, retryOne }
}
