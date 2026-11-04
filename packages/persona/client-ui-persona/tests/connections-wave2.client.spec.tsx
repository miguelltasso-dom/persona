// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../src/client/connections/mock-data.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

describe('ConnectionsView (W2-7 copy)', () => {
  it('shows honest terms notice when accounts are listed', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectionsView dict={connectionsPt} entries={MOCK_CONNECTIONS} />
      </PreviewFrame>,
    )
    expect(screen.getByText(connectionsPt['wave2.termsNotice'])).toBeTruthy()
  })
})
