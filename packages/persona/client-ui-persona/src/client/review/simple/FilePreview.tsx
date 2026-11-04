/** What opens under a file row, by type (SIMPLE-WORKSPACE-SPEC §3): text, spreadsheet, image, or "no preview". */

import { useState, type ReactNode } from 'react'
import { Button } from '../../primitives/index.ts'
import type { DraftFileUi } from './draft-types.ts'
import { BeforeAfterText } from './BeforeAfterText.tsx'
import styles from './FilePreview.module.css'

export interface FilePreviewProps {
  readonly file: DraftFileUi
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
  /** Open the draft's copy with the system (read only). */
  readonly onOpenDraftFile?: ((fileId: string) => void) | undefined
}

type ImageView = 'before' | 'after'

function ImageBeforeAfter({ file, t }: Pick<FilePreviewProps, 'file' | 't'>): ReactNode {
  // Wide: both versions side by side and no buttons. Narrow (CSS container query): one at a time, switched here.
  const [view, setView] = useState<ImageView>('after')
  return (
    <div className={styles.image} data-view={view}>
      <div className={styles.imageControls} role="group" aria-label={t('image.group')}>
        {(['before', 'after'] as const).map(side => (
          <Button
            key={side}
            size="s"
            variant={view === side ? 'primary' : 'secondary'}
            aria-pressed={view === side}
            onClick={() => { setView(side) }}
          >
            {t(`image.${side}`)}
          </Button>
        ))}
      </div>
      <div className={styles.imagePair}>
        {file.beforeImageSrc !== undefined && (
          <figure className={styles.figure} data-side="before">
            <img className={styles.img} src={file.beforeImageSrc} alt={`${file.name} · ${t('image.before')}`} />
            <figcaption className={styles.caption}>{t('image.before')}</figcaption>
          </figure>
        )}
        {file.afterImageSrc !== undefined && (
          <figure className={styles.figure} data-side="after">
            <img className={styles.img} src={file.afterImageSrc} alt={`${file.name} · ${t('image.after')}`} />
            <figcaption className={styles.caption}>{t('image.after')}</figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}

function SheetCells({ file, t }: Pick<FilePreviewProps, 'file' | 't'>): ReactNode {
  const cells = file.cells ?? []
  return (
    <div className={styles.sheet}>
      <p className={styles.sheetSummary}>{cells.length === 1 ? t('sheet.summary.one') : t('sheet.summary.many', { count: cells.length })}</p>
      <ul className={styles.cells}>
        {cells.map(cell => (
          <li key={`${cell.sheet}!${cell.cell}`} className={styles.cell}>
            {t('sheet.cell', { sheet: cell.sheet, cell: cell.cell, before: cell.before, after: cell.after })}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FilePreview({ file, t, onOpenDraftFile }: FilePreviewProps): ReactNode {
  let body: ReactNode = null
  if (file.type === 'image' && (file.beforeImageSrc !== undefined || file.afterImageSrc !== undefined)) {
    body = <ImageBeforeAfter file={file} t={t} />
  } else if (file.type === 'sheet' && file.cells !== undefined && file.cells.length > 0) {
    body = <SheetCells file={file} t={t} />
  } else if (file.ops !== undefined) {
    body = <BeforeAfterText ops={file.ops} t={t} />
  }

  if (body !== null) {
    return (
      <div className={styles.root}>
        {body}
        {file.truncated === true && file.ops === undefined ? <p className={styles.note}>{t('patch.truncated')}</p> : null}
      </div>
    )
  }
  // PDF and everything else (and a file cut short with nothing to show): say so and offer the draft's own copy.
  return (
    <div className={styles.root}>
      <p className={styles.note}>{file.truncated === true ? t('patch.truncated') : t('preview.unavailable')}</p>
      {file.canOpenDraft === true && onOpenDraftFile !== undefined && (
        <Button size="s" variant="secondary" onClick={() => { onOpenDraftFile(file.id) }}>
          {t('preview.openDraft')}
        </Button>
      )}
    </div>
  )
}
