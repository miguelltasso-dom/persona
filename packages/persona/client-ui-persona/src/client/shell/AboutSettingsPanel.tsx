/**
 * "Configurações › Sobre" (cena 24 da Muse; revisão do Carbon, item 1): o AboutPersona direto sob o cabeçalho, alinhado à grade.
 * Sem o cartão legado "Versão e avisos", sem o botão do modal do DSW e sem o atalho. A versão entra quando a ponte de versão existir.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AboutPersona, ABOUT_LABELS_PT } from '../primitives/About.tsx'
import { Screen, ScreenHeader } from '../primitives/index.ts'
import { openPersonaExternalUrl, openPersonaThirdPartyNotices } from './persona-about-host.ts'
import { SettingsScrollFrame } from './SettingsScrollFrame.tsx'

export type AboutSettingsPanelProps = PropsLocale<'persona.shell'>

export function AboutSettingsPanel({ t }: AboutSettingsPanelProps): ReactNode {
  return (
    <SettingsScrollFrame>
      <Screen>
        <ScreenHeader icon="configuracoes" eyebrow={t('place.settings')} title={t('about.title')} />
        <AboutPersona
          labels={ABOUT_LABELS_PT}
          onOpenUrl={openPersonaExternalUrl}
          onOpenNotices={openPersonaThirdPartyNotices}
          inline
        />
      </Screen>
    </SettingsScrollFrame>
  )
}
