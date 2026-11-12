/**
 * Item 20 (Keel, 00:23): the voice model is the archive the vosk-browser project publishes for its own demo — the same public source as
 * the runtime, already in the tar.gz shape the Worker extracts (one wrapping folder, `conf/`, `am/`, `graph/` inside) and measured
 * against the published file on 12/11/2026. The Host downloads it with the pinned sha256 and stores it as `model.tar.gz`; nothing is
 * converted here and nothing is hosted by us.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentManifestEntry } from './manifest.ts'

/** The pinned model component: published URL, size and sha256 measured in a real Worker load (Chrome, 12/11/2026). */
export const VOICE_MODEL_ENTRY: ComponentManifestEntry = {
  kind: 'stt',
  version: 'vosk-model-small-pt-0.3',
  url: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-pt-0.3.tar.gz',
  sha256: '499771532fc4c5fc9d7657003a4193275c7f3561a6ccda9226f1d427c010887c',
  bytes: 32_440_432,
  format: 'tar.gz',
}

/** The archive the renderer's worker loads, stored beside the component by the installer. */
export const VOICE_MODEL_ARCHIVE = 'model.tar.gz'

/**
 * The archive for the installed component.
 * @param componentPath - The installed component directory (`<root>/stt/<version>`).
 * @returns The tar.gz bytes.
 */
export function voiceModelArchive(componentPath: string): Buffer {
  const archive = join(componentPath, VOICE_MODEL_ARCHIVE)
  if (!existsSync(archive)) throw new Error(`stt: the model archive is missing under ${componentPath}`)
  return readFileSync(archive)
}
