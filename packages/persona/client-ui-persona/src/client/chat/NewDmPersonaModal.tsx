import { useId, useState, useMemo, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Avatar, Button, Card, Chip, Input, Modal, type ChipTone } from '../primitives/index.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import type { PersonaWorkUiState } from '../team/persona-work-state.ts'
import styles from './NewDmPersonaModal.module.css'

export interface SelectablePersonaOption {
  readonly id: string
  readonly name: string
  readonly role?: string | undefined
  readonly characterId?: string | undefined
  readonly state?: PersonaWorkUiState | undefined
  readonly stateLabel?: string | undefined
  readonly stateTone?: ChipTone | undefined
  readonly isCoordination?: boolean | undefined
  readonly hasExistingDm?: boolean | undefined
}

export interface NewDmPersonaModalProps extends PropsLocale<'persona.chat'> {
  readonly open: boolean
  readonly personas: readonly SelectablePersonaOption[]
  readonly onClose: () => void
  readonly onSelectPersona: (personaId: string) => void
  readonly onHirePersona?: (() => void) | undefined
}

export function NewDmPersonaModal({
  t,
  open,
  personas,
  onClose,
  onSelectPersona,
  onHirePersona,
}: NewDmPersonaModalProps): ReactNode {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...personas]
    // Order: existing DMs first, then coordination, then rest
    list.sort((a, b) => {
      if (a.hasExistingDm !== b.hasExistingDm) return a.hasExistingDm ? -1 : 1
      if (a.isCoordination !== b.isCoordination) return a.isCoordination ? -1 : 1
      return 0
    })
    if (q.length === 0) return list
    return list.filter(p =>
      p.name.toLowerCase().includes(q) || (p.role !== undefined && p.role.toLowerCase().includes(q)),
    )
  }, [personas, query])

  if (!open) return null

  return (
    <Modal open={open} title={t('dm.selectModalTitle')} onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.search}>
          <Input
            hideLabel
            label={t('dm.searchPersona')}
            placeholder={t('dm.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocusedIndex(0)
            }}
          />
        </div>

        <div
          className={styles.grid}
          role="listbox"
          aria-label={t('dm.selectModalTitle')}
          aria-activedescendant={filtered[focusedIndex] === undefined ? undefined : `${listId}-${filtered[focusedIndex].id}`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (filtered.length === 0) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
              event.preventDefault()
              setFocusedIndex(i => (i + 1) % filtered.length)
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
              event.preventDefault()
              setFocusedIndex(i => (i - 1 + filtered.length) % filtered.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              const chosen = filtered[focusedIndex]
              if (chosen !== undefined) {
                onSelectPersona(chosen.id)
                onClose()
              }
            }
          }}
        >
          {filtered.length === 0 ? (
            <p className={styles.empty}>{t('dm.emptySearch')}</p>
          ) : (
            filtered.map((item, index) => {
              const portrait = item.characterId !== undefined ? (AVATAR_96 as Record<string, string>)[item.characterId] : undefined
              const isFocused = index === focusedIndex
              return (
                <div
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={isFocused}
                  className={styles.optionWrap}
                >
                  <Card
                    interactive
                    padding="s"
                    className={`${styles.card} ${isFocused ? styles.cardFocused : ''}`}
                    onClick={() => {
                      onSelectPersona(item.id)
                      onClose()
                    }}
                  >
                    <div className={styles.cardContent}>
                      <Avatar
                        name={item.name}
                        src={portrait}
                        shape="portrait"
                        size={48}
                        presence={item.state === 'working' ? 'busy' : 'online'}
                        decorative
                      />
                      <div className={styles.meta}>
                        <span className={styles.name}>{item.name}</span>
                        <span className={styles.role}>
                          {item.hasExistingDm === true ? t('dm.continueConversation') : (item.role ?? '')}
                        </span>
                      </div>
                      {item.stateLabel !== undefined && (
                        <div className={styles.status}>
                          <Chip size="s" tone={item.stateTone ?? 'neutral'}>
                            {item.stateLabel}
                          </Chip>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )
            })
          )}
        </div>

        {onHirePersona !== undefined && (
          <div className={styles.footer}>
            <Button variant="ghost" onClick={onHirePersona}>
              {t('dm.hirePersona')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
