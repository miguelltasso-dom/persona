/**
 * "Nova rotina" / "Editar rotina" (IV-9, UX-BEYOND §IV-9): O que fazer · Quando (cards) · Quem faz (faces) · Em que
 * projeto · the summary in plain words. The person never sees an rrule: the choice is turned into one on save, and a rule
 * that is not one of ours is kept as it is ("Horário personalizado").
 */

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar, BrandIcon, Button, ChoiceCards, Input, Modal, UiIcon, type ChoiceCardOption } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './RoutineEditor.module.css'
import {
  DEFAULT_WHEN,
  PRESET_TIME,
  daysOf,
  describeWhen,
  isValidTime,
  normalizeWhen,
  rruleFromWhen,
  whenIsComplete,
  type RoutineWhen,
  type WhenChoice,
} from './routine-schedule.ts'

export interface EditorPersona {
  readonly id: string
  readonly name: string
  readonly avatarSrc?: string | undefined
}

export interface EditorProject {
  readonly id: string
  readonly name: string
}

/** What the editor opens with (a new routine, or one being edited). */
export interface RoutineDraft {
  readonly id?: string | undefined
  readonly prompt: string
  /** The friendly schedule; `undefined` = a stored rule this editor does not write (kept as `keepRrule`). */
  readonly when: RoutineWhen | undefined
  readonly keepRrule?: string | undefined
  readonly ownerPersonaId?: string | undefined
  readonly projectId: string
  readonly paused?: boolean | undefined
}

/** What the editor hands back on Salvar: everything the host needs, the rule already written. */
export interface RoutineSaved {
  readonly id?: string | undefined
  readonly prompt: string
  readonly rrule: string
  readonly ownerPersonaId?: string | undefined
  readonly projectId: string
}

export interface RoutineEditorModalProps {
  readonly dict: LocaleDict
  readonly open: boolean
  readonly mode: 'create' | 'edit'
  readonly initial: RoutineDraft
  readonly personas: readonly EditorPersona[]
  readonly projects: readonly EditorProject[]
  readonly onSave: (saved: RoutineSaved) => Promise<void>
  /** Edit only. No handler, no button. */
  readonly onTogglePause?: ((paused: boolean) => Promise<void>) | undefined
  readonly onDelete?: (() => Promise<void>) | undefined
  /** A routine the team keeps for each persona: it can be paused, never deleted, and the modal says so (no Apagar at all). */
  readonly isTeamRoutine?: boolean | undefined
  /** Harvest 19b: the inbox rule section (built by the panel; absent = no section). */
  readonly emailRule?: ReactNode | undefined
  readonly onClose: () => void
}

const CHOICES: readonly WhenChoice[] = ['daily', 'weekdays', 'weekly', 'custom']
const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

