/**
 * Item 20 (Muse §1): sends a recorded voice message as an audio attachment of the thread — the same path images already use
 * (`upload*Attachment` then `post*Message`). No transcription here: the audio goes first, the transcript is best-effort.
 */

import type { VoiceRecording } from './useVoiceCapture.ts'

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
 * @returns The stored attachment (id and display name).
 */
export async function sendVoiceMessage(
  target: VoiceSendTarget,
  recording: VoiceRecording,
  scope: 'channel' | 'dm',
): Promise<{ readonly id: string; readonly name: string }> {
  const seconds = Math.max(1, Math.round(recording.durationMs / 1_000))
  const file = new File([recording.blob], `audio-${String(seconds)}s.webm`, { type: recording.blob.type === '' ? 'audio/webm' : recording.blob.type })
  const uploaded = scope === 'channel' ? await target.uploadChannelAttachment(file) : await target.uploadDmAttachment(file)
  if (scope === 'channel') await target.postChannelMessage('', [uploaded.id])
  else await target.postDmMessage('', [uploaded.id])
  return uploaded
}
