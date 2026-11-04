import type { DesktopCapturerSource, NativeImage } from 'electron'
import { expect, it, vi } from 'vitest'
import { teachSourceView } from '../src/teach-sources.ts'

it('projects local capture thumbnails at 16:10 and omits empty previews', () => {
  const resize = vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,cHJldmlldw==' }))
  const thumbnail = { isEmpty: () => false, resize } as unknown as NativeImage
  const source: DesktopCapturerSource = { id: 'screen:1', name: 'Tela', thumbnail, appIcon: null as unknown as NativeImage, display_id: '1' }
  expect(teachSourceView(source)).toEqual({ id: 'screen:1', name: 'Tela', kind: 'screen', thumbnail: 'data:image/png;base64,cHJldmlldw==' })
  expect(resize).toHaveBeenCalledWith({ width: 320, height: 200 })
  const empty = { ...source, id: 'window:1', thumbnail: { isEmpty: () => true } as unknown as NativeImage }
  expect(teachSourceView(empty)).toEqual({ id: 'window:1', name: 'Tela', kind: 'window' })
})
