// Ember: gallery of screens I build, with sample data in the app's frame (rail width kept so 960 px and 200 % zoom are honest).
// Built by scripts/persona/ember-gallery.mjs; `#state` picks what is drawn. Not shipped with the app.
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, type ReactNode } from 'react'
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
import { pt as chatPt } from '../../../packages/persona/client-ui-persona/src/client/locale/chat/locales.ts'
import { bindLocale } from '../../../packages/persona/client-ui-persona/src/client/preview/locale-bind.ts'
import { PersonaAskCard, type PersonaAskCardProps } from '../../../packages/persona/client-ui-persona/src/client/ask/PersonaAskCard.tsx'
import type { PersonaAskUi } from '../../../packages/persona/client-ui-persona/src/client/ask/persona-ask-model.ts'
import { TaskProposalCard, type TaskProposalCardProps } from '../../../packages/persona/client-ui-persona/src/client/proposal/TaskProposalCard.tsx'
import type { TaskProposalUi } from '../../../packages/persona/client-ui-persona/src/client/proposal/task-proposal-model.ts'
import { KanbanCard } from '../../../packages/persona/client-ui-persona/src/client/kanban/KanbanCard.tsx'
import { StartedNowProvider } from '../../../packages/persona/client-ui-persona/src/client/kanban/StartedNowNote.tsx'
import type { KanbanCardModel } from '../../../packages/persona/client-ui-persona/src/client/kanban/types.ts'
import { pt as kanbanPt } from '../../../packages/persona/client-ui-persona/src/client/locale/kanban/locales.ts'

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

// D-095: an external action (with its real preview, and without one) and a connector card, in the V2 detail.
const EMAIL_PREVIEW = {
  actionClass: 'send', verb: 'email', connectorName: 'Gmail', to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta',
  body: 'Oi, Ana! Confirmo os 12 bolos de cenoura para sexta, às 9h. Qualquer mudança me avise até quinta.', truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true,
}
const actionItem = (extra: Record<string, unknown>, actionPreview: Record<string, unknown> | null): ApprovalItem => ({
  ...approvalViewToItem({ id: 'act-1', kind: 'action', title: 'Enviar um email', question: 'Nina quer enviar um email', status: 'pending', personaId: 'nina', personaName: 'Nina', ...(actionPreview === null ? {} : { actionPreview }), ...extra } as never),
  decisionState: 'pending',
  createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
})
const CONNECTOR_ITEM: ApprovalItem = {
  ...approvalViewToItem({
    id: 'conn-1', kind: 'connector', title: 'Liberar o Gmail para Téo', question: 'Bia pediu a Téo Arte da home, mas Téo não pode usar o Gmail.', status: 'pending', personaId: 'teo', personaName: 'Téo',
    connector: { reason: 'colleague', connectorName: 'Gmail', cli: 'claude', connectorId: 'gmail', access: 'read', requestedByPersonaId: 'bia', requestedByPersonaName: 'Bia', taskId: 't-arte', taskTitle: 'Arte da home', options: ['once', 'always', 'not-now'] },
  } as never),
  decisionState: 'pending',
  createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
}

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

