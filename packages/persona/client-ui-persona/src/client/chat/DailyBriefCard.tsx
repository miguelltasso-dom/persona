/**
 * D-090 / EQUIPE-REAL-SPEC §(b) (TEAM-7): o cartão "Bom dia" no #geral, a reunião do dia. É um cartão ESTRUTURADO (não prosa), montado pelo host
 * sem IA: "Ontem" (até 3 linhas + "e mais n"), "Hoje" (quem está em quê) e "Precisa de você" ("{n} coisas esperam você" + Ver). Seção sem nada
 * não aparece. Recolhível; altura máxima de 320 px e o resto em "Ver tudo"; "⋯ → Pausar o resumo da manhã" leva à rotina.
 *
 * Só renderiza com a flag `persona.flag.teamwork` (o chamador decide). Nada fica sem destino: cada botão só existe quando o chamador entrega o que
 * ele faz. O texto da persona (os títulos) é mostrado como texto, nunca como instrução.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ACCENTS, AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { isHouseDecorEnabled } from '../decor/house-decor-flag.ts'
import { Avatar, BrandIcon, Button, Card, IconButton, MenuButton, UiIcon } from '../primitives/index.ts'
import type { DailyBriefItemUi, DailyBriefUi } from '../remote/map-host-ui.ts'
import styles from './DailyBriefCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

/** Quantas linhas de "Ontem" cabem antes do "e mais n" (a spec). */
export const DAILY_YESTERDAY_MAX = 3
/** A altura máxima do cartão; o resto fica em "Ver tudo". */
export const DAILY_MAX_HEIGHT_PX = 320

/** O que cada botão do cartão faz; sem a função, o botão não existe. */
export interface DailyBriefActions {
  /** "Ver" em "Precisa de você" abre Aprovações. */
  readonly onOpenApprovals?: (() => void) | undefined
  /** "e mais n" leva a Quadros. */
  readonly onOpenBoard?: (() => void) | undefined
  /** "⋯ → Pausar o resumo da manhã" leva à rotina (Rotinas). */
  readonly onOpenRoutines?: (() => void) | undefined
  /** A linha de uma tarefa abre a tarefa no quadro. */
  readonly onOpenTask?: ((taskId: string) => void) | undefined
}

export interface DailyBriefCardProps {
  readonly t: ChatT
  readonly brief: DailyBriefUi
  readonly rowTag?: 'li' | 'div'
  /** "Ver" em "Precisa de você" abre Aprovações. */
  readonly onOpenApprovals?: (() => void) | undefined
  /** "e mais n" leva a Quadros. */
  readonly onOpenBoard?: (() => void) | undefined
  /** "⋯ → Pausar o resumo da manhã" leva à rotina (Rotinas). */
  readonly onOpenRoutines?: (() => void) | undefined
  /** A linha de uma tarefa abre a tarefa no quadro. */
  readonly onOpenTask?: ((taskId: string) => void) | undefined
  /** O id da mensagem do cartão no fio: é por ele que "Resumir o dia" (`posted`/`already`) leva ao cartão e o faz piscar 1× (`message-focus`). */
  readonly messageId?: string | undefined
}

/**
 * Quando o cartão foi postado, em hora local da pessoa (EQUIPE-REAL §(b) "O resumo a pedido"): `late` = a partir das 12:00, `time` = "HH:MM".
 * É só a RESERVA de quando o host ainda não manda o tipo do cartão: o tipo (`variant`, motor do Tally) manda, ver {@link dailyBriefShowsLate}.
 */
export function dailyBriefMoment(postedAt: string | undefined): { readonly late: boolean; readonly time: string } {
  const at = postedAt === undefined ? Number.NaN : Date.parse(postedAt)
  if (Number.isNaN(at)) return { late: false, time: '' }
  const date = new Date(at)
  return { late: date.getHours() >= 12, time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
}

/**
 * Este cartão é o "Resumo do dia · {hora}" (pedido à mão, sem o spot do sol nascendo) e não o "Bom dia · {dia}" da manhã? O TIPO do motor
 * (`variant`) decide, a tela nunca adivinha; sem ele (host que ainda não o manda, cartão antigo) vale a hora em que o cartão foi postado: a rotina da manhã
 * nunca posta depois das 12:00, então um cartão sem tipo depois das 12:00 só pode ser o pedido à mão.
 */
export function dailyBriefShowsLate(brief: Pick<DailyBriefUi, 'variant' | 'postedAt'>): boolean {
  if (brief.variant !== undefined) return brief.variant === 'on-demand'
  return dailyBriefMoment(brief.postedAt).late
}

/**
 * A trilha de patinhas (ACCENTS `paw-trail`, currentColor) como divisor discreto entre "Ontem" e "Hoje" (Muse 22:12; BR-P4). Sempre
 * `aria-hidden`, 8 px de altura, em ink-soft a 40%, nunca atrás de texto; some em forced-colors e a ≤ 800 px. Atrás de `houseDecor` (além
 * da `teamwork`): sem a flag, nenhum nó a mais. A cor vem de uma máscara (um `<img>` não herda o `currentColor` do SVG).
 */
export function PawTrailDivider(): ReactNode {
  if (!isHouseDecorEnabled()) return null
  const url = ACCENTS['paw-trail']
  if (url === undefined) return null
  return <span className={styles.pawTrail} aria-hidden="true" data-house-decor="paw-trail" style={{ ['--paw-trail-url' as string]: `url("${url}")` }} />
}

/** "segunda-feira" a partir de "YYYY-MM-DD" (meio-dia local: nunca cai no dia vizinho por fuso). */
export function weekdayLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('pt-BR', { weekday: 'long' })
}

