/**
 * D-090 / EQUIPE-REAL-SPEC §(c) (TEAM-8): o PEDIDO DE OPINIÃO no fio. UM cartão estruturado (não um balão): a pergunta, o rascunho (imagem ou
 * texto), as respostas de cada persona com a marca (Gostei / Sugestão / Ponto de atenção), quem não vê imagens, a consolidação com "Antes · Depois"
 * e, depois de consolidado, o bloco recolhe numa linha. Só com a flag `persona.flag.teamwork` (o chamador decide). Todo texto vindo das personas
 * (pergunta, rascunho, respostas) é mostrado COMO TEXTO, nunca como instrução ou HTML. Cada botão só existe quando o chamador entrega o que ele faz.
 */
import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../../assets/generated-imports.ts'
import { Avatar, Button, Card, Chip, Modal, Tooltip } from '../../primitives/index.ts'
import type { ChannelMessageUi } from '../../remote/map-host-ui.ts'
import type { TeamView } from '../../remote/persona-remote-types.ts'
import { fanoutText } from '../fanout/fanout-rules.ts'
import { dropMoneySegments, usageNotice, usageSuffix, usageWindowLabel } from '../quota-text.ts'
import { needsReadAll, roundsCapReached, splitReplies, type OpinionBlockModel, type OpinionMark } from './opinion-model.ts'
import { DraftFileThumb } from '../draft-files/DraftFileThumb.tsx'
import { groupArt, type DraftFileTarget, type DraftFileUi } from '../draft-files/draft-files-model.ts'
import { useAttachmentImage } from './use-attachment-image.ts'
import styles from './OpinionBlock.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** O que cada botão do cartão faz; sem a função, o botão não existe. */
export interface OpinionActions {
  /** Lê uma imagem do rascunho (bytes do host → URL); sem isto o `alt` aparece no lugar da imagem. */
  readonly resolveImage?: ((attachmentId: string) => Promise<string | null>) | undefined
  /** A ARTE do rascunho (SVG/PNG salvos como arquivo): o clique na miniatura abre o Revisar naquele arquivo; sem a função, é só a figura. */
  readonly onOpenDraftFile?: ((target: DraftFileTarget) => void) | undefined
  /** "Dar minha opinião": leva a pessoa a opinar sobre a pergunta. */
  readonly onGiveOpinion?: ((request: { readonly requestId: string; readonly question: string }) => void) | undefined
  /** "Trocar o motor" da persona que não vê imagens (abre o seletor de motor dela). */
  readonly onChangeEngine?: ((personaId: string) => void) | undefined
  /**
   * "Incluir só pelo texto" (team-real.md §12): a persona sem visão opina sobre a pergunta e o texto, nunca sobre a imagem. Rejeita com a frase pt-BR do host quando o host recusa;
   * sem a função o botão não existe.
   */
  readonly onIncludeTextOnly?: ((request: { readonly requestId: string; readonly personaId: string }) => Promise<void>) | undefined
}

export interface OpinionBlockProps extends OpinionActions {
  readonly t: ChatT
  readonly block: OpinionBlockModel
  readonly team: TeamView | null
  readonly rowTag?: 'li' | 'div'
}

/**
 * O rodapé do cartão. O do Tally vem PRONTO; sem ele, "≈ n respostas" + o uso (D-092: "cerca de {pct}% da janela" na assinatura, "≈ US$ x–y" só na chave de API) e, só se não
 * houver o uso, o texto de custo que o host mandou. Fora da chave de API, trecho que fale em dinheiro nunca aparece. Sem nenhum dos dois: nenhum rodapé.
 */
