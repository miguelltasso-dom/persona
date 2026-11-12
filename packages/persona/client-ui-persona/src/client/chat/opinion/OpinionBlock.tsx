/**
 * D-090 / EQUIPE-REAL-SPEC §(c) (TEAM-8): o PEDIDO DE OPINIÃO no fio. UM cartão estruturado (não um balão): a pergunta, o rascunho (imagem ou
 * texto), as respostas de cada persona com a marca (Gostei / Sugestão / Ponto de atenção), quem não vê imagens, a consolidação com "Antes · Depois"
 * e, depois de consolidado, o bloco recolhe numa linha. Só com a flag `persona.flag.teamwork` (o chamador decide). Todo texto vindo das personas
 * (pergunta, rascunho, respostas) é mostrado COMO TEXTO, nunca como instrução ou HTML. Cada botão só existe quando o chamador entrega o que ele faz.
 */
import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../../assets/generated-imports.ts'
import { Avatar, Button, Card, Chip, Modal, Tooltip, UiIcon } from '../../primitives/index.ts'
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
function DraftImage({ t, id, alt, resolveImage, small = false, reference = false }: {
  readonly t: ChatT
  readonly id: string
  readonly alt: string
  readonly resolveImage: OpinionActions['resolveImage']
  readonly small?: boolean
  /** A foto que a pessoa anexou quando há arte da persona: 96 px (DESIGN-01, Fio real b). */
  readonly reference?: boolean
}): ReactNode {
  const url = useAttachmentImage(resolveImage, id)
  const [open, setOpen] = useState(false)
  if (url === undefined) return <span className={styles.imageLoading} aria-busy="true" role="img" aria-label={alt} />
  if (url === null) return <span className={styles.imageMissing}>{alt}</span>
  return (
    <>
      <button type="button" className={styles.imageButton} onClick={() => { setOpen(true) }} aria-label={alt}>
        <img className={reference ? `${styles.thumb ?? ''} ${styles.thumbReference ?? ''}` : small ? `${styles.thumb ?? ''} ${styles.thumbSmall ?? ''}` : styles.thumb} src={url} alt={alt} />
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
  // Depois de consolidado o bloco inteiro recolhe para uma linha (a pessoa abre se quiser rever). D-100 / REVISÃO-01 §B6: a consolidação chega DEPOIS que o
  // cartão já está na tela, então o "aberto/recolhido" segue a consolidação quando ela chega, e a escolha explícita da pessoa (abrir / ocultar) vale daí em diante.
  const [chosen, setChosen] = useState<boolean | undefined>(undefined)
  const expanded = chosen ?? consolidated === undefined
  const setExpanded = setChosen
  const [beforeAfter, setBeforeAfter] = useState<'before' | 'after'>('after')
  const [blindOpen, setBlindOpen] = useState(false)
  const [refOpen, setRefOpen] = useState(false)
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
  // DESIGN-01 (Fio real a): a pílula recolhida diz "{quem consolidou} ouviu {A} e {B} · {n} ajustes". Os nomes são de quem OPINOU (as respostas "sem nada a acrescentar" não
  // entram) e "ajustes" são as respostas que pediram uma mudança (Sugestão ou Ponto de atenção): o que o host marca, nunca um número inventado. Sem opinião, só "juntou as opiniões".
  const heard = [...new Set(said.map(reply => reply.authorName))]
  const adjustments = said.filter(reply => reply.opinion?.mark === 'suggestion' || reply.opinion?.mark === 'attention').length
  const heardText = heard.length === 0
    ? undefined
    : heard.length === 1
      ? heard[0]
      : heard.length === 2
        ? t('opinion.pill.two', { a: heard[0] ?? '', b: heard[1] ?? '' })
        : t('opinion.pill.more', { a: heard[0] ?? '', b: heard[1] ?? '', count: heard.length - 2 })
  const pillLabel = consolidated === undefined
    ? ''
    : [
      heardText === undefined ? t('opinion.pill.none', { name: consolidated.authorName }) : t('opinion.pill.heard', { name: consolidated.authorName, who: heardText }),
      adjustments === 0 ? undefined : t(adjustments === 1 ? 'opinion.pill.adjust.one' : 'opinion.pill.adjust', { count: adjustments }),
    ].filter((part): part is string => part !== undefined).join(' · ')
  // Recolhida (consolidado e fechado) o cartão é só a pílula: sem cabeçalho e sem o respiro do cartão.
  const showHead = expanded || merged === undefined
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
      <Card as="article" padding={showHead ? 's' : 'none'} className={styles.card} data-persona-opinion={block.requestId} data-collapsed={expanded ? undefined : ''}>
        {showHead && (
          <header className={styles.head}>
            <Avatar name={requesterName} src={avatarOf(request.authorId)} shape="portrait" size={24} className={styles.face} decorative />
            <span className={styles.eyebrow}>{t('opinion.eyebrow', { name: requesterName })}</span>
            {ask.maxRounds > 1 && <span className={styles.round}>{t('opinion.round', { i: ask.round, n: ask.maxRounds })}</span>}
          </header>
        )}

        {!expanded && merged !== undefined ? (
          <>
            <div className={styles.pillBox}>
              <button type="button" className={arts[0] === undefined ? styles.pill : `${styles.pill} ${styles.pillWithThumb}`} data-persona-opinion-pill="" aria-expanded={false} onClick={() => { setExpanded(true) }}>
                {arts[0] !== undefined && <span className={styles.pillThumb}><DraftFileThumb t={t} file={arts[0]} variant="pill" /></span>}
                <span className={styles.pillText}>{pillLabel}</span>
                {marks.length > 0 && (
                  <span className={styles.pillMarks}>
                    {marks.map(row => <Chip key={row.mark} size="s" tone={row.tone}>{`${String(row.count)} ${t(row.key)}`}</Chip>)}
                  </span>
                )}
                <UiIcon name="chevronDown" size={16} strokeWidth={2.2} className={styles.pillChevron} />
              </button>
            </div>
            {cap && (
              <p className={styles.cap}>{capLine}</p>
            )}
          </>
        ) : (
          <>
            <p className={styles.question}>{request.body}</p>

            {arts.length > 0 && (
              <div className={styles.draftImages} data-persona-opinion-art="">
                {arts.map(file => (
                  <figure key={file.path} className={styles.artFigure}>
                    <DraftFileThumb t={t} file={file} variant="hero" onOpen={openArt} />
                    <figcaption className={styles.artName}>{file.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {/* DESIGN-01 (Fio real b): com a arte da persona à vista, o que a pessoa anexou vira REFERÊNCIA: um chip com o ícone attach, e 96 px quando abre. Sem arte, o anexo é o assunto e segue inline. */}
            {ask.imageIds.length > 0 && arts.length === 0 && (
              <div className={styles.draftImages}>
                {ask.imageIds.map(id => <DraftImage key={id} t={t} id={id} alt={imageAlt} resolveImage={resolveImage} />)}
              </div>
            )}
            {ask.imageIds.length > 0 && arts.length > 0 && (
              <div className={styles.reference} data-persona-opinion-reference="">
                <button type="button" className={styles.referenceChip} aria-expanded={refOpen} onClick={() => { setRefOpen(open => !open) }}>
                  <UiIcon name="attach" size={14} strokeWidth={2.2} />
                  {t('opinion.reference')}
                  <UiIcon name="chevronDown" size={12} strokeWidth={2.2} className={styles.referenceChevron} />
                </button>
                {refOpen && (
                  <div className={styles.referenceImages}>
                    {ask.imageIds.map(id => <DraftImage key={id} t={t} id={id} alt={imageAlt} resolveImage={resolveImage} reference />)}
                  </div>
                )}
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
            {consolidated !== undefined && (
              <button type="button" className={styles.link} aria-expanded onClick={() => { setExpanded(false) }}>
                {hasReplies ? t('opinion.hideReplies') : t('opinion.collapse')}
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
      <Avatar name={reply.authorName} src={avatarOf(reply.authorId)} shape={reply.authorId === 'user' ? 'person' : 'portrait'} size={24} className={styles.face} decorative />
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
