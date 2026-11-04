/** Edit DM/@mention talk ACL (`setPersonaTalkAcl`, PERSONA-CARD-SPEC §2). */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Chip, Modal } from '../primitives/index.ts'
import type { PersonaCardBridge } from '../remote/persona-card-bridge.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import styles from './PersonaTalkAclOverlay.module.css'

export interface PersonaTalkAclOverlayInjected {
  readonly dict: LocaleDict
  readonly persona: PersonaRemoteClient
  readonly live: PersonaLiveStore
  readonly cardBridge: PersonaCardBridge
  readonly hooks: { readonly shell: HostObservable<ShellState> }
  closeTalkAclEditor(): void
}

export type PersonaTalkAclOverlayProps = InjectFace<PersonaTalkAclOverlayInjected>

export function PersonaTalkAclOverlay({
  dict,
  persona,
  live,
  cardBridge,
  useShell,
  closeTalkAclEditor,
}: PersonaTalkAclOverlayProps): ReactNode {
  const personaId = useShell(state => state.talkAclPersonaId)
  const t = (key: string) => bindLocale(dict, key)
  const open = personaId !== null
  const [mode, setMode] = useState<'workspace' | 'chosen'>('workspace')
  const [chosenIds, setChosenIds] = useState<readonly string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const members = live.observable.getSnapshot().team?.members ?? []
  const tenant = live.observable.getSnapshot().tenant

  const loadAcl = useCallback(async (): Promise<void> => {
    if (personaId === null || tenant === null) return
    if (!('getPersonaTalkAcl' in persona) || typeof persona.getPersonaTalkAcl !== 'function') return
    setLoading(true)
    setError(false)
    try {
      const acl = await unwrapRemote(
        await persona.getPersonaTalkAcl({
          workspaceId: tenant.workspaceId,
          projectId: tenant.projectId,
          personaId,
        }),
      )
      setMode(acl.mode)
      setChosenIds(acl.principals.filter(row => row.kind === 'person').map(row => row.id))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [persona, personaId, tenant])

  useEffect(() => {
    if (!open) return
    void loadAcl()
  }, [open, loadAcl])

  const toggleMember = (id: string): void => {
    setChosenIds(current => (current.includes(id) ? current.filter(row => row !== id) : [...current, id]))
  }

  const onSave = (): void => {
    if (personaId === null || tenant === null) return
    if (!('setPersonaTalkAcl' in persona) || typeof persona.setPersonaTalkAcl !== 'function') {
      closeTalkAclEditor()
      return
    }
    setSaving(true)
    void (async () => {
      try {
        const principals = mode === 'workspace'
          ? []
          : chosenIds.map((id) => {
            const member = members.find(row => row.id === id)
            return { kind: 'person' as const, id, name: member?.displayName ?? id }
          })
        await unwrapRemote(
          await persona.setPersonaTalkAcl({
            workspaceId: tenant.workspaceId,
            projectId: tenant.projectId,
            personaId,
            mode,
            principals,
          }),
        )
        cardBridge.invalidate(personaId)
        closeTalkAclEditor()
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
      title={t('talkAcl.title')}
      description={t('talkAcl.description')}
      closeLabel={t('talkAcl.cancel')}
      onClose={closeTalkAclEditor}
      footer={(
        <>
          <Button variant="ghost" onClick={closeTalkAclEditor}>{t('talkAcl.cancel')}</Button>
          <Button variant="primary" disabled={saving || loading} onClick={onSave}>{t('talkAcl.save')}</Button>
        </>
      )}
    >
      {error && <p className={styles.error}>{t('talkAcl.error')}</p>}
      <div className={styles.modeRow} role="radiogroup" aria-label={t('talkAcl.modeLabel')}>
        <button
          type="button"
          className={styles.modeButton}
          role="radio"
          aria-checked={mode === 'workspace'}
          onClick={() => { setMode('workspace') }}
        >
          {t('talkAcl.modeWorkspace')}
        </button>
        <button
          type="button"
          className={styles.modeButton}
          role="radio"
          aria-checked={mode === 'chosen'}
          onClick={() => { setMode('chosen') }}
        >
          {t('talkAcl.modeChosen')}
        </button>
      </div>
      {mode === 'chosen' && (
        <ul className={styles.memberList}>
          {members.map(member => (
            <li key={member.id}>
              <button
                type="button"
                className={styles.memberToggle}
                aria-pressed={chosenIds.includes(member.id)}
                onClick={() => { toggleMember(member.id) }}
              >
                <Chip size="m" tone={chosenIds.includes(member.id) ? 'brand' : 'plain'}>
                  {member.displayName}
                </Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
