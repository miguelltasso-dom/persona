/**
 * Item 20 (Muse §1): sends a recorded voice message as an audio attachment of the thread — the same path images already use
 * (`upload*Attachment` then `post*Message`). No transcription here: the audio goes first, the transcript is best-effort.
 */

import type { VoiceRecording } from './useVoiceCapture.ts'

/**
 * Nome do anexo de voz: `voz-<segundos>s.webm` (ou `.ogg`). A bolha do fio lê a duração do nome, sem mudar o host (Keel 04:46).
 * @param seconds - Duração arredondada, em segundos inteiros.
 * @param mime - Tipo do áudio gravado.
 */
export function voiceAttachmentName(seconds: number, mime: string): string {
  const extension = mime.startsWith('audio/ogg') ? 'ogg' : 'webm'
  return `voz-${String(seconds)}s.${extension}`
}

/** The slice of the live store a voice message needs. */
export interface VoiceSendTarget {
  uploadChannelAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  uploadDmAttachment(file: File): Promise<{ readonly id: string; readonly name: string }>
  postChannelMessage(body: string, attachmentIds?: readonly string[]): Promise<void>
  postDmMessage(body: string, attachmentIds?: readonly string[]): Promise<void>
}

/**
 * Upload the audio and post the message that carries it.
 * @param target - Live store (channel or DM).
 * @param recording - What the capture produced.
 * @param scope - Which thread the message belongs to.
 * @param options - `transcript`: the words the recognizer heard, sent in the body next to the audio (P1-05: the CLIs read the
 *   words, not the file). Without it the body stays empty, as before.
 * @returns The stored attachment (id and display name).
 */
export async function sendVoiceMessage(
  target: VoiceSendTarget,
  recording: VoiceRecording,
  scope: 'channel' | 'dm',
  options: { readonly transcript?: string | undefined } = {},
): Promise<{ readonly id: string; readonly name: string }> {
  const body = options.transcript?.trim() ?? ''
  const seconds = Math.max(1, Math.round(recording.durationMs / 1_000))
  const type = recording.blob.type === '' ? 'audio/webm' : recording.blob.type
  const file = new File([recording.blob], voiceAttachmentName(seconds, type), { type })
  const uploaded = scope === 'channel' ? await target.uploadChannelAttachment(file) : await target.uploadDmAttachment(file)
  if (scope === 'channel') await target.postChannelMessage(body, [uploaded.id])
  else await target.postDmMessage(body, [uploaded.id])
  return uploaded
}
