import { useEffect, useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Modal } from '../primitives/index.ts'
import styles from './GestorPlanAdjustModal.module.css'

export interface GestorPlanAdjustModalProps {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly open: boolean
  readonly gestorName: string
  onClose(): void
  onSubmit(comment: string): void
}

export function GestorPlanAdjustModal({
  t,
  open,
  gestorName,
  onClose,
  onSubmit,
}: GestorPlanAdjustModalProps): ReactNode {
  const fieldId = useId()
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!open) setComment('')
  }, [open])

  const trimmed = comment.trim()
  const canSubmit = trimmed.length > 0

  return (
    <Modal
      open={open}
      size="m"
      title={t('gestorPlan.adjustModalTitle', { name: gestorName })}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('gestorPlan.adjustModalCancel')}</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              onSubmit(trimmed)
              onClose()
            }}
          >
            {t('gestorPlan.adjustModalSubmit')}
          </Button>
        </>
      )}
    >
      <p className={styles.lead}>{t('gestorPlan.adjustModalLead')}</p>
      <label className={styles.field} htmlFor={fieldId}>
        <span className={styles.label}>{t('gestorPlan.adjustModalLabel')}</span>
        <textarea
          id={fieldId}
          className={styles.input}
          rows={4}
          value={comment}
          onChange={(e) => { setComment(e.target.value) }}
          placeholder={t('gestorPlan.adjustModalPlaceholder')}
        />
      </label>
    </Modal>
  )
}
