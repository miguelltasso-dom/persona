/** Marco F — import wizard (preview). */
import { useState, type ReactNode } from 'react'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
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

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
  if (initialState === 'empty') {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
        primaryKey="empty.action"
        onPrimary={() => { setStep('file') }}
      />
    )
  }

  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className={page.shell} data-persona-surface="importers">
      <header>
        <h1 className={page.title}>{t('title')}</h1>
        <p className={page.subtitle}>{t('subtitle')}</p>
      </header>
      <p className={page.meta}>{t(`step.${step}`)}</p>
      {step === 'file' && <PersonaButton>{t('action.chooseFile')}</PersonaButton>}
      {step === 'progress' && (
        <p role="status">{importing ? t('progress.running') : t('progress.done')}</p>
      )}
      <div className={page.actions}>
        {stepIndex > 0 && (
          <PersonaButton variant="secondary" onClick={() => { setStep(STEP_ORDER[stepIndex - 1] ?? step) }}>
            {t('action.back')}
          </PersonaButton>
        )}
        {step !== 'progress' && step !== 'confirm' && (
          <PersonaButton onClick={() => { setStep(STEP_ORDER[stepIndex + 1] ?? step) }}>
            {t('action.next')}
          </PersonaButton>
        )}
        {step === 'confirm' && (
          <PersonaButton onClick={() => { setImporting(true); setStep('progress') }}>
            {t('action.confirmImport')}
          </PersonaButton>
        )}
        {step === 'progress' && !importing && (
          <PersonaButton variant="secondary">{t('action.rollback')}</PersonaButton>
        )}
      </div>
    </div>
  )
}
