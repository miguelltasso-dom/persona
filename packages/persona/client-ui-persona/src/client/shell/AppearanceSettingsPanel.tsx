/**
 * "Configurações › Aparência" (TH-1, APARENCIA-SPEC; cena 22 da Muse): o Tema (Sistema / Claro / Escuro) em três cartões com uma
 * miniatura do app desenhada com os tokens; as Figurinhas das personas (antes a aba Personalidade, atrás da flag figurinhas);
 * e o interruptor "Dicas de atalho". A troca do tema é AO VIVO e fica no Config do usuário (ver `theme-preference.ts`).
 * Não há "som ao concluir": não existe backend para ele (decisão do Keel).
 */

import { useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Card, ChoiceCards, Screen, ScreenHeader, Switch, type ChoiceCardOption } from '../primitives/index.ts'
import { THEME_CHOICES, type ThemeBridge, type ThemeChoice } from '../theme/theme-preference.ts'
import { isStickersEnabled } from '../figurinhas/figurinhas-flag.ts'
import { StickersSection } from '../figurinhas/StickersSection.tsx'
import { SettingsScrollFrame } from './SettingsScrollFrame.tsx'
import { useShortcutTips } from './shortcut-tips-preference.ts'
import styles from './AppearanceSettingsPanel.module.css'

export interface AppearanceSettingsPanelProps extends PropsLocale<'persona.shell'> {
  /** Lê, troca e ouve a escolha de tema (o serviço de tema do host, ou a ponte local sem ele). */
  readonly themeBridge: ThemeBridge
}

/**
 * A miniatura de um tema: o mesmo desenho (rail, cabeçalho, dois cartões, uma etiqueta) feito só de tokens, na paleta do esquema pedido,
 * qualquer que seja o tema da janela. "Sistema" junta as duas metades na diagonal. Decorativa: o título e a frase do cartão dizem o resto.
 */
function ThemeMiniature({ choice }: { readonly choice: ThemeChoice }): ReactNode {
  const scenes = choice === 'system' ? (['light', 'dark'] as const) : ([choice] as const)
  return (
    <span className={styles.mini} data-theme-mini={choice} aria-hidden="true">
      {scenes.map(scheme => (
        <span
          key={scheme}
          className={styles.scene}
          data-persona-scheme={scheme}
          data-half={choice === 'system' ? scheme : undefined}
        >
          <span className={styles.rail}>
            <span className={styles.railDot} />
            <span className={styles.railDot} />
            <span className={styles.railDot} />
          </span>
          <span className={styles.head} />
          <span className={styles.panelBig} />
          <span className={styles.panelSmall} />
          <span className={styles.chip} />
          {scheme === 'dark' && (
            <>
              <span className={styles.lamp} />
              <span className={styles.firefly} data-n="1" />
              <span className={styles.firefly} data-n="2" />
              <span className={styles.firefly} data-n="3" />
            </>
          )}
        </span>
      ))}
    </span>
  )
}

export function AppearanceSettingsPanel({ t, themeBridge }: AppearanceSettingsPanelProps): ReactNode {
  const choice = useSyncExternalStore(themeBridge.subscribe, themeBridge.read, themeBridge.read)
  const tips = useShortcutTips()
  const options: readonly ChoiceCardOption<ThemeChoice>[] = THEME_CHOICES.map(id => ({
    id,
    title: t(`appearance.${id}`),
    body: t(`appearance.${id}Hint`),
    icon: <ThemeMiniature choice={id} />,
  }))
  return (
    <SettingsScrollFrame>
      <Screen>
        <ScreenHeader icon="configuracoes" eyebrow={t('place.settings')} title={t('appearance.title')} />
        {/* `data-theme-persistence`: onde a escolha fica guardada (`config` = Config do usuário via o serviço de tema do host; `local` = só este navegador); as provas leem. */}
        <Card as="section" titleAs="h2" title={t('appearance.theme')} padding="m" data-theme-persistence={themeBridge.persistence}>
          <ChoiceCards<ThemeChoice>
            legend={t('appearance.theme')}
            hideLegend
            variant="preview"
            name="persona-theme"
            options={options}
            value={choice}
            onChange={(next) => { themeBridge.write(next) }}
          />
        </Card>
        {isStickersEnabled() && <StickersSection t={t} />}
        {/* P1-03 (Carbon): a seção de sons fica escondida até um evento do app tocar um som (createSoundEffects ainda não tem chamadores). */}
        <Card as="section" padding="m">
          <div className={styles.tipsRow}>
            <div className={styles.tipsText}>
              <h2 id="persona-shortcut-tips-title" className={styles.tipsTitle}>{t('appearance.shortcutTips')}</h2>
              <p id="persona-shortcut-tips-hint" className={styles.tipsHint}>{t('appearance.shortcutTipsHint')}</p>
            </div>
            <Switch
              checked={tips.enabled}
              onChange={tips.setEnabled}
              labelledBy="persona-shortcut-tips-title"
              describedBy="persona-shortcut-tips-hint"
            />
          </div>
        </Card>
      </Screen>
    </SettingsScrollFrame>
  )
}
