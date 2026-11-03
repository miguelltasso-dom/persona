/** Prism main panels + locale-backed Lumen queue-2 surfaces. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createLiveTenantObservable } from '../data/live-tenant-bridge.ts'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import {
  RemoteApprovalsPanel,
  RemoteCanvasPanel,
  RemoteImportPanel,
  RemoteMembersPanel,
  RemoteProfilePanel,
  RemoteRulesPanel,
} from '../data/lumen-remote-panels.tsx'
import { APPROVALS_NS } from '../locale/approvals/locales.ts'
import { CANVAS_NS } from '../locale/canvas/locales.ts'
import { IMPORTERS_NS } from '../locale/importers/locales.ts'
import { MEMBERS_NS } from '../locale/members/locales.ts'
import { PROFILE_NS } from '../locale/profile/locales.ts'
import { RULES_NS } from '../locale/rules/locales.ts'
import { ConnectedGeneralChannelView } from '../remote/ConnectedGeneralChannelView.tsx'
import { ConnectedOverviewView } from '../remote/ConnectedOverviewView.tsx'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import { CHAT_NS } from '../locale/chat/locales.ts'
import { SHELL_NS } from '../locale/shell/locales.ts'
import { DirectMessagesPanel } from './DirectMessagesPanel.tsx'
import { ProjectsPanel } from './ProjectsPanel.tsx'
import { SearchPlaceholderView } from './SearchPlaceholderView.tsx'

function liveInject(live: PersonaLiveStore): { hooks: { live: PersonaLiveStore['observable'] }; postChannelMessage(body: string): void } {
  return {
    hooks: { live: live.observable },
    postChannelMessage: (body: string) => { void live.postChannelMessage(body) },
  }
}

/** Register Prism-owned `main` keys (production shell). */
export function registerPrismScreens(
  ctx: Context,
  live: PersonaLiveStore,
  selectPanel?: (panel: 'channels' | 'kanban' | 'approvals') => void,
): void {
  const tenantObservable = createLiveTenantObservable(live)
  const remoteInject = (): LumenRemoteInjected => ({
    persona: ctx.remote.persona,
    hooks: { tenant: tenantObservable },
  })

  const channelInject = () => ({
    shellT: ctx.locale.bind(SHELL_NS),
    ...liveInject(live),
  })

  ctx.slots.register({
    name: 'main',
    key: 'overview',
    locale: SHELL_NS,
    inject: () => ({
      hooks: { live: live.observable },
      navigate: (panel: 'channels' | 'kanban' | 'approvals') => { selectPanel?.(panel) },
    }),
  }, ConnectedOverviewView)

  ctx.slots.register({
    name: 'main',
    key: 'channels',
    locale: CHAT_NS,
    inject: channelInject,
  }, ConnectedGeneralChannelView)

  ctx.slots.register({ name: 'main', key: 'team', locale: MEMBERS_NS, inject: remoteInject }, RemoteMembersPanel)

  ctx.slots.register({
    name: 'main',
    key: 'search',
    locale: SHELL_NS,
  }, SearchPlaceholderView)

  ctx.slots.register({
    name: 'main',
    key: 'projects',
    locale: SHELL_NS,
    inject: () => ({ hooks: { live: live.observable } }),
  }, ProjectsPanel)

  ctx.slots.register({
    name: 'main',
    key: 'directMessages',
    locale: SHELL_NS,
  }, DirectMessagesPanel)

  ctx.slots.register({ name: 'main', key: 'approvals', locale: APPROVALS_NS, inject: remoteInject }, RemoteApprovalsPanel)
  ctx.slots.register({ name: 'main', key: 'rules', locale: RULES_NS, inject: remoteInject }, RemoteRulesPanel)
  ctx.slots.register({ name: 'main', key: 'profile', locale: PROFILE_NS, inject: remoteInject }, RemoteProfilePanel)
  ctx.slots.register({ name: 'main', key: 'members', locale: MEMBERS_NS, inject: remoteInject }, RemoteMembersPanel)
  ctx.slots.register({ name: 'main', key: 'importers', locale: IMPORTERS_NS, inject: remoteInject }, RemoteImportPanel)
  ctx.slots.register({ name: 'main', key: 'canvas', locale: CANVAS_NS, inject: remoteInject }, RemoteCanvasPanel)
}