export function RoutineEditorModal({ dict, open, mode, initial, personas, projects, onSave, onTogglePause, onDelete, isTeamRoutine = false, emailRule, onClose }: RoutineEditorModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const nameId = useId()
  const initialWhen = initial.when ?? (initial.keepRrule === undefined ? DEFAULT_WHEN : undefined)
  const [prompt, setPrompt] = useState(initial.prompt)
  const [choice, setChoice] = useState<WhenChoice>(initialWhen?.choice ?? 'custom')
  const [days, setDays] = useState<readonly number[]>(initialWhen === undefined ? [] : daysOf(initialWhen))
  const [time, setTime] = useState(initialWhen?.time ?? PRESET_TIME)
  const [owner, setOwner] = useState<string | undefined>(initial.ownerPersonaId)
  const [projectId, setProjectId] = useState(initial.projectId)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [paused, setPaused] = useState(initial.paused === true)
  // A rule this editor does not write stays exactly as stored: the schedule part is shown, not edited.
  const keepsStoredRule = initialWhen === undefined

  const when: RoutineWhen | undefined = keepsStoredRule
    ? undefined
    : choice === 'custom' ? { choice, time, days } : normalizeWhen(daysOf({ choice, time: PRESET_TIME, days: [] }), PRESET_TIME)
  const complete = keepsStoredRule || (when !== undefined && whenIsComplete(when))
  const promptOk = prompt.trim().length > 0
  const valid = promptOk && complete
  const ownerName = personas.find(persona => persona.id === owner)?.name
  const whenText = keepsStoredRule ? t('list.custom') : when !== undefined && whenIsComplete(when) ? describeWhen(t, when) : ''
  const summary = !promptOk
    ? t('editor.summary.empty')
    : whenText === ''
      ? ''
      : ownerName === undefined
        ? t('editor.summary.coordination', { when: whenText, request: prompt.trim() })
        : t('editor.summary.with', { when: whenText, persona: ownerName, request: prompt.trim() })

  const choiceOptions: readonly ChoiceCardOption<WhenChoice>[] = CHOICES.map(id => ({
    id,
    title: t(`editor.when.${id}.title`),
    body: t(`editor.when.${id}.body`),
  }))

  const pickChoice = (next: WhenChoice): void => {
    // Going to "Escolher…" starts from what the preset meant, so nothing is lost.
    if (next === 'custom' && choice !== 'custom') setDays(daysOf({ choice, time, days }))
    setChoice(next)
  }

  const toggleDay = (day: number): void => {
    setDays(current => (current.includes(day) ? current.filter(value => value !== day) : [...current, day]))
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!valid || busy) return
    const rrule = keepsStoredRule ? (initial.keepRrule ?? '') : rruleFromWhen(when ?? DEFAULT_WHEN)
    setBusy(true)
    setFailed(false)
    void onSave({ id: initial.id, prompt: prompt.trim(), rrule, ownerPersonaId: owner, projectId })
      .then(() => { onClose() })
      .catch(() => { setFailed(true) })
      .finally(() => { setBusy(false) })
  }

  const run = (action: () => Promise<void>, then: () => void): void => {
    setBusy(true)
    setFailed(false)
    void action().then(then).catch(() => { setFailed(true) }).finally(() => { setBusy(false) })
  }

  const footer = confirmingDelete && onDelete !== undefined
    ? (
      <div className={styles.footer}>
        <span className={styles.note}>{t('editor.delete.body')}</span>
        <div className={styles.footerEnd}>
          <Button variant="ghost" disabled={busy} onClick={() => { setConfirmingDelete(false) }}>{t('editor.delete.back')}</Button>
          <Button variant="danger" loading={busy} onClick={() => { run(onDelete, onClose) }}>{t('editor.delete.yes')}</Button>
        </div>
      </div>
    )
    : (
      <div className={styles.footer}>
        {mode === 'edit' && (
          <div className={styles.row}>
            {onTogglePause !== undefined && (
              <Button variant="ghost" disabled={busy} onClick={() => { run(() => onTogglePause(!paused), () => { setPaused(value => !value) }) }}>
                {paused ? t('editor.resume') : t('editor.pause')}
              </Button>
            )}
            {onDelete !== undefined && (
              <Button variant="ghost" disabled={busy} onClick={() => { setConfirmingDelete(true) }}>{t('editor.delete')}</Button>
            )}
          </div>
        )}
        <div className={styles.footerEnd}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>{t('editor.cancel')}</Button>
          <Button variant="primary" type="submit" form={`${nameId}-form`} loading={busy} disabled={!valid}>{t('editor.save')}</Button>
        </div>
      </div>
    )

  return (
    <Modal
      open={open}
      size="m"
      title={mode === 'create' ? t('editor.titleNew') : t('editor.titleEdit')}
      closeLabel={t('editor.close')}
      onClose={onClose}
      footer={footer}
    >
      <form id={`${nameId}-form`} className={styles.form} onSubmit={submit} noValidate>
        {confirmingDelete && <p className={styles.summary} role="alert">{t('editor.delete.title')}</p>}
        {isTeamRoutine && <p className={styles.note}>{t('editor.systemNote')}</p>}
        <Input
          label={t('editor.what')}
          value={prompt}
          autoFocus
          onChange={(event) => { setPrompt(event.target.value) }}
          {...(promptOk ? { hint: t('editor.whatHint') } : { hint: t('editor.needPrompt') })}
        />

        {keepsStoredRule
          ? (
            <>
              <p className={styles.note}>{t('editor.customReadOnly')}</p>
              {emailRule}
            </>
          )
          : (
            <>
              <ChoiceCards legend={t('editor.whenLegend')} name={`${nameId}-when`} options={choiceOptions} value={choice} onChange={pickChoice} />
              {choice === 'custom' && (
                <>
                  <fieldset className={styles.group}>
                    <legend className={styles.legend}>{t('editor.days')}</legend>
                    <div className={styles.row}>
                      {WEEK_ORDER.map((day) => {
                        const pressed = days.includes(day)
                        return (
                          <button key={day} type="button" className={styles.toggle} aria-pressed={pressed} aria-label={t(`day.${String(day)}`)} onClick={() => { toggleDay(day) }}>
                            <span className={styles.toggleMark} aria-hidden="true">{pressed ? <UiIcon name="check" size={14} strokeWidth={2.6} /> : null}</span>
                            {t(`dayShort.${String(day)}`)}
                          </button>
                        )
                      })}
                    </div>
                    {days.length === 0 && <p className={styles.note}>{t('editor.needDay')}</p>}
                  </fieldset>
                  <div className={styles.timeField}>
                    <Input
                      label={t('editor.time')}
                      type="time"
                      value={time}
                      onChange={(event) => { setTime(event.target.value) }}
                      {...(isValidTime(time) ? {} : { error: t('editor.needTime') })}
                    />
                  </div>
                </>
              )}
              {/* Muse (12/11): the e-mail trigger belongs to "Quando", not above it. */}
              {emailRule}
            </>
          )}

        {personas.length > 0 && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{t('editor.who')}</legend>
            <div className={styles.people} role="radiogroup" aria-label={t('editor.who')}>
              <button type="button" role="radio" aria-checked={owner === undefined} className={styles.person} onClick={() => { setOwner(undefined) }}>
                <BrandIcon name="equipe" size={40} />
                <span className={styles.personName}>{t('editor.whoCoordination')}</span>
              </button>
              {personas.map(persona => (
                <button key={persona.id} type="button" role="radio" aria-checked={owner === persona.id} className={styles.person} onClick={() => { setOwner(persona.id) }}>
                  <Avatar name={persona.name} size={40} shape="portrait" decorative {...(persona.avatarSrc === undefined ? {} : { src: persona.avatarSrc })} />
                  <span className={styles.personName}>{persona.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {projects.length > 1 && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{t('editor.project')}</legend>
            <div className={styles.row} role="radiogroup" aria-label={t('editor.project')}>
              {projects.map(project => (
                <button key={project.id} type="button" role="radio" aria-checked={projectId === project.id} className={styles.toggle} onClick={() => { setProjectId(project.id) }}>
                  <span className={styles.toggleMark} aria-hidden="true">{projectId === project.id ? <UiIcon name="check" size={14} strokeWidth={2.6} /> : null}</span>
                  {project.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className={styles.group}>
          <span className={styles.legend}>{t('editor.summary')}</span>
          <p className={styles.summary} role="status">{summary}</p>
        </div>
        {failed && <p className={styles.error} role="alert">{t('editor.failed')}</p>}
      </form>
    </Modal>
  )
}
