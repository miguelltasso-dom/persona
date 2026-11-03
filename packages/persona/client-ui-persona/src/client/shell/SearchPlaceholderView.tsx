import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { PersonaMuted, PersonaPanel } from '../primitives/index.ts'

/** Busca global — placeholder until host search is wired. */
export function SearchPlaceholderView({ t }: PropsLocale<'persona.shell'>): ReactNode {
  return (
    <PersonaPanel>
      <h1>{t('sidebar.search')}</h1>
      <PersonaMuted>{t('sidebar.search')}</PersonaMuted>
    </PersonaPanel>
  )
}
