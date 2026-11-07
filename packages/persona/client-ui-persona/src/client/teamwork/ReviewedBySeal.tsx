/**
 * TEAM-8 (EQUIPE-REAL-SPEC §(d), D-090): o selo "Revisado por {R}" (rosto 16 + o ícone `revisao`, BR-P6, `Chip success`) nos 3 lugares:
 * 1. no cartão de entrega do fio (`GeneralChannelView.tsx`);
 * 2. no cabeçalho do "Revisar mudanças" (`DraftReviewPanel.tsx` / `ReviewDeliveryPanel.tsx`);
 * 3. no cartão de Aprovações (`ReactiveApprovalsList.tsx` / `InboxDetail.tsx`).
 *
 * Só aparece com `persona.flag.teamwork` ligada, com revisão real (`name` não vazio, nunca um id) e sem `openPoints`
 * (na 3ª volta, com `openPoints > 0`, a entrega segue SEM o selo).
 */

import type { ReactNode } from 'react'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { BrandIcon, Chip } from '../primitives/index.ts'
import styles from '../chat/TeamLine.module.css'
import { isTeamworkEnabled } from './teamwork-flag.ts'

export interface ReviewedBySealReviewer {
  readonly id?: string | undefined
  readonly name: string
  readonly characterId?: string | undefined
  readonly avatarSrc?: string | undefined
  /** Na 3ª volta (`openPoints > 0`), o trabalho segue sem o selo. */
  readonly openPoints?: number | undefined
}

export interface ReviewedBySealProps {
  readonly reviewer?: ReviewedBySealReviewer | undefined
  /** Rótulo pronto ("Revisado por {R}"); quando omitido, usa `Revisado por ${reviewer.name}`. */
  readonly label?: string | undefined
}

export function ReviewedBySeal({ reviewer, label }: ReviewedBySealProps): ReactNode {
  if (!isTeamworkEnabled() || reviewer === undefined) return null
  const name = reviewer.name.trim()
  if (name === '') return null
  if (typeof reviewer.openPoints === 'number' && Number.isFinite(reviewer.openPoints) && reviewer.openPoints > 0) {
    return null
  }
  const src = reviewer.avatarSrc
    ?? personaPortraitSrc(reviewer.characterId ?? reviewer.id, name)
    ?? personaPortraitSrc(undefined, name)
  return (
    <Chip size="s" tone="success">
      <span className={styles.reviewedSeal} data-teamwork="reviewed-seal">
        <span className={styles.reviewedFace} aria-hidden="true">
          {src === undefined
            ? <span>{name.slice(0, 1).toUpperCase()}</span>
            : <img src={src} alt="" />}
        </span>
        <BrandIcon name="revisao" size={12} />
        <span>{label ?? `Revisado por ${name}`}</span>
      </span>
    </Chip>
  )
}

export interface ReviewSkippedNoteProps {
  /** Quantas partes do pedido tiveram falha técnica de revisão (≥ 1 para aparecer). */
  readonly count?: number | undefined
  /** Texto pronto ("A revisão não rodou em {n} parte(s); seguiram sem o selo"). */
  readonly label?: string | undefined
  readonly actionLabel?: string | undefined
  readonly onOpen?: (() => void) | undefined
}

/**
 * EQUIPE-REAL-SPEC §0 ("Falha técnica de revisão"): nunca uma linha por tarefa no fio; se a revisão falhou em ≥ 1 parte do
 * mesmo pedido, aparece UMA linha agrupada no cartão de entrega: "A revisão não rodou em {n} parte(s); seguiram sem o selo · Ver".
 */
export function ReviewSkippedNote({ count, label, actionLabel = 'Ver', onOpen }: ReviewSkippedNoteProps): ReactNode {
  if (!isTeamworkEnabled() || count === undefined || !Number.isFinite(count)) return null
  const n = Math.floor(count)
  if (n <= 0) return null
  const defaultText = n === 1
    ? 'A revisão não rodou em 1 parte; seguiu sem o selo'
    : `A revisão não rodou em ${n} partes; seguiram sem o selo`
  return (
    <span className={styles.reviewSkippedNote} data-teamwork="review-skipped">
      <span>{label ?? defaultText}</span>
      {onOpen !== undefined && (
        <button type="button" className={styles.action} onClick={onOpen}>
          {actionLabel}
        </button>
      )}
    </span>
  )
}
