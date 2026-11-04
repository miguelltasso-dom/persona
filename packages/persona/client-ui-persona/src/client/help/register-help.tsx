/**
 * Ajuda + Novidades wiring (Muse). Prism calls `registerHelpLocale(ctx)` and registers `HelpPanel` as the
 * 'help' main slot with `locale: HELP_NS`. Everything else (docs, search, render) lives in this folder.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { HelpShellTab } from '../shell/create-shell-store.ts'
import { HELP_NS, de, en, es, fr, ja, pt, ru, zh, type HelpKey } from '../locale/help/locales.ts'
import { HelpView, type HelpTab } from './HelpView.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'persona.help': HelpKey
  }
}

export { HELP_NS }

export function registerHelpLocale(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(HELP_NS, { zh, en, ja, es, fr, de, ru, pt }), 'persona: help dictionaries')
}

export interface HelpPanelInjected {
  /** Guide to open (e.g. the channel '?' opens 'canais'). */
  readonly initialDocId?: string | undefined
  readonly initialTab?: HelpTab | undefined
  readonly hooks?: {
    readonly shell: HostObservable<{ readonly helpDocId: string | null; readonly helpTab: HelpShellTab | null }>
  }
  /** Interface language; guides are pt-only for now. */
  readonly language?: string | undefined
  askTeam(): void
  openExternal(url: string): void
}

export type HelpPanelProps = PropsLocale<'persona.help'> & InjectFace<HelpPanelInjected>

export function HelpPanel(props: HelpPanelProps): ReactNode {
  const { t, initialDocId, initialTab, language, hooks } = props
  const shell = hooks?.shell
  const shellSnap = shell === undefined
    ? null
    : useSyncExternalStore(shell.subscribe, shell.getSnapshot, shell.getSnapshot)
  const docId = shellSnap?.helpDocId ?? initialDocId ?? undefined
  const tab = shellSnap?.helpTab ?? initialTab ?? undefined
  return (
    <HelpView
      t={(key, params) => t(key as HelpKey, params)}
      initialDocId={docId}
      initialTab={tab}
      showPtOnlyNote={language !== undefined && !language.toLowerCase().startsWith('pt')}
      onAskTeam={() => { props.askTeam() }}
      onOpenExternal={(url) => { props.openExternal(url) }}
    />
  )
}
