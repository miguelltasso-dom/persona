/**
 * Item 20 (Keel, 23:08): the voice model has one source, the Host. The component manager downloads the official Vosk zip, checks the
 * pinned sha256 and extracts it; this hands the renderer the `model.tar.gz` its worker loads. The renderer never reaches the network.
 */

import type { Context } from '@deepseek-ai/cordis'
import { voiceModelArchive } from '@deepseek-ai/dsh-persona-components'
import type { VoiceModelBytesView, VoiceModelStateView } from './types.ts'

/**
 * What the Host has installed for the voice model, without touching the network.
 * @param ctx - Host context carrying `personaComponents`.
 * @returns Installed version, absent, or why the component store is unavailable.
 */
export function voiceModelStateOf(ctx: Context): VoiceModelStateView {
  const components = ctx.get('personaComponents')
  if (components === undefined || !components.configured) return { state: 'unavailable' }
  const state = components.state('stt')
  if (state.state === 'installed') return { state: 'installed', version: state.version }
  if (state.state === 'failed') return { state: 'failed', reason: state.reason }
  return { state: 'absent' }
}

/**
 * Install the pinned voice model on demand and pack it for the renderer's worker.
 * @param ctx - Host context carrying `personaComponents`.
 * @returns The archive as base64, or why it is not available.
 */
export async function ensureVoiceModelBytes(ctx: Context): Promise<VoiceModelBytesView> {
  const components = ctx.get('personaComponents')
  if (components === undefined || !components.configured) return { state: 'unavailable' }
  const installed = await components.ensure('stt')
  if (installed.state === 'failed') return { state: 'failed', reason: installed.reason }
  if (installed.state !== 'installed') return { state: 'unavailable' }
  let archive: Buffer
  try {
    archive = voiceModelArchive(installed.path)
  } catch {
    // The directory exists without the archive: a corrupt install, not a transient failure. The person is told to try again.
    return { state: 'failed', reason: 'checksum' }
  }
  return { state: 'ready', version: installed.version, base64: archive.toString('base64'), bytes: archive.byteLength }
}
