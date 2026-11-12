/**
 * Harvest 19b — the company inbox rule. One component, two surfaces: the Connections card (full form) and the routine
 * editor (the human phrase, with the form behind “Editar regra”). The filter runs at the origin, before any model.
 */

import { useId, useState, type ReactNode } from 'react'
import type { EmailFilterView, EmailPresetView } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Card, Input } from '../primitives/index.ts'
import { Select } from '../primitives/Select.tsx'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import { pt as defaultDict } from '../locale/email-rule/locales.ts'
import styles from './EmailRule.module.css'

export interface EmailRuleFormProps {
  readonly dict?: LocaleDict
  readonly presets: readonly EmailPresetView[]
  readonly filter: EmailFilterView
  /** Save the rule; reject to show “Não consegui salvar a regra”. */
  readonly onSave: (filter: EmailFilterView) => Promise<void>
  /** `phrase` (routine editor) starts with the human sentence and hides the fields behind “Editar regra”. */
  readonly variant?: 'full' | 'phrase'
}

/**
 * Inbox rule card. Empty lists mean any message; bulk mail is skipped by default.
 * @param props - Locale, presets, the stored rule, the save port and the surface.
 */
export function EmailRuleForm({
  dict = defaultDict,
  presets,
  filter,
  onSave,
  variant = 'full',
}: EmailRuleFormProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [to, setTo] = useState(filter.to.join(', '))
  const [from, setFrom] = useState(filter.from.join(', '))
  const [subject, setSubject] = useState(filter.subject.join(', '))
  const [preset, setPreset] = useState(filter.preset ?? '')
  const [skipBulk, setSkipBulk] = useState(filter.skipBulk)
  const [editing, setEditing] = useState(variant === 'full')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null)
  const presetId = useId()
  const selected = presets.find(item => item.id === preset)
  const toList = splitList(to)
  const subjectList = splitList(subject)
  const phrase = toList.length === 0 && subjectList.length === 0
    ? t('trigger.any')
    : t('trigger.phrase', {
      to: toList.length === 0 ? t('any') : toList.join(', '),
      subject: subjectList.length === 0 ? t('any') : subjectList.join(', '),
    })

  const cancel = (): void => {
    setTo(filter.to.join(', '))
    setFrom(filter.from.join(', '))
    setSubject(filter.subject.join(', '))
    setPreset(filter.preset ?? '')
    setSkipBulk(filter.skipBulk)
    setNote(null)
    setEditing(false)
  }

  const save = async (): Promise<void> => {
    setBusy(true)
    setNote(null)
    try {
      await onSave({
        to: toList,
        from: splitList(from),
        subject: subjectList,
        skipBulk,
        ...(preset === '' ? {} : { preset }),
      })
      setNote({ tone: 'ok', text: t('saved') })
      if (variant === 'phrase') setEditing(false)
    } catch {
      setNote({ tone: 'error', text: t('failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      padding="m"
      as="section"
      title={t('title')}
      className={styles.card}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        const target = event.target
        if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type !== 'checkbox')) event.preventDefault()
      }}
    >
      <p className={styles.hint}>{t('hint')}</p>
      {variant === 'phrase' && !editing && (
        <div className={styles.phraseRow}>
          <div>
            <p className={styles.phrase}>{phrase}</p>
            <p className={styles.hint}>{t('trigger.hint')}</p>
          </div>
          <Button size="s" variant="secondary" onClick={() => { setEditing(true) }}>{t('edit')}</Button>
        </div>
      )}
      {editing && (
        <div className={styles.form}>
          <div className={styles.row}>
            <label htmlFor={presetId} className={styles.label}>{t('preset.label')}</label>
            <Select
              id={presetId}
              value={preset}
              onChange={(event) => { setPreset(event.target.value) }}
            >
              <option value="">{t('preset.choose')}</option>
              {presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
            {selected !== undefined && (
              <p className={styles.hint}>{t('preset.server', { host: selected.host, port: selected.port })}</p>
            )}
          </div>
          <Input label={t('to.label')} hint={t('to.hint')} value={to} onChange={(event) => { setTo(event.target.value) }} />
          <Input label={t('from.label')} hint={t('from.hint')} value={from} onChange={(event) => { setFrom(event.target.value) }} />
          <Input label={t('subject.label')} hint={t('subject.hint')} value={subject} onChange={(event) => { setSubject(event.target.value) }} />
          <label className={styles.check}>
            <input type="checkbox" checked={skipBulk} onChange={(event) => { setSkipBulk(event.target.checked) }} />
            {t('skipBulk')}
          </label>
          <div className={styles.actions}>
            <Button size="s" variant="primary" loading={busy} onClick={() => { void save() }}>{t('save')}</Button>
            {variant === 'phrase' && (
              <Button size="s" variant="ghost" onClick={cancel}>{t('cancel')}</Button>
            )}
          </div>
        </div>
      )}
      {note !== null && (
        <p className={note.tone === 'ok' ? styles.ok : styles.error} aria-live="polite">{note.text}</p>
      )}
    </Card>
  )
}

function splitList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(item => item !== '')
}
