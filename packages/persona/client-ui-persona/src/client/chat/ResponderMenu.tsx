/**
 * CV-3 / CV-8: a LISTA do "Quem responde" (rostos 24, nome e função) e as 2 linhas do "Toda a equipe". Só desenha e chama; quem guarda a busca,
 * a seleção e o teclado é o composer (a mesma lista serve ao popover do seletor e ao `@nome` no texto).
 */
import { Fragment, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, UiIcon } from '../primitives/index.ts'
import { fanoutText } from './fanout/fanout-rules.ts'
import type { ResponderItem } from './responder-menu.ts'
import styles from './ResponderMenu.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface ResponderMenuProps {
  readonly t: ChatT
  readonly listId: string
  readonly items: readonly ResponderItem[]
  readonly activeIndex: number
  /** A persona escolhida agora (a linha leva o ✓). */
  readonly selectedId: string
  /** CV-8: a escolha do "Toda a equipe" feita agora, se houver. */
  readonly selectedFanout?: 'everyone' | 'relevant' | undefined
  /** Os rostos empilhados do "Toda a equipe" (os primeiros da equipe). */
  readonly teamFaces?: readonly { readonly id: string; readonly name: string }[] | undefined
  readonly onActivate: (index: number) => void
  readonly onPick: (item: ResponderItem) => void
}

export function optionId(listId: string, index: number): string {
  return `${listId}-opt-${String(index)}`
}

const avatarOf = (id: string): string | undefined => (AVATAR_96 as Readonly<Record<string, string>>)[id]

export function ResponderMenu({ t, listId, items, activeIndex, selectedId, selectedFanout, teamFaces = [], onActivate, onPick }: ResponderMenuProps): ReactNode {
  return (
    <ul className={styles.list} role="listbox" id={listId} aria-label={t('composer.modelLabel')}>
      {items.map((item, index) => {
        const active = index === activeIndex
        const previous = items[index - 1]
        const startsHere = item.kind === 'default'
        const selected = item.kind === 'fanout' ? selectedFanout === item.choice : selectedFanout === undefined && item.member.id === selectedId
        return (
          <Fragment key={item.kind === 'fanout' ? `fanout-${item.choice}` : item.member.id}>
            {startsHere && (
              <li className={styles.heading} role="presentation" data-has-divider={previous?.kind === 'fanout' ? '' : undefined}>
                {t('responder.here')}
              </li>
            )}
            <li
              id={optionId(listId, index)}
              role="option"
              aria-selected={selected}
              className={styles.option}
              data-active={active ? '' : undefined}
              data-kind={item.kind}
              onMouseEnter={() => { onActivate(index) }}
              onMouseDown={(event) => { event.preventDefault() }}
              onClick={() => { onPick(item) }}
            >
              {item.kind === 'fanout' ? (
                <>
                  <span className={styles.faces} aria-hidden="true">
                    {teamFaces.slice(0, 4).map(face => (
                      <Avatar key={face.id} name={face.name} src={avatarOf(face.id)} shape="portrait" size={24} decorative />
                    ))}
                  </span>
                  <span className={styles.text}>
                    <span className={styles.name}>
                      {item.choice === 'everyone'
                        ? fanoutText(t, 'composer.fanout.everyone', 'Toda a equipe ({count})', { count: item.count })
                        : fanoutText(t, 'composer.fanout.relevant', 'Quem tiver algo a dizer')}
                    </span>
                    {item.choice === 'relevant' && (
                      <span className={styles.role}>{fanoutText(t, 'composer.fanout.relevantHint', 'A Coordenação escolhe quem responde')}</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Avatar name={item.member.name} src={avatarOf(item.member.id)} shape="portrait" size={24} decorative />
                  <span className={styles.text}>
                    <span className={styles.name}>{item.member.name}</span>
                    <span className={styles.role}>{item.member.role}</span>
                  </span>
                </>
              )}
              {selected && <UiIcon name="check" size={16} strokeWidth={2.4} />}
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}
