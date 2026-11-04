import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '../primitives/index.ts'
import styles from './GeneralChannelView.module.css'

export interface MessageQuote {
  readonly messageId: string
  readonly excerpt: string
  readonly comment: string
}

/** Floating "Citar" over a text selection in the message stream (T3-UX-HARVEST §5). */
export function MessageQuoteToolbar({
  t,
  containerRef,
  onQuote,
}: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly containerRef: React.RefObject<HTMLElement | null>
  readonly onQuote: (quote: Omit<MessageQuote, 'comment'>) => void
}): ReactNode {
  const [pos, setPos] = useState<{ top: number; left: number; messageId: string; excerpt: string } | null>(null)

  useEffect(() => {
    const root = containerRef.current
    if (root === null) return undefined
    const onSelectionChange = (): void => {
      const selection = document.getSelection()
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
        setPos(null)
        return
      }
      const range = selection.getRangeAt(0)
      const message = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer.closest<HTMLElement>('li[data-author]')
        : range.commonAncestorContainer.parentElement?.closest<HTMLElement>('li[data-author]')
      if (message === null || message === undefined || !root.contains(message)) {
        setPos(null)
        return
      }
      const text = selection.toString().trim()
      if (text.length === 0) {
        setPos(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const host = root.getBoundingClientRect()
      setPos({
        top: rect.top - host.top - 36,
        left: rect.left - host.left,
        messageId: message.dataset.messageId ?? '',
        excerpt: text.slice(0, 400),
      })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => { document.removeEventListener('selectionchange', onSelectionChange) }
  }, [containerRef])

  if (pos === null || pos.messageId.length === 0) return null
  return (
    <div className={styles.quoteToolbar} style={{ top: pos.top, left: pos.left }} role="toolbar" aria-label={t('composer.quoteToolbar')}>
      <Button
        size="s"
        variant="primary"
        onClick={() => {
          onQuote({ messageId: pos.messageId, excerpt: pos.excerpt })
          document.getSelection()?.removeAllRanges()
          setPos(null)
        }}
      >
        {t('composer.quoteAction')}
      </Button>
    </div>
  )
}
