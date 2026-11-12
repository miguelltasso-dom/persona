/**
 * EQUIPE-REAL-SPEC §0 (Muse, 05/11): UM cartão de entrega por pedido, quando todas as partes ficaram prontas: "Pronto: {pedido curto}", as partes com os
 * rostos ("Texto da campanha (Bia)"), o selo "Revisado por {R}" quando houve revisão e "Revisar". É o único fechamento do pedido: nada de "Concluído"
 * repetido nem "Pronto" de cada parte no fio.
 *
 * "Revisar" abre APROVAÇÕES com aquela entrega selecionada (o detalhe da caixa V2), onde estão a decisão e o "Revisar mudanças"; só existe com
 * `approvalId` e `onOpenApproval` (nada sem destino). Atrás de `persona.flag.teamwork`. A linha agrupada "A revisão não rodou em {n} parte(s)…" é do
 * Quill (TEAM-8): este cartão não a desenha.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Avatar, Button, Card, Chip } from '../primitives/index.ts'
import type { DeliveryCardUi } from '../remote/map-host-ui.ts'
import { ReviewSkippedNote } from '../teamwork/ReviewedBySeal.tsx'
import { reviewSkippedLineText } from '../teamwork/team-lines-model.ts'
import { DraftFileThumb } from './draft-files/DraftFileThumb.tsx'
import type { DraftFileUi } from './draft-files/draft-files-model.ts'
import styles from './DeliveryCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface DeliveryCardProps {
  readonly t: ChatT
  readonly delivery: DeliveryCardUi
  readonly rowTag?: 'li' | 'div'
  /** "Revisar": abre Aprovações com esta entrega selecionada. Sem o handler (ou sem `approvalId`) não há botão. */
  readonly onOpenApproval?: ((approvalId: string) => void) | undefined
  /** EQUIPE-REAL §0 (TEAM-8): "Ver" na linha agrupada de falha de revisão abre o detalhe da Tarefa no quadro. */
  readonly onOpenTask?: ((taskId: string) => void) | undefined
  /** DESIGN-01 (Fio real d): a ARTE FINAL da entrega (de `deliveryArt`): a miniatura de 240 px no cartão. Sem ela, o cartão é o de sempre. */
  readonly art?: DraftFileUi | undefined
}

export function DeliveryCard({ t, delivery, rowTag = 'li', onOpenApproval, onOpenTask, art }: DeliveryCardProps): ReactNode {
  const skippedLine = reviewSkippedLineText(delivery.reviewSkippedCount)
  const skippedTaskId = delivery.reviewSkippedTaskId ?? delivery.parts[0]?.taskId
  const onOpenSkipped = skippedTaskId !== undefined && onOpenTask !== undefined
    ? () => { onOpenTask(skippedTaskId) }
    : (delivery.approvalId !== undefined && onOpenApproval !== undefined ? () => { onOpenApproval(delivery.approvalId!) } : undefined)
  const Tag = rowTag
  const title = t('team.delivery.title', { title: delivery.title })
  const reviewer = skippedLine !== undefined ? undefined : delivery.reviewedByName
  const approvalId = delivery.approvalId
  // A miniatura abre a MESMA entrega do "Revisar e aplicar" (um destino só); sem destino é só a figura, nunca um botão morto.
  const openArt = approvalId !== undefined && onOpenApproval !== undefined ? () => { onOpenApproval(approvalId) } : undefined
  return (
    <Tag className={styles.row} data-delivery-card="">
      <Card
        as="article"
        tone="success"
        padding="m"
        aria-label={title}
        title={title}
        className={styles.card}
        // BR-P6 (Muse): o spot "pedido pronto" à direita do título, só a partir de 960 px; decorativo, o título já diz "Pronto: {pedido}".
        actions={ILLUSTRATIONS['spot-pedido-pronto'] === undefined ? undefined : (
          <img className={styles.spot} src={ILLUSTRATIONS['spot-pedido-pronto']} alt="" aria-hidden="true" width={48} height={48} data-delivery-spot="" />
        )}
      >
        {/* Carbon (fio-d103 #4): com arte, em larguras >= 600 px a miniatura fica à esquerda e as partes + o rodapé à direita; sem arte nada muda. */}
        <div className={art === undefined ? styles.noArt : styles.withArt} data-delivery-with-art={art === undefined ? undefined : ''}>
          {art !== undefined && (
            <div className={styles.art} data-delivery-art="">
              <DraftFileThumb t={t} file={art} variant="delivery" onOpen={openArt} />
            </div>
          )}
          <div className={art === undefined ? styles.noArt : styles.side} data-delivery-side={art === undefined ? undefined : ''}>
            <ul className={styles.parts} aria-label={t('team.delivery.parts')}>
              {delivery.parts.map((part, index) => {
                const who = part.personaName
                const face = part.characterId === undefined ? undefined : AVATAR_96[part.characterId as keyof typeof AVATAR_96]
                return (
                  <li key={`${index}-${part.taskId}`} className={styles.part}>
                    {who !== undefined && <Avatar name={who} src={face} shape="portrait" size={24} className={styles.partFace} decorative />}
                    <span className={styles.partText} {...(part.fullTitle === undefined ? {} : { title: part.fullTitle })}>{who === undefined ? part.title : t('team.delivery.part', { title: part.title, name: who })}</span>
                  </li>
                )
              })}
            </ul>
            {(reviewer !== undefined || skippedLine !== undefined || (approvalId !== undefined && onOpenApproval !== undefined)) && (
              <div className={styles.footer}>
                {skippedLine !== undefined && (
                  <ReviewSkippedNote
                    count={delivery.reviewSkippedCount}
                    label={t(skippedLine.key, skippedLine.params)}
                    actionLabel={t('review.skipped.action')}
                    onOpen={onOpenSkipped}
                  />
                )}
                {reviewer !== undefined && (
                  <Chip
                    tone="success"
                    size="s"
                    icon={delivery.reviewedByCharacterId === undefined ? undefined : (
                      <img className={styles.face16} src={AVATAR_96[delivery.reviewedByCharacterId as keyof typeof AVATAR_96]} alt="" aria-hidden="true" />
                    )}
                  >
                    {t('team.delivery.reviewedBy', { name: reviewer })}
                  </Chip>
                )}
                {approvalId !== undefined && onOpenApproval !== undefined && (
                  <Button size="s" variant="primary" onClick={() => { onOpenApproval(approvalId) }}>{t('team.delivery.review')}</Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Tag>
  )
}
