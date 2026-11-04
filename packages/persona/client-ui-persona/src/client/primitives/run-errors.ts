/**
 * Run errors (Muse, design/RUN-ERRORS-SPEC.md): typed code from runner/host → what happened, what to do,
 * one useful action. Pure; returns locale keys (`runError.*` in the chat namespace) and action ids that the
 * screen wires to handlers. Never names a CLI, runner, host or executor.
 */

export type RunErrorCode =
  | 'not_logged_in' | 'cli_not_found' | 'model_unavailable' | 'quota_exhausted'
  | 'budget_exhausted' | 'provider_unreachable' | 'engine_unavailable' | 'app_offline'

export interface RunErrorPayload {
  readonly code: RunErrorCode
  readonly provider?: string | undefined
  readonly model?: string | undefined
  readonly account?: string | undefined
  readonly persona?: string | undefined
  /** ISO time the quota comes back. */
  readonly resetAt?: string | undefined
  /** Login command to copy, e.g. `claude login`. */
  readonly command?: string | undefined
  /** True when another account of the same provider can take over now. */
  readonly otherAccount?: boolean | undefined
}

export type RunErrorAction =
  | 'retry' | 'howToConnect' | 'pickEngine' | 'howToInstall' | 'pickModel' | 'swapAccount'
  | 'waitAndResume' | 'otherEngine' | 'adjustLimit' | 'seeUsage' | 'retryNow' | 'reconnect'

export interface RunErrorDescription {
  readonly tone: 'warning' | 'danger'
  readonly titleKey: string
  readonly bodyKey: string
  readonly params: Readonly<Record<string, string>>
  readonly primary: RunErrorAction
  readonly secondary?: RunErrorAction | undefined
  readonly command?: string | undefined
}

/** "18:30" and whether it is today/tomorrow/unknown, in the viewer's local time. */
export function describeResetTime(resetAt: string | undefined, now: Date = new Date()): { readonly whenKey: string; readonly time: string } {
  if (resetAt === undefined) return { whenKey: 'runError.when.unknown', time: '' }
  const at = new Date(resetAt)
  if (Number.isNaN(at.getTime())) return { whenKey: 'runError.when.unknown', time: '' }
  const time = `${String(at.getHours())}:${String(at.getMinutes()).padStart(2, '0')}`
  const day = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(at) - day(now)) / 86_400_000)
  if (diff <= 0) return { whenKey: 'runError.when.today', time }
  if (diff === 1) return { whenKey: 'runError.when.tomorrow', time }
  return { whenKey: 'runError.when.later', time: at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ` ${time}` }
}

export function describeRunError(p: RunErrorPayload, now?: Date): RunErrorDescription {
  const provider = p.provider ?? '—'
  const base = { provider, model: p.model ?? '', account: p.account ?? '', persona: p.persona ?? '' }
  switch (p.code) {
    case 'not_logged_in':
      return { tone: 'warning', titleKey: 'runError.notLoggedIn.title', bodyKey: 'runError.notLoggedIn.body', params: base, primary: 'retry', secondary: 'howToConnect', command: p.command }
    case 'cli_not_found':
      return { tone: 'danger', titleKey: 'runError.notInstalled.title', bodyKey: 'runError.notInstalled.body', params: base, primary: 'pickEngine', secondary: 'howToInstall' }
    case 'model_unavailable':
      return { tone: 'warning', titleKey: 'runError.model.title', bodyKey: 'runError.model.body', params: base, primary: 'pickModel' }
    case 'quota_exhausted': {
      const reset = describeResetTime(p.resetAt, now)
      const params = { ...base, time: reset.time, whenKey: reset.whenKey }
      return p.otherAccount === true
        ? { tone: 'warning', titleKey: 'runError.quota.title', bodyKey: 'runError.quota.bodySwap', params, primary: 'swapAccount', secondary: 'waitAndResume' }
        : { tone: 'warning', titleKey: 'runError.quota.title', bodyKey: 'runError.quota.bodyWait', params, primary: 'waitAndResume', secondary: 'otherEngine' }
    }
    case 'budget_exhausted':
      return { tone: 'warning', titleKey: 'runError.budget.title', bodyKey: 'runError.budget.body', params: base, primary: 'adjustLimit', secondary: 'seeUsage' }
    case 'provider_unreachable':
      return { tone: 'warning', titleKey: 'runError.unreachable.title', bodyKey: 'runError.unreachable.body', params: base, primary: 'retryNow' }
    case 'engine_unavailable':
      return { tone: 'danger', titleKey: 'runError.engine.title', bodyKey: 'runError.engine.body', params: base, primary: 'pickEngine' }
    case 'app_offline':
      return { tone: 'warning', titleKey: 'runError.offline.title', bodyKey: 'runError.offline.body', params: base, primary: 'reconnect' }
  }
}

/** Resolve a description to final strings with the chat namespace `t`. */
export function runErrorText(d: RunErrorDescription, t: (key: string, params?: Readonly<Record<string, string>>) => string): {
  readonly title: string; readonly body: string; readonly primary: string; readonly secondary?: string | undefined
} {
  const when = d.params.whenKey !== undefined ? t(d.params.whenKey, { time: d.params.time ?? '', provider: d.params.provider ?? '' }) : ''
  const params = { ...d.params, when }
  return {
    title: t(d.titleKey, params),
    body: t(d.bodyKey, params),
    primary: t(`runError.action.${d.primary}`, params),
    ...(d.secondary !== undefined ? { secondary: t(`runError.action.${d.secondary}`, params) } : {}),
  }
}
