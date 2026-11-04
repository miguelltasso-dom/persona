/** C7b — Rotinas: calendário semanal, resultados, silêncio, pausar equipe. */

import { useEffect, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Avatar, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, Toast, ToastRegion, UiIcon } from '../primitives/index.ts'
import { PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './Routines.module.css'
import editorStyles from './RoutineEditor.module.css'
import { WEEK_DAYS, type QuietWindow, type RoutineRun } from './mock-data.ts'
import { RoutineEditorModal, type EditorPersona, type EditorProject, type RoutineDraft, type RoutineSaved } from './RoutineEditorModal.tsx'
import { DEFAULT_WHEN, describeWhen, weekRangeLabel, whenFromRrule } from './routine-schedule.ts'
import { ProjectWorkspaceScopeChip } from '../data/ProjectWorkspaceScopeChip.tsx'
import { pt as defaultDict } from '../locale/routines/locales.ts'

export type RoutinesSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

/** One routine as the list shows it ("Suas rotinas"). */
export interface RoutineRow {
  readonly id: string
  readonly name: string
  /** The request ("O que fazer"); older hosts have none, then the name stands in. */
  readonly prompt: string
  readonly rrule: string
  readonly ownerPersonaId?: string | undefined
  readonly ownerName?: string | undefined
  readonly ownerAvatarSrc?: string | undefined
  readonly projectId: string
  readonly paused: boolean
  /** The host's own plain-language schedule, used only for a rule this screen does not write (never the raw rule). */
  readonly humanSchedule?: string | undefined
  /** The routines the team keeps for each persona: they can be paused, never deleted (the host refuses). */
  readonly system?: boolean | undefined
  /**
   * What the host also stores about the routine and the editor does not touch. Kept on the row so "Desfazer" after a
   * delete brings the routine back exactly as it was ('' = no quiet window).
   */
  readonly timeZone?: string | undefined
  readonly catchUp?: 'skip' | 'run_once' | 'run_all' | undefined
  readonly silenceStart?: string | undefined
  readonly silenceEnd?: string | undefined
}

/** What the screen can do to routines. A missing handler is a missing button: nothing here is drawn without an action. */
export interface RoutineActions {
  readonly personas: readonly EditorPersona[]
  readonly projects: readonly EditorProject[]
  readonly defaultProjectId: string
  /** Creates (no `id`) or updates (with `id`). */
  readonly onSave: (saved: RoutineSaved) => Promise<void>
  /** The host can update a routine: "Editar" is drawn only then. */
  readonly canEdit: boolean
  readonly onTogglePause?: ((row: RoutineRow, paused: boolean) => Promise<void>) | undefined
  readonly onDelete?: ((row: RoutineRow) => Promise<void>) | undefined
  /** Brings a deleted routine back (the "Desfazer" of the delete toast). */
  readonly onRestore?: ((row: RoutineRow) => Promise<void>) | undefined
}

const UNDO_MS = 6000

/** A rule this screen does not write: the host's plain sentence when it has one that is not the rule itself. */
function readableSchedule(row: RoutineRow, fallback: string): string {
  const human = row.humanSchedule?.trim() ?? ''
  return human.length > 0 && human !== row.rrule && !/FREQ=/u.test(human) ? human : fallback
}

const DAY_LABELS: Record<(typeof WEEK_DAYS)[number], string> = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
}

function resultChipTone(result: RoutineRun['result']): 'success' | 'accent' | 'danger' | 'neutral' {
  if (result === 'ok') return 'success'
  if (result === 'partial') return 'accent'
  if (result === 'failed') return 'danger'
  return 'neutral'
}

