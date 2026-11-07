/**
 * D-084 / PERSONA-POWERS-SPEC §1 (HT-9 básico): o cartão de prévia de uma ação externa que a persona quer fazer fora do app (enviar um email,
 * publicar, pagar, apagar). TUDO o que sai da empresa é visto antes: o cartão mostra a coisa real (para quem, assunto, corpo; o valor e quem recebe;
 * a lista a apagar) e só deixa Enviar com a prévia completa. É uma mensagem da persona no fio, com a borda esquerda âmbar.
 *
 *  - Enviar (o verbo muda: Publicar · Pagar · Apagar) · Editar (email/post: abre o conteúdo no próprio cartão, com "Salvar e enviar") · Cancelar.
 *  - A caixinha "Não perguntar de novo para {persona} no {conector}" NUNCA vem marcada e só existe em enviar/publicar: pagar e apagar sempre pedem.
 *  - Pagar e apagar levam o aviso "Isso não dá para desfazer depois."
 *  - Prévia cortada (ou sem o que conferir): sem Enviar ("não dá para enviar às cegas"), a mesma falha fechada do host.
 *  - Depois: "Enviando…" (botão em loading) · "✓ Enviado para … · hora" · "Cancelado · {persona} não enviou" · "{persona} ajustou a mensagem. Confira de novo."
 *    (chega um cartão novo) · falha com o motivo. Nenhum Desfazer aqui: email, post e pagamento não voltam.
 *
 * Atrás de `persona.flag.actionPreview` (quem monta decide). Cada botão só existe com `onDecide` (nenhum botão morto). O texto da persona é só texto.
 */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, BrandIcon, Button, Card, Input, Notice, Textarea, UiIcon } from '../primitives/index.ts'
import type { ActionPreviewUi } from '../remote/map-host-ui.ts'
import { ActionContent } from './ActionContent.tsx'
import styles from './ActionPreviewCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** O que a pessoa decidiu (o formato do `decideApproval({ kind: 'action', … })` do contrato). */
export interface ActionDecision {
  readonly approvalId: string
  readonly choice: 'send' | 'edit' | 'cancel'
  readonly edited?: { readonly subject?: string; readonly body?: string }
  /** A caixinha "Não perguntar de novo" (só em enviar/publicar; o host ignora em pagar/apagar). */
  readonly remember?: boolean
}

export interface ActionPreviewCardProps {
  readonly t: ChatT
  readonly preview: ActionPreviewUi
  readonly rowTag?: 'li' | 'div'
  /** Sem ele o cartão é só leitura (nenhum botão). */
  readonly onDecide?: ((decision: ActionDecision) => void | Promise<void>) | undefined
}

export { ACTION_BODY_LINES, ACTION_ITEMS_MAX } from './ActionContent.tsx'

/** BR-P7: the icon of the action's medium, beside the words ("Vai enviar um email · pelo Gmail"). */
const VERB_ICON = { email: 'email', post: 'publicar', pay: 'pagar', delete: 'apagar' } as const

function eyebrowText(t: ChatT, preview: ActionPreviewUi): string {
  const connector = preview.connectorName
  switch (preview.verb) {
    case 'email': return t('action.email', { connector })
    case 'post': return t('action.post', { connector })
    case 'pay': return t('action.pay', { connector, amount: preview.amount ?? '' })
    default: return t(preview.count === 1 ? 'action.delete.one' : 'action.delete', { connector, count: preview.count })
  }
}

function ctaText(t: ChatT, preview: ActionPreviewUi): string {
  switch (preview.verb) {
    case 'post': return t('action.cta.publish')
    case 'pay': return t('action.cta.pay')
    case 'delete': return t('action.cta.delete')
    default: return t('action.send')
  }
}

