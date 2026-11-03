/** Marco F — import wizard (preview). */
import { useState, type ReactNode } from 'react'
import { Button, Card, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './ImportWizard.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { pt as defaultDict } from '../locale/importers/locales.ts'

export type ImportersSurfaceState = 'loading' | 'error' | 'empty' | 'ready'
type ImportStep = 'file' | 'map' | 'preview' | 'privacy' | 'confirm' | 'progress'

const STEP_ORDER: readonly ImportStep[] = ['file', 'map', 'preview', 'privacy', 'confirm', 'progress']

export interface ImportWizardProps {
  readonly dict?: LocaleDict
  readonly initialState?: ImportersSurfaceState
}

export function ImportWizard({ dict = defaultDict, initialState = 'ready' }: ImportWizardProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [step, setStep] = useState<ImportStep>('file')
  const [importing, setImporting] = useState(false)

  const header = (
    <ScreenHeader
      icon="arquivos"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen width="reading" className={styles.shell} data-persona-surface="importers">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
      </Screen>
    )
  }
  if (initialState === 'empty') {
    return (
      <Screen width="reading" className={styles.shell} data-persona-surface="importers">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-vault"
          titleKey="empty.title"
          hintKey="empty.hint"
          primaryKey="empty.action"
          onPrimary={() => { setStep('file') }}
        />
      </Screen>
    )
  }

  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <Screen width="reading" className={styles.shell} data-persona-surface="importers">
      {header}
      <Card padding="l" className={styles.stepCard}>
        <p className={styles.stepLabel}>{t(`step.${step}`)}</p>
        {step === 'file' && <Button variant="primary">{t('action.chooseFile')}</Button>}
        {step === 'progress' && (
          <p role="status">{importing ? t('progress.running') : t('progress.done')}</p>
        )}
        <div className={styles.actions}>
          {stepIndex > 0 && (
            <Button variant="secondary" onClick={() => { setStep(STEP_ORDER[stepIndex - 1] ?? step) }}>
              {t('action.back')}
            </Button>
          )}
          {step !== 'progress' && step !== 'confirm' && (
            <Button variant="primary" onClick={() => { setStep(STEP_ORDER[stepIndex + 1] ?? step) }}>
              {t('action.next')}
            </Button>
          )}
          {step === 'confirm' && (
            <Button variant="primary" onClick={() => { setImporting(true); setStep('progress') }}>
              {t('action.confirmImport')}
            </Button>
          )}
          {step === 'progress' && !importing && (
            <Button variant="secondary">{t('action.rollback')}</Button>
          )}
        </div>
      </Card>
    </Screen>
  )
}
