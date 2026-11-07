/**
 * IV-6: liga o `/lado` e o `/resumo` de UMA conversa (o canal ou uma DM) ao host e devolve o cartão "Pergunta à parte" e os handlers do
 * menu "/". Sem o host, sem quem responde ou sem a conversa, não há handler: o comando continua FORA do menu (P0-27, controle morto não existe).
 */

import { useMemo, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AsideCard } from '../chat/AsideCard.tsx'
import type { ComposerSlashActions } from '../chat/composer-slash-commands.ts'
import { useAsideAsks, type AsideApi } from '../chat/use-aside-asks.ts'
import { characterIdForPersona } from './map-host-ui.ts'
import type { PersonaLiveStore } from './persona-live-store.ts'
import type { TeamView } from './persona-remote-types.ts'

export interface ConnectedAsideInput {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly liveStore: PersonaLiveStore
  readonly team: TeamView | null
  /** Muda quando a conversa muda (canal, DM, assunto). */
  readonly conversationKey: string
  /** A persona que responde (a do DM, ou quem responde por padrão no canal); '' = ninguém. */
  readonly personaId: string
  readonly subjectId: string
  readonly streamKind: 'channel' | 'dm'
  /** O id do canal ou da DM; `null` enquanto o host não respondeu. */
  readonly ownerId: string | null
}

export interface ConnectedAside {
  readonly card: ReactNode
  readonly slashActions: Pick<ComposerSlashActions, 'lado' | 'resumo'>
}

/** O que o `PersonaLiveStore` entrega, ou `undefined` quando o host não tem as chamadas do IV-6. */
export function asideApiFrom(liveStore: PersonaLiveStore): AsideApi | undefined {
  const { openAsideAsk, summarizeConversation, getAsideAsk, listAsideAsks } = liveStore
  if (openAsideAsk === undefined || summarizeConversation === undefined || getAsideAsk === undefined) return undefined
  return {
    openAsideAsk: (personaId, subjectId, question) => openAsideAsk(personaId, subjectId, question),
    summarizeConversation: input => summarizeConversation(input),
    getAsideAsk: id => getAsideAsk(id),
    ...(listAsideAsks === undefined ? {} : { listAsideAsks: (personaId: string, subjectId: string) => listAsideAsks(personaId, subjectId) }),
  }
}

export function useConnectedAside({ t, liveStore, team, conversationKey, personaId, subjectId, streamKind, ownerId }: ConnectedAsideInput): ConnectedAside {
  const api = useMemo(() => asideApiFrom(liveStore), [liveStore])
  const owner = ownerId ?? ''
  const ready = api !== undefined && personaId !== '' && owner !== ''
  const aside = useAsideAsks({
    api,
    conversationKey: `${conversationKey}|${personaId}|${subjectId}`,
    summaryLabel: t('aside.summaryQuestion'),
    ...(ready ? { rehydrate: { personaId, subjectId } } : {}),
  })
  const slashActions: ConnectedAside['slashActions'] = ready
    ? {
      lado: (text) => { aside.ask(personaId, subjectId, text) },
      resumo: () => { aside.summarize({ personaId, subjectId, streamKind, ownerId: owner }) },
    }
    : {}
  const card = aside.items.length === 0
    ? null
    : (
      <AsideCard
        t={t}
        items={aside.items}
        personaOf={(id) => {
          const persona = team?.personas.find(p => p.id === id)
          return persona === undefined ? undefined : { name: persona.name, characterId: characterIdForPersona(team, id) }
        }}
        onRetry={aside.retry}
        onDismiss={aside.dismiss}
        {...(liveStore.resumePersona === undefined ? {} : { onResumePersona: (id: string) => liveStore.resumePersona?.(id) })}
      />
    )
  return { card, slashActions }
}
