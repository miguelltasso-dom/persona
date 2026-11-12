/**
 * PERSONA-POWERS-SPEC §1–2: o CONTEÚDO de uma ação externa, desenhado UMA vez: a prévia (antes de enviar) e o "Ver" (depois, só leitura) mostram
 * o mesmo conteúdo. Email: Para (negrito) · Assunto · Mensagem (até 6 linhas + Ver tudo). Post: o texto. Pagamento: Valor e Quem recebe (negrito) ·
 * Referência. Apagar: a lista (até 6 + "e mais n"). O texto da persona é só texto.
 */

import { useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActionContentUi } from '../remote/map-host-ui.ts'
import styles from './ActionPreviewCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** Quantas linhas do corpo cabem antes de "Ver tudo". */
export const ACTION_BODY_LINES = 6
/** Quantos itens a apagar a lista mostra antes do "e mais n". */
export const ACTION_ITEMS_MAX = 6

/** O corpo (ou o texto do post): até 6 linhas e "Ver tudo". */
function BodyBlock({ t, text }: { readonly t: ChatT; readonly text: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const id = useId()
  const long = text.split('\n').length > ACTION_BODY_LINES || text.length > 360
  return (
    <div className={styles.bodyWrap}>
      <p id={id} className={styles.bodyText} data-clamped={long && !open ? '' : undefined}>{text}</p>
      {long && (
        <button type="button" className={styles.link} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(value => !value) }}>
          {open ? t('action.seeLess') : t('action.seeAll')}
        </button>
      )}
    </div>
  )
}

export interface ActionContentProps {
  readonly t: ChatT
  readonly verb: 'email' | 'post' | 'pay' | 'delete'
  readonly content: ActionContentUi
}

export function ActionContent({ t, verb, content }: ActionContentProps): ReactNode {
  // P0-06b: "e mais N" abre: a pessoa vê TODOS os itens que o host mandou antes de aprovar (o que o host cortou acima do limite dele segue como texto, e a prévia cortada já não deixa enviar).
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const shownItems = expanded ? content.items : content.items.slice(0, ACTION_ITEMS_MAX)
  const revealable = content.items.length - ACTION_ITEMS_MAX
  const missing = Math.max(content.count - content.items.length, 0)
  return (
    <>
      {verb === 'email' && (
        <dl className={styles.fields}>
          <div><dt>{t('action.to')}</dt><dd><strong>{content.to}</strong></dd></div>
          {/* P0-10: quem mais recebe (Cc, Cco) e o que vai junto (Anexos) aparecem; nada que o host manda fica escondido na hora de aprovar. */}
          {content.cc !== undefined && <div><dt>{t('action.cc')}</dt><dd><strong>{content.cc}</strong></dd></div>}
          {content.bcc !== undefined && <div><dt>{t('action.bcc')}</dt><dd><strong>{content.bcc}</strong></dd></div>}
          {content.subject !== undefined && <div><dt>{t('action.subject')}</dt><dd>{content.subject}</dd></div>}
          {content.attachments !== undefined && content.attachments.length > 0 && (
            <div>
              <dt>{t('action.attachments')}</dt>
              <dd>
                <ul className={styles.attachments}>
                  {content.attachments.map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
      {(verb === 'email' || verb === 'post') && content.body !== undefined && <BodyBlock t={t} text={content.body} />}
      {verb === 'pay' && (
        <dl className={styles.fields}>
          {content.amount !== undefined && <div><dt>{t('action.amount')}</dt><dd><strong>{content.amount}</strong></dd></div>}
          {content.payee !== undefined && <div><dt>{t('action.payee')}</dt><dd><strong>{content.payee}</strong></dd></div>}
          {content.reference !== undefined && <div><dt>{t('action.reference')}</dt><dd>{content.reference}</dd></div>}
        </dl>
      )}
      {verb === 'delete' && shownItems.length > 0 && (
        <ul className={styles.items} id={listId}>
          {shownItems.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          {revealable > 0 && (
            <li className={styles.moreItems}>
              <button type="button" className={styles.link} aria-expanded={expanded} aria-controls={listId} onClick={() => { setExpanded(value => !value) }}>
                {expanded ? t('action.seeLess') : t('action.moreItems', { n: revealable })}
              </button>
            </li>
          )}
          {missing > 0 && <li className={styles.moreItems}>{t('action.moreItems', { n: missing })}</li>}
        </ul>
      )}
    </>
  )
}
