// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string) => chatPt[key as keyof typeof chatPt] ?? key

describe('ChannelComposer default responder', () => {
  it('selects coordination persona when roster order puts watchdog first', () => {
    render(
      <ChannelComposer
        t={t}
        members={[
          { id: 'luna', name: 'Luna', role: 'Vigia', state: 'waiting', systemRoles: ['watchdog'] },
          { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working', systemRoles: ['coordination'] },
        ]}
      />,
    )
    const select = screen.getByLabelText('Persona que responde')
    expect((select as HTMLSelectElement).value).toBe('atlas')
  })
})
