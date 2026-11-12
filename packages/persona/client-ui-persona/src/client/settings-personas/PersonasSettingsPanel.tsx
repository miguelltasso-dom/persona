/**
 * "Configurações › Personas" (HT-13 + EFF-1 + D-090, atrás de `persona.flag.settingsPersonas`).
 * Nenhum controle morto: cada controle na linha de uma persona (ou nos blocos abaixo) só aparece quando os dados/ações
 * do host estão presentes.
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PersonaEngineChoiceView, PersonaTeamworkView } from '@deepseek-ai/dsh-persona-host/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import { formatEngineEffortChip, nativeEffortName } from '../profile/engine-effort-model.ts'
import { Avatar, Button, Card, Chip, ChoiceCards, EmptyState, Notice, Screen, ScreenHeader, Switch } from '../primitives/index.ts'
import { Select } from '../primitives/Select.tsx'
import { SettingsScrollFrame } from '../shell/SettingsScrollFrame.tsx'
import styles from './PersonasSettingsPanel.module.css'

export interface SettingsPersonaGrant {
  readonly cli: string
  readonly connectorId: string
  readonly name: string
  readonly loadedAlways?: boolean | undefined
}

export interface SettingsPersonaRow {
  readonly id: string
  readonly name: string
  /** Função da persona ("Revisor de contratos"). */
  readonly title?: string | undefined
  /** Chave do retrato na galeria (`avatarRef`). */
  readonly characterId?: string | undefined
  /** Nível de autonomia atual (HT-13, `PERSONA-POWERS-SPEC.md` §6). */
  readonly autonomy?: AutonomyLevel | undefined
  /** Escolha de motor/modelo/esforço (EFF-1, `EFFORT-SPEC.md` §3). */
  readonly engine?: PersonaEngineChoiceView | undefined
  readonly engineChip?: string | undefined
  /** "Pode contratar" (`PERSONA-POWERS-SPEC.md` §5/§6). */
  readonly canRecruit?: boolean | undefined
  /** "Pode salvar arquivos no rascunho" (EQUIPE-REAL-SPEC (e)): o host sempre manda; `undefined` = a tela não mostra o interruptor (nada por trás). */
  readonly canSaveFiles?: boolean | undefined
  /** `false` = o projeto da persona não tem pasta: o interruptor fica desabilitado e a frase diz o porquê. */
  readonly canSaveFilesAvailable?: boolean | undefined
  /** "Pode pedir ajuda a colegas · até N por dia · rodadas de opinião" (D-090, `EQUIPE-REAL-SPEC.md`). */
  readonly teamwork?: PersonaTeamworkView | undefined
  /** Conectores permanentes ("Sem perguntar", `PERSONA-POWERS-SPEC.md` §3/§6). */
  readonly grants?: readonly SettingsPersonaGrant[] | undefined
  /** HT-0: quando `true`, esta persona usa o Codex na conta própria da pessoa (sem mexer em quadros/tarefas/colegas). */
  readonly codexOwnAccount?: boolean | undefined
}

export type ReviewDeliveryMode = 'off' | 'all' | 'types'
/** `'coordination'` | `'same_role'` | id de uma persona. */
export type ReviewDeliveryWho = 'coordination' | 'same_role' | string

export interface ReviewBeforeDeliveryProject {
  readonly id: string
  readonly name: string
}

export interface ReviewBeforeDeliverySettings {
  readonly projects: readonly ReviewBeforeDeliveryProject[]
  readonly selectedProjectId: string
  readonly mode: ReviewDeliveryMode
  readonly reviewer: ReviewDeliveryWho
  readonly taskTypesLabel?: string | undefined
  onSelectProject?(projectId: string): void
  onChangeMode(mode: ReviewDeliveryMode): void
  onChangeReviewer(reviewer: ReviewDeliveryWho): void
}

export interface HousePersonasSettings {
  readonly useClaudeSkills: boolean
  readonly hireDirect: boolean
  readonly codexLoadedAlways?: boolean | undefined
  onChangeUseClaudeSkills(next: boolean): void
  onChangeHireDirect(next: boolean): void
}