function timeOf(iso: string | undefined): string {
  if (iso === undefined) return ''
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function ActionPreviewCard({ t, preview, rowTag = 'li', onDecide }: ActionPreviewCardProps): ReactNode {
  const Tag = rowTag
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(preview.subject ?? '')
  const [body, setBody] = useState(preview.body ?? '')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = preview.personaName ?? t('action.somePersona')
  const face = preview.characterId === undefined ? undefined : AVATAR_96[preview.characterId as keyof typeof AVATAR_96]

  // O que já aconteceu vira uma linha (o cartão some): enviado · cancelado · ajustado · falha.
  if (preview.status === 'sent') {
    const when = timeOf(preview.sentAt)
    const target = preview.sentTo ?? preview.to
    const text = target === undefined
      ? t('action.sentNoTarget', { when })
      : t('action.sent', { to: target, when })
    return (
      <Tag className={styles.done} data-action-preview="sent">
        <span className={styles.doneIcon} aria-hidden="true"><UiIcon name="check" size={16} strokeWidth={2.4} /></span>
        <span>{text}</span>
      </Tag>
    )
  }
  if (preview.status === 'cancelled') {
    return <Tag className={styles.done} data-action-preview="cancelled"><span>{t('action.cancelled', { name })}</span></Tag>
  }
  if (preview.status === 'adjusted') {
    return <Tag className={styles.done} data-action-preview="adjusted"><span>{t('action.adjusted', { name })}</span></Tag>
  }
  if (preview.status === 'failed') {
    return (
      <Tag className={styles.row} data-action-preview="failed">
        <Notice tone="warning">
          {preview.failureReason === undefined ? t('action.failedGeneric') : t('action.failed', { reason: preview.failureReason })}
        </Notice>
      </Tag>
    )
  }

  const sending = preview.status === 'sending' || busy
  const irreversible = preview.actionClass === 'pay' || preview.actionClass === 'delete'
  const canRemember = preview.actionClass === 'send' || preview.actionClass === 'post'
  const canEdit = (preview.verb === 'email' || preview.verb === 'post') && !preview.blind
  const eyebrow = eyebrowText(t, preview)

  const decide = (choice: ActionDecision['choice'], edited?: ActionDecision['edited']): void => {
    if (onDecide === undefined || sending) return
    setBusy(true)
    const decision: ActionDecision = {
      approvalId: preview.approvalId,
      choice,
      ...(edited === undefined ? {} : { edited }),
      ...(canRemember && remember && choice !== 'cancel' ? { remember: true } : {}),
    }
    void Promise.resolve(onDecide(decision)).finally(() => { setBusy(false) })
  }

  return (
    <Tag className={styles.row} data-action-preview="pending" data-action-class={preview.actionClass}>
      <Card
        as="article"
        tone="accent"
        padding="s"
        aria-label={eyebrow}
        className={styles.card}
        eyebrow={(
          <span className={styles.eyebrowRow}>
            <Avatar name={name} src={face} shape="portrait" size={24} decorative />
            <BrandIcon name={VERB_ICON[preview.verb]} size={18} />
            <span>{eyebrow}</span>
          </span>
        )}
      >
        {preview.requestedByPerson && <p className={styles.asked}>{t('action.youAsked', { name })}</p>}

        {editing
          ? (
            <div className={styles.edit}>
              {preview.verb === 'email' && <Input label={t('action.subject')} value={subject} onChange={(event) => { setSubject(event.target.value) }} />}
              <Textarea label={t('action.message')} value={body} rows={6} onChange={(event) => { setBody(event.target.value) }} />
            </div>
          )
          : (
            <>
              {preview.missing !== true && <ActionContent t={t} verb={preview.verb} content={preview} />}
            </>
          )}

        {/* Muse 04:37: sem NENHUMA prévia é "A prévia não chegou…" (a mesma de Aprovações); "parcial" é só da prévia cortada. */}
        {preview.missing === true
          ? <Notice tone="warning">{t('action.missing')}</Notice>
          : preview.blind && <Notice tone="warning">{t('action.partial')}</Notice>}
        {irreversible && <Notice tone="warning">{t('action.irreversible')}</Notice>}

        {canRemember && !editing && onDecide !== undefined && !preview.blind && (
          <label className={styles.remember}>
            <input type="checkbox" checked={remember} disabled={sending} onChange={(event) => { setRemember(event.target.checked) }} />
            <span>{t('action.dontAskNeutral', { name, connector: preview.connectorName })}</span>
          </label>
        )}

        {onDecide !== undefined && (
          <div className={styles.actions}>
            {editing
              ? (
                <>
                  <Button size="s" variant="primary" loading={sending} disabled={body.trim() === ''} onClick={() => { decide('edit', { ...(preview.verb === 'email' ? { subject } : {}), body }) }}>
                    {sending ? t('action.sending') : t('action.saveAndSend')}
                  </Button>
                  <Button size="s" variant="ghost" disabled={sending} onClick={() => { setEditing(false) }}>{t('action.back')}</Button>
                </>
              )
              : (
                <>
                  {preview.missing !== true && (
                    <Button size="s" variant="primary" loading={sending} disabled={preview.blind} onClick={() => { decide('send') }}>
                      {sending ? t('action.sending') : ctaText(t, preview)}
                    </Button>
                  )}
                  {canEdit && <Button size="s" variant="secondary" disabled={sending} onClick={() => { setEditing(true) }}>{t('action.edit')}</Button>}
                  <Button size="s" variant="ghost" disabled={sending} onClick={() => { decide('cancel') }}>{t('action.cancel')}</Button>
                </>
              )}
          </div>
        )}
      </Card>
    </Tag>
  )
}
