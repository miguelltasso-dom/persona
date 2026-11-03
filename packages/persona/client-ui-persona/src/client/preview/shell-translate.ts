/** Typed shell `t` for preview tests (matches `PropsLocale<'persona.shell'>`). */

import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { pt } from '../locale/shell/locales.ts'
import { bindLocale } from './locale-bind.ts'

/** @returns Portuguese shell copy for isolated component previews. */
export const shellTranslate: TranslateNS<'persona.shell'> = (key, params) =>
  bindLocale(pt, key, params as Readonly<Record<string, string | number>> | undefined)
