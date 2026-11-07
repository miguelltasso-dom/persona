/**
 * EQUIPE-REAL-SPEC §(e) (Muse 07/11 15:25): a linha tipada "{name} salvou {file} no rascunho". UMA por turno que gravou arquivos, nunca uma por gravação
 * (o host manda `MessageView.filesSaved`); com 2 ou mais, "{name} salvou {count} arquivos no rascunho", até 3 miniaturas e o "+{n} arquivos" no fim.
 * Sem balão, família da linha de equipe (`TeamLine`): o rosto da persona e a frase; a miniatura de 40 px à direita. Imagem e SVG só por `<img src>` do `thumb`
 * (nunca inline); outros tipos levam o ícone do tipo. O clique na frase ou numa miniatura abre o Revisar naquele arquivo (`onOpenDraftFile`); sem o destino, é só a figura.
 *
 * Só com `persona.flag.teamwork` (quem monta decide); a linha quebra o grupo de balões (`group-breakers.ts`).
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../../assets/generated-imports.ts'
import { Avatar } from '../../primitives/index.ts'
import { DraftFileThumb } from './DraftFileThumb.tsx'
import type { DraftFileTarget, DraftFileUi } from './draft-files-model.ts'
import styles from './DraftFilesLine.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** Até 3 miniaturas na linha; o resto vira "+{n} arquivos". */
export const DRAFT_LINE_MAX_THUMBS = 3

/** A frase da linha, sem marcação (também usada pelos testes). `undefined` = sem arquivos. */
export function draftFilesSentence(t: ChatT, personaName: string, files: readonly DraftFileUi[]): string | undefined {
  const first = files[0]
  if (first === undefined) return undefined
  return files.length === 1 ? t('team.fileSaved', { name: personaName, file: first.name }) : t('team.filesSaved', { name: personaName, count: files.length })
}

export interface DraftFilesLineProps {
  readonly t: ChatT
  readonly files: readonly DraftFileUi[]
  readonly personaName: string
  /** O id do personagem (o rosto); sem ele, as iniciais. */
  readonly personaCharacterId?: string | undefined
  readonly timeLabel?: string | undefined
  readonly rowTag?: 'li' | 'div'
  /** "Abrir em Revisar mudanças": sem isto a linha é só leitura. */
  readonly onOpenDraftFile?: ((target: DraftFileTarget) => void) | undefined
}

export function DraftFilesLine({ t, files, personaName, personaCharacterId, timeLabel, rowTag = 'li', onOpenDraftFile }: DraftFilesLineProps): ReactNode | null {
  const sentence = draftFilesSentence(t, personaName, files)
  const first = files[0]
  if (sentence === undefined || first === undefined) return null
  const Tag = rowTag
  const shown = files.slice(0, files.length === 1 ? 1 : DRAFT_LINE_MAX_THUMBS)
  const more = files.length - shown.length
  const open = onOpenDraftFile === undefined ? undefined : (file: DraftFileUi): void => { onOpenDraftFile({ taskId: file.taskId, path: file.path }) }
  const src = personaCharacterId === undefined ? undefined : AVATAR_96[personaCharacterId as keyof typeof AVATAR_96]
  return (
    <Tag className={styles.line} data-draft-files-line={files.length === 1 ? 'one' : 'many'}>
      <span className={styles.face} aria-hidden="true"><Avatar name={personaName} src={src} shape="portrait" size={24} decorative /></span>
      <p className={styles.text}>
        {open === undefined ? sentence : <button type="button" className={styles.open} onClick={() => { open(first) }}>{sentence}</button>}
        {timeLabel !== undefined && timeLabel !== '' && <span className={styles.time}> · {timeLabel}</span>}
      </p>
      <span className={styles.thumbs}>
        {shown.map(file => <DraftFileThumb key={file.path} t={t} file={file} variant="chip" onOpen={open} />)}
        {more > 0 && <span className={styles.more}>{more === 1 ? t('team.filesMore.one') : t('team.filesMore', { n: more })}</span>}
      </span>
    </Tag>
  )
}
