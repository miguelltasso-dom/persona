/**
 * "Nova rotina" / "Editar rotina" (IV-9, UX-BEYOND §IV-9): O que fazer · Quando (cards) · Quem faz (faces) · Em que
 * projeto · the summary in plain words. The person never sees an rrule: the choice is turned into one on save, and a rule
 * that is not one of ours is kept as it is ("Horário personalizado").
 */

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar, BrandIcon, Button, ChoiceCards, Input, Modal, UiIcon, type ChoiceCardOption } from '../primitives/index.ts'
import { Select } from '../primitives/Select.tsx'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './RoutineEditor.module.css'
import {
  EMPTY_FILTER_TEXT,
  eventLabelKey,
  eventWhenKey,
  fieldsOf,
  filterSentence,
  stripOf,
  textOfFilter,
  wireOfFilter,
  type EventFilterText,
  type EventSourceId,
  type RoutineEventWire,
} from './routine-trigger.ts'
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
  /** Item 26: the routine starts by an event (then `when`/`keepRrule` are absent). */
  readonly trigger?: RoutineEventWire | undefined
}

/** What the editor hands back on Salvar: everything the host needs, the rule already written. */
export interface RoutineSaved {
  readonly id?: string | undefined
  readonly prompt: string
  /** `''` for a routine that starts by an event (it has no time). */
  readonly rrule: string
  readonly ownerPersonaId?: string | undefined
  readonly projectId: string
  /** Item 26: the event the routine waits for; absent = the clock (`rrule`). */
  readonly trigger?: RoutineEventWire | undefined
}

/** One event the editor can offer ("Chegar um e-mail"), and whether its connector is on (a routine only listens to what the person connected). */
export interface EventOption {
  readonly source: EventSourceId
  readonly connected: boolean
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
  /**
   * Item 26: the events the routine can wait for. Absent or empty = the clock only (an older host: no segmented control, nothing else changes).
   * The loose "E-mail da empresa" card is NOT here any more (Muse 12/11): the account lives in Conexões, the rule of THIS routine is the strip below.
   */
  readonly eventOptions?: readonly EventOption[] | undefined
  /** Item 26 (Muse 04:16): the "Abrir Conexões" button next to the "Não ligado" note, so nobody has to find the way. No handler, no button. */
  readonly onOpenConnections?: (() => void) | undefined
  readonly onClose: () => void
}

const CHOICES: readonly WhenChoice[] = ['daily', 'weekdays', 'weekly', 'custom']
const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

