/**
 * COLHEITA-S1 · P1-05 (Carbon) · Muse §1 (item 20): o microfone do composer. Com o composer vazio aparece o botão de gravar
 * (só ícone). Gravando, a barra de gravação (VoiceRecorderBar) toma o lugar do botão; enviar entrega a gravação ao pai, que
 * sobe o áudio e posta a mensagem. Com texto no composer, não aparece nada (o enviar é o da caixa).
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, UiIcon } from '../../primitives/index.ts'
import { VoiceRecorderBar } from '../../voice/VoiceRecorderBar.tsx'
import { useVoiceCapture, type VoiceCaptureOptions, type VoiceRecording } from '../../voice/useVoiceCapture.ts'

type ShellT = PropsLocale<'persona.shell'>['t']

export interface VoiceComposeButtonProps {
  readonly t: ShellT
  /** Com o composer vazio o microfone aparece; com texto, só o enviar da caixa. */
  readonly empty: boolean
  /** Entrega a gravação ao fio (o pai sobe o áudio e posta a mensagem). */
  readonly onSendVoice: (recording: VoiceRecording) => void | Promise<void>
  /** Só para testes: as APIs do navegador injetadas (microfone, gravador, níveis). */
  readonly captureOptions?: VoiceCaptureOptions | undefined
}

export function VoiceComposeButton({ t, empty, onSendVoice, captureOptions }: VoiceComposeButtonProps): ReactNode {
  const capture = useVoiceCapture(captureOptions)
  if (capture.state === 'recording') {
    return (
      <VoiceRecorderBar
        t={t}
        elapsedMs={capture.elapsedMs}
        levels={capture.levels}
        onDiscard={() => { capture.cancel() }}
        onSend={() => {
          void capture.stop().then(async (recording) => {
            if (recording !== undefined) await onSendVoice(recording)
          })
        }}
      />
    )
  }
  if (!empty) return null
  return (
    <IconButton
      size="s"
      label={t('voice.record')}
      icon={<UiIcon name="mic" size={18} />}
      onClick={() => { void capture.start() }}
    />
  )
}
