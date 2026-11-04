/** Lumen main panels + locale registration (import from `mount.ts`). */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createLiveTenantObservable } from '../data/live-tenant-bridge.ts'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import {
  RemoteConnectionsPanel,
  RemoteFilesPanel,
  RemoteKnowledgePanel,
  RemoteRoutinesPanel,
  RemoteUsagePanel,
} from '../data/lumen-remote-panels.tsx'
import { ConnectedGlobalKanban } from '../remote/ConnectedGlobalKanban.tsx'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId, ShellState } from '../shell/create-shell-store.ts'
import type { ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import {
  de as connectionsDe, en as connectionsEn, es as connectionsEs, fr as connectionsFr,
  ja as connectionsJa, CONNECTIONS_NS, pt as connectionsPt, ru as connectionsRu, zh as connectionsZh,
  type ConnectionsKey,
} from '../locale/connections/locales.ts'
import {
  de as reviewDe, en as reviewEn, es as reviewEs, fr as reviewFr, ja as reviewJa, REVIEW_NS,
  pt as reviewPt, ru as reviewRu, zh as reviewZh, type ReviewKey,
} from '../locale/review/locales.ts'
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
import {
  de as approvalsDe, en as approvalsEn, es as approvalsEs, fr as approvalsFr, ja as approvalsJa,
  APPROVALS_NS, pt as approvalsPt, ru as approvalsRu, zh as approvalsZh, type ApprovalsKey,
} from '../locale/approvals/locales.ts'
import {
  de as rulesDe, en as rulesEn, es as rulesEs, fr as rulesFr, ja as rulesJa, RULES_NS,
  pt as rulesPt, ru as rulesRu, zh as rulesZh, type RulesKey,
} from '../locale/rules/locales.ts'
import {
  de as profileDe, en as profileEn, es as profileEs, fr as profileFr, ja as profileJa, PROFILE_NS,
  pt as profilePt, ru as profileRu, zh as profileZh, type ProfileKey,
} from '../locale/profile/locales.ts'
import {
  de as membersDe, en as membersEn, es as membersEs, fr as membersFr, ja as membersJa, MEMBERS_NS,
  pt as membersPt, ru as membersRu, zh as membersZh, type MembersKey,
} from '../locale/members/locales.ts'
import {
  de as importersDe, en as importersEn, es as importersEs, fr as importersFr, ja as importersJa,
  IMPORTERS_NS, pt as importersPt, ru as importersRu, zh as importersZh, type ImportersKey,
} from '../locale/importers/locales.ts'
import {
  de as canvasDe, en as canvasEn, es as canvasEs, fr as canvasFr, ja as canvasJa, CANVAS_NS,
  pt as canvasPt, ru as canvasRu, zh as canvasZh, type CanvasKey,
} from '../locale/canvas/locales.ts'
import {
  de as governanceDe, en as governanceEn, es as governanceEs, fr as governanceFr, ja as governanceJa,
  GOVERNANCE_NS, pt as governancePt, ru as governanceRu, zh as governanceZh, type GovernanceKey,
} from '../locale/governance/locales.ts'
import {
  de as secondBrainDe, en as secondBrainEn, es as secondBrainEs, fr as secondBrainFr, ja as secondBrainJa,
  SECOND_BRAIN_NS, pt as secondBrainPt, ru as secondBrainRu, zh as secondBrainZh, type SecondBrainKey,
} from '../locale/second-brain/locales.ts'
import { ConnectedOrgChartPanel } from '../remote/ConnectedOrgChartPanel.tsx'
import { ConnectedTeamHealthPanel } from '../remote/ConnectedTeamHealthPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'persona.kanban': KanbanKey
    'persona.knowledge': KnowledgeKey
    'persona.routines': RoutinesKey
    'persona.files': FilesKey
    'persona.usage': UsageKey
    'persona.connections': ConnectionsKey
    'persona.review': ReviewKey
    'persona.approvals': ApprovalsKey
    'persona.rules': RulesKey
    'persona.profile': ProfileKey
    'persona.members': MembersKey
    'persona.importers': ImportersKey
    'persona.canvas': CanvasKey
    'persona.governance': GovernanceKey
    'persona.secondBrain': SecondBrainKey
  }
}

