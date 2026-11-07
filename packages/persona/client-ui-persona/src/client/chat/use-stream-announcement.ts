/**
 * FL-11 / IV-5 (Muse 19:10): a resposta que cresce NÃO é lida a cada pedaço. Para o leitor de tela: UMA vez no início, "{persona} está
 * escrevendo…", e UMA no fim, "{persona} respondeu." (quem parou é dito por "{persona} parou."). Só diz o que viu acontecer: uma resposta que
 * já chegou pronta não anuncia nada.
 */
import { useEffect, useRef, useState } from 'react'

interface StreamAnnounceMessage {
  readonly id: string
  readonly authorName: string
  readonly streaming?: true | undefined
  readonly stopped?: true | undefined
}

export function useStreamAnnouncement(
  messages: readonly StreamAnnounceMessage[],
  t: (key: 'stream.writing' | 'stream.doneAnnounce', params: { readonly name: string }) => string,
): string {
  const [text, setText] = useState('')
  const writing = useRef<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    const now = new Map<string, string>()
    for (const message of messages) if (message.streaming === true) now.set(message.id, message.authorName)
    let next: string | null = null
    for (const [id, name] of now) if (!writing.current.has(id)) next = t('stream.writing', { name })
    for (const [id, name] of writing.current) {
      if (now.has(id)) continue
      const settled = messages.find(message => message.id === id)
      if (settled !== undefined && settled.stopped !== true) next = t('stream.doneAnnounce', { name })
    }
    writing.current = now
    if (next !== null) setText(next)
  }, [messages, t])
  return text
}
