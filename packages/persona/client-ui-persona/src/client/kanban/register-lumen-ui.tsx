/** Lumen main panels + locale registration (import from `mount.ts`). */

import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  de as connectionsDe, en as connectionsEn, es as connectionsEs, fr as connectionsFr,
  ja as connectionsJa, CONNECTIONS_NS, pt as connectionsPt, ru as connectionsRu, zh as connectionsZh,
  type ConnectionsKey,
} from '../locale/connections/locales.ts'
import {
  de as filesDe, en as filesEn, es as filesEs, fr as filesFr, ja as filesJa, FILES_NS,
  pt as filesPt, ru as filesRu, zh as filesZh, type FilesKey,
} from '../locale/files/locales.ts'
import {
  de as kanbanDe, en as kanbanEn, es as kanbanEs, fr as kanbanFr, ja as kanbanJa, KANBAN_NS,
  pt as kanbanPt, ru as kanbanRu, zh as kanbanZh, type KanbanKey,
} from '../locale/kanban/locales.ts'
import {
  de as knowledgeDe, en as knowledgeEn, es as knowledgeEs, fr as knowledgeFr, ja as knowledgeJa,
  KNOWLEDGE_NS, pt as knowledgePt, ru as knowledgeRu, zh as knowledgeZh, type KnowledgeKey,
} from '../locale/knowledge/locales.ts'
import {
  de as routinesDe, en as routinesEn, es as routinesEs, fr as routinesFr, ja as routinesJa,
  ROUTINES_NS, pt as routinesPt, ru as routinesRu, zh as routinesZh, type RoutinesKey,
} from '../locale/routines/locales.ts'
import {
  de as usageDe, en as usageEn, es as usageEs, fr as usageFr, ja as usageJa, USAGE_NS,
  pt as usagePt, ru as usageRu, zh as usageZh, type UsageKey,
} from '../locale/usage/locales.ts'
import { ConnectionsView } from '../connections/ConnectionsView.tsx'
import { FilesView } from '../files/FilesView.tsx'
import { KnowledgeVault } from '../knowledge/KnowledgeVault.tsx'
import { RoutinesView } from '../routines/RoutinesView.tsx'
import { UsageLimits } from '../usage/UsageLimits.tsx'
import { GlobalKanban } from './GlobalKanban.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'persona.kanban': KanbanKey
    'persona.knowledge': KnowledgeKey
    'persona.routines': RoutinesKey
    'persona.files': FilesKey
    'persona.usage': UsageKey
    'persona.connections': ConnectionsKey
  }
}

function KanbanMainPanel(): ReactNode {
  return <GlobalKanban />
}

function KnowledgeMainPanel(): ReactNode {
  return <KnowledgeVault />
}

function RoutinesMainPanel(): ReactNode {
  return <RoutinesView />
}

function FilesMainPanel(): ReactNode {
  return <FilesView />
}

function UsageMainPanel(): ReactNode {
  return <UsageLimits />
}

function ConnectionsMainPanel(): ReactNode {
  return <ConnectionsView />
}

/** Register Lumen locale namespaces and keyed `main` slots (mocks until Anvil B3). */
export function registerLumenUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(KANBAN_NS, {
    zh: kanbanZh, en: kanbanEn, ja: kanbanJa, es: kanbanEs, fr: kanbanFr, de: kanbanDe, ru: kanbanRu, pt: kanbanPt,
  }), 'persona: kanban dictionaries')
  ctx.effect(() => ctx.locale.register(KNOWLEDGE_NS, {
    zh: knowledgeZh, en: knowledgeEn, ja: knowledgeJa, es: knowledgeEs, fr: knowledgeFr, de: knowledgeDe,
    ru: knowledgeRu, pt: knowledgePt,
  }), 'persona: knowledge dictionaries')
  ctx.effect(() => ctx.locale.register(ROUTINES_NS, {
    zh: routinesZh, en: routinesEn, ja: routinesJa, es: routinesEs, fr: routinesFr, de: routinesDe,
    ru: routinesRu, pt: routinesPt,
  }), 'persona: routines dictionaries')
  ctx.effect(() => ctx.locale.register(FILES_NS, {
    zh: filesZh, en: filesEn, ja: filesJa, es: filesEs, fr: filesFr, de: filesDe, ru: filesRu, pt: filesPt,
  }), 'persona: files dictionaries')
  ctx.effect(() => ctx.locale.register(USAGE_NS, {
    zh: usageZh, en: usageEn, ja: usageJa, es: usageEs, fr: usageFr, de: usageDe, ru: usageRu, pt: usagePt,
  }), 'persona: usage dictionaries')
  ctx.effect(() => ctx.locale.register(CONNECTIONS_NS, {
    zh: connectionsZh, en: connectionsEn, ja: connectionsJa, es: connectionsEs, fr: connectionsFr,
    de: connectionsDe, ru: connectionsRu, pt: connectionsPt,
  }), 'persona: connections dictionaries')

  ctx.slots.register({ name: 'main', key: 'kanban', locale: KANBAN_NS, inject: () => ({}) }, KanbanMainPanel)
  ctx.slots.register({ name: 'main', key: 'knowledge', locale: KNOWLEDGE_NS, inject: () => ({}) }, KnowledgeMainPanel)
  ctx.slots.register({ name: 'main', key: 'routines', locale: ROUTINES_NS, inject: () => ({}) }, RoutinesMainPanel)
  ctx.slots.register({ name: 'main', key: 'files', locale: FILES_NS, inject: () => ({}) }, FilesMainPanel)
  ctx.slots.register({ name: 'main', key: 'usage', locale: USAGE_NS, inject: () => ({}) }, UsageMainPanel)
  ctx.slots.register({ name: 'main', key: 'connections', locale: CONNECTIONS_NS, inject: () => ({}) }, ConnectionsMainPanel)
}