export interface RoutinesViewProps {
  readonly dict?: LocaleDict
  readonly routineRuns?: readonly RoutineRun[]
  readonly quietWindows?: readonly QuietWindow[]
  readonly initialState?: RoutinesSurfaceState
  readonly onRemoteRetry?: () => void
  readonly scopeProjectId?: string | null
  /** UX-14: empty → "Pedir sugestões à coordenação" (opens the coordinator DM with a ready request). */
  readonly onAskSuggestions?: (() => void) | undefined
  /** Saves a silence window ("22:00" – "07:00"). Without it the "Adicionar janela" button is not drawn. */
  readonly onAddQuietWindow?: ((window: { readonly label: string; readonly start: string; readonly end: string }) => Promise<void>) | undefined
  /** The routines themselves ("Suas rotinas"), with what can be done to them. Without `actions` the list is read-only. */
  readonly routineRows?: readonly RoutineRow[]
  readonly actions?: RoutineActions | undefined
}

/** Weekly routine calendar preview. */
export function RoutinesView({
  dict = defaultDict,
  routineRuns = [],
  quietWindows = [],
  initialState = 'ready',
  onRemoteRetry,
  scopeProjectId = null,
  onAskSuggestions,
  onAddQuietWindow,
  routineRows = [],
  actions,
}: RoutinesViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [surfaceState, setSurfaceState] = useState(initialState)
  const [editor, setEditor] = useState<{ readonly mode: 'create' | 'edit'; readonly row?: RoutineRow } | null>(null)
  const [deleted, setDeleted] = useState<RoutineRow | null>(null)
  const [undoFailed, setUndoFailed] = useState(false)
  const [teamPaused, setTeamPaused] = useState(false)
  const [addingQuiet, setAddingQuiet] = useState(false)
  const [quietLabel, setQuietLabel] = useState('')
  const [quietStart, setQuietStart] = useState('22:00')
  const [quietEnd, setQuietEnd] = useState('07:00')
  const [quietBusy, setQuietBusy] = useState(false)
  const [quietFailed, setQuietFailed] = useState(false)

  useEffect(() => {
    setSurfaceState(initialState)
  }, [initialState])

  // The delete toast lasts 6 s (same as every Desfazer); after that the routine stays deleted.
  useEffect(() => {
    if (deleted === null && !undoFailed) return undefined
    const timer = window.setTimeout(() => { setDeleted(null); setUndoFailed(false) }, UNDO_MS)
    return () => { window.clearTimeout(timer) }
  }, [deleted, undoFailed])

  // One primary per screen (SCREEN-SPECS rule 2): with routines it is "Nova rotina" in the header; with none it is the
  // empty state's, and the header has none.
  const hasRoutines = routineRows.length > 0
  const newRoutine = actions === undefined
    ? undefined
    : (
      <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={() => { setEditor({ mode: 'create' }) }}>
        {t('action.new')}
      </Button>
    )
  const header = (
    <ScreenHeader
      icon="rotinas"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      actions={hasRoutines ? newRoutine : undefined}
    />
  )

  const draftOf = (row: RoutineRow | undefined, projectId: string): RoutineDraft => {
    if (row === undefined) return { prompt: '', when: DEFAULT_WHEN, projectId }
    const when = whenFromRrule(row.rrule)
    return {
      id: row.id,
      prompt: row.prompt.length > 0 ? row.prompt : row.name,
      when,
      ...(when === undefined ? { keepRrule: row.rrule } : {}),
      ownerPersonaId: row.ownerPersonaId,
      projectId: row.projectId,
      paused: row.paused,
    }
  }
  const editorNode = actions === undefined || editor === null
    ? null
    : (
      <RoutineEditorModal
        key={`${editor.mode}-${editor.row?.id ?? 'new'}`}
        dict={dict}
        open
        mode={editor.mode}
        initial={draftOf(editor.row, actions.defaultProjectId)}
        personas={actions.personas}
        projects={actions.projects}
        onSave={actions.onSave}
        isTeamRoutine={editor.row?.system === true}
        onClose={() => { setEditor(null) }}
        {...(editor.row === undefined || actions.onTogglePause === undefined
          ? {}
          : { onTogglePause: (paused: boolean) => actions.onTogglePause!(editor.row!, paused) })}
        {...(editor.row === undefined || editor.row.system === true || actions.onDelete === undefined
          ? {}
          : { onDelete: async () => { const row = editor.row!; await actions.onDelete!(row); setUndoFailed(false); setDeleted(row) } })}
      />
    )
  const deleteToast = deleted === null && !undoFailed
    ? null
    : (
      <ToastRegion label={t('toast.region')}>
        {undoFailed
          ? <Toast tone="danger" title={t('toast.undoFailed')} dismissLabel={t('toast.dismiss')} onDismiss={() => { setUndoFailed(false) }} />
          : (
            <Toast
              tone="success"
              title={t('toast.deleted')}
              {...(deleted === null || actions?.onRestore === undefined
                ? {}
                : {
                  action: (
                    <Button
                      size="s"
                      variant="ghost"
                      onClick={() => {
                        const row = deleted
                        setDeleted(null)
                        void actions.onRestore!(row).catch(() => { setUndoFailed(true) })
                      }}
                    >
                      {t('toast.undo')}
                    </Button>
                  ),
                })}
            />
          )}
      </ToastRegion>
    )
  const scopeChip = <ProjectWorkspaceScopeChip dict={dict} projectId={scopeProjectId} />

  if (surfaceState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={7} />
      </Screen>
    )
  }
  if (surfaceState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (surfaceState === 'empty') {
    // With a way to create, "Nova rotina" is the one primary here and the coordinator's ideas become the secondary.
    const primary = newRoutine ?? (onAskSuggestions === undefined ? undefined : <Button variant="primary" onClick={onAskSuggestions}>{t('empty.action')}</Button>)
    const secondary = newRoutine !== undefined && onAskSuggestions !== undefined
      ? <Button variant="secondary" onClick={onAskSuggestions}>{t('empty.secondary')}</Button>
      : undefined
    return (
      <Screen className={styles.shell} data-persona-surface="routines">
        {header}
        {scopeChip}
        <EmptyState
          illustration={ILLUSTRATIONS['empty-routines']}
          title={t('empty.title')}
          body={t('empty.hint')}
          {...(primary === undefined ? {} : { action: primary })}
          {...(secondary === undefined ? {} : { secondaryAction: secondary })}
        />
        {editorNode}
        {deleteToast}
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="routines">
      {header}
      {scopeChip}
      <p className={styles.hint}>{t('week.label', { range: weekRangeLabel(new Date()) })}</p>
      {hasRoutines && (
        <Card padding="m" as="section" aria-labelledby="routines-list-heading">
          <h2 id="routines-list-heading" className={styles.sectionTitle}>{t('list.title')}</h2>
          <ul className={editorStyles.list}>
            {routineRows.map((row) => {
              const when = whenFromRrule(row.rrule)
              const whenText = when === undefined ? readableSchedule(row, t('list.custom')) : describeWhen(t, when)
              const who = row.ownerName ?? t('list.coordination')
              const canEdit = actions?.canEdit === true
              return (
                <li
                  key={row.id}
                  className={editorStyles.item}
                  {...(canEdit ? { onClick: () => { setEditor({ mode: 'edit', row }) } } : {})}
                >
                  <Avatar
                    name={who}
                    size={32}
                    shape="portrait"
                    decorative
                    {...(row.ownerAvatarSrc === undefined ? {} : { src: row.ownerAvatarSrc })}
                  />
                  <div className={editorStyles.itemText}>
                    <p className={editorStyles.itemName}>{row.name}</p>
                    <p className={editorStyles.itemWhen}>{whenText} · {who}</p>
                  </div>
                  <div className={editorStyles.itemEnd}>
                    {row.paused && <Chip tone="neutral" size="s">{t('list.paused')}</Chip>}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="s"
                        aria-label={t('list.editNamed', { name: row.name })}
                        onClick={(event) => { event.stopPropagation(); setEditor({ mode: 'edit', row }) }}
                      >
                        {t('list.edit')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          aria-pressed={teamPaused}
          onClick={() => { setTeamPaused(p => !p) }}
        >
          {teamPaused ? t('resumeTeam') : t('pauseTeam')}
        </Button>
        <p className={styles.hint}>{t('pauseTeam.hint')}</p>
      </div>
      {/* A list of days, not a grid: the old grid/gridcell roles had no rows (axe: aria-required-children/parent). Focusable
          so a keyboard can scroll it when it overflows on a narrow window. */}
      <div className={styles.weekGrid} role="list" aria-label={t('title')} tabIndex={0}>
        {WEEK_DAYS.map(day => (
          <div key={day} className={styles.dayCol} role="listitem">
            <div className={styles.dayLabel}>{DAY_LABELS[day]}</div>
            {routineRuns.filter(run => run.day === day).map(run => (
              <Card
                key={run.id}
                padding="s"
                className={`${styles.runCard}${teamPaused ? ` ${styles.runPaused}` : ''}`}
              >
                <h3 className={styles.runTitle}>{run.routineName}</h3>
                <p className={styles.runTime}>{run.time}</p>
                <Chip tone={resultChipTone(run.result)} size="s">{t(`run.result.${run.result}`)}</Chip>
                <p className={styles.runSummary}>{run.summary}</p>
              </Card>
            ))}
          </div>
        ))}
      </div>
      <Card padding="m" as="section" aria-labelledby="quiet-heading">
        <h2 id="quiet-heading" className={styles.sectionTitle}>{t('quietHours')}</h2>
        <p className={styles.hint}>{t('quietHours.hint')}</p>
        <ul className={styles.quietList}>
          {quietWindows.map(window => (
            <li key={window.id}>
              <Chip tone="neutral" size="s">{window.label} · {window.range}</Chip>
            </li>
          ))}
        </ul>
        {onAddQuietWindow !== undefined && !addingQuiet && (
          <Button variant="secondary" size="s" onClick={() => { setQuietFailed(false); setAddingQuiet(true) }}>{t('quiet.add')}</Button>
        )}
        {onAddQuietWindow !== undefined && addingQuiet && (
          <form
            className={styles.quietForm}
            onSubmit={(event) => {
              event.preventDefault()
              setQuietBusy(true)
              setQuietFailed(false)
              void onAddQuietWindow({ label: quietLabel.trim() === '' ? t('quiet.defaultLabel') : quietLabel.trim(), start: quietStart, end: quietEnd })
                .then(() => { setAddingQuiet(false); setQuietLabel('') })
                .catch(() => { setQuietFailed(true) })
                .finally(() => { setQuietBusy(false) })
            }}
          >
            <div className={styles.quietField}>
              <Input label={t('quiet.label')} type="text" value={quietLabel} placeholder={t('quiet.defaultLabel')} onChange={(event) => { setQuietLabel(event.target.value) }} />
            </div>
            <div className={styles.quietField}>
              <Input label={t('quiet.from')} type="time" required value={quietStart} onChange={(event) => { setQuietStart(event.target.value) }} />
            </div>
            <div className={styles.quietField}>
              <Input label={t('quiet.to')} type="time" required value={quietEnd} onChange={(event) => { setQuietEnd(event.target.value) }} />
            </div>
            <div className={styles.quietActions}>
              <Button variant="primary" size="s" type="submit" loading={quietBusy}>{t('quiet.save')}</Button>
              <Button variant="secondary" size="s" type="button" disabled={quietBusy} onClick={() => { setAddingQuiet(false); setQuietFailed(false) }}>{t('quiet.cancel')}</Button>
            </div>
            {quietFailed && <p className={styles.quietFailed} role="alert">{t('quiet.failed')}</p>}
          </form>
        )}
      </Card>
      {editorNode}
      {deleteToast}
    </Screen>
  )
}
