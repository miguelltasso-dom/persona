/**
 * CV-8 (CONVERSAS-SPEC §A): the card "Respostas da equipe de {x}" — what came back when ONE message went to the whole team (or to
 * whoever the Coordenação picked). One line per persona with the face, the name and the first 2 lines of the answer + "Ler tudo".
 *  - while lines are still arriving: "{k} de {n} responderam" (polite live region);
 *  - whoever has nothing to add is ONE collapsed line at the end ("e mais 4 sem nada a acrescentar"), never 10 answers repeating;
 *  - at its limit: "{persona} está no limite até {hora}" (no call was made); paused; failed: "{persona} não conseguiu responder agora."
 *    WITHOUT a retry button (the host has no retry yet — no shortcut is invented).
 * The host sends typed fields; the words are written here. Nothing here needs the thread's other machinery.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../../assets/generated-imports.ts'
import { Avatar, Card } from '../../primitives/index.ts'
import type { ChannelMessageUi } from '../../remote/map-host-ui.ts'
import { isBubblesEnabled } from '../bubbles-flag.ts'
import { fanoutText } from './fanout-rules.ts'
import { clockLabel, type FanoutBlockModel } from './fanout-block-model.ts'
import styles from './Fanout.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface FanoutBlockProps {
  readonly t: ChatT
  readonly block: FanoutBlockModel
  /** The team of the channel ("Marketing"); without it the title is just "Respostas da equipe". */
  readonly teamName?: string | undefined
  readonly rowTag?: 'li' | 'div'
}

/** A long answer shows 2 lines and "Ler tudo". */
function isLong(body: string): boolean {
  return body.length > 150 || body.split('\n').length > 2
}

function avatarOf(message: ChannelMessageUi): string | undefined {
  return AVATAR_96[message.authorId as keyof typeof AVATAR_96]
}

export function FanoutBlock({ t, block, teamName, rowTag = 'li' }: FanoutBlockProps): ReactNode {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [nothingOpen, setNothingOpen] = useState(false)
  const toggle = (id: string): void => {
    setOpen((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const replies = block.lines.filter(line => line.fanout?.kind === 'reply')
  const notes = block.lines.filter(line => line.fanout !== undefined && ['limit', 'paused', 'failed'].includes(line.fanout.kind))
  const nobody = block.lines.some(line => line.fanout?.nobody === true)
  const nothing = block.lines.filter(line => line.fanout?.kind === 'nothing' && line.fanout.nobody !== true)
  const arrived = block.lines.filter(line => line.streaming !== true).length
  const pending = arrived < block.total || block.lines.some(line => line.streaming === true)

  const title = teamName === undefined || teamName.trim() === ''
    ? fanoutText(t, 'fanout.blockTitleNoTeam', 'Respostas da equipe')
    : fanoutText(t, 'fanout.blockTitle', 'Respostas da equipe de {team}', { team: teamName })

  const noteText = (line: ChannelMessageUi): string => {
    const name = line.authorName
    if (line.fanout?.kind === 'limit') {
      const time = clockLabel(line.fanout.until)
      return time === ''
        ? fanoutText(t, 'fanout.limitNoTime', '{name} está no limite agora', { name })
        : fanoutText(t, 'fanout.limit', '{name} está no limite até {time}', { name, time })
    }
    if (line.fanout?.kind === 'paused') return fanoutText(t, 'fanout.paused', '{name} está em pausa', { name })
    return fanoutText(t, 'fanout.failed', '{name} não conseguiu responder agora.', { name })
  }

  const Wrapper = rowTag
  return (
    <Wrapper className={isBubblesEnabled() ? `${styles.row} ${styles.rowBubbles}` : styles.row} data-fanout-block={block.id}>
      <Card as="div" padding="s" titleAs="h3" title={title}>
        {pending && (
          <p className={styles.progress} role="status" aria-live="polite">
            {fanoutText(t, 'fanout.progress', '{done} de {count} responderam', { done: arrived, count: block.total })}
          </p>
        )}
        <ul className={styles.lines}>
          {replies.map((line) => {
            const expanded = open.has(line.id)
            const long = isLong(line.body)
            return (
              <li key={line.id} className={styles.reply} data-fanout-kind="reply">
                <Avatar name={line.authorName} src={avatarOf(line)} size={24} decorative />
                <div className={styles.replyBody}>
                  <p className={styles.name}>{line.authorName}</p>
                  <p className={expanded ? styles.textFull : styles.text}>{line.body}</p>
                  {long && (
                    <button type="button" className={styles.link} aria-expanded={expanded} onClick={() => { toggle(line.id) }}>
                      {expanded ? fanoutText(t, 'fanout.readLess', 'Ler menos') : fanoutText(t, 'fanout.readAll', 'Ler tudo')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {notes.map(line => (
            <li key={line.id} className={styles.note} data-fanout-kind={line.fanout?.kind} {...(line.fanout?.kind === 'failed' && line.fanout.message !== undefined ? { title: line.fanout.message } : {})}>
              <Avatar name={line.authorName} src={avatarOf(line)} size={24} decorative />
              <span>{noteText(line)}</span>
            </li>
          ))}
        </ul>
        {nobody && <p className={styles.nobody}>{fanoutText(t, 'fanout.nobody', 'Ninguém tem algo a acrescentar agora.')}</p>}
        {nothing.length > 0 && (
          <div className={styles.nothing}>
            <button type="button" className={styles.link} aria-expanded={nothingOpen} onClick={() => { setNothingOpen(value => !value) }}>
              {nothing.length === 1
                ? fanoutText(t, 'fanout.nothingMore.one', 'e mais 1 sem nada a acrescentar')
                : fanoutText(t, 'fanout.nothingMore', 'e mais {count} sem nada a acrescentar', { count: nothing.length })}
            </button>
            {nothingOpen && (
              <ul className={styles.lines}>
                {nothing.map(line => (
                  <li key={line.id} className={styles.note} data-fanout-kind="nothing">
                    <Avatar name={line.authorName} src={avatarOf(line)} size={24} decorative />
                    <span>{fanoutText(t, 'fanout.nothing', '{name}: nada a acrescentar', { name: line.authorName })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </Wrapper>
  )
}
