/**
 * IV-6 (contracts/aside.md, T3-UX-HARVEST §11): o cartão "Pergunta à parte" / "Resumo da conversa", acima do composer e FORA do fio.
 * Uma pergunta de lado não faz parte da conversa nem da Tarefa: aqui a persona "está pensando…", responde (até 3 frases) ou diz por que
 * não pôde (pausa, sem IA, falha) com a ação que resolve (Retomar · Tentar de novo). Nada fica mudo.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import type { PersonaCharacterId } from '../assets/asset-url.ts'
import { Avatar, Button, IconButton, UiIcon } from '../primitives/index.ts'
import type { AsideItemUi } from './use-aside-asks.ts'
import styles from './AsideCard.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface AsidePersonaRef {
  readonly name: string
  readonly characterId?: PersonaCharacterId | undefined
}

export interface AsideCardProps {
  readonly t: ChatT
  readonly items: readonly AsideItemUi[]
  /** Quem responde: o nome e o rosto vêm do time (sem a persona na lista, "A persona" e as iniciais). */
  readonly personaOf: (personaId: string) => AsidePersonaRef | undefined
  readonly onRetry: (key: string) => void
  readonly onDismiss: (key: string) => void
  /** "Retomar {persona}" quando ela está em pausa (sem o handler, o botão não existe). */
  readonly onResumePersona?: ((personaId: string) => void | Promise<void>) | undefined
}

/** A frase de falha, escrita aqui a partir do motivo tipado (o texto do host é só um reserva que a UI não usa). */
export function asideErrorText(t: ChatT, error: AsideItemUi['error'], name: string): string {
  switch (error) {
    case 'paused': return t('aside.error.paused', { name })
    case 'no_engine': return t('aside.error.noEngine')
    case 'timeout': return t('aside.error.timeout')
    case 'empty': return t('aside.error.empty')
    default: return t('aside.error.failed')
  }
}

export function AsideCard({ t, items, personaOf, onRetry, onDismiss, onResumePersona }: AsideCardProps): ReactNode {
  if (items.length === 0) return null
  return (
    <section className={styles.region} aria-label={t('aside.region')} data-aside-region="" tabIndex={0}>
      {items.map((item, index) => {
        const persona = personaOf(item.personaId)
        const name = persona?.name ?? t('aside.somePersona')
        const src = persona?.characterId === undefined ? undefined : AVATAR_96[persona.characterId as keyof typeof AVATAR_96]
        const title = item.kind === 'summary' ? t('aside.titleSummary') : t('aside.title')
        const canResume = item.status === 'failed' && item.error === 'paused' && onResumePersona !== undefined
        return (
          <article key={item.key} className={styles.item} data-aside-item={item.status} data-aside-kind={item.kind}>
            <header className={styles.header}>
              <Avatar name={name} src={src} shape="portrait" size={24} decorative />
              <h2 className={styles.title}>{title}</h2>
              <IconButton
                size="s"
                label={t('aside.close')}
                icon={<UiIcon name="close" size={16} />}
                onClick={() => { onDismiss(item.key) }}
              />
            </header>
            {item.kind === 'aside' && <p className={styles.question}>{item.question}</p>}
            {item.status === 'asking' && (
              <p className={styles.thinking} role="status">
                <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
                {t('aside.thinking', { name })}
              </p>
            )}
            {item.status === 'answered' && (
              <div className={styles.answer}>
                <p className={styles.answerBy}>{t('aside.answerBy', { name })}</p>
                <p className={styles.answerText}>{item.answer}</p>
              </div>
            )}
            {item.status === 'failed' && (
              <div className={styles.failed} role="status">
                <p className={styles.failedText}>{asideErrorText(t, item.error, name)}</p>
                <div className={styles.actions}>
                  {canResume && (
                    <Button size="s" variant="secondary" onClick={() => { void onResumePersona(item.personaId) }}>
                      {t('aside.resume', { name })}
                    </Button>
                  )}
                  {item.error !== 'empty' && <Button size="s" variant="ghost" onClick={() => { onRetry(item.key) }}>{t('aside.retry')}</Button>}
                </div>
              </div>
            )}
            {index === 0 && <p className={styles.note}>{t('aside.note')}</p>}
          </article>
        )
      })}
    </section>
  )
}
