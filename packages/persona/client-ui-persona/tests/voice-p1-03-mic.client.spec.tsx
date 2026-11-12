// @vitest-environment jsdom
// COLHEITA-S1 · P1-03 (Carbon; Keel 09:53): sem transcritor pronto não há microfone na tela (#geral e DM); com um transcritor pronto,
// o microfone aparece. Sem o microfone, o Setup não mostra voz pela metade.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const MEMBER = { id: 'bento' as const, name: 'Bento', role: 'Engenharia', state: 'waiting' as const }
const RECORD = shellPt['voice.record']

function channel(extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
  return render(
    <GeneralChannelView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[MEMBER]}
      messages={[]}
      memberId="owner"
      uploadAttachment={async () => ({ id: 'a1', name: 'voz-2s.webm' })}
      onSendMessage={() => undefined}
      {...extra}
    />,
  )
}

function dm(extra: Partial<React.ComponentProps<typeof DirectMessagesView>> = {}) {
  return render(
    <DirectMessagesView
      t={key => chatPt[key as keyof typeof chatPt] ?? key}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      loading={false}
      dms={[{ id: 'dm-1', peerId: 'p1', peerName: 'Bento' }]}
      selectedId="dm-1"
      messages={[]}
      onSelect={() => {}}
      onSend={() => {}}
      uploadAttachment={async () => ({ id: 'a1', name: 'voz-2s.webm' })}
      {...extra}
    />,
  )
}

describe('P1-03 · microfone só com transcritor pronto (DM)', () => {
  it('sem transcritor, não há botão de gravar na DM', () => {
    dm()
    expect(screen.queryByRole('button', { name: RECORD })).toBeNull()
  })

  it('com um transcritor pronto, o botão de gravar aparece na DM', () => {
    dm({ voiceTranscriber: async () => 'oi' })
    expect(screen.getByRole('button', { name: RECORD })).toBeTruthy()
  })
})

describe('P1-03 · microfone só com transcritor pronto (#geral)', () => {
  it('sem transcritor, não há botão de gravar na tela', () => {
    channel()
    expect(screen.queryByRole('button', { name: RECORD })).toBeNull()
  })

  it('com um transcritor pronto, o botão de gravar aparece sozinho', () => {
    channel({ voiceTranscriber: async () => 'oi' })
    expect(screen.getByRole('button', { name: RECORD })).toBeTruthy()
  })
})
