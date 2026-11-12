/** Persona browser UI entry. Prism owns everything below this directory. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { de, en, es, fr, ja, pt, ru, SHELL_NS, zh, type ShellKey } from './locale/shell/locales.ts'
import {
  de as onboardingDe, en as onboardingEn, es as onboardingEs, fr as onboardingFr,
  ja as onboardingJa, ONBOARDING_NS, pt as onboardingPt, ru as onboardingRu, zh as onboardingZh,
  type OnboardingKey,
} from './locale/onboarding/locales.ts'
import {
  de as editorDe, en as editorEn, es as editorEs, fr as editorFr, ja as editorJa,
  PERSONA_EDITOR_NS, pt as editorPt, ru as editorRu, zh as editorZh, type PersonaEditorKey,
} from './locale/persona-editor/locales.ts'
import {
  de as hireDe, en as hireEn, es as hireEs, fr as hireFr, ja as hireJa, HIRE_NS,
  pt as hirePt, ru as hireRu, zh as hireZh, type HireKey,
} from './locale/hire/locales.ts'
import {
  de as chatDe, en as chatEn, es as chatEs, fr as chatFr, ja as chatJa, CHAT_NS,
  pt as chatPt, ru as chatRu, zh as chatZh, type ChatKey,
} from './locale/chat/locales.ts'
import { mountPersonaUi, personaRemote } from './mount.ts'
import './theme/index.ts'
import { applyStoredThemeEarly } from './theme/theme-preference.ts'
import {
  BROWSER_NS, de as browserDe, en as browserEn, es as browserEs, fr as browserFr, ja as browserJa, pt as browserPt, ru as browserRu, zh as browserZh,
} from './locale/browser/locales.ts'
import {
  de as stationDe, en as stationEn, es as stationEs, fr as stationFr, ja as stationJa, pt as stationPt, ru as stationRu, STATION_NS, zh as stationZh,
} from './locale/station/locales.ts'
import {
  de as emailRuleDe, en as emailRuleEn, EMAIL_RULE_NS, es as emailRuleEs, fr as emailRuleFr, ja as emailRuleJa, pt as emailRulePt, ru as emailRuleRu, zh as emailRuleZh,
} from './locale/email-rule/locales.ts'
import {
  de as indicatorsDe, en as indicatorsEn, es as indicatorsEs, fr as indicatorsFr, INDICATORS_NS, ja as indicatorsJa, pt as indicatorsPt, ru as indicatorsRu, zh as indicatorsZh,
} from './locale/indicators/locales.ts'
import { bindIndicatorsText } from './indicators/indicators-text.ts'
import type { BrowserKey } from './locale/browser/locales.ts'
import type { StationKey } from './locale/station/locales.ts'
import type { EmailRuleKey } from './locale/email-rule/locales.ts'
import type { IndicatorsKey } from './locale/indicators/locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'persona.shell': ShellKey
    'persona.onboarding': OnboardingKey
    'persona.personaEditor': PersonaEditorKey
    'persona.hire': HireKey
    'persona.chat': ChatKey
    'persona.browser': BrowserKey
    'persona.station': StationKey
    'persona.emailRule': EmailRuleKey
    'persona.indicators': IndicatorsKey
  }
}

export { inject } from './mount.ts'

function registerLocales(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SHELL_NS, { zh, en, ja, es, fr, de, ru, pt }), 'persona: shell dictionaries')
  ctx.effect(() => ctx.locale.register(ONBOARDING_NS, {
    zh: onboardingZh, en: onboardingEn, ja: onboardingJa, es: onboardingEs,
    fr: onboardingFr, de: onboardingDe, ru: onboardingRu, pt: onboardingPt,
  }), 'persona: onboarding dictionaries')
  ctx.effect(() => ctx.locale.register(PERSONA_EDITOR_NS, {
    zh: editorZh, en: editorEn, ja: editorJa, es: editorEs, fr: editorFr, de: editorDe, ru: editorRu, pt: editorPt,
  }), 'persona: persona editor dictionaries')
  ctx.effect(() => ctx.locale.register(HIRE_NS, {
    zh: hireZh, en: hireEn, ja: hireJa, es: hireEs, fr: hireFr, de: hireDe, ru: hireRu, pt: hirePt,
  }), 'persona: hire card dictionaries')
  ctx.effect(() => ctx.locale.register(CHAT_NS, {
    zh: chatZh, en: chatEn, ja: chatJa, es: chatEs, fr: chatFr, de: chatDe, ru: chatRu, pt: chatPt,
  }), 'persona: chat dictionaries')
  ctx.effect(() => ctx.locale.register(BROWSER_NS, {
    zh: browserZh, en: browserEn, ja: browserJa, es: browserEs, fr: browserFr, de: browserDe, ru: browserRu, pt: browserPt,
  }), 'persona: browser dictionaries')
  ctx.effect(() => ctx.locale.register(STATION_NS, {
    zh: stationZh, en: stationEn, ja: stationJa, es: stationEs, fr: stationFr, de: stationDe, ru: stationRu, pt: stationPt,
  }), 'persona: station dictionaries')
  ctx.effect(() => ctx.locale.register(EMAIL_RULE_NS, {
    zh: emailRuleZh, en: emailRuleEn, ja: emailRuleJa, es: emailRuleEs, fr: emailRuleFr, de: emailRuleDe, ru: emailRuleRu, pt: emailRulePt,
  }), 'persona: email rule dictionaries')
  ctx.effect(() => ctx.locale.register(INDICATORS_NS, {
    zh: indicatorsZh, en: indicatorsEn, ja: indicatorsJa, es: indicatorsEs, fr: indicatorsFr, de: indicatorsDe, ru: indicatorsRu, pt: indicatorsPt,
  }), 'persona: indicators dictionaries')
}

/** Mount Persona Remote, shell root, and locale dictionaries. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  // TH-1: antes de qualquer outra coisa, o tema salvo (ou o forçado) vai para o <html>/<body>; o app abre no tema certo, sem piscar o outro.
  applyStoredThemeEarly()
  registerLocales(ctx)
  bindIndicatorsText((key, params) => ctx.locale.bind(INDICATORS_NS)(key as never, params as never))
  return mountPersonaUi(ctx, personaRemote)
}
