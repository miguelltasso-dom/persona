import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, UiIcon, type PersonaCardFaceProps } from '../primitives/index.ts'
import { PERSONA_STATE_LABEL, personaStateOf } from './persona-state.ts'
import type { ChannelPersonaMember } from './persona-work-state.ts'
import styles from './TeamCompactBar.module.css'

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>
/** The bar shows the first five faces; the rest is "+n" (DESIGN-01-MUSE §1 cena 02). */
const MAX_FACES = 5
const FACE = 36

export interface TeamCompactBarProps extends PropsLocale<'persona.shell'> {
  readonly members: readonly ChannelPersonaMember[]
  /** The bar is showing (the big strip scrolled away). Hidden, it is out of the tab order and the accessibility tree. */
  readonly visible: boolean
  /** Who is writing right now in this channel, for the live pill. */
  readonly writing?: string | null | undefined
  /** "Mostrar a equipe": scrolls the thread back up to the big strip. */
  readonly onShowStage: () => void
  /** Clicking a face opens the DM (the same face props the strip uses). */
  readonly personaFace?: ((characterId: string) => PersonaCardFaceProps) | undefined
}

/**
 * The 56 px bar that replaces the big "Sua equipe neste canal" strip once the person scrolls the thread down: five 36 px faces with the
 * state dot (name on hover and focus), a live pill ("Bia · escrevendo…") and the "Mostrar a equipe" button. A new message never
 * unfolds it. It sits in a zero-height sticky dock, so it floats over the top of the thread without taking room in the layout.
 */
export function TeamCompactBar({ t, members, visible, writing, onShowStage, personaFace }: TeamCompactBarProps): ReactNode {
  if (members.length === 0) return null
  const shown = members.slice(0, MAX_FACES)
  const extra = members.length - shown.length
  // The live pill: whoever is writing, else the first persona who is not idle (waiting on the person comes first).
  const busy = members.find(member => personaStateOf(member) === 'waiting')
    ?? members.find(member => ['working', 'draft', 'reviewing'].includes(personaStateOf(member)))
  const live = writing != null && writing !== ''
    ? t('team.compactWriting', { name: writing })
    : busy === undefined ? null : `${busy.name} · ${t(PERSONA_STATE_LABEL[personaStateOf(busy)])}`
  return (
    <div className={styles.dock} data-persona-stage-dock="">
      <div className={styles.bar} role="group" aria-label={t('team.channelStripTitle')} hidden={!visible} data-persona-stage-bar="">
        <ul className={styles.faces}>
          {shown.map((member) => {
            const state = personaStateOf(member)
            const label = `${member.name} · ${t(PERSONA_STATE_LABEL[state])}`
            const face = <Avatar name={member.name} src={PORTRAITS[member.id]} shape="portrait" size={FACE} state={state} decorative />
            return (
              <li key={member.id} className={styles.faceItem} data-persona-state={state}>
                {personaFace === undefined ? (
                  <span className={styles.face} title={label} aria-label={label} role="img">{face}</span>
                ) : (
                  <button type="button" className={styles.face} title={label} aria-label={label} {...personaFace(member.id)}>{face}</button>
                )}
                <span className={styles.faceName} aria-hidden="true">{member.name}</span>
              </li>
            )
          })}
          {extra > 0 && <li className={styles.more} aria-label={t('team.compactMore', { count: String(extra) })}>{t('team.compactMore', { count: String(extra) })}</li>}
        </ul>
        {live !== null && <span className={styles.live} data-persona-stage-live="">{live}</span>}
        <Button variant="ghost" size="s" icon={<UiIcon name="chevronDown" size={16} strokeWidth={2.2} />} onClick={onShowStage}>
          {t('team.showStage')}
        </Button>
      </div>
    </div>
  )
}