// IV-10 (the structured question with chips) and P1-9 ("Proposta de {persona}") live in the thread: a frame as wide as the thread.
const chatT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as PersonaAskCardProps['t'] & TaskProposalCardProps['t']
const ASK_OPTIONS = [
  { id: 'padaria', label: 'Padaria' }, { id: 'agencia', label: 'Agência' }, { id: 'loja', label: 'Loja online' },
  { id: 'clinica', label: 'Clínica ou consultório' }, { id: 'escritorio', label: 'Escritório de serviços' }, { id: 'outra', label: 'Outra coisa' },
]
const askOf = (extra: Partial<PersonaAskUi> = {}): PersonaAskUi => ({
  askId: 'att-1', ticketId: 'tk-1', personaId: 'atlas', personaName: 'Atlas', characterId: 'atlas',
  question: 'O que a sua empresa faz? Com isso eu monto uma equipe pronta, e você só confere.', options: ASK_OPTIONS, multiple: false, ...extra,
})
/** Clicks the given controls once drawn (a card keeps its picks in its own state). */
function Preclick({ selector, indexes, children }: { readonly selector: string; readonly indexes: readonly number[]; readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nodes = ref.current?.querySelectorAll<HTMLElement>(selector) ?? []
    for (const index of indexes) nodes[index]?.click()
  }, [selector, indexes])
  return <div ref={ref}>{children}</div>
}
const thread = (children: ReactNode): ReactNode => <div style={{ maxWidth: 760 }}>{children}</div>
const askCard = (props: Partial<PersonaAskCardProps> & { readonly ask: PersonaAskUi }): ReactNode => (
  thread(<PersonaAskCard t={chatT} rowTag="div" timeLabel="13:44" onAnswer={async () => {}} {...props} />)
)
const proposalItem = (id: string, name: string, characterId: string, question: string, reason: string) => ({ id, personaId: characterId, personaName: name, characterId, question, reason })
const PROPOSAL_SINGLE: TaskProposalUi = { kind: 'single', items: [proposalItem('prop-1', 'Nina', 'nina', 'Posso retomar “Relatório de sexta”?', 'Está parado há 3 dias.')] }
const PROPOSAL_DIGEST: TaskProposalUi = {
  kind: 'digest',
  items: [
    proposalItem('d1', 'Nina', 'nina', 'Posso retomar “Relatório de sexta”?', 'Está parado há 3 dias.'),
    proposalItem('d2', 'Bento', 'bento', 'Posso destravar “Formulário de pedidos”?', 'Falta o preço do bolo de cenoura.'),
    proposalItem('d3', 'Atlas', 'atlas', 'Posso dar o próximo passo em “Site da padaria”?', 'O objetivo está aberto e nada está andando.'),
  ],
}
const proposalCard = (props: Partial<TaskProposalCardProps> & { readonly proposal: TaskProposalUi }): ReactNode => (
  thread(<TaskProposalCard t={chatT} rowTag="div" authorName={props.proposal.kind === 'digest' ? 'Atlas' : 'Nina'} authorCharacterId={props.proposal.kind === 'digest' ? 'atlas' : 'nina'} timeLabel="09:10" onDecide={async () => {}} onUndo={async () => {}} {...props} />)
)

