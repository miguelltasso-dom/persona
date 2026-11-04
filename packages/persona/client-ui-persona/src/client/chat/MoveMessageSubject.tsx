import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandIcon, MenuButton, type MenuItem } from '../primitives/index.ts'
import type { ConversationSubjectUi } from './conversation-subjects.ts'
import { SubjectDot, subjectDisplayName } from './SubjectBar.tsx'

export interface MoveMessageSubjectProps extends PropsLocale<'persona.chat'> {
  readonly subjects: readonly ConversationSubjectUi[]
  readonly currentSubjectId: string
  readonly onMove: (subjectId: string) => void
}

/** WAVE2: floating control beside reactions — move message to another assunto. */
export function MoveMessageSubject({
  t,
  subjects,
  currentSubjectId,
  onMove,
}: MoveMessageSubjectProps): ReactNode {
  const items: MenuItem[] = subjects
    .filter(row => row.id !== currentSubjectId)
    .map(row => ({
      id: row.id,
      label: subjectDisplayName(t, row),
      leading: <SubjectDot colorIndex={row.colorIndex} size={10} />,
      onSelect: () => { onMove(row.id) },
    }))
  if (items.length === 0) return null
  return (
    <MenuButton
      variant="ghost"
      label={t('subjects.move')}
      icon={<BrandIcon name="mover-assunto" size={18} />}
      items={items}
    />
  )
}
