// Ember: gallery of screens I build, with sample data in the app's frame (rail width kept so 960 px and 200 % zoom are honest).
// Built by scripts/persona/ember-gallery.mjs; `#state` picks what is drawn. Not shipped with the app.
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { ApprovalsInbox } from '../../../packages/persona/client-ui-persona/src/client/approvals/ApprovalsInbox.tsx'
import { ApprovalsInboxV2 } from '../../../packages/persona/client-ui-persona/src/client/approvals/ApprovalsInboxV2.tsx'
import type { ApprovalItem } from '../../../packages/persona/client-ui-persona/src/client/approvals/mock-data.ts'
import type { PersonaDailyProactiveSummary } from '../../../packages/persona/client-ui-persona/src/client/approvals/proactivity-mock-data.ts'
import { approvalViewToItem } from '../../../packages/persona/client-ui-persona/src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../../../packages/persona/client-ui-persona/src/client/locale/approvals/locales.ts'
import { OrgChartView } from '../../../packages/persona/client-ui-persona/src/client/governance/OrgChartView.tsx'
import { pt as governancePt } from '../../../packages/persona/client-ui-persona/src/client/locale/governance/locales.ts'
import { SkillsPanel } from '../../../packages/persona/client-ui-persona/src/client/skills/SkillsPanel.tsx'
import { RoutineEditorModal } from '../../../packages/persona/client-ui-persona/src/client/routines/RoutineEditorModal.tsx'
import { RoutinesView, type RoutineActions, type RoutineRow } from '../../../packages/persona/client-ui-persona/src/client/routines/RoutinesView.tsx'
import { DEFAULT_WHEN } from '../../../packages/persona/client-ui-persona/src/client/routines/routine-schedule.ts'
import { pt as routinesPt } from '../../../packages/persona/client-ui-persona/src/client/locale/routines/locales.ts'

// ---- A-4: hire cards. A host that sends role + description + measured tasks; an older host that sends only the name; a vault card.
const hire = (extra: Record<string, unknown>): ApprovalItem => approvalViewToItem({
  id: 'hire-x', kind: 'hire', title: 'Sol', question: 'Contratar Sol?', status: 'pending',
  personaId: 'atlas', personaName: 'Atlas', hireAvatarRef: 'sol', ...extra,
})
// Names and animals that are NOT on the team (Atlas, Bento, Nina, Sol, Luna): a hire is for someone who is not there yet.
const FULL = hire({
  id: 'hire-full', title: 'Bolota', hireAvatarRef: 'tamandua',
  roleTitle: 'revisar cláusulas de rescisão',
  description: 'Lê os contratos que chegam, marca as cláusulas de rescisão e avisa quando algo foge do padrão.',
  monthlyTasks: 12,
})
const NAME_ONLY = hire({ id: 'hire-old', title: 'Capi', hireAvatarRef: 'capivara' })
const MOTIVE = { ...hire({ id: 'hire-why', title: 'Pipa', hireAvatarRef: 'tucano', roleTitle: 'Suporte', description: 'Atende os clientes pelo WhatsApp.' }), hireWhy: 'Toda semana chegam mais de 20 mensagens sem resposta.' }
// A-4b: a Cofre card shows who proposes it; with data from the host it says WHAT changes (field + before → after).
const vault = (extra: Record<string, unknown>): ApprovalItem => approvalViewToItem({
  id: 'v-x', kind: 'vault', title: 'tom-de-voz', question: 'Atualizar registro no Cofre?', status: 'pending',
  personaId: 'nina', personaName: 'Nina', ...extra,
})
const VAULT = vault({ id: 'v-plain', title: 'Tom de voz' })
const VAULT_CHANGE = vault({ id: 'v-change', title: 'preco-do-pao', changeField: 'Preço do pão', changeBefore: 'R$ 12', changeAfter: 'R$ 14' })
// A real dependency named by the host: the only case where a primary action is off, and the card says on what.
const WAITING = hire({ id: 'hire-wait', title: 'Pipa', hireAvatarRef: 'tucano', roleTitle: 'Suporte', description: 'Atende os clientes pelo WhatsApp.', dependsOnTitle: 'Contratar Bolota' })

// REVIEW-APPROVALS-REDESIGN §2: the inbox (list + detail), with a hire, a task, two low-risk cards and a persona's proposal.
const INBOX_ITEMS: readonly ApprovalItem[] = [
  { ...FULL, createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), risk: 'normal' },
  { ...MOTIVE, createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), risk: 'normal' },
  { ...vault({ id: 'v-low', title: 'preco-do-pao', changeField: 'Preço do pão', changeBefore: 'R$ 12', changeAfter: 'R$ 14' }), risk: 'low' as const, createdAt: new Date(Date.now() - 50 * 60_000).toISOString() },
  { ...vault({ id: 'v-low2', title: 'horario', personaName: 'Sol', personaId: 'sol' }), risk: 'low' as const },
]
const INBOX_PROPOSALS: readonly PersonaDailyProactiveSummary[] = [{
  personaId: 'luna', personaName: 'Luna', personaCharacterId: 'luna', summaryDate: new Date().toISOString().slice(0, 10),
  proposals: [{ id: 'prop-1', kind: 'initiative', title: 'Automatizar o smoke do checkout', oneQuestion: 'Posso abrir um ticket e rodar o smoke no main?', impactDetail: 'Reduz o risco de regressão no fluxo de pagamento.', cost: { tokens: 12_000, runs: 1 }, approvalKind: 'skill' }],
}]