export function RoutineEditorModal({ dict, open, mode, initial, personas, projects, onSave, onTogglePause, onDelete, isTeamRoutine = false, eventOptions, onOpenConnections, onClose }: RoutineEditorModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const nameId = useId()
  const sourceId = useId()
  // Item 26: "Quando" is ONE exclusive choice, a clock or an event — never both on screen (Muse 12/11). Without events the clock stays as it was.
  const events = eventOptions ?? []
  const hasEvents = events.length > 0
  const firstSource = events.find(option => option.connected)?.source ?? events[0]?.source ?? 'email'
  const [kind, setKind] = useState<'time' | 'event'>(hasEvents && initial.trigger !== undefined ? 'event' : 'time')
  const [source, setSource] = useState<EventSourceId>(initial.trigger?.source ?? firstSource)
  const [filterText, setFilterText] = useState<EventFilterText>(initial.trigger === undefined ? EMPTY_FILTER_TEXT : textOfFilter(initial.trigger.filter))
  const [editingRule, setEditingRule] = useState(false)
  const sourceConnected = events.find(option => option.source === source)?.connected === true
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
  const isEvent = hasEvents && kind === 'event'

  const when: RoutineWhen | undefined = keepsStoredRule
    ? undefined
    : choice === 'custom' ? { choice, time, days } : normalizeWhen(daysOf({ choice, time: PRESET_TIME, days: [] }), PRESET_TIME)
  const complete = isEvent ? sourceConnected : keepsStoredRule || (when !== undefined && whenIsComplete(when))
  const promptOk = prompt.trim().length > 0
  const valid = promptOk && complete
  const ownerName = personas.find(persona => persona.id === owner)?.name
  const eventText = isEvent ? `${t(eventWhenKey(source))}${filterSentence(t, source, filterText)}` : ''
  const whenText = isEvent ? eventText : keepsStoredRule ? t('list.custom') : when !== undefined && whenIsComplete(when) ? describeWhen(t, when) : ''
  const summary = !promptOk
    ? t('editor.summary.empty')
    : whenText === ''
      ? ''
      : isEvent
        ? t(ownerName === undefined ? 'editor.summary.eventCoordination' : 'editor.summary.event', {
          event: t(eventWhenKey(source)), filter: filterSentence(t, source, filterText), persona: ownerName ?? '', request: prompt.trim(),
        })
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

  const pickKind = (next: 'time' | 'event'): void => {
    setKind(next)
    setEditingRule(false)
  }

  const toggleDay = (day: number): void => {
    setDays(current => (current.includes(day) ? current.filter(value => value !== day) : [...current, day]))
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!valid || busy) return
    // An event has no time ('' rule); a clock keeps its rule. The trigger travels ONLY when it is an event: absent means "the clock".
    const rrule = isEvent ? '' : keepsStoredRule ? (initial.keepRrule ?? '') : rruleFromWhen(when ?? DEFAULT_WHEN)
    const trigger: RoutineEventWire | undefined = isEvent ? { kind: 'event', source, filter: wireOfFilter(source, filterText) } : undefined
    setBusy(true)
    setFailed(false)
    void onSave({ id: initial.id, prompt: prompt.trim(), rrule, ownerPersonaId: owner, projectId, ...(trigger === undefined ? {} : { trigger }) })
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

        {hasEvents && (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{t('editor.whenLegend')}</legend>
            <div
              className={styles.segmented}
              role="radiogroup"
              aria-label={t('editor.whenLegend')}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                pickKind(kind === 'time' ? 'event' : 'time')
              }}
            >
              {(['time', 'event'] as const).map(id => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={kind === id}
                  tabIndex={kind === id ? 0 : -1}
                  className={styles.segment}
                  onClick={() => { pickKind(id) }}
                >
                  <span className={styles.segmentMark} aria-hidden="true">{kind === id ? <UiIcon name="check" size={14} strokeWidth={2.6} /> : null}</span>
                  {t(`editor.kind.${id}`)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {isEvent
          ? (
            <>
              <div className={styles.group}>
                <label htmlFor={sourceId} className={styles.legend}>{t('editor.event.label')}</label>
                <div className={styles.selectWrap}>
                  <Select id={sourceId} className={styles.eventSelect} value={source} onChange={(event) => { setSource(event.target.value as EventSourceId); setEditingRule(false) }}>
                    {events.map(option => (
                      <option key={option.source} value={option.source}>
                        {option.connected ? t(eventLabelKey(option.source)) : t('editor.event.off', { name: t(eventLabelKey(option.source)) })}
                      </option>
                    ))}
                  </Select>
                  <UiIcon name="chevronDown" size={16} className={styles.selectIcon} />
                </div>
              </div>
              {sourceConnected
                ? (
                  <>
                    <div className={styles.strip} data-persona-event-strip={source}>
                      <div className={styles.stripText}>
                        <p className={styles.stripLine}>{stripOf(t, source, filterText)}</p>
                        <p className={styles.stripHint}>{t('editor.event.strip.hint')}</p>
                      </div>
                      <Button size="s" variant="secondary" aria-expanded={editingRule} aria-controls={`${nameId}-rule`} onClick={() => { setEditingRule(value => !value) }}>
                        {editingRule ? t('editor.event.done') : t('editor.event.edit')}
                      </Button>
                    </div>
                    {editingRule && (
                      <div className={styles.filterFields} id={`${nameId}-rule`}>
                        {fieldsOf(source).map(field => (
                          <Input
                            key={field}
                            label={t(`editor.filter.${field}`)}
                            hint={t(`editor.filter.${field}.hint`)}
                            value={filterText[field]}
                            {...(field === 'to' || field === 'from' ? { type: 'text', autoComplete: 'off' } : {})}
                            onChange={(event) => { setFilterText(current => ({ ...current, [field]: event.target.value })) }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )
                : (
                  <div className={styles.offNote}>
                    <p className={styles.note} role="status">{t('editor.event.connect', { name: t(`editor.event.conn.${source}`) })}</p>
                    {onOpenConnections !== undefined && (
                      <Button size="s" variant="secondary" onClick={onOpenConnections}>{t('editor.event.openConnections')}</Button>
                    )}
                  </div>
                )}
            </>
          )
          : keepsStoredRule
            ? (
              <>
                <p className={styles.note}>{t('editor.customReadOnly')}</p>
              </>
            )
            : (
              <>
                <ChoiceCards legend={t('editor.whenLegend')} hideLegend={hasEvents} name={`${nameId}-when`} options={choiceOptions} value={choice} onChange={pickChoice} />
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
