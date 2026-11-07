/**
 * EQUIPE-REAL-SPEC §(e): a miniatura de UM arquivo do rascunho. `chip` = o quadrado de 40 px da linha do fio; `art` = a arte no cartão de opinião (o `thumb` do
 * host no tamanho que ele tem, até 192 px, 160 px no cartão recolhido). A imagem é SÓ `<img src>` do `thumb` (já pela porta única do Revisar): nunca marcação
 * inline, nunca URL de fora. Sem `thumb`, o ícone do tipo num quadrado de papel mais fundo com borda de 1 px (nunca um quadro quebrado).
 * Com `onOpen` é um botão ("Abrir {file} em Revisar mudanças", alvo ≥ 24 px); sem ele, só a figura com o nome.
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { UiIcon, type FileType, type UiIconName } from '../../primitives/index.ts'
import type { DraftFileUi } from './draft-files-model.ts'
import styles from './DraftFileThumb.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

const TYPE_ICON: Readonly<Record<FileType, UiIconName>> = { text: 'fileText', sheet: 'fileSheet', image: 'image', pdf: 'file', other: 'file' }

export interface DraftFileThumbProps {
  readonly t: ChatT
  readonly file: DraftFileUi
  readonly variant?: 'chip' | 'art'
  /** Cartão recolhido: a arte menor (160 px). */
  readonly small?: boolean
  readonly onOpen?: ((file: DraftFileUi) => void) | undefined
}

export function DraftFileThumb({ t, file, variant = 'chip', small = false, onOpen }: DraftFileThumbProps): ReactNode {
  const body = file.thumb !== undefined
    ? <img className={styles.image} src={file.thumb} alt="" draggable={false} />
    : <span className={styles.icon} aria-hidden="true"><UiIcon name={TYPE_ICON[file.type]} size={variant === 'art' ? 28 : 20} /></span>
  const className = [styles.box, variant === 'art' ? styles.art : styles.chip, small ? styles.small : undefined].filter(Boolean).join(' ')
  if (onOpen === undefined) {
    return <span className={className} role="img" aria-label={file.name} data-draft-file={file.path}>{body}</span>
  }
  return (
    <button type="button" className={className} data-draft-file={file.path} aria-label={t('team.fileOpen', { file: file.name })} title={file.name} onClick={() => { onOpen(file) }}>
      {body}
    </button>
  )
}
