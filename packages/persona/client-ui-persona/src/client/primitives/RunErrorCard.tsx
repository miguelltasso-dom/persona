/**
 * RunErrorCard (Muse, design/RUN-ERRORS-SPEC.md): a persona tells you, in the conversation, why it could not
 * work: what happened, what to do (with the command to copy when needed) and one useful action.
 * Presentational: strings come from `runErrorText(describeRunError(payload), t)`.
 */

import { useState, type ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { Button } from './Button.tsx'
import { UiIcon } from './icons.tsx'
import styles from './RunErrorCard.module.css'

export interface RunErrorCardProps {
  readonly tone: 'warning' | 'danger'
  readonly persona: { readonly name: string; readonly avatarSrc?: string | undefined }
  readonly title: string
  readonly body: string
  readonly primary: { readonly label: string; readonly onClick: () => void }
  readonly secondary?: { readonly label: string; readonly onClick: () => void } | undefined
  readonly command?: string | undefined
  readonly labels: { readonly copy: string; readonly copied: string; readonly commandLabel: string }
}

export function RunErrorCard({ tone, persona, title, body, primary, secondary, command, labels }: RunErrorCardProps): ReactNode {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    if (command === undefined) return
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1800)
    }, () => {})
  }
  return (
    <section className={styles.card} data-tone={tone} role="status" aria-label={`${persona.name}: ${title}`}>
      <div className={styles.who}>
        <Avatar name={persona.name} src={persona.avatarSrc} size={40} shape="portrait" decorative />
        <span className={styles.badge} aria-hidden="true"><UiIcon name="alert" size={14} strokeWidth={2.4} /></span>
      </div>
      <div className={styles.text}>
        <p className={styles.name}>{persona.name}</p>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{body}</p>
        {command !== undefined && (
          <div className={styles.command}>
            <code aria-label={labels.commandLabel}>{command}</code>
            <Button size="s" variant="ghost" icon={<UiIcon name={copied ? 'check' : 'copy'} size={16} strokeWidth={2.2} />} onClick={copy}>
              {copied ? labels.copied : labels.copy}
            </Button>
          </div>
        )}
        <div className={styles.actions}>
          <Button size="s" variant="primary" onClick={primary.onClick}>{primary.label}</Button>
          {secondary !== undefined && <Button size="s" variant="ghost" onClick={secondary.onClick}>{secondary.label}</Button>}
        </div>
      </div>
    </section>
  )
}
