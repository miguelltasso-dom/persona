/**
 * EQUIPE-REAL-SPEC §(e) (Muse 07/11 15:25): os ARQUIVOS que a persona gravou no rascunho. Puro (sem React): lê `DraftFileView` do host
 * (Forge 15:47: path, name, mime, taskId, personaId, size?, thumb?, pngPath?) com cuidado (item inválido some; nunca derruba o fio) e fica com a miniatura.
 *
 * A imagem é SEMPRE o `thumb` que o host fez quando a linha nasceu (um PNG pequeno em `data:`), e passa pela porta única das imagens do Revisar
 * (`safeReviewImageSrc`): só `<img src>` de endereço embutido, nunca marcação inline, nunca URL de fora. Um SVG por `<img>` não roda script e não
 * carrega fonte externa. Sem `thumb` (não é imagem, ou o host não conseguiu), a tela mostra o ícone do tipo; nunca um quadro quebrado.
 * Todos os nomes do fio moram AQUI e em `persona-remote-types.ts`: se o host mudar, muda este arquivo.
 */
import { fileTypeOf, type FileType } from '../../primitives/index.ts'
import { safeReviewImageSrc } from '../../review/simple/image-src.ts'

/** O que a tela faz com um arquivo do rascunho: abre o Revisar na Tarefa dele (o `taskId` é o `ticketId` do Revisar) naquele caminho. */
export interface DraftFileTarget {
  readonly taskId: string
  readonly path: string
}

export interface DraftFileUi {
  /** Relativo à raiz do rascunho, com `/`: o MESMO texto que o Revisar usa para o arquivo. */
  readonly path: string
  /** O que a linha mostra (`cartaz.svg`). */
  readonly name: string
  readonly mime: string
  /** A Tarefa do Revisar. */
  readonly taskId: string
  readonly personaId: string
  readonly type: FileType
  /** A miniatura PRONTA (`data:image/…` já pela porta única); ausente = o ícone do tipo. */
  readonly thumb?: string
  /** Num SVG: o PNG irmão que o time viu. */
  readonly pngPath?: string
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/**
 * Os arquivos que o host mandou → a forma da tela. Item sem `path` (ou repetido) some; `name` cai no último trecho do caminho.
 * @param raw - `MessageView.filesSaved.files` ou `OpinionView.files`, do jeito que o host mandou (desconhecido até aqui).
 * @returns A lista na ordem do host; vazia quando não há nada em que confiar.
 */
export function mapDraftFiles(raw: unknown): readonly DraftFileUi[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const files: DraftFileUi[] = []
  for (const row of raw as readonly unknown[]) {
    if (typeof row !== 'object' || row === null) continue
    const item = row as Readonly<Record<string, unknown>>
    const path = text(item.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    const name = text(item.name) || baseName(path)
    const thumb = safeReviewImageSrc(typeof item.thumb === 'string' ? item.thumb : undefined)
    const pngPath = text(item.pngPath)
    files.push({
      path,
      name,
      mime: text(item.mime),
      taskId: text(item.taskId),
      personaId: text(item.personaId),
      type: fileTypeOf(name),
      ...(thumb === undefined ? {} : { thumb }),
      ...(pngPath === '' ? {} : { pngPath }),
    })
  }
  return files
}

const stemOf = (path: string): string => path.replace(/\.[^./]+$/u, '').toLowerCase()

/**
 * Uma arte pode chegar como o `.svg` E o `.png` irmão (Bolt 15:44: o time recebe o PNG). O cartão de opinião mostra UMA miniatura por arte:
 * o `.svg` (o arquivo da persona) fica, com a miniatura do PNG se ele mesmo não tiver; o `.png` irmão (pelo `pngPath` ou pelo mesmo nome) sai da lista.
 * @param files - Os arquivos em opinião, na ordem do host.
 */
export function groupArt(files: readonly DraftFileUi[]): readonly DraftFileUi[] {
  const isSvg = (file: DraftFileUi): boolean => /\.svg$/iu.test(file.name)
  const isPng = (file: DraftFileUi): boolean => /\.png$/iu.test(file.name)
  const siblingOf = new Map<string, DraftFileUi>()
  for (const svg of files.filter(isSvg)) {
    const png = files.find(other => isPng(other) && (other.path === svg.pngPath || stemOf(other.path) === stemOf(svg.path)))
    if (png !== undefined) siblingOf.set(svg.path, png)
  }
  const hidden = new Set([...siblingOf.values()].map(file => file.path))
  return files
    .filter(file => !hidden.has(file.path))
    .map((file) => {
      const png = siblingOf.get(file.path)
      return png?.thumb !== undefined && file.thumb === undefined ? { ...file, thumb: png.thumb } : file
    })
}
