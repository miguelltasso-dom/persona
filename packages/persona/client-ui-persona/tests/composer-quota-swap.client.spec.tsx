// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt } from '../src/client/locale/chat/locales.ts'

const t = ((key: string, params?: Readonly<Record<string, string | number>>): string =>
  bindLocale(pt, key, params)) as TranslateNS<'persona.chat'>

afterEach(() => { cleanup() })

describe('ChannelComposer quota blocked (T3 §12)', () => {
  it('shows Retomar and Trocar de conta when draft is empty', () => {
    const onResume = vi.fn()
    const onSwap = vi.fn()
    render(
      <ChannelComposer
        t={t}
        members={[]}
        quotaBlocked
        onResumeQuota={onResume}
        onSwapAccount={onSwap}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['composer.resumeQuota'] }))
    fireEvent.click(screen.getByRole('button', { name: pt['composer.swapAccount'] }))
    expect(onResume).toHaveBeenCalledOnce()
    expect(onSwap).toHaveBeenCalledOnce()
  })
})
