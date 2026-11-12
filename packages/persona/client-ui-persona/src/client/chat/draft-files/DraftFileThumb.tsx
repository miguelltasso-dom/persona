/**
 * EQUIPE-REAL-SPEC §(e): a miniatura de UM arquivo do rascunho. `chip` = o quadrado de 40 px da linha do fio; `art` = a arte no cartão de opinião (o `thumb` do
 * host no tamanho que ele tem, até 192 px, 160 px no cartão recolhido). A imagem é SÓ `<img src>` do `thumb` (já pela porta única do Revisar): nunca marcação
 * inline, nunca URL de fora. Sem `thumb`, o ícone do tipo num quadrado de papel mais fundo com borda de 1 px (nunca um quadro quebrado).
 * Com `onOpen` é um botão ("Abrir {file} em Revisar mudanças", alvo ≥ 24 px); sem ele, só a figura com o nome.
 */
import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { UiIcon, type FileType, type UiIconName } from '../../primitives/index.ts'
import type { DraftFileUi } from './draft-files-model.ts'
import styles from './DraftFileThumb.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

const TYPE_ICON: Readonly<Record<FileType, UiIconName>> = { text: 'fileText', sheet: 'fileSheet', image: 'image', pdf: 'file', other: 'file' }

export interface DraftFileThumbProps {
  readonly t: ChatT
  readonly file: DraftFileUi
  /** `pill` = 36 px na pílula da opinião recolhida; `hero` = a arte grande do cartão de opinião (até 320 px); `delivery` = 240 px no cartão de entrega (DESIGN-01, Fio real). */
  readonly variant?: 'chip' | 'art' | 'pill' | 'hero' | 'delivery'
  /** Cartão recolhido: a arte menor (160 px). */
  readonly small?: boolean
  readonly onOpen?: ((file: DraftFileUi) => void) | undefined
}

/** O SVG da persona chega como `data:image/svg+xml` (o arquivo dela, já sanitizado, por `<img src>`): é vetor e escala sem perder nada. */
const isVector = (thumb: string): boolean => /^data:image\/svg\+xml/iu.test(thumb)

export function DraftFileThumb({ t, file, variant = 'chip', small = false, onOpen }: DraftFileThumbProps): ReactNode {
  // DESIGN-01 (Muse 13:40): raster NUNCA além do tamanho real: no cartão aberto (hero) e na entrega, o teto é a largura natural ÷ DPR (192 px a 2x = 96 px CSS), centrado, sem esticar nem borrar.
  const grows = variant === 'hero' || variant === 'delivery'
  const kind = file.thumb === undefined ? undefined : isVector(file.thumb) ? 'vector' : 'raster'
  const [natural, setNatural] = useState<{ readonly src: string; readonly width: number } | undefined>(undefined)
  const cap = natural !== undefined && natural.src === file.thumb ? natural.width : undefined
  const rasterGrows = grows && kind === 'raster'
  const thumbSrc = file.thumb
  const body = thumbSrc !== undefined
    ? (
      <img
        className={styles.image}
        src={thumbSrc}
        alt=""
        draggable={false}
        {...(rasterGrows
          ? {
            onLoad: (event: { readonly currentTarget: HTMLImageElement }) => {
              const width = event.currentTarget.naturalWidth
              if (width > 0) setNatural({ src: thumbSrc, width: width / (window.devicePixelRatio > 0 ? window.devicePixelRatio : 1) })
            },
          }
          : {})}
        {...(rasterGrows && cap !== undefined ? { style: { maxWidth: `${String(cap)}px` } } : {})}
      />
    )
    : <span className={styles.icon} aria-hidden="true"><UiIcon name={TYPE_ICON[file.type]} size={variant === 'chip' || variant === 'pill' ? 20 : 28} /></span>
  const className = [styles.box, styles[variant], small ? styles.small : undefined].filter(Boolean).join(' ')
  if (onOpen === undefined) {
    return <span className={className} role="img" aria-label={file.name} data-draft-file={file.path} data-thumb={grows ? kind : undefined}>{body}</span>
  }
  return (
    <button type="button" className={className} data-draft-file={file.path} data-thumb={grows ? kind : undefined} aria-label={t('team.fileOpen', { file: file.name })} title={file.name} onClick={() => { onOpen(file) }}>
      {body}
    </button>
  )
}
