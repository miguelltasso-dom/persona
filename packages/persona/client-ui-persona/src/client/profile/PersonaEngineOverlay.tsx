/** Switch persona runner, model and "Esforço" with the engine's NATIVE level names (`setPersonaEngine`, EFFORT-SPEC.md + PERSONA-CARD-SPEC §2). */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConnectionView, PersonaEffortLevel, PersonaView, ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { connectionsToRunnerOptions, connectionRunnerConnected } from '../hire/connections-to-runner-options.ts'
import type { RunnerOptionUi } from '../persona-editor/PersonaEditor.tsx'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal } from '../primitives/index.ts'
import type { PersonaCardBridge } from '../remote/persona-card-bridge.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import { isEngineEffortEnabled } from './engine-effort-flag.ts'
import {
  ENGINE_DEFAULT_ID,
  acceptedEffortLevels,
  effortLevelHint,
  effortLevelLabel,
  modelOptionsForConnection,
  normalizeEffortName,
  snapEffort,
  type EffortChoiceId,
  type EffortName,
  type ModelChoiceId,
} from './engine-effort-model.ts'
import styles from './PersonaEngineOverlay.module.css'

export interface PersonaEngineOverlayInjected {
  readonly dict: LocaleDict
  readonly persona: PersonaRemoteClient
  readonly cardBridge: PersonaCardBridge
  readonly hooks: { readonly shell: HostObservable<ShellState> }
  readonly scope: () => ProjectScopeRequest | null
  closeEngineEditor(): void
  /** Quando passado pelo shell (`mount.ts`), respeita a flag `persona.flag.engineEffort`; em testes diretos, liga os 3 blocos por padrão. */
  readonly effortEnabled?: boolean | undefined
  readonly onSaved?: (() => void) | undefined
}

export type PersonaEngineOverlayProps = InjectFace<PersonaEngineOverlayInjected>

interface SnappedNotice {
  readonly modelLabel: string
  readonly from: EffortName
  readonly to: EffortName | null
}

function connectionForRunnerId(connections: readonly ConnectionView[], runnerId: string): ConnectionView | undefined {
  if (runnerId === 'dsh') return connections.find(row => row.kind === 'dsh')
  const kind = runnerId.replace(/^oar:/u, '')
  return connections.find(row => row.kind === kind)
}

