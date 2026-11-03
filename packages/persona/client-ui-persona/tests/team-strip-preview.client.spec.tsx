// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { MOCK_CHANNEL_ROSTER } from '../src/client/team/mock-channel-roster.ts'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'

installPreviewTheme()

describe('team channel strip preview', () => {
  it('lists members with text status labels', () => {
    render(
      <PreviewFrame brandLabel={pt['brand.name']}>
        <TeamChannelStrip t={shellTranslate} members={MOCK_CHANNEL_ROSTER} />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['team.channelStripTitle'] })).toBeTruthy()
    expect(screen.getByText('Atlas')).toBeTruthy()
    expect(screen.getByText(pt['team.statusWaiting'])).toBeTruthy()
  })
})