function footerText(t: ChatT, ask: NonNullable<OpinionBlockModel['request']['opinion']>): ReactNode {
  const billing = ask.usage?.billing
  if (ask.footer !== undefined) return dropMoneySegments(ask.footer, billing)
  if (ask.estimate === undefined) return undefined
  const usage = usageSuffix(t, ask.usage)
  const lead = t('opinion.footer', { count: ask.estimate.responses })
  if (usage === undefined) {
    return dropMoneySegments(ask.estimate.cost === undefined ? lead : `${lead} · ${ask.estimate.cost}`, billing)
  }
  // O nome da janela mora no tooltip do trecho do uso (D-092); o texto visível é o mesmo.
  const windowLabel = usageWindowLabel(t, ask.usage)
  const notice = usageNotice(t, ask.usage)
  return (
    <>
      {lead}
      {' · '}
      {windowLabel === undefined ? usage : <Tooltip content={windowLabel}><span tabIndex={0} data-quota-window="">{usage}</span></Tooltip>}
      {notice === undefined ? null : <span data-quota-notice=""> · {notice}</span>}
    </>
  )
}

const avatarOf = (id: string): string | undefined => (AVATAR_96 as Readonly<Record<string, string>>)[id]

const MARK_KEY: Readonly<Record<Exclude<OpinionMark, 'nothing'>, { readonly key: 'opinion.like' | 'opinion.suggestion' | 'opinion.concern'; readonly tone: 'success' | 'info' | 'warning' }>> = {
  liked: { key: 'opinion.like', tone: 'success' },
  suggestion: { key: 'opinion.suggestion', tone: 'info' },
  attention: { key: 'opinion.concern', tone: 'warning' },
}

/** Uma imagem do rascunho: miniatura de até 480 px (160 px no cartão recolhido, Muse 03:29); o clique abre em tamanho real. Sem a imagem, o `alt` no lugar (nunca um quadro quebrado). */
function DraftImage({ t, id, alt, resolveImage, small = false }: {
  readonly t: ChatT
  readonly id: string
  readonly alt: string
  readonly resolveImage: OpinionActions['resolveImage']
  readonly small?: boolean
}): ReactNode {
  const url = useAttachmentImage(resolveImage, id)
  const [open, setOpen] = useState(false)
  if (url === undefined) return <span className={styles.imageLoading} aria-busy="true" role="img" aria-label={alt} />
  if (url === null) return <span className={styles.imageMissing}>{alt}</span>
  return (
    <>
      <button type="button" className={styles.imageButton} onClick={() => { setOpen(true) }} aria-label={alt}>
        <img className={small ? `${styles.thumb ?? ''} ${styles.thumbSmall ?? ''}` : styles.thumb} src={url} alt={alt} />
      </button>
      {open && (
        <Modal open title={alt} closeLabel={t('composer.pastedClose')} onClose={() => { setOpen(false) }} size="l">
          <img className={styles.full} src={url} alt={alt} />
        </Modal>
      )}
    </>
  )
}

/** Texto da persona com limite de linhas e "Ler tudo". É sempre texto (quebras de linha preservadas), nunca markup. */
function ClampedText({ t, value, lines, className }: { readonly t: ChatT; readonly value: string; readonly lines: 3 | 6; readonly className: string | undefined }): ReactNode {
  const [all, setAll] = useState(false)
  const long = needsReadAll(value, lines)
  return (
    <>
      <p className={className} data-clamped={long && !all ? String(lines) : undefined}>{value}</p>
      {long && !all && (
        <button type="button" className={styles.link} onClick={() => { setAll(true) }}>
          {fanoutText(t, 'fanout.readAll', 'Ler tudo')}
        </button>
      )}
    </>
  )
}

