import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { hasPose, poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar } from '../primitives/index.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import styles from './TypingIndicator.module.css'

/**
 * P1-4 (Muse, BR-P3-SPEC): "{persona} está escrevendo…". Com a pose `digitando` da persona, a pose INTEIRA a 48 px de altura (nunca recortada no
 * rosto); sem ela (os 12 extras), o retrato de 32 px. As reticências animam só sem reduced-motion. Não é região ao vivo: quem avisa o leitor de
 * tela é o aviso único do início da resposta (sem repetir).
 */
export function TypingIndicator({ t, member }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly member: ChannelPersonaMember
}): ReactNode {
  const character = member.id as PersonaCharacterId
  const pose = hasPose(character, 'digitando') ? poseUrl(character, 'digitando') : undefined
  const label = t('stream.writing', { name: member.name })
  const text = label.endsWith('…') ? label.slice(0, -1) : label
  return (
    <div className={styles.typing} data-persona-typing="" data-pose={pose === undefined ? 'avatar' : 'digitando'}>
      {pose !== undefined
        ? <img className={styles.pose} src={pose} alt="" height={48} />
        : <Avatar name={member.name} src={(AVATAR_96 as Readonly<Record<string, string>>)[member.id]} shape="portrait" size={32} decorative />}
      <span className={styles.text}>
        {text}
        <span className={styles.dots} aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
      </span>
    </div>
  )
}
