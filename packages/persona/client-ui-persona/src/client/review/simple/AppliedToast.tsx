/**
 * "Aplicado na pasta" + Desfazer, 6 s (SIMPLE-WORKSPACE-SPEC §4). The Desfazer button exists ONLY when the host gave a
 * way back (a restore point): no false Undo. Lives where the review was opened from, so it outlives the closed sheet.
 */

import { useEffect, type ReactNode } from 'react'
import { Button, Toast, ToastRegion } from '../../primitives/index.ts'
import type { LocaleDict } from '../../preview/locale-bind.ts'
import { bindLocale } from '../../preview/locale-bind.ts'
import { pt as defaultDict } from '../../locale/review/locales.ts'

export const APPLIED_TOAST_MS = 6000

export interface AppliedToastProps {
  readonly dict?: LocaleDict
  /** Present only when the host can undo this apply. */
  readonly onUndo?: (() => void) | undefined
  readonly onDismiss: () => void
  readonly durationMs?: number
}

export function AppliedToast({ dict = defaultDict, onUndo, onDismiss, durationMs = APPLIED_TOAST_MS }: AppliedToastProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => { clearTimeout(timer) }
  }, [onDismiss, durationMs])
  return (
    <ToastRegion label={t('apply.noticesLabel')}>
      <Toast
        tone="success"
        title={t('apply.done')}
        action={onUndo === undefined ? undefined : (
          <Button size="s" variant="ghost" onClick={() => { onUndo(); onDismiss() }}>{t('undo.action')}</Button>
        )}
      />
    </ToastRegion>
  )
}
