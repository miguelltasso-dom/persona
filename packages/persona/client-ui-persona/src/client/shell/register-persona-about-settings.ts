import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ABOUT_LABELS_EN, ABOUT_LABELS_PT, type AboutLabels } from '../primitives/About.tsx'
import { openPersonaExternalUrl, openPersonaThirdPartyNotices, personaAppVersion } from './persona-about-host.ts'
import { PersonaAboutSettingsSection } from './PersonaAboutSettingsSection.tsx'

function aboutLabelsForLocale(ctx: ClientContext): AboutLabels {
  return ctx.locale.getSnapshot().active === 'pt' ? ABOUT_LABELS_PT : ABOUT_LABELS_EN
}

/** Kit de lançamento: Configurações › Sobre (after ui-settings declares `settings.section`). */
export function registerPersonaAboutSettings(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'persona-about',
    order: 900,
    label: () => aboutLabelsForLocale(ctx).title,
    inject: () => ({
      labels: aboutLabelsForLocale(ctx),
      version: personaAppVersion(),
      onOpenUrl: openPersonaExternalUrl,
      onOpenNotices: openPersonaThirdPartyNotices,
    }),
  }, PersonaAboutSettingsSection))
}
