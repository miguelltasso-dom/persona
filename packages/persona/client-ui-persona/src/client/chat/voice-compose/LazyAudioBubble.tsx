/**
 * COLHEITA-S1 · P1-05 (Carbon) · Keel 04:11: a bolha de áudio de um anexo do fio. Antes de tocar, mostra só o botão de tocar;
 * ao tocar, pede os bytes (`load`, que devolve uma URL de objeto) e mostra o player da bolha. A URL é revogada ao desmontar.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AudioBubble } from '../../voice/AudioBubble.tsx'
import { UiIcon } from '../../primitives/index.ts'
import styles from './LazyAudioBubble.module.css'

type ShellT = PropsLocale<'persona.shell'>['t']

export interface LazyAudioBubbleProps {
  readonly t: ShellT
  /** Pede os bytes ao tocar e devolve a URL do objeto (ou `null` se não der). */
  readonly load: () => Promise<string | null>
  /** Duração conhecida (o anexo não traz a duração; sem ela, a bolha mostra zero até o áudio carregar). */
  readonly durationMs?: number | undefined
  readonly levels?: readonly number[] | undefined
}

export function LazyAudioBubble({ t, load, durationMs = 0, levels }: LazyAudioBubbleProps): ReactNode {
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const created = useRef<string | null>(null)

  // A URL do objeto é solta quando a bolha sai da tela (não fica vazando memória do áudio).
  useEffect(() => () => {
    if (created.current !== null) URL.revokeObjectURL(created.current)
    created.current = null
  }, [])

  if (src !== null) return <AudioBubble t={t} src={src} durationMs={durationMs} {...(levels === undefined ? {} : { levels })} />
  return (
    <button
      type="button"
      className={styles.play}
      aria-label={t('voice.play')}
      aria-busy={state === 'loading' ? true : undefined}
      disabled={state === 'loading'}
      onClick={() => {
        setState('loading')
        void load().then((url) => {
          if (url === null) {
            setState('failed')
            return
          }
          created.current = url
          setSrc(url)
        })
      }}
    >
      <UiIcon name="play" size={16} />
    </button>
  )
}