export interface PersonasSettingsPanelProps extends PropsLocale<'persona.shell'> {
  /** Quem está na equipe; `null` enquanto o host não respondeu. */
  readonly personas: readonly SettingsPersonaRow[] | null
  readonly onChangeAutonomy?: ((personaId: string, level: AutonomyLevel) => void) | undefined
  readonly onOpenEngine?: ((personaId: string) => void) | undefined
  readonly onChangeCanRecruit?: ((personaId: string, canRecruit: boolean) => void) | undefined
  readonly onChangeCanSaveFiles?: ((personaId: string, canSaveFiles: boolean) => void) | undefined
  /** Escolher a pasta do projeto (a mesma ação de Arquivos); só aparece junto da frase do projeto sem pasta. */
  readonly onChooseFolder?: (() => void) | undefined
  readonly onChangeTeamwork?: ((
    personaId: string,
    patch: { readonly canAskColleagues?: boolean; readonly askCapPerDay?: number; readonly maxOpinionRounds?: number },
  ) => void) | undefined
  readonly onRevokeGrant?: ((personaId: string, cli: string, connectorId: string) => void) | undefined
  /** HT-0: abre Conexões a partir do aviso de Codex na conta própria (`settings.codexOwnAccount`). */
  readonly onOpenConnections?: (() => void) | undefined
  /** D-090 §(d): bloco "Revisão antes de entregar · {projeto}". */
  readonly reviewBeforeDelivery?: ReviewBeforeDeliverySettings | undefined
  /**
   * v1.1 (Keel 14:53, achado #3; frase da Muse 15:00): a revisão fica SEMPRE ligada e a tela diz isso em uma frase, sem controle nenhum — modo e revisor
   * só voltam como `reviewBeforeDelivery` (ligados ao host) na v1.1.x. Vale só quando `reviewBeforeDelivery` não vem.
   */
  readonly reviewAlwaysOn?: boolean | undefined
  /** HT-11 / HT-13 §5: "Suas skills do Claude" e "Contratar direto, sem Aprovações". */
  readonly houseSettings?: HousePersonasSettings | undefined
}

const ASK_CAP_VALUES = Array.from({ length: 20 }, (_, idx) => idx + 1)
const OPINION_ROUND_VALUES = [1, 2, 3] as const
const REVIEW_MODES: readonly ReviewDeliveryMode[] = ['off', 'all', 'types']

/** Nome do provedor no chip ("Claude · Haiku · medium"): o CLI que a persona usa. `dsh` é o motor direto, que a pessoa vê como DeepSeek. */
function engineProviderLabel(cli: string | undefined): string | undefined {
  if (cli === undefined || cli.trim() === '') return undefined
  const names: Readonly<Record<string, string>> = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', opencode: 'OpenCode', dsh: 'DeepSeek' }
  return names[cli.trim().toLowerCase()] ?? cli.trim()
}

