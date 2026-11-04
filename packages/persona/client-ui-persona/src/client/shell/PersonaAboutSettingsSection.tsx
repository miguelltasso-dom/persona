import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AboutPersona, type AboutLabels } from '../primitives/About.tsx'

export interface PersonaAboutSettingsInjected {
  readonly labels: AboutLabels
  readonly version: string
  readonly onOpenUrl: (url: string) => void
  readonly onOpenNotices: () => void
}

/** Configurações › Sobre — Muse {@link AboutPersona} wired for the DSH settings shell. */
export function PersonaAboutSettingsSection({
  labels,
  version,
  onOpenUrl,
  onOpenNotices,
}: PropsRuntime<'settings.section'> & InjectFace<PersonaAboutSettingsInjected>): ReactNode {
  return (
    <AboutPersona
      version={version}
      labels={labels}
      onOpenUrl={onOpenUrl}
      onOpenNotices={onOpenNotices}
    />
  )
}
