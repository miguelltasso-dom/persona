/** Optional graph (SECOND-BRAIN-SPEC §4) — static layout, list escape hatch. */

import type { BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { BrandIcon, Button } from '../primitives/index.ts'
import { brainKindBrandIcon } from './brain-ui-adapters.ts'
import { pt as defaultDict } from '../locale/second-brain/locales.ts'
import styles from './SecondBrain.module.css'

export interface SecondBrainGraphViewProps {
  readonly dict?: LocaleDict
  readonly pages: readonly BrainPageView[]
  readonly onOpenPage: (pageId: string) => void
  readonly onShowList: () => void
}

export function SecondBrainGraphView({
  dict = defaultDict,
  pages,
  onOpenPage,
  onShowList,
}: SecondBrainGraphViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <div className={styles.graphShell} aria-label={t('graph.label')}>
      <div className={styles.graphToolbar}>
        <Button size="s" variant="secondary" onClick={onShowList}>{t('graph.showList')}</Button>
      </div>
      <ul className={styles.graphNodes}>
        {pages.map(page => (
          <li key={page.id}>
            <button type="button" className={styles.graphNode} onClick={() => { onOpenPage(page.id) }}>
              <span className={styles.graphSeal} aria-hidden="true">
                <BrandIcon name={brainKindBrandIcon(page.kind)} size={18} />
              </span>
              <span className={styles.graphLabel}>{page.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
