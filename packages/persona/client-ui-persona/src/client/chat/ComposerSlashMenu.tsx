import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandIcon } from '../primitives/index.ts'
import type { ComposerSlashCommand } from './composer-slash-commands.ts'
import styles from './ChannelComposer.module.css'

export function ComposerSlashMenu({
  t,
  items,
  activeIndex,
  onPick,
}: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly items: readonly ComposerSlashCommand[]
  readonly activeIndex: number
  readonly onPick: (command: ComposerSlashCommand) => void
}): ReactNode {
  if (items.length === 0) return null
  return (
    <ul className={styles.slashMenu} role="listbox" aria-label={t('composer.slashMenu')}>
      {items.map((row, index) => (
        <li key={row.id} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={styles.slashItem}
            onMouseDown={(event) => { event.preventDefault() }}
            onClick={() => { onPick(row) }}
          >
            <BrandIcon name={row.icon} size={18} />
            <span>{t(`composer.slash.${row.id}`)}</span>
            <span className={styles.slashHint}>{row.prefix}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
