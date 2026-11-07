/**
 * D-084 / PERSONA-POWERS-SPEC §3: o pedido de iniciativa no fio — "{persona} quer usar o {conector} para {motivo}." com três saídas:
 * Permitir desta vez · Sempre permitir para {persona} · Agora não. "Sempre permitir" é a concessão permanente (`grantConnector`, `read`): o Toast
 * "Agora {persona} pode usar o {conector} sem perguntar · Desfazer" confirma, e o Desfazer só existe quando o chamador sabe desfazer.
 *
 * Atrás de `persona.flag.actionPreview`. Cada botão só existe com `onDecide` (nenhum botão morto). O motivo é texto da persona, nunca instrução.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Card, Toast, ToastRegion } from '../primitives/index.ts'
import type { InitiativeAskUi } from '../remote/map-host-ui.ts'
import styles from './InitiativeAskCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export type InitiativeChoice = 'once' | 'always' | 'not-now'

export interface InitiativeAskCardProps {
  readonly t: ChatT
  readonly ask: InitiativeAskUi
  readonly rowTag?: 'li' | 'div'
  /**
   * `decideApproval({ kind: 'connector', id, choice })`; sem ele o cartão é só leitura. Devolve `true` quando o host devolveu a concessão
   * (`connectorDecision.grant`): só então o Toast de "Sempre permitir" leva o Desfazer.
   */
  readonly onDecide?: ((approvalId: string, choice: InitiativeChoice) => void | boolean | Promise<void | boolean>) | undefined
  /** Desfaz a concessão permanente (o botão do Toast); sem ele o Toast não tem Desfazer. */
  readonly onUndoGrant?: ((approvalId: string) => void | Promise<void>) | undefined
}

export function InitiativeAskCard({ t, ask, rowTag = 'li', onDecide, onUndoGrant }: InitiativeAskCardProps): ReactNode {
  const Tag = rowTag
  const [pending, setPending] = useState<InitiativeChoice | null>(null)
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState(false)
  const [grantUndoable, setGrantUndoable] = useState(false)
  const name = ask.personaName ?? t('action.somePersona')
  const face = ask.characterId === undefined ? undefined : AVATAR_96[ask.characterId as keyof typeof AVATAR_96]
  const connector = ask.connectorName

  if (ask.status === 'decided') {
    const text = ask.choice === 'always'
      ? t('initiative.decidedAlways', { name, connector })
      : ask.choice === 'once'
        ? t('initiative.decidedOnce', { name, connector })
        : t('initiative.decidedNot', { name, connector })
    return (
      <Tag className={styles.done} data-initiative-ask="decided" data-initiative-choice={ask.choice ?? 'not-now'}>
        <span>{text}</span>
        {toast && (
          <ToastRegion label={t('grant.region')}>
            <Toast
              tone="success"
              title={t('grant.toast', { name, connector })}
              {...(onUndoGrant === undefined || !grantUndoable ? {} : {
                action: <Button size="s" variant="ghost" onClick={() => { void Promise.resolve(onUndoGrant(ask.approvalId)).finally(() => { setToast(false) }) }}>{t('grant.undo')}</Button>,
              })}
              onDismiss={() => { setToast(false) }}
            />
          </ToastRegion>
        )}
      </Tag>
    )
  }

  const decide = (choice: InitiativeChoice): void => {
    if (onDecide === undefined || pending !== null) return
    setPending(choice)
    setFailed(false)
    void Promise.resolve(onDecide(ask.approvalId, choice))
      .then((result) => {
        if (choice !== 'always') return
        setGrantUndoable(result === true)
        setToast(true)
      })
      .catch(() => { setFailed(true) })
      .finally(() => { setPending(null) })
  }

  const sentence = t('initiative.ask', { name, connector, purpose: ask.purpose })
  return (
    <Tag className={styles.row} data-initiative-ask="pending">
      <Card as="article" tone="accent" padding="s" aria-label={sentence} className={styles.card}>
        <div className={styles.head}>
          <Avatar name={name} src={face} shape="portrait" size={24} decorative />
          <p className={styles.text}>{sentence}</p>
        </div>
        {failed && <p className={styles.failed} role="status">{t('initiative.failed')}</p>}
        {onDecide !== undefined && (
          <div className={styles.actions}>
            <Button size="s" variant="primary" loading={pending === 'once'} disabled={pending !== null} onClick={() => { decide('once') }}>{t('initiative.once')}</Button>
            <Button size="s" variant="secondary" loading={pending === 'always'} disabled={pending !== null} onClick={() => { decide('always') }}>{t('initiative.always', { name })}</Button>
            <Button size="s" variant="ghost" loading={pending === 'not-now'} disabled={pending !== null} onClick={() => { decide('not-now') }}>{t('initiative.notNow')}</Button>
          </div>
        )}
      </Card>
    </Tag>
  )
}