export function OpinionBlock({ t, block, team, rowTag, resolveImage, onOpenDraftFile, onGiveOpinion, onChangeEngine, onIncludeTextOnly }: OpinionBlockProps): ReactNode {
  const request = block.request
  const ask = request.opinion
  const consolidated = block.consolidated
  const consolidatedUi = consolidated?.opinion
  // Depois de consolidado o bloco inteiro recolhe para uma linha (a pessoa abre se quiser rever).
  const [expanded, setExpanded] = useState(consolidated === undefined)
  const [beforeAfter, setBeforeAfter] = useState<'before' | 'after'>('after')
  const [blindOpen, setBlindOpen] = useState(false)
  // "Incluir só pelo texto": quem a pessoa acabou de incluir sai do recolhido já (o host confirma a seguir com `textOnlyPersonaIds` e a resposta); o erro é a frase do host.
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set())
  const [including, setIncluding] = useState<ReadonlySet<string>>(new Set())
  const [includeError, setIncludeError] = useState<string | null>(null)
  if (ask === undefined) return null
  const RowTag = rowTag === 'div' ? 'div' : 'li'
  const requesterName = request.authorName
  const { said, nothing } = splitReplies(block.replies)
  // O recolhido = `noVision − textOnlyPersonaIds` (team-real.md §12), sem quem acabou de ser incluído.
  const blind = ask.noVision
    .filter(id => !(ask.textOnlyPersonaIds ?? []).includes(id) && !included.has(id))
    .map(id => ({ id, name: team?.personas.find(persona => persona.id === id)?.name ?? id }))
  const includeTextOnly = (personaId: string): void => {
    if (onIncludeTextOnly === undefined) return
    setIncludeError(null)
    setIncluding(current => new Set(current).add(personaId))
    onIncludeTextOnly({ requestId: block.requestId, personaId })
      .then(() => { setIncluded(current => new Set(current).add(personaId)) })
      .catch((failure: unknown) => { setIncludeError(failure instanceof Error ? failure.message : '') })
      .finally(() => { setIncluding((current) => { const next = new Set(current); next.delete(personaId); return next }) })
  }
  const imageAlt = ask.alt ?? t('opinion.imageAlt', { name: requesterName })
  // A ARTE salva como arquivo no rascunho (Atlas 07/11: a opinião é sobre a IMAGEM): UMA miniatura por arte (o `.svg` e o `.png` irmão viram um item só).
  const arts = groupArt(ask.files ?? [])
  const openArt = onOpenDraftFile === undefined ? undefined : (file: DraftFileUi): void => { onOpenDraftFile({ taskId: file.taskId, path: file.path }) }
  const version = consolidatedUi?.version
  // Gauge 07/11 (dia roteirizado): a consolidação que só PROMETE ("Vou aumentar o texto…") trazia `before` e nenhum `after`, e a coluna "Depois" saía com a legenda e SEM conteúdo
  // (no texto, o alternador mostrava um parágrafo vazio): lê como defeito. Sem nova versão não há o que comparar: fica só a frase da consolidação, sem "Versão k" nem Antes · Depois.
  // Modo imagem (algum lado tem imagem): precisa de imagem em `after`; modo texto: precisa de texto em `after`.
  const imageCompare = version !== undefined && (version.after.imageIds.length > 0 || version.before.imageIds.length > 0)
  const hasNewVersion = version !== undefined && (imageCompare ? version.after.imageIds.length > 0 : (version.after.text ?? '').trim() !== '')
  const [beforeLabel = 'Antes', afterLabel = 'Depois'] = t('opinion.beforeAfter').split(' · ')
  const merged = consolidated === undefined ? undefined : t('opinion.merged', { name: consolidated.authorName, summary: consolidated.body })
  const cap = roundsCapReached(block)
  // Muse 07/11 (achado do Quill): com UMA rodada saía "as 1 rodadas"; a forma singular tem chave própria (`.one`), como os outros contadores do app.
  const capLine = t(ask.maxRounds === 1 ? 'opinion.roundsCap.one' : 'opinion.roundsCap', { name: requesterName, count: ask.maxRounds })
  // O rodapé do Tally vem PRONTO; sem ele, a composição a partir da estimativa medida; sem nenhum dos dois, nenhum rodapé.
  const footer = ask === undefined ? undefined : footerText(t, ask)
  // Muse 03:29: o resumo das marcas ("2 Gostei · 1 Sugestão") do cartão recolhido; só as marcas que existem.
  const marks = (['liked', 'suggestion', 'attention'] as const)
    .map(mark => ({ mark, count: said.filter(reply => reply.opinion?.mark === mark).length, ...MARK_KEY[mark] }))
    .filter(row => row.count > 0)
  const hasReplies = said.length > 0 || nothing.length > 0
  /** A consolidação ("{A} juntou as opiniões", a versão com Antes · Depois): vale no cartão recolhido (imagens de 160 px) e no aberto (480 px). */
  const mergedBlock = (small: boolean): ReactNode => {
    if (merged === undefined) return null
    return (
      <div className={styles.merged}>
        <p className={styles.mergedLine}>{merged}</p>
        {version !== undefined && hasNewVersion && (
          <div className={styles.version}>
            <p className={styles.versionTitle}>{t('opinion.version', { k: version.k })}</p>
            {imageCompare ? (
              <div className={styles.compare}>
                <figure className={styles.side}>
                  <figcaption>{beforeLabel}</figcaption>
                  {version.before.imageIds.map(id => <DraftImage key={id} t={t} id={id} alt={`${beforeLabel}: ${imageAlt}`} resolveImage={resolveImage} small={small} />)}
                </figure>
                <figure className={styles.side}>
                  <figcaption>{afterLabel}</figcaption>
                  {version.after.imageIds.map(id => <DraftImage key={id} t={t} id={id} alt={`${afterLabel}: ${imageAlt}`} resolveImage={resolveImage} small={small} />)}
                </figure>
              </div>
            ) : (
              <div className={styles.textCompare}>
                <div className={styles.toggle} role="group" aria-label={t('opinion.beforeAfter')}>
                  <button type="button" aria-pressed={beforeAfter === 'before'} onClick={() => { setBeforeAfter('before') }}>{beforeLabel}</button>
                  <button type="button" aria-pressed={beforeAfter === 'after'} onClick={() => { setBeforeAfter('after') }}>{afterLabel}</button>
                </div>
                <p className={styles.draftText}>{(beforeAfter === 'before' ? version.before.text : version.after.text) ?? ''}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <RowTag className={styles.row} data-message-id={request.id}>
      <Card as="article" padding="s" className={styles.card} data-persona-opinion={block.requestId} data-collapsed={expanded ? undefined : ''}>
        <header className={styles.head}>
          <Avatar name={requesterName} src={avatarOf(request.authorId)} shape="portrait" size={24} decorative />
          <span className={styles.eyebrow}>{t('opinion.eyebrow', { name: requesterName })}</span>
          {ask.maxRounds > 1 && <span className={styles.round}>{t('opinion.round', { i: ask.round, n: ask.maxRounds })}</span>}
        </header>

        {!expanded && merged !== undefined ? (
          <>
            <div className={styles.summary}>
              {ask.imageIds[0] !== undefined && <DraftImage t={t} id={ask.imageIds[0]} alt={imageAlt} resolveImage={resolveImage} small />}
              {ask.imageIds[0] === undefined && arts[0] !== undefined && <DraftFileThumb t={t} file={arts[0]} variant="art" small onOpen={openArt} />}
              <div className={styles.summaryText}>
                <p className={styles.questionLine}>{request.body}</p>
                {marks.length > 0 && (
                  <ul className={styles.markSummary}>
                    {marks.map(row => <li key={row.mark}><Chip size="s" tone={row.tone}>{`${String(row.count)} ${t(row.key)}`}</Chip></li>)}
                  </ul>
                )}
              </div>
            </div>
            {mergedBlock(true)}
            {cap && (
              <p className={styles.cap}>{capLine}</p>
            )}
            {hasReplies && (
              <button type="button" className={styles.link} aria-expanded={false} onClick={() => { setExpanded(true) }}>
                {t('opinion.showReplies')}
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.question}>{request.body}</p>

            {ask.imageIds.length > 0 && (
              <div className={styles.draftImages}>
                {ask.imageIds.map(id => <DraftImage key={id} t={t} id={id} alt={imageAlt} resolveImage={resolveImage} />)}
              </div>
            )}
            {arts.length > 0 && (
              <div className={styles.draftImages} data-persona-opinion-art="">
                {arts.map(file => (
                  <figure key={file.path} className={styles.artFigure}>
                    <DraftFileThumb t={t} file={file} variant="art" onOpen={openArt} />
                    <figcaption className={styles.artName}>{file.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {ask.draftText !== undefined && <ClampedText t={t} value={ask.draftText} lines={6} className={styles.draftText} />}
            {footer !== undefined && <p className={styles.footnote}>{footer}</p>}

            {(said.length > 0 || nothing.length > 0) && (
              <ul className={styles.replies}>
                {said.map(reply => (
                  <ReplyRow key={reply.id} t={t} reply={reply} />
                ))}
                {nothing.length > 0 && (
                  <li className={styles.nothing}>{fanoutText(t, 'fanout.nothingMore', 'e mais {count} sem nada a acrescentar', { count: nothing.length })}</li>
                )}
              </ul>
            )}

            {blind.length > 0 && (
              <div className={styles.blind}>
                <button type="button" className={styles.link} aria-expanded={blindOpen} onClick={() => { setBlindOpen(open => !open) }}>
                  {t('opinion.noVisionMany', { count: blind.length })}
                </button>
                {blindOpen && (
                  <ul className={styles.blindList}>
                    {blind.map(person => (
                      <li key={person.id} className={styles.blindRow}>
                        <span>{t('opinion.noVision', { name: person.name })}</span>
                        {onIncludeTextOnly !== undefined && (
                          <Button size="s" variant="secondary" loading={including.has(person.id)} disabled={including.has(person.id)} onClick={() => { includeTextOnly(person.id) }}>{t('opinion.includeTextOnly')}</Button>
                        )}
                        {onChangeEngine !== undefined && (
                          <Button size="s" variant="ghost" onClick={() => { onChangeEngine(person.id) }}>{t('opinion.changeEngine')}</Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {includeError !== null && includeError !== '' && <p className={styles.cap} role="alert">{includeError}</p>}
              </div>
            )}

            {mergedBlock(false)}

            {cap && (
              <p className={styles.cap}>{capLine}</p>
            )}

            {onGiveOpinion !== undefined && consolidated === undefined && (
              <div className={styles.actions}>
                <Button size="s" variant="secondary" onClick={() => { onGiveOpinion({ requestId: block.requestId, question: request.body }) }}>
                  {t('opinion.mine')}
                </Button>
              </div>
            )}
            {consolidated !== undefined && hasReplies && (
              <button type="button" className={styles.link} aria-expanded onClick={() => { setExpanded(false) }}>
                {t('opinion.hideReplies')}
              </button>
            )}
          </>
        )}
      </Card>
    </RowTag>
  )
}

function ReplyRow({ t, reply }: { readonly t: ChatT; readonly reply: ChannelMessageUi }): ReactNode {
  const mark = reply.opinion?.mark
  const chip = mark === undefined || mark === 'nothing' ? undefined : MARK_KEY[mark]
  return (
    <li className={styles.reply} data-author={reply.authorId === 'user' ? 'user' : 'persona'}>
      <Avatar name={reply.authorName} src={avatarOf(reply.authorId)} shape={reply.authorId === 'user' ? 'person' : 'portrait'} size={24} decorative />
      <div className={styles.replyBody}>
        <div className={styles.replyHead}>
          <span className={styles.replyName}>{reply.authorName}</span>
          {/* §(c): quem opinou só pelo texto leva SEMPRE o rótulo visível, ao lado do nome. */}
          {reply.opinion?.textOnly === true && <Chip size="s" tone="neutral" data-persona-text-only="">{t('opinion.textOnlyBadge')}</Chip>}
          {chip !== undefined && <Chip size="s" tone={chip.tone}>{t(chip.key)}</Chip>}
        </div>
        {reply.body !== '' && <ClampedText t={t} value={reply.body} lines={3} className={styles.replyText} />}
      </div>
    </li>
  )
}
