/**
 * COLHEITA-S1 · P1-05 (Carbon) · Keel 04:11: o anexo de áudio de uma mensagem do fio. A tela pergunta o TIPO quando a mensagem
 * aparece (metadado); só anexo de áudio mostra a bolha. Os bytes só saem com o toque (é o `LazyAudioBubble`).
 * O acesso (tradução do shell, checagem de tipo, carregamento) vem do contexto que o fio conectado monta.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { LazyAudioBubble } from './LazyAudioBubble.tsx'

type ShellT = PropsLocale<'persona.shell'>['t']

export interface AudioAttachmentAccess {
  readonly t: ShellT
  /** O anexo é áudio? null se não for; senão a duração do nome (0 quando o nome não traz). Só o tipo e o nome; sem bytes. */
  readonly check: (attachmentId: string) => Promise<number | null>
  /** Os bytes ao tocar; devolve a URL do objeto (ou null). */
  readonly load: (attachmentId: string) => Promise<string | null>
}

export const AudioAttachmentContext = createContext<AudioAttachmentAccess | null>(null)

export interface AudioAttachmentSlotProps {
  readonly attachmentId: string
}

/** Um anexo da mensagem: a bolha de áudio se for áudio; nada se não for (ou sem acesso). */
export function AudioAttachmentSlot({ attachmentId }: AudioAttachmentSlotProps): ReactNode {
  const access = useContext(AudioAttachmentContext)
  if (access === null) return null
  return <AudioAttachmentReady access={access} attachmentId={attachmentId} />
}

function AudioAttachmentReady({ access, attachmentId }: { readonly access: AudioAttachmentAccess; readonly attachmentId: string }): ReactNode {
  // `undefined` = ainda perguntando; `null` = não é áudio; número = a duração (ms) da bolha.
  const [duration, setDuration] = useState<number | null | undefined>(undefined)
  // O acesso muda de identidade a cada desenho do pai; a pergunta é uma por anexo, então usa a referência mais recente sem refazer.
  const latest = useRef(access)
  latest.current = access
  useEffect(() => {
    let alive = true
    void latest.current.check(attachmentId).then((value) => { if (alive) setDuration(value) }, () => { if (alive) setDuration(null) })
    return () => { alive = false }
  }, [attachmentId])
  if (duration === undefined || duration === null) return null
  return <LazyAudioBubble t={access.t} durationMs={duration} load={() => access.load(attachmentId)} />
}