// IV-9: Rotinas (a list in people's words, the editor, the empty state with its one primary).
const ROUTINE_ROWS: readonly RoutineRow[] = [
  { id: 'r1', name: 'Resumo das vendas da semana', prompt: 'Resumir as vendas da semana', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0', ownerPersonaId: 'nina', ownerName: 'Nina', projectId: 'site', paused: false },
  { id: 'r2', name: 'Varredura de PRs', prompt: 'Revisar os PRs abertos', rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0', ownerPersonaId: 'bento', ownerName: 'Bento', projectId: 'site', paused: false },
  { id: 'r3', name: 'Relatório de sexta', prompt: 'Mandar o relatório', rrule: 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0', projectId: 'site', paused: true },
  { id: 'r4', name: 'Backup do Cofre', prompt: 'Guardar uma cópia do Cofre', rrule: 'FREQ=HOURLY;INTERVAL=6', ownerPersonaId: 'sol', ownerName: 'Sol', projectId: 'site', paused: false },
]
const ROUTINE_PEOPLE = [{ id: 'nina', name: 'Nina' }, { id: 'bento', name: 'Bento' }, { id: 'sol', name: 'Sol' }, { id: 'luna', name: 'Luna' }]
const ROUTINE_ACTIONS: RoutineActions = {
  personas: ROUTINE_PEOPLE,
  projects: [{ id: 'site', name: 'Site' }, { id: 'contratacao', name: 'Contratação' }],
  defaultProjectId: 'site',
  canEdit: true,
  onSave: async () => {},
  onTogglePause: async () => {},
  onDelete: async () => {},
  onRestore: async () => {},
}
const editorProps = {
  dict: routinesPt,
  open: true,
  personas: ROUTINE_PEOPLE,
  projects: [{ id: 'site', name: 'Site' }, { id: 'contratacao', name: 'Contratação' }],
  onSave: async () => {},
  onClose: () => {},
} as const

const STATES: Readonly<Record<string, () => ReactNode>> = {
  routines: () => <RoutinesView dict={routinesPt} routineRows={ROUTINE_ROWS} actions={ROUTINE_ACTIONS} routineRuns={[]} quietWindows={[{ id: 'q', label: 'Noites', range: '22:00 – 07:00' }]} onAskSuggestions={() => {}} onAddQuietWindow={async () => {}} />,
  'routines-empty': () => <RoutinesView dict={routinesPt} initialState="empty" routineRows={[]} actions={ROUTINE_ACTIONS} onAskSuggestions={() => {}} />,
  'routine-editor': () => <RoutineEditorModal {...editorProps} mode="create" initial={{ prompt: 'Resumir as vendas da semana', when: DEFAULT_WHEN, ownerPersonaId: 'nina', projectId: 'site' }} />,
  'routine-editor-custom': () => <RoutineEditorModal {...editorProps} mode="edit" onTogglePause={async () => {}} onDelete={async () => {}} initial={{ id: 'r3', prompt: 'Mandar o relatório de sexta', when: { choice: 'custom', time: '17:00', days: [5] }, ownerPersonaId: 'bento', projectId: 'site', paused: false }} />,
  inbox: () => <ApprovalsInboxV2 dict={approvalsPt} items={INBOX_ITEMS} proactiveSummaries={INBOX_PROPOSALS} onDecideItem={() => {}} onDecideProactive={() => {}} />,
  'inbox-vault': () => <ApprovalsInboxV2 dict={approvalsPt} items={INBOX_ITEMS} proactiveSummaries={INBOX_PROPOSALS} focusId="v-low" onDecideItem={() => {}} onDecideProactive={() => {}} />,
  'inbox-empty': () => <ApprovalsInboxV2 dict={approvalsPt} items={[]} proactiveSummaries={[]} onOpenOverview={() => {}} />,
  // IV-8: nothing taught yet, and nobody organized yet (the real screens, no sample data).
  'skills-empty': () => <SkillsPanel personaName="Nina" personaCharacter="nina" onTeach={() => {}} />,
  'org-empty': () => <OrgChartView dict={governancePt} data={null} surfaceState="empty" onBuildTeam={() => {}} groupBy="person" onGroupByChange={() => {}} onSelectPersona={() => {}} />,
  'approvals-hire': () => <ApprovalsInbox dict={approvalsPt} items={[FULL, MOTIVE, NAME_ONLY, VAULT_CHANGE, VAULT, WAITING]} onDecideItem={() => {}} />,
  'approvals-hire-details': () => <ApprovalsInbox dict={approvalsPt} items={[FULL, NAME_ONLY]} onDecideItem={() => {}} />,
}

const state = window.location.hash.replace('#', '') || 'approvals-hire'
const render = STATES[state] ?? STATES['approvals-hire']!
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.setAttribute('data-ds-dark-theme', 'true')

createRoot(document.getElementById('root')!).render(
  <div data-persona-root="" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', minHeight: '100vh', background: 'var(--persona-paper)', color: 'var(--persona-ink)' }}>
    <aside style={{ background: 'var(--persona-rail)' }} aria-hidden="true" />
    <main data-gallery-state={state} style={{ padding: 24, minWidth: 0 }}>{render()}</main>
  </div>,
)
