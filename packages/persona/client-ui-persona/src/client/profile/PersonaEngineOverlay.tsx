/** Switch persona runner/model (`setPersonaEngine`, PERSONA-CARD-SPEC §2). */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ConnectionView, ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
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
import styles from './PersonaEngineOverlay.module.css'

export interface PersonaEngineOverlayInjected {
  readonly dict: LocaleDict
  readonly persona: PersonaRemoteClient
  readonly cardBridge: PersonaCardBridge
  readonly hooks: { readonly shell: HostObservable<ShellState> }
  readonly scope: () => ProjectScopeRequest | null
  closeEngineEditor(): void
}

export type PersonaEngineOverlayProps = InjectFace<PersonaEngineOverlayInjected>

export function PersonaEngineOverlay({
  dict,
  persona,
  cardBridge,
  useShell,
  scope,
  closeEngineEditor,
}: PersonaEngineOverlayProps): ReactNode {
  const personaId = useShell(state => state.enginePersonaId)
  const t = (key: string) => bindLocale(dict, key)
  const open = personaId !== null
  const [runners, setRunners] = useState<readonly RunnerOptionUi[]>([])
  const [selected, setSelected] = useState<string>('dsh')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const loadRunners = useCallback(async (): Promise<void> => {
    const tenant = scope()
    if (tenant === null) return
    if (!('listConnections' in persona) || typeof persona.listConnections !== 'function') return
    setLoading(true)
    setError(false)
    try {
      const rows = await unwrapRemote(await persona.listConnections(tenant) as Parameters<typeof unwrapRemote>[0]) as ConnectionView[]
      setRunners(connectionsToRunnerOptions(rows))
      const firstConnected = rows.find(row => connectionRunnerConnected(row))
      if (firstConnected !== undefined) {
        setSelected(firstConnected.kind === 'dsh' ? 'dsh' : `oar:${firstConnected.kind}` as string)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, scope])

  useEffect(() => {
    if (!open) return
    void loadRunners()
  }, [open, loadRunners])

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
            runnerModel: 'sonnet',
          }),
        )
        cardBridge.invalidate(personaId)
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
      <ul className={styles.list} role="listbox" aria-label={t('engine.listLabel')}>
        {runners.map(row => (
          <li key={row.id}>
            <button
              type="button"
              className={styles.option}
              role="option"
              aria-selected={selected === row.id}
              onClick={() => { setSelected(row.id) }}
            >
              <span className={styles.optionLabel}>{row.label}</span>
              {row.recommended === true && <span className={styles.badge}>{t('engine.recommended')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
