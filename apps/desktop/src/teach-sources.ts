/** Convert desktop capture sources to renderer-safe, local previews. */
import type { DesktopCapturerSource } from 'electron'
import type { TeachSource } from './teach-capture.ts'

/** @param source - Source returned by Electron. @returns Public identity and an optional 320×200 PNG. */
export function teachSourceView(source: DesktopCapturerSource): TeachSource {
  return {
    id: source.id,
    name: source.name,
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    ...(source.thumbnail.isEmpty() ? {} : { thumbnail: source.thumbnail.resize({ width: 320, height: 200 }).toDataURL() }),
  }
}
