import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { ActivityGroupProps } from '../primitives/Pooled.tsx'

/** T3 §9 + GES-5 — governance locale → ActivityGroup labels. */
export function activityGroupLabelsFromDict(dict: LocaleDict): ActivityGroupProps['labels'] {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return {
    phrase: {
      command: n => t('activity.command', { count: n }),
      file: n => t('activity.file', { count: n }),
      hire: n => t('activity.hire', { count: n }),
      message: n => t('activity.message', { count: n }),
      read: n => t('activity.read', { count: n }),
      check: n => t('activity.check', { count: n }),
    },
    more: n => t('activity.more', { count: n }),
    failed: n => t('activity.failed', { count: n }),
    running: t('activity.running'),
    status: {
      done: t('activity.status.done'),
      failed: t('activity.status.failed'),
      running: t('activity.status.running'),
      waiting: t('activity.status.waiting'),
    },
    open: t('activity.open'),
    expand: t('activity.expand'),
    collapse: t('activity.collapse'),
  }
}