/** Quantos rostos 16 cabem no item de um pedido terminado antes do "+n". */
export const DAILY_REQUEST_FACES_MAX = 3

/** "Texto, Arte e Posts": a lista de partes em português (sem inventar vírgula de Oxford). */
export function joinParts(parts: readonly string[]): string {
  try {
    return new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(parts)
  } catch {
    return parts.join(', ')
  }
}

function faceOf(item: DailyBriefItemUi): string | undefined {
  return item.characterId === undefined ? undefined : AVATAR_96[item.characterId as keyof typeof AVATAR_96]
}

export function DailyBriefCard({ t, brief, rowTag = 'li', onOpenApprovals, onOpenBoard, onOpenRoutines, onOpenTask, messageId }: DailyBriefCardProps): ReactNode {
  const Tag = rowTag
  const bodyId = useId()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  // A altura real do conteúdo decide se há "Ver tudo": mede ao montar, quando o resumo muda e quando a janela muda (200%).
  const measure = (): void => {
    const body = bodyRef.current
    if (body !== null) setOverflowing(body.scrollHeight > DAILY_MAX_HEIGHT_PX + 1)
  }
  useLayoutEffect(measure, [brief, collapsed])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => { window.removeEventListener('resize', measure) }
  }, [])

  const weekday = weekdayLabel(brief.day)
  const moment = dailyBriefMoment(brief.postedAt)
  const late = dailyBriefShowsLate(brief)
  // "Resumo do dia · {hora}"; sem a hora do cartão, só a palavra-título (nunca "Resumo do dia · " pendurado).
  const eyebrow = late ? (moment.time === '' ? t('daily.eyebrowNoTime') : t('daily.eyebrowLater', { time: moment.time })) : t('daily.eyebrow', { weekday })
  const name = brief.coordinatorName ?? t('daily.coordination')
  const src = brief.coordinatorCharacterId === undefined ? undefined : AVATAR_96[brief.coordinatorCharacterId as keyof typeof AVATAR_96]
  const shownYesterday = brief.yesterday.slice(0, DAILY_YESTERDAY_MAX)
  const moreYesterday = brief.yesterday.length - shownYesterday.length + brief.yesterdayMore

  const line = (item: DailyBriefItemUi, kind: 'finished' | 'working'): ReactNode => {
    // Um PEDIDO terminado (Anvil agrupa): "[rostos 16] Campanha de Natal ficou pronta · Texto, Arte e Posts"; nunca o rosto da Coordenação (Muse 05/11).
    if (kind === 'finished' && item.request !== undefined) {
      const request = item.request
      const shown = request.faces.slice(0, DAILY_REQUEST_FACES_MAX)
      const extra = request.faces.length - shown.length
      // Muse 05/11: frase NEUTRA, sem gênero ("Campanha de Natal: tudo pronto"): a tela não adivinha o gênero de um substantivo.
      const done = t('daily.requestDone', { title: request.title })
      const parts = joinParts(request.parts)
      const names = shown.map(face => face.name).join(', ')
      const inner = (
        <>
          <span className={styles.requestText}>{done}</span>
          {parts !== '' && <span className={styles.requestParts}> · {parts}</span>}
        </>
      )
      return (
        <li key={`finished-request-${item.taskId}-${request.title}`} className={styles.line} data-daily-request="">
          {shown.length > 0 && (
            <span className={styles.faces} role="img" aria-label={t('daily.requestFaces', { names: extra > 0 ? `${names} +${extra}` : names })}>
              {shown.map(face => <img key={face.name} className={styles.face16} src={AVATAR_96[face.characterId as keyof typeof AVATAR_96]} alt="" />)}
              {extra > 0 && <span className={styles.facesMore}>{t('daily.requestMore', { n: extra })}</span>}
            </span>
          )}
          {onOpenTask === undefined
            ? <span className={styles.lineText}>{inner}</span>
            : <button type="button" className={styles.lineLink} onClick={() => { onOpenTask(item.taskId) }}>{inner}</button>}
        </li>
      )
    }
    const who = item.personaName ?? t('daily.somePersona')
    const text = kind === 'finished' ? t('daily.finished', { name: who, title: item.title }) : t('daily.working', { name: who, title: item.title })
    const face = faceOf(item)
    return (
      <li key={`${kind}-${item.taskId}-${item.personaId ?? ''}`} className={styles.line}>
        {item.personaName !== undefined && <Avatar name={who} src={face} shape="portrait" size={24} decorative />}
        {onOpenTask === undefined
          ? <span className={styles.lineText}>{text}</span>
          : <button type="button" className={styles.lineLink} onClick={() => { onOpenTask(item.taskId) }}>{text}</button>}
      </li>
    )
  }

  const menu = onOpenRoutines === undefined
    ? undefined
    : (
      <MenuButton
        label={t('daily.menu')}
        variant="ghost"
        icon={<UiIcon name="more" size={18} />}
        items={[{ id: 'pause', label: t('daily.pause'), onSelect: onOpenRoutines }]}
      />
    )

  return (
    <Tag className={styles.row} data-daily-brief="" {...(messageId === undefined ? {} : { 'data-message-id': messageId })}>
      <Card
        as="article"
        tone="brand"
        padding="m"
        aria-label={eyebrow}
        className={styles.card}
        eyebrow={(
          <span className={styles.eyebrowRow}>
            <Avatar name={name} src={src} shape="portrait" size={24} decorative />
            {/* BR-P6 (Muse): o ícone "bom-dia" vive SEMPRE ao lado do texto do eyebrow, nunca sozinho. */}
            <span className={styles.eyebrowIcon}><BrandIcon name="bom-dia" size={16} /></span>
            <span>{eyebrow}</span>
          </span>
        )}
        actions={(
          <span className={styles.headerActions}>
            {/* BR-P6: o spot do Bom dia, à direita do título, só a partir de 960 px (decorativo: o texto já diz tudo). O resumo à tarde ("Resumo do dia · {hora}") não leva o sol nascendo. */}
            {!late && ILLUSTRATIONS['spot-bom-dia'] !== undefined && (
              <img className={styles.spot} src={ILLUSTRATIONS['spot-bom-dia']} alt="" aria-hidden="true" width={48} height={48} data-daily-spot="" />
            )}
            {menu}
            <IconButton
              size="s"
              label={collapsed ? t('daily.expand') : t('daily.collapse')}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              icon={<UiIcon name={collapsed ? 'plus' : 'minus'} size={16} />}
              onClick={() => { setCollapsed(value => !value) }}
            />
          </span>
        )}
      >
        <div
          id={bodyId}
          ref={bodyRef}
          className={styles.body}
          data-clamped={overflowing && !showAll ? '' : undefined}
          hidden={collapsed}
        >
          {brief.yesterday.length > 0 && (
            <section className={styles.section} aria-labelledby={`${bodyId}-yesterday`}>
              <h3 id={`${bodyId}-yesterday`} className={styles.sectionTitle}>{t('daily.yesterday')}</h3>
              <ul className={styles.lines}>
                {shownYesterday.map(item => line(item, 'finished'))}
              </ul>
              {moreYesterday > 0 && (onOpenBoard === undefined
                ? <p className={styles.more}>{t('daily.moreYesterday', { n: moreYesterday })}</p>
                : <button type="button" className={styles.moreLink} onClick={onOpenBoard}>{t('daily.moreYesterday', { n: moreYesterday })}</button>)}
            </section>
          )}
          {brief.yesterday.length > 0 && brief.today.length > 0 && <PawTrailDivider />}
          {brief.today.length > 0 && (
            <section className={styles.section} aria-labelledby={`${bodyId}-today`}>
              <h3 id={`${bodyId}-today`} className={styles.sectionTitle}>{t('daily.today')}</h3>
              <ul className={styles.lines}>
                {brief.today.map(item => line(item, 'working'))}
              </ul>
            </section>
          )}
          {brief.waitingCount > 0 && (
            <section className={styles.section} aria-label={t('daily.waiting', { count: brief.waitingCount })}>
              <p className={styles.waiting}>
                {t(brief.waitingCount === 1 ? 'daily.waiting.one' : 'daily.waiting', { count: brief.waitingCount })}
                {onOpenApprovals !== undefined && (
                  <button type="button" className={styles.moreLink} onClick={onOpenApprovals}>{t('daily.see')}</button>
                )}
              </p>
            </section>
          )}
        </div>
        {!collapsed && overflowing && (
          <div className={styles.footer}>
            <Button size="s" variant="ghost" aria-expanded={showAll} aria-controls={bodyId} onClick={() => { setShowAll(value => !value) }}>
              {showAll ? t('daily.seeLess') : t('daily.seeAll')}
            </Button>
          </div>
        )}
      </Card>
    </Tag>
  )
}