export function PersonasSettingsPanel({
  t,
  personas,
  onChangeAutonomy,
  onOpenEngine,
  onChangeCanRecruit,
  onChangeCanSaveFiles,
  onChooseFolder,
  onChangeTeamwork,
  onRevokeGrant,
  onOpenConnections,
  reviewBeforeDelivery,
  reviewAlwaysOn,
  houseSettings,
}: PersonasSettingsPanelProps): ReactNode {
  // Cena 16 (Muse): cada persona é uma linha de 64 px; o corpo abre e fecha em acordeão (ids das linhas abertas).
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set())
  const toggleRow = (id: string): void => {
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const reviewModeRef = useRef<HTMLDivElement>(null)

  const onReviewModeKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (reviewBeforeDelivery === undefined) return
    const { key } = event
    if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') {
      return
    }
    event.preventDefault()
    const idx = Math.max(0, REVIEW_MODES.indexOf(reviewBeforeDelivery.mode))
    const last = REVIEW_MODES.length - 1
    const nextIdx = key === 'Home'
      ? 0
      : key === 'End'
        ? last
        : (key === 'ArrowRight' || key === 'ArrowDown')
          ? (idx >= last ? 0 : idx + 1)
          : (idx <= 0 ? last : idx - 1)
    const target = REVIEW_MODES[nextIdx]
    if (target === undefined) return
    reviewBeforeDelivery.onChangeMode(target)
    reviewModeRef.current?.querySelector<HTMLElement>(`[data-review-mode="${target}"]`)?.focus()
  }

  const allGrants = (personas ?? []).flatMap(p => (p.grants ?? []).map(g => ({ personaId: p.id, personaName: p.name, ...g })))
  const hasCodexNote = houseSettings?.codexLoadedAlways === true || allGrants.some(g => g.loadedAlways === true || g.cli === 'codex')
  const selectedProjectName = reviewBeforeDelivery?.projects.find(p => p.id === reviewBeforeDelivery.selectedProjectId)?.name
    ?? reviewBeforeDelivery?.projects[0]?.name
    ?? ''

  return (
    <SettingsScrollFrame>
      <Screen>
        <ScreenHeader
          icon="configuracoes"
          eyebrow={t('place.settings')}
          title={t('personasTab.title')}
          subtitle={t('personasTab.subtitle')}
        />
        <div className={styles.stack}>
          <Card as="section" titleAs="h2" title={t('personasTab.can.title')} padding="m" data-persona-settings="personas">
            {personas !== null && personas.length > 0 && personas.some(row => row.canSaveFilesAvailable === false) && (
              <div id="persona-no-folder-banner" className={styles.banner}>
                <Notice tone="info">
                  <span>{t('settings.canSaveFilesNoFolder' as never)}</span>
                  {onChooseFolder !== undefined && (
                    <>
                      {' '}
                      <Button variant="ghost" size="s" onClick={onChooseFolder}>{t('settings.chooseFolder' as never)}</Button>
                    </>
                  )}
                </Notice>
              </div>
            )}
            {personas === null || personas.length === 0 ? (
              <EmptyState compact title={t('personasTab.empty.title')} body={t('personasTab.empty.body')} />
            ) : (
              <ul className={styles.list}>
                {personas.map((row) => {
                  const src = resolvePersonaFace({ id: row.id, characterId: row.characterId, name: row.name })
                  const chipBase = row.engineChip ?? (row.engine !== undefined
                    ? formatEngineEffortChip(row.engine, nativeEffortName, t('personasTab.engine.defaultChip' as never))
                    : undefined)
                  const provider = engineProviderLabel(row.engine?.runnerCli)
                  const chipText = chipBase === undefined ? undefined : provider === undefined ? chipBase : `${provider} · ${chipBase}`
                  const recruitLabelId = `persona-can-recruit-${row.id}`
                  const askColleaguesLabelId = `persona-can-ask-${row.id}`
                  const saveFilesLabelId = `persona-can-save-files-${row.id}`
                  const saveFilesHintId = `persona-can-save-files-hint-${row.id}`
                  const isOpen = openRows.has(row.id)
                  const bodyId = `persona-row-body-${row.id}`
                  return (
                    <li key={row.id} className={styles.row} data-persona-id={row.id}>
                      <div className={styles.rowTop}>
                        <button
                          type="button"
                          className={styles.rowToggle}
                          aria-expanded={isOpen}
                          aria-controls={bodyId}
                          onClick={() => { toggleRow(row.id) }}
                        >
                          <span className={styles.identity}>
                            <Avatar name={row.name} {...(src === undefined ? {} : { src })} size={40} decorative />
                            <span className={styles.who}>
                              <span className={styles.name}>{row.name}</span>
                              {row.title !== undefined && row.title.trim() !== '' && <span className={styles.role}>{row.title}</span>}
                            </span>
                          </span>
                          {row.autonomy !== undefined && (
                            <span className={styles.summary}>{t(`personasTab.autonomy.${row.autonomy}` as never)}</span>
                          )}
                        </button>
                        {chipText !== undefined && (
                          onOpenEngine !== undefined ? (
                            <button
                              type="button"
                              className={styles.engineChipButton}
                              data-persona-engine-trigger={row.id}
                              aria-label={t('personasTab.engine.change' as never, { name: row.name, current: chipText })}
                              onClick={() => { onOpenEngine(row.id) }}
                            >
                              <Chip size="s" tone="neutral">
                                {chipText}
                                <svg className={styles.chipChevron} viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" focusable="false">
                                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </Chip>
                            </button>
                          ) : (
                            <Chip size="s" tone="neutral">{chipText}</Chip>
                          )
                        )}
                        <button
                          type="button"
                          className={styles.rowChevronButton}
                          aria-expanded={isOpen}
                          aria-controls={bodyId}
                          aria-label={t('personasTab.row.toggle' as never, { name: row.name })}
                          onClick={() => { toggleRow(row.id) }}
                        >
                          <svg className={styles.chevron} viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" focusable="false">
                            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                      <div id={bodyId} className={styles.accordion} data-open={isOpen ? 'true' : 'false'}>
                        <div className={styles.accordionInner}>

                          {row.codexOwnAccount === true && (
                            <Notice tone="info">
                              <span>{t('settings.codexOwnAccount' as never)}</span>
                              {onOpenConnections !== undefined && (
                                <>
                                  {' '}
                                  <Button variant="ghost" size="s" onClick={onOpenConnections}>
                                    {t('settings.codexOwnAccount.action' as never)}
                                  </Button>
                                </>
                              )}
                            </Notice>
                          )}

                          {row.autonomy !== undefined && onChangeAutonomy !== undefined && (
                            <div className={styles.autonomyWrap}>
                              <ChoiceCards
                                legend={t('personasTab.autonomy.label' as never, { name: row.name })}
                                hideLegend
                                name={`persona-autonomy-${row.id}`}
                                value={row.autonomy}
                                onChange={(level) => { onChangeAutonomy(row.id, level) }}
                                options={[
                                  {
                                    id: 'on-request' as const,
                                    title: t('personasTab.autonomy.on-request' as never),
                                    body: t('personasTab.autonomy.on-request.hint' as never),
                                  },
                                  {
                                    id: 'propose' as const,
                                    title: t('personasTab.autonomy.propose' as never),
                                    body: t('personasTab.autonomy.propose.hint' as never),
                                  },
                                  {
                                    id: 'act-within-limits' as const,
                                    title: t('personasTab.autonomy.act-within-limits' as never),
                                    body: t('personasTab.autonomy.act-within-limits.hint' as never),
                                  },
                                ]}
                              />
                            </div>
                          )}

                          {row.grants !== undefined && row.grants.length > 0 && (
                            <div className={styles.grantsRow}>
                              <span className={styles.grantsLabel}>{t('personasTab.withoutAsking' as never)}</span>
                              {row.grants.map(grant => (
                                <span key={`${grant.cli}:${grant.connectorId}`} className={styles.grantChip}>
                                  <span>{grant.name}</span>
                                  {onRevokeGrant !== undefined && (
                                    <button
                                      type="button"
                                      className={styles.grantRemove}
                                      aria-label={t('personasTab.revokeGrant' as never, { name: row.name, connector: grant.name })}
                                      onClick={() => { onRevokeGrant(row.id, grant.cli, grant.connectorId) }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          {row.canSaveFiles !== undefined && onChangeCanSaveFiles !== undefined && (
                            <div data-persona-save-files={row.id}>
                              <div className={styles.switchRow}>
                                <Switch
                                  id={`switch-save-files-${row.id}`}
                                  checked={row.canSaveFilesAvailable === false ? false : row.canSaveFiles}
                                  disabled={row.canSaveFilesAvailable === false}
                                  labelledBy={saveFilesLabelId}
                                  describedBy={row.canSaveFilesAvailable === false ? 'persona-no-folder-banner' : saveFilesHintId}
                                  onChange={(next) => { onChangeCanSaveFiles(row.id, next) }}
                                />
                                <label id={saveFilesLabelId} htmlFor={`switch-save-files-${row.id}`} className={styles.switchLabel}>
                                  {t('settings.canSaveFiles' as never)}
                                </label>
                              </div>
                              {row.canSaveFilesAvailable !== false && (
                                <p id={saveFilesHintId} className={styles.costHint}>{t('settings.canSaveFilesHint' as never)}</p>
                              )}
                            </div>
                          )}

                          {(
                            (row.canRecruit !== undefined && onChangeCanRecruit !== undefined)
                      || (row.teamwork !== undefined && onChangeTeamwork !== undefined)
                          ) && (
                            <div className={styles.controlsBar}>
                              {row.canRecruit !== undefined && onChangeCanRecruit !== undefined && (
                                <div className={styles.switchRow}>
                                  <Switch
                                    id={`switch-recruit-${row.id}`}
                                    checked={row.canRecruit}
                                    labelledBy={recruitLabelId}
                                    onChange={(next) => { onChangeCanRecruit(row.id, next) }}
                                  />
                                  <label id={recruitLabelId} htmlFor={`switch-recruit-${row.id}`} className={styles.switchLabel}>
                                    {t('personasTab.canRecruit' as never)}
                                  </label>
                                </div>
                              )}

                              {row.teamwork !== undefined && onChangeTeamwork !== undefined && (
                                <>
                                  <div className={styles.switchRow}>
                                    <Switch
                                      id={`switch-ask-${row.id}`}
                                      checked={row.teamwork.canAskColleagues}
                                      labelledBy={askColleaguesLabelId}
                                      onChange={(next) => { onChangeTeamwork(row.id, { canAskColleagues: next }) }}
                                    />
                                    <label id={askColleaguesLabelId} htmlFor={`switch-ask-${row.id}`} className={styles.switchLabel}>
                                      {t('settings.canAskColleagues' as never)}
                                    </label>
                                  </div>

                                  <label className={styles.selectField}>
                                    <span className="persona-sr-only">{t('settings.askCapLabel' as never, { name: row.name })}</span>
                                    <Select
                                      aria-label={t('settings.askCapLabel' as never, { name: row.name })}
                                      value={row.teamwork.askCapPerDay}
                                      onChange={(event) => {
                                        onChangeTeamwork(row.id, { askCapPerDay: Number(event.target.value) })
                                      }}
                                    >
                                      {ASK_CAP_VALUES.map(n => (
                                        <option key={n} value={n}>
                                          {t((n === 1 ? 'settings.askCap.one' : 'settings.askCap') as never, { count: n })}
                                        </option>
                                      ))}
                                    </Select>
                                    {row.teamwork.askedToday > 0 && (
                                      <span className={styles.askedToday}>
                                        {t('settings.askedToday' as never, { used: row.teamwork.askedToday, cap: row.teamwork.askCapPerDay })}
                                      </span>
                                    )}
                                  </label>

                                  <label className={styles.selectField}>
                                    <span className="persona-sr-only">{t('opinion.roundsLabel' as never, { name: row.name })}</span>
                                    <Select
                                      aria-label={t('opinion.roundsLabel' as never, { name: row.name })}
                                      value={row.teamwork.maxOpinionRounds}
                                      onChange={(event) => {
                                        onChangeTeamwork(row.id, { maxOpinionRounds: Number(event.target.value) })
                                      }}
                                    >
                                      {OPINION_ROUND_VALUES.map(n => (
                                        <option key={n} value={n}>
                                          {t((n === 1 ? 'opinion.roundsSetting.one' : 'opinion.roundsSetting') as never, { count: n })}
                                        </option>
                                      ))}
                                    </Select>
                                  </label>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {reviewBeforeDelivery === undefined && reviewAlwaysOn === true && (
            <Card
              as="section"
              titleAs="h2"
              title={t('review.setting' as never)}
              padding="m"
              data-persona-settings="review-before-delivery"
              data-review-always-on=""
            >
              <div className={styles.reviewBlock}>
                <p className={styles.reviewNote}>{t('review.alwaysOn' as never)}</p>
                <p className={styles.costHint}>{t('review.costHint' as never)}</p>
              </div>
            </Card>
          )}

          {reviewBeforeDelivery !== undefined && (
            <Card
              as="section"
              titleAs="h2"
              title={selectedProjectName !== ''
                ? t('review.settingProject' as never, { project: selectedProjectName })
                : t('review.setting' as never)}
              padding="m"
              data-persona-settings="review-before-delivery"
            >
              <div className={styles.reviewBlock}>
                {reviewBeforeDelivery.projects.length > 1 && (
                  <label className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('review.projectLabel' as never)}</span>
                    <Select
                      aria-label={t('review.projectLabel' as never)}
                      value={reviewBeforeDelivery.selectedProjectId}
                      onChange={(event) => { reviewBeforeDelivery.onSelectProject?.(event.target.value) }}
                    >
                      {reviewBeforeDelivery.projects.map(proj => (
                        <option key={proj.id} value={proj.id}>{proj.name}</option>
                      ))}
                    </Select>
                  </label>
                )}

                <div
                  ref={reviewModeRef}
                  role="radiogroup"
                  aria-label={t('review.modeLabel' as never)}
                  className={styles.segmentedTrack}
                  onKeyDown={onReviewModeKeyDown}
                >
                  {REVIEW_MODES.map((mode) => {
                    const isSelected = reviewBeforeDelivery.mode === mode
                    const labelText = mode === 'off'
                      ? t('review.mode.off' as never)
                      : mode === 'all'
                        ? t('review.mode.all' as never)
                        : t('review.mode.types' as never, {
                          types: reviewBeforeDelivery.taskTypesLabel ?? t('review.defaultTypes' as never),
                        })
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={isSelected ? 0 : -1}
                        data-review-mode={mode}
                        className={styles.segmentButton}
                        onClick={() => { reviewBeforeDelivery.onChangeMode(mode) }}
                      >
                        {labelText}
                      </button>
                    )
                  })}
                </div>

                {reviewBeforeDelivery.mode !== 'off' && (
                  <label className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{t('review.whoLabel' as never)}</span>
                    <Select
                      aria-label={t('review.whoLabel' as never)}
                      value={reviewBeforeDelivery.reviewer}
                      onChange={(event) => { reviewBeforeDelivery.onChangeReviewer(event.target.value) }}
                    >
                      <option value="coordination">{t('review.who.coordination' as never)}</option>
                      <option value="same_role">{t('review.who.sameRole' as never)}</option>
                      {(personas ?? []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </label>
                )}

                <p className={styles.costHint}>{t('review.costHint' as never)}</p>
              </div>
            </Card>
          )}

          {(allGrants.length > 0 || hasCodexNote) && (
            <Card as="section" titleAs="h2" title={t('personasTab.connectors.title' as never)} padding="m" data-persona-settings="connectors">
              <div className={styles.houseBlock}>
                {allGrants.length > 0 && (
                  <div className={styles.grantsRow}>
                    {allGrants.map(g => (
                      <span key={`${g.personaId}:${g.cli}:${g.connectorId}`} className={styles.grantChip}>
                        <span>{g.name} · {g.personaName}</span>
                        {onRevokeGrant !== undefined && (
                          <button
                            type="button"
                            className={styles.grantRemove}
                            aria-label={t('personasTab.revokeGrant' as never, { name: g.personaName, connector: g.name })}
                            onClick={() => { onRevokeGrant(g.personaId, g.cli, g.connectorId) }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {hasCodexNote && <p className={styles.costHint}>{t('settings.codexNote' as never)}</p>}
              </div>
            </Card>
          )}

          {houseSettings !== undefined && (
            <Card as="section" titleAs="h2" title={t('personasTab.claudeSkills.title' as never)} padding="m" data-persona-settings="house">
              <div className={styles.houseBlock}>
                <div className={styles.switchRow}>
                  <Switch
                    id="switch-claude-skills"
                    checked={houseSettings.useClaudeSkills}
                    labelledBy="label-claude-skills"
                    describedBy="hint-claude-skills"
                    onChange={houseSettings.onChangeUseClaudeSkills}
                  />
                  <label id="label-claude-skills" htmlFor="switch-claude-skills" className={styles.switchLabel}>
                    {t('settings.skills' as never)}
                  </label>
                </div>
                <p id="hint-claude-skills" className={styles.costHint}>
                  {t('personasTab.claudeSkills.hint' as never)}
                </p>

                <div className={styles.switchRow}>
                  <Switch
                    id="switch-hire-direct"
                    checked={houseSettings.hireDirect}
                    labelledBy="label-hire-direct"
                    onChange={houseSettings.onChangeHireDirect}
                  />
                  <label id="label-hire-direct" htmlFor="switch-hire-direct" className={styles.switchLabel}>
                    {t('settings.hireDirect' as never)}
                  </label>
                </div>
                {houseSettings.hireDirect && (
                  <Notice tone="warning">{t('personasTab.hireDirect.warning' as never)}</Notice>
                )}
              </div>
            </Card>
          )}
        </div>
      </Screen>
    </SettingsScrollFrame>
  )
}