// HT-3: the board card right after the persona started on the card the person moved to Fazendo ("{nome} começou agora" + the ring, once).
const STARTED_CARD: KanbanCardModel = {
  id: 'tk-1', title: 'Tabela de preços da semana', projectId: 'site', projectName: 'Padaria', teamId: 'default', teamName: 'Equipe', column: 'in_progress',
  waitingEvent: false, blocked: false, reviewApproved: false, assignee: { id: 'p-nina', name: 'Nina', initials: 'N' }, assigneeState: 'working',
}
const startedCard = (card: KanbanCardModel, startedId: string | undefined): ReactNode => (
  <div style={{ maxWidth: 340 }}>
    <StartedNowProvider value={{ startedFor: id => (id === startedId ? { cardId: id, personaId: 'p-nina', personaName: 'Nina' } : undefined) }}>
      <KanbanCard
        dict={kanbanPt}
        card={card}
        draggingId={null}
        showProject={false}
        columnLabels={{ todo: 'A fazer', in_progress: 'Em andamento', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Concluído' }}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onMoveCard={() => {}}
      />
    </StartedNowProvider>
  </div>
)

const STATES: Readonly<Record<string, () => ReactNode>> = {
  'board-started-now': () => startedCard(STARTED_CARD, 'tk-1'),
  'board-not-started': () => startedCard(STARTED_CARD, undefined),
  'ask-single': () => askCard({ ask: askOf({ step: { index: 1, total: 3 } }) }),
  'ask-multiple': () => <Preclick selector="[role=checkbox]" indexes={[0, 2, 3]}>{askCard({ ask: askOf({ multiple: true, step: { index: 2, total: 3 }, question: 'O que mais toma o seu tempo hoje?' }) })}</Preclick>,
  'ask-answered': () => askCard({ ask: askOf({ step: { index: 1, total: 3 } }), live: { status: 'answered', optionIds: ['padaria'], text: '' } }),
  'ask-cancelled': () => askCard({ ask: askOf(), live: { status: 'cancelled', optionIds: [], text: '' } }),
  'proposal-single': () => proposalCard({ proposal: PROPOSAL_SINGLE }),
  'proposal-digest': () => proposalCard({ proposal: PROPOSAL_DIGEST }),
  'proposal-decided': () => proposalCard({
    proposal: PROPOSAL_DIGEST,
    liveById: { d1: { status: 'accepted', ticketId: 'tk-7', ticketTitle: 'Relatório de sexta' }, d2: { status: 'declined' }, d3: { status: 'expired' } },
    onOpenTask: () => {},
  }),
  'proposal-partly': () => proposalCard({ proposal: PROPOSAL_DIGEST, liveById: { d1: { status: 'accepted', ticketId: 'tk-7', ticketTitle: 'Relatório de sexta' }, d2: { status: 'declined' } }, onOpenTask: () => {} }),
  routines: () => <RoutinesView dict={routinesPt} routineRows={ROUTINE_ROWS} actions={ROUTINE_ACTIONS} routineRuns={[]} quietWindows={[{ id: 'q', label: 'Noites', range: '22:00 – 07:00' }]} onAskSuggestions={() => {}} onAddQuietWindow={async () => {}} />,
  'routines-empty': () => <RoutinesView dict={routinesPt} initialState="empty" routineRows={[]} actions={ROUTINE_ACTIONS} onAskSuggestions={() => {}} />,
  'routine-editor': () => <RoutineEditorModal {...editorProps} mode="create" initial={{ prompt: 'Resumir as vendas da semana', when: DEFAULT_WHEN, ownerPersonaId: 'nina', projectId: 'site' }} />,
  'routine-editor-custom': () => <RoutineEditorModal {...editorProps} mode="edit" onTogglePause={async () => {}} onDelete={async () => {}} initial={{ id: 'r3', prompt: 'Mandar o relatório de sexta', when: { choice: 'custom', time: '17:00', days: [5] }, ownerPersonaId: 'bento', projectId: 'site', paused: false }} />,
  inbox: () => <ApprovalsInboxV2 dict={approvalsPt} items={INBOX_ITEMS} proactiveSummaries={INBOX_PROPOSALS} onDecideItem={() => {}} onDecideProactive={() => {}} />,
  'inbox-vault': () => <ApprovalsInboxV2 dict={approvalsPt} items={INBOX_ITEMS} proactiveSummaries={INBOX_PROPOSALS} focusId="v-low" onDecideItem={() => {}} onDecideProactive={() => {}} />,
  'inbox-action': () => <ApprovalsInboxV2 dict={approvalsPt} items={[actionItem({}, EMAIL_PREVIEW), ...INBOX_ITEMS.slice(0, 2)]} proactiveSummaries={[]} onDecideItem={() => {}} onDecideAction={() => {}} onDecideConnector={() => {}} />,
  'inbox-action-pay': () => <ApprovalsInboxV2 dict={approvalsPt} items={[actionItem({ id: 'act-pay' }, { ...EMAIL_PREVIEW, actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', amount: 'R$ 120,00', payee: 'Gráfica Boa Impressão', to: undefined, subject: undefined, body: undefined, canRemember: false }), ...INBOX_ITEMS.slice(0, 2)]} proactiveSummaries={[]} onDecideItem={() => {}} onDecideAction={() => {}} onDecideConnector={() => {}} />,
  'inbox-action-blind': () => <ApprovalsInboxV2 dict={approvalsPt} items={[actionItem({ id: 'act-none' }, null), ...INBOX_ITEMS.slice(0, 2)]} proactiveSummaries={[]} onDecideItem={() => {}} onDecideAction={() => {}} onDecideConnector={() => {}} />,
  'inbox-connector': () => <ApprovalsInboxV2 dict={approvalsPt} items={[CONNECTOR_ITEM, ...INBOX_ITEMS.slice(0, 2)]} proactiveSummaries={[]} onDecideItem={() => {}} onDecideAction={() => {}} onDecideConnector={() => {}} />,
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
