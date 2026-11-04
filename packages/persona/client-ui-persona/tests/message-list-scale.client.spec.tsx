// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { mockLargeChannelMessages } from '../src/client/chat/mock-large-channel-messages.ts'
import { CHAT_MESSAGE_VIRTUAL_MIN } from '../src/client/chat/message-stream-virtual.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

afterEach(() => { cleanup() })
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: keyof typeof chatPt, params?: Readonly<Record<string, string>>) => {
  let text: string = chatPt[key]
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) text = text.replace(`{${name}}`, value)
  }
  return text
}) as PropsLocale<'persona.chat'>['t']

describe('MessageList scale (DESEMPENHO)', () => {
  it('virtualizes a 10k channel stream within jsdom budget', () => {
    const messages = mockLargeChannelMessages(10_000)
    const start = performance.now()
    const { container } = render(<MessageList t={t} messages={messages} />)
    const ms = performance.now() - start
    const mounted = container.querySelectorAll('[data-message-id]').length
    expect(mounted).toBeLessThan(messages.length)
    expect(mounted).toBeGreaterThan(CHAT_MESSAGE_VIRTUAL_MIN)
    expect(ms).toBeLessThan(12_000)
  })
})
