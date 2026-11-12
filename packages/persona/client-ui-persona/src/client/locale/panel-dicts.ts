/**
 * P2-01 parte B (Keel 05:53 e 06:02): os dicionários do ctx.locale que o slot entrega ao painel. Cada entrada é
 * `localeBindAsDict(ctx.locale.bind(NS))` (ver register-lumen-ui.tsx). Sem entrada, o componente usa o pt do próprio locale.
 */

import type { LocaleDict } from '../preview/locale-bind.ts'

export interface PanelDicts {
  readonly browser?: LocaleDict | undefined
  readonly station?: LocaleDict | undefined
  readonly cofre?: LocaleDict | undefined
  readonly emailRule?: LocaleDict | undefined
}

export interface LocalePanelProps {
  readonly dicts?: PanelDicts | undefined
}