export function PersonaEngineOverlay({
  dict,
  persona,
  cardBridge,
  useShell,
  scope,
  closeEngineEditor,
  effortEnabled,
  onSaved,
}: PersonaEngineOverlayProps): ReactNode {
  const personaId = useShell(state => state.enginePersonaId)
  const t = useCallback((key: string, params?: Readonly<Record<string, string>>) => bindLocale(dict, key, params), [dict])
  const open = personaId !== null
  const showEffortBlocks = effortEnabled ?? (typeof localStorage !== 'undefined' && localStorage.getItem('persona.flag.engineEffort') === '0' ? false : true)
  const [connections, setConnections] = useState<readonly ConnectionView[]>([])
  const [runners, setRunners] = useState<readonly RunnerOptionUi[]>([])
  const [selected, setSelected] = useState<string>('dsh')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedEffort, setSelectedEffort] = useState<EffortName | null>(null)
  const [snappedNotice, setSnappedNotice] = useState<SnappedNotice | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const modelListRef = useRef<HTMLDivElement>(null)
  const snapNoticeRef = useRef<HTMLParagraphElement>(null)

  const loadRunners = useCallback(async (targetPersonaId: string): Promise<void> => {
    const tenant = scope()
    if (tenant === null) return
    if (!('listConnections' in persona) || typeof persona.listConnections !== 'function') return
    setLoading(true)
    setError(false)
    setSnappedNotice(null)
    try {
      const rows = await unwrapRemote(await persona.listConnections(tenant) as Parameters<typeof unwrapRemote>[0]) as ConnectionView[]
      setConnections(rows)
      setRunners(connectionsToRunnerOptions(rows))

      let storedChoice: PersonaView['engine'] | undefined = undefined
      if ('listPersonas' in persona && typeof persona.listPersonas === 'function') {
        try {
          const teamPersonas = await unwrapRemote(await persona.listPersonas(tenant) as Parameters<typeof unwrapRemote>[0]) as PersonaView[]
          storedChoice = teamPersonas.find(row => row.id === targetPersonaId)?.engine
        } catch {
          storedChoice = undefined
        }
      }

      if (storedChoice !== undefined) {
        const runnerId = storedChoice.runnerKind === 'dsh' ? 'dsh' : `oar:${storedChoice.runnerCli}`
        setSelected(runnerId)
        const modelVal = storedChoice.runnerModel !== null && storedChoice.runnerModel.trim() !== '' && storedChoice.runnerModel !== 'default'
          ? storedChoice.runnerModel
          : null
        setSelectedModel(modelVal)
        setSelectedEffort(normalizeEffortName(storedChoice.runnerEffort) ?? null)
      } else {
        const firstConnected = rows.find(row => connectionRunnerConnected(row)) ?? rows[0]
        if (firstConnected !== undefined) {
          setSelected(firstConnected.kind === 'dsh' ? 'dsh' : `oar:${firstConnected.kind}`)
        }
        setSelectedModel(null)
        setSelectedEffort(null)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, scope])

  useEffect(() => {
    if (!open || personaId === null) return
    void loadRunners(personaId)
  }, [open, personaId, loadRunners])

  // EFFORT-SPEC §2 (Muse 06:28): the saved model is always visible and marked. The real Claude list has 12 rows, so the saved one can sit below the fold of the
  // Modal body: once the data is in, the checked row scrolls into view (centered, so its hint is never left under the Modal's bottom fade; the engine default, first row at the top, needs no scroll: Muse 16:25).
  useEffect(() => {
    if (!open || loading) return
    const checked = modelListRef.current?.querySelector<HTMLElement>('[data-checked="true"]')
    if (checked === null || checked === undefined || typeof checked.scrollIntoView !== 'function') return
    if (checked.querySelector('input')?.getAttribute('value') === ENGINE_DEFAULT_ID) return
    checked.scrollIntoView({ block: 'center' })
  }, [open, loading])

  // When a model change drops the level, the line that says so (role="status") scrolls into view: the most important notice is never left under the fade (Muse 16:08).
  useEffect(() => {
    if (snappedNotice === null) return
    const notice = snapNoticeRef.current
    if (notice !== null && typeof notice.scrollIntoView === 'function') notice.scrollIntoView({ block: 'nearest' })
  }, [snappedNotice])

  const activeConnection = connectionForRunnerId(connections, selected)
  const modelOptions = modelOptionsForConnection(t, activeConnection)
  const allowedEfforts = acceptedEffortLevels(activeConnection, selectedModel)
  // EFFORT-SPEC §4.1 (Keel 06:22): where the model list came from, in plain words. `source` is 'cli' | 'static' (Anvil, host).
  const activeSource = (activeConnection as (ConnectionView & { readonly source?: 'cli' | 'static' }) | undefined)?.source
  const activeEngineLabel = runners.find(row => row.id === selected)?.label ?? ''
  const modelSourceLine: string | null = activeSource === 'cli'
    ? t('engine.modelsFromAccount')
    : activeSource === 'static'
      ? t('engine.modelsDefaultList', { engine: activeEngineLabel })
      : null

  const onSelectRunner = (runnerId: string): void => {
    // The engine already chosen: nothing changes, so the model and the level picked so far stay (they are only saved on "Aplicar").
    if (runnerId === selected) return
    setSelected(runnerId)
    setSelectedModel(null)
    const conn = connectionForRunnerId(connections, runnerId)
    const allowed = acceptedEffortLevels(conn, null)
    const snapped = snapEffort(selectedEffort, allowed)
    setSelectedEffort(snapped.next)
    setSnappedNotice(null)
  }

  const onSelectModel = (choiceId: ModelChoiceId): void => {
    const nextModel = choiceId === ENGINE_DEFAULT_ID ? null : choiceId
    setSelectedModel(nextModel)
    const allowed = acceptedEffortLevels(activeConnection, nextModel)
    const snapped = snapEffort(selectedEffort, allowed)
    setSelectedEffort(snapped.next)
    if (snapped.snappedFrom !== null) {
      const modelTitle = modelOptions.find(opt => opt.id === choiceId)?.title ?? (nextModel ?? t('engine.modelDefault'))
      setSnappedNotice({
        modelLabel: modelTitle,
        from: snapped.snappedFrom,
        to: snapped.next,
      })
    } else {
      setSnappedNotice(null)
    }
  }

  const effortChoices: readonly EffortChoiceId[] = [ENGINE_DEFAULT_ID, ...allowedEfforts]
  const currentEffortChoice: EffortChoiceId = selectedEffort !== null && allowedEfforts.includes(selectedEffort)
    ? selectedEffort
    : ENGINE_DEFAULT_ID

  const onSave = (): void => {
    const tenant = scope()
    if (personaId === null || tenant === null) return
    if (!('setPersonaEngine' in persona) || typeof persona.setPersonaEngine !== 'function') {
      closeEngineEditor()
      return
    }
    const picked = runners.find(row => row.id === selected) ?? runners[0]
    if (picked === undefined) return
    setSaving(true)
    void (async () => {
      try {
        const runnerKind = picked.id === 'dsh' ? 'dsh' as const : 'cli' as const
        const runnerCli = runnerKind === 'cli' ? picked.id.replace(/^oar:/u, '') : ''
        await unwrapRemote(
          await persona.setPersonaEngine({
            workspaceId: tenant.workspaceId,
            projectId: tenant.projectId,
            personaId,
            runnerKind,
            runnerCli,
            runnerModel: selectedModel,
            ...(showEffortBlocks ? { runnerEffort: selectedEffort as PersonaEffortLevel | null } : {}),
          }),
        )
        setSnappedNotice(null)
        cardBridge.invalidate(personaId)
        onSaved?.()
        closeEngineEditor()
      } catch {
        setError(true)
      } finally {
        setSaving(false)
      }
    })()
  }

  if (!open) return null

  return (
    <Modal
      open
      title={t('engine.title')}
      description={t('engine.description')}
      closeLabel={t('engine.cancel')}
      onClose={closeEngineEditor}
      footer={(
        <>
          <Button variant="ghost" onClick={closeEngineEditor}>{t('engine.cancel')}</Button>
          <Button variant="primary" disabled={saving || loading || runners.length === 0} onClick={onSave}>
            {t('engine.save')}
          </Button>
        </>
      )}
    >
      {error && <p className={styles.error}>{t('engine.error')}</p>}
      <div className={styles.layout}>
        <section className={styles.section} aria-label={t('engine.listLabel')}>
          <div className={styles.list} role="listbox" aria-label={t('engine.listLabel')}>
            {runners.map(row => (
              <button
                key={row.id}
                type="button"
                className={styles.option}
                role="option"
                aria-selected={selected === row.id}
                onClick={() => { onSelectRunner(row.id) }}
              >
                <span className={styles.optionLabel}>{row.label}</span>
                {!row.connected && <span className={styles.notConnected}>{t('engine.notConnected')}</span>}
              </button>
            ))}
          </div>
        </section>

        {showEffortBlocks && (
          <div className={styles.modelEffortGrid}>
            <section className={styles.section} aria-labelledby="persona-engine-model-heading" data-engine-block="model">
              <div className={styles.sectionHeader}>
                <h3 id="persona-engine-model-heading" className={styles.sectionTitle}>{t('engine.model')}</h3>
              </div>
              {modelSourceLine !== null && <p className={styles.modelSource}>{modelSourceLine}</p>}
              <div ref={modelListRef} role="radiogroup" aria-labelledby="persona-engine-model-heading" className={styles.modelList}>
                {modelOptions.map((opt) => {
                  const checked = (selectedModel ?? ENGINE_DEFAULT_ID) === opt.id
                  return (
                    <label key={opt.id} className={styles.modelRow} data-checked={checked ? 'true' : 'false'}>
                      <input
                        type="radio"
                        className={styles.modelRadio}
                        name="persona-engine-model"
                        value={opt.id}
                        checked={checked}
                        disabled={saving || loading}
                        onChange={() => { onSelectModel(opt.id) }}
                      />
                      <span className={styles.modelText}>
                        <span className={styles.modelName}>{opt.title}</span>
                        <span className={styles.modelHint}>{opt.body}</span>
                      </span>
                      <span className={styles.modelCheck} aria-hidden="true">{checked ? '✓' : ''}</span>
                    </label>
                  )
                })}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="persona-engine-effort-heading" data-engine-block="effort">
              <div className={styles.sectionHeader}>
                <h3 id="persona-engine-effort-heading" className={styles.sectionTitle}>{t('engine.effort')}</h3>
                <p className={styles.sectionTip}>{t('engine.effortTip')}</p>
              </div>
              {allowedEfforts.length === 0 ? (
                <p className={styles.effortNone} data-effort-none="">{t('engine.effortNone')}</p>
              ) : (
                <div role="radiogroup" aria-labelledby="persona-engine-effort-heading" className={styles.modelList}>
                  {effortChoices.map((choiceId) => {
                    const checked = currentEffortChoice === choiceId
                    const level = choiceId === ENGINE_DEFAULT_ID ? null : choiceId
                    const hint = effortLevelHint(t, level)
                    return (
                      <label key={choiceId} className={styles.modelRow} data-checked={checked ? 'true' : 'false'} data-effort-id={choiceId}>
                        <input
                          type="radio"
                          className={styles.modelRadio}
                          name="persona-engine-effort"
                          value={choiceId}
                          checked={checked}
                          disabled={saving || loading}
                          onChange={() => {
                            setSelectedEffort(level)
                            setSnappedNotice(null)
                          }}
                        />
                        <span className={styles.modelText}>
                          <span className={styles.modelName}>{effortLevelLabel(t, level)}</span>
                          {hint !== undefined && <span className={styles.modelHint}>{hint}</span>}
                        </span>
                        <span className={styles.modelCheck} aria-hidden="true">{checked ? '✓' : ''}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {snappedNotice !== null && (
                <p ref={snapNoticeRef} className={styles.effortSnapped} role="status">
                  {t('engine.effortSnapped', {
                    model: snappedNotice.modelLabel,
                    level: effortLevelLabel(t, snappedNotice.from),
                    fallback: effortLevelLabel(t, snappedNotice.to),
                  })}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </Modal>
  )
}

export { isEngineEffortEnabled }