import type { PersonaCardShellBridge } from '../remote/persona-card-shell-bridge.ts'

export type LumenPersonaCardBridge = PersonaCardShellBridge

export interface LumenShellBridge {
  selectPanel(id: MainPanelId): void
  clearBoardsFocusProject(): void
  openPersonaProfile(personaId: string): void
  setProjectWorkspaceProjectId(projectId: string | null): void
  openTeamSetup(): void
  shell: HostObservable<ShellState>
  personaCard?: LumenPersonaCardBridge
}

function mainPanelForProjectTab(tab: ProjectWorkspaceTab): MainPanelId | null {
  if (tab === 'board') return null
  if (tab === 'conversation') return 'channels'
  if (tab === 'files') return 'files'
  if (tab === 'routines') return 'routines'
  if (tab === 'sprints') return 'kanban'
  return null
}

/** Register Lumen locale namespaces and queue-1 `main` keys (host Remote). */
export function registerLumenUi(ctx: Context, live: PersonaLiveStore, shell?: LumenShellBridge): void {
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
  ctx.effect(() => ctx.locale.register(REVIEW_NS, {
    zh: reviewZh, en: reviewEn, ja: reviewJa, es: reviewEs, fr: reviewFr, de: reviewDe, ru: reviewRu, pt: reviewPt,
  }), 'persona: review dictionaries')
  ctx.effect(() => ctx.locale.register(APPROVALS_NS, {
    zh: approvalsZh, en: approvalsEn, ja: approvalsJa, es: approvalsEs, fr: approvalsFr,
    de: approvalsDe, ru: approvalsRu, pt: approvalsPt,
  }), 'persona: approvals dictionaries')
  ctx.effect(() => ctx.locale.register(RULES_NS, {
    zh: rulesZh, en: rulesEn, ja: rulesJa, es: rulesEs, fr: rulesFr, de: rulesDe, ru: rulesRu, pt: rulesPt,
  }), 'persona: rules dictionaries')
  ctx.effect(() => ctx.locale.register(PROFILE_NS, {
    zh: profileZh, en: profileEn, ja: profileJa, es: profileEs, fr: profileFr, de: profileDe, ru: profileRu, pt: profilePt,
  }), 'persona: profile dictionaries')
  ctx.effect(() => ctx.locale.register(MEMBERS_NS, {
    zh: membersZh, en: membersEn, ja: membersJa, es: membersEs, fr: membersFr, de: membersDe, ru: membersRu, pt: membersPt,
  }), 'persona: members dictionaries')
  ctx.effect(() => ctx.locale.register(IMPORTERS_NS, {
    zh: importersZh, en: importersEn, ja: importersJa, es: importersEs, fr: importersFr,
    de: importersDe, ru: importersRu, pt: importersPt,
  }), 'persona: importers dictionaries')
  ctx.effect(() => ctx.locale.register(CANVAS_NS, {
    zh: canvasZh, en: canvasEn, ja: canvasJa, es: canvasEs, fr: canvasFr, de: canvasDe, ru: canvasRu, pt: canvasPt,
  }), 'persona: canvas dictionaries')
  ctx.effect(() => ctx.locale.register(GOVERNANCE_NS, {
    zh: governanceZh, en: governanceEn, ja: governanceJa, es: governanceEs, fr: governanceFr, de: governanceDe,
    ru: governanceRu, pt: governancePt,
  }), 'persona: governance dictionaries')
  ctx.effect(() => ctx.locale.register(SECOND_BRAIN_NS, {
    zh: secondBrainZh, en: secondBrainEn, ja: secondBrainJa, es: secondBrainEs, fr: secondBrainFr, de: secondBrainDe,
    ru: secondBrainRu, pt: secondBrainPt,
  }), 'persona: second brain dictionaries')

  const tenantObservable = createLiveTenantObservable(live)
  const shellStub: HostObservable<ShellState> = {
    getSnapshot: () => ({
      activePanel: 'kanban',
      hostStatus: 'unknown',
      hostProtocol: null,
      onboardingOpen: false,
      profilePersonaId: null,
      profileEditorOpen: false,
      boardsFocusProjectId: null,
      projectWorkspaceProjectId: null,
      talkAclPersonaId: null,
      enginePersonaId: null,
      teachPersonaId: null,
      teachCapture: null,
    }),
    subscribe: () => () => {},
  }
  const lumenInject = (): LumenRemoteInjected => ({
    persona: ctx.remote.persona,
    hooks: {
      tenant: tenantObservable,
      shell: shell?.shell ?? shellStub,
    },
    ...(shell?.personaCard?.sendToPersona === undefined
      ? {}
      : { sendToPersona: shell.personaCard.sendToPersona }),
    ...(shell?.selectPanel === undefined ? {} : { selectMainPanel: shell.selectPanel }),
  })

  ctx.slots.register({
    name: 'main',
    key: 'kanban',
    locale: KANBAN_NS,
    inject: () => ({
      persona: ctx.remote.persona,
      refreshKanban: () => live.refresh(),
      navigateProjectTab: (tab: ProjectWorkspaceTab) => {
        const panel = mainPanelForProjectTab(tab)
        if (panel !== null) shell?.selectPanel(panel)
      },
      clearBoardsFocusProject: () => { shell?.clearBoardsFocusProject() },
      setProjectWorkspaceProjectId: (projectId: string | null) => { shell?.setProjectWorkspaceProjectId(projectId) },
      ...(shell?.personaCard === undefined
        ? {}
        : {
          personaCard: shell.personaCard,
          openPersonaProfile: shell.openPersonaProfile,
        }),
      hooks: {
        live: live.observable,
        tenant: tenantObservable,
        shell: shell?.shell ?? shellStub,
      },
    }),
  }, ConnectedGlobalKanban)

  const panels = [
    { key: 'knowledge', locale: KNOWLEDGE_NS, Panel: RemoteKnowledgePanel },
    { key: 'routines', locale: ROUTINES_NS, Panel: RemoteRoutinesPanel },
    { key: 'files', locale: FILES_NS, Panel: RemoteFilesPanel },
    { key: 'usage', locale: USAGE_NS, Panel: RemoteUsagePanel },
    { key: 'connections', locale: CONNECTIONS_NS, Panel: RemoteConnectionsPanel },
  ] as const

  for (const { key, locale, Panel } of panels) {
    ctx.slots.register({ name: 'main', key, locale, inject: lumenInject }, Panel)
  }

  const openTeamSetup = (): void => { shell?.openTeamSetup() }

  ctx.slots.register({
    name: 'main',
    key: 'orgChart',
    locale: GOVERNANCE_NS,
    inject: () => ({
      ...lumenInject(),
      openTeamSetup,
      openPersonaProfile: (personaId: string) => { shell?.openPersonaProfile(personaId) },
      ...(shell?.personaCard === undefined
        ? {}
        : {
          cardInfo: shell.personaCard.cardInfo,
          prefetchPersonaCard: shell.personaCard.prefetch,
          cardDict: shell.personaCard.cardDict,
          sendToPersona: shell.personaCard.sendToPersona,
          togglePersonaPause: shell.personaCard.togglePause,
          switchPersonaEngine: shell.personaCard.switchEngine,
          editPersonaTalk: shell.personaCard.editTalk,
          teachPersona: shell.personaCard.teachPersona,
        }),
      hooks: {
        ...lumenInject().hooks,
        live: live.observable,
        personaCardRevision: shell?.personaCard?.revision ?? {
          getSnapshot: () => ({ n: 0 }),
          subscribe: () => () => {},
        },
        shell: shell?.shell ?? {
          getSnapshot: () => ({
            activePanel: 'orgChart',
            hostStatus: 'unknown',
            hostProtocol: null,
            onboardingOpen: false,
            profilePersonaId: null,
            profileEditorOpen: false,
            boardsFocusProjectId: null,
            projectWorkspaceProjectId: null,
            talkAclPersonaId: null,
            enginePersonaId: null,
            teachPersonaId: null,
            teachCapture: null,
          } satisfies ShellState),
          subscribe: () => () => {},
        },
      },
    }),
  }, ConnectedOrgChartPanel)

  ctx.slots.register({
    name: 'main',
    key: 'teamHealth',
    locale: GOVERNANCE_NS,
    inject: () => ({
      ...lumenInject(),
      openTeamSetup,
      hooks: {
        ...lumenInject().hooks,
        live: live.observable,
      },
    }),
  }, ConnectedTeamHealthPanel)
}
