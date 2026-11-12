/* oxlint-disable @stylistic/max-len, typescript/no-non-null-assertion -- galeria interna de capturas (dados de exemplo), fora do app */
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
// COLHEITA pré-aceite (itens 4, 10, 19b): a reserva da janela em Uso e limites, a regra do e-mail da empresa e o "Detalhes" da fala simples.
import { UsageLimits } from '../../../packages/persona/client-ui-persona/src/client/usage/UsageLimits.tsx'
import { MOCK_USAGE_METERS } from '../../../packages/persona/client-ui-persona/src/client/usage/mock-data.ts'
import { ConnectionsView } from '../../../packages/persona/client-ui-persona/src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../../../packages/persona/client-ui-persona/src/client/connections/mock-data.ts'
import { EmailRuleForm } from '../../../packages/persona/client-ui-persona/src/client/email-rule/EmailRuleForm.tsx'
import { personaFaceSrc } from '../../../packages/persona/client-ui-persona/src/client/hire/persona-face.ts'
import { MemoryPanel } from '../../../packages/persona/client-ui-persona/src/client/memory/MemoryPanel.tsx'
import type { MemoryRow } from '../../../packages/persona/client-ui-persona/src/client/memory/mock-data.ts'
import { CofreScreen, type CofreScreenProps } from '../../../packages/persona/client-ui-persona/src/client/cofre/CofreScreen.tsx'
import { cofreGroups, type HostCofreEntry } from '../../../packages/persona/client-ui-persona/src/client/cofre/cofre-wire.ts'
import { pt as cofrePt } from '../../../packages/persona/client-ui-persona/src/client/locale/cofre/locales.ts'
import type { ApprovalView, PlaybookNoteView } from '@deepseek-ai/dsh-persona-host/types'
import { ReactiveApprovalsList } from '../../../packages/persona/client-ui-persona/src/client/approvals/ReactiveApprovalsList.tsx'
import { PlaybookPanel } from '../../../packages/persona/client-ui-persona/src/client/playbook/PlaybookPanel.tsx'
import { IndicatorOffer } from '../../../packages/persona/client-ui-persona/src/client/indicators/IndicatorOffer.tsx'
import { SeusNumeros } from '../../../packages/persona/client-ui-persona/src/client/indicators/SeusNumeros.tsx'
import type { IndicatorUi, IndicatorUiData } from '../../../packages/persona/client-ui-persona/src/client/indicators/indicators-model.ts'
import { IndicatorsProvider } from '../../../packages/persona/client-ui-persona/src/client/indicators/use-indicators.tsx'
import { CodeRequestCard, type CodeRequestRow } from '../../../packages/persona/client-ui-persona/src/client/cofre/CodeRequestCard.tsx'
import { BoardColumn, BoardColumns } from '../../../packages/persona/client-ui-persona/src/client/primitives/Board.tsx'
import { SecondBrainShell } from '../../../packages/persona/client-ui-persona/src/client/second-brain/SecondBrainShell.tsx'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../../../packages/persona/client-ui-persona/src/client/data/lumen-inject.ts'
import { MarkdownBody } from '../../../packages/persona/client-ui-persona/src/client/chat/markdown/MarkdownBody.tsx'

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
/** Scrolls the open dialog to the e-mail rule once drawn (it sits below the fold at 200 %). */
function ScrollEnd({ children }: { readonly children: ReactNode }): ReactNode {
  useEffect(() => {
    const id = window.setTimeout(() => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog] section')).find(node => (node.textContent ?? '').includes('E-mail da empresa'))
      card?.scrollIntoView({ block: 'center' })
    }, 400)
    return () => { window.clearTimeout(id) }
  }, [])
  return <>{children}</>
}
/** Like Preclick, but waits a beat: a control that only exists after a layout measure (the proof quote's "ver tudo") is not there at mount. */
function ClickLater({ selector, children }: { readonly selector: string; readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setTimeout(() => { ref.current?.querySelector<HTMLElement>(selector)?.click() }, 400)
    return () => { window.clearTimeout(id) }
  }, [selector])
  return <div ref={ref}>{children}</div>
}
/** Runs clicks in order, a beat apart (menus and panels mount after the previous click). Each step finds a control by its accessible name. */
function Drive({ steps, children }: { readonly steps: readonly { readonly role: string; readonly name: string }[]; readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    const find = (step: { readonly role: string; readonly name: string }): HTMLElement | undefined => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(step.role === 'menuitem' ? '[role=menuitem]' : 'button'))
      return nodes.find((node) => {
        const label = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim()
        return step.name.endsWith('*') ? label.startsWith(step.name.slice(0, -1)) : label === step.name
      })
    }
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, ms) })
    void (async () => {
      for (const step of steps) {
        // Waits for the control to exist (menus, panels and async buttons mount after the previous click), up to 6 s.
        for (let tries = 0; tries < 60 && alive; tries += 1) {
          const hit = find(step)
          if (hit !== undefined) { hit.click(); break }
          await sleep(100)
        }
        await sleep(400)
      }
      await sleep(700)
      if (alive) ref.current?.setAttribute('data-drive-done', '1')
    })()
    return () => { alive = false }
  }, [steps])
  return <div ref={ref} data-drive="1">{children}</div>
}
/** Types digits into the six boxes of the code card (React-aware: native setter + input event), once drawn. */
function TypeIn({ digits, children }: { readonly digits: string; readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      Array.from(digits).forEach((digit, index) => {
        const box = ref.current?.querySelector<HTMLInputElement>('input[aria-label="Dígito ' + String(index + 1) + ' de 6"]')
        if (box === null || box === undefined) return
        setter?.call(box, digit)
        box.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }, 400)
    return () => { window.clearTimeout(id) }
  }, [digits])
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

// ---- Itens 10 / 19b / 4 (dados de exemplo): reserva da janela, regra do e-mail, "Detalhes" da fala simples.
const IN_2H = new Date(Date.now() + 2 * 3_600_000 + 14 * 60_000).toISOString()
const RESERVE_OFFICIAL_METERS = [{ id: 'u1', label: 'Claude Code (oficial)', origin: 'official' as const, percent: 97 }, ...MOCK_USAGE_METERS.slice(1)]
const usageReserve = (reserve: Parameters<typeof UsageLimits>[0]['windowReserve'], meters = RESERVE_OFFICIAL_METERS): ReactNode => (
  <UsageLimits meters={meters} windowReserve={reserve} onContinueWindow={() => {}} showLimitNotice={false} initialState="ready" />
)
const MAIL_PRESETS = [
  { id: 'locaweb', label: 'Locaweb', host: 'email-ssl.com.br', port: 993, secure: true },
  { id: 'hostinger', label: 'Hostinger', host: 'imap.hostinger.com', port: 993, secure: true },
  { id: 'zoho', label: 'Zoho Mail', host: 'imap.zoho.com', port: 993, secure: true },
]
const MAIL_FILTER = { to: ['vendas@padarialua.com.br'], from: [], subject: ['encomenda'], skipBulk: true, preset: 'locaweb' }
const MAIL_RULE = (variant: 'full' | 'phrase'): ReactNode => <EmailRuleForm presets={MAIL_PRESETS} filter={MAIL_FILTER} onSave={async () => {}} variant={variant} />
/** A persona's message balloon (card surface, thread width), so the Markdown is judged in its real frame. */
const bubble = (children: ReactNode): ReactNode => thread(<div style={{ background: 'var(--persona-card)', border: '1px solid var(--persona-outline-soft)', borderRadius: 16, padding: '12px 16px', maxWidth: 560 }}>{children}</div>)
const SPEECH_SOURCE = [
  'Abrimos às 7h todos os dias e você já pode conferir.',
  '',
  '<details><summary>Detalhes</summary>',
  '',
  'Salvei o cartaz em `packages/persona/persona-host/src/speech.ts` e atualizei o horário.',
  '',
  '- primeiro passo: abri o rascunho',
  '- segundo passo: troquei o texto',
  '',
  '</details>',
].join('\n')

// Item 16 (Anvil): memória do dono com a prova (as palavras dele, entre aspas curvas); item 7 (Flint): cartão "Continuar".
const memRow = (id: string, body: string, extra: Partial<MemoryRow>): MemoryRow => ({
  id, workspaceId: 'ws-demo', kind: 'memory', body, status: 'active', sourceIds: [], authorId: 'member-miguel', visibility: { kind: 'workspace' },
  createdAt: new Date(Date.now() - 86_400_000).toISOString(), revision: 1, uiOrigin: 'conversation', pendingApproval: false, ...extra,
})
const LONG_QUOTE = [
  'Daqui pra frente, sempre que for falar de preço, use o valor com vírgula e o símbolo R$ na frente.',
  'Nunca arredonde para cima.',
  'Se o cliente pedir desconto, me chame antes de responder.',
  'E quando for sexta, avise a equipe do fechamento do caixa às 17h, sem esquecer de ninguém.',
  'Obrigado!',
].join('\n')
const OWNER_MEMORY: readonly MemoryRow[] = [
  memRow('m1', 'Preço sempre com vírgula e R$ na frente; nunca arredondar para cima.', { ownerRule: true, ownerSource: { quote: LONG_QUOTE, by: 'Você', mine: true, at: new Date(Date.now() - 3_600_000).toISOString(), where: 'channel', place: 'geral' } }),
  memRow('m2', 'A padaria fecha o caixa às 17h na sexta.', { ownerSource: { quote: 'Lembra que a gente fecha o caixa às 17h na sexta.', by: 'Você', mine: true, at: new Date(Date.now() - 26 * 3_600_000).toISOString(), where: 'dm', place: '' }, ownerTo: { name: 'Nina' } }),
  memRow('m3', 'Cliente X não quer menção a concorrentes.', { uiOrigin: 'vault', pendingApproval: true }),
]
const CONTINUE_ASK = askOf({ question: 'Já deixei o cartaz no rascunho e falta só revisar as cores. Quer que eu continue?', options: [{ id: 'continuar', label: 'Continuar' }, { id: 'parar', label: 'Parar por aqui' }] })

// Item 15 (Lumen): Configurações › Cofre. Dados de exemplo; nenhum valor secreto existe (só o selo "guardada").
const cofreEntry = (over: Partial<HostCofreEntry> & Pick<HostCofreEntry, 'id' | 'kind' | 'title'>): HostCofreEntry => ({ projectId: 'p1', fields: {}, hasSecret: false, createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z', authorId: 'u1', ...over })
const COFRE_ENTRIES: readonly HostCofreEntry[] = [
  cofreEntry({ id: 'c1', kind: 'company', title: 'Padaria Lua Ltda', fields: { legalName: 'Padaria Lua Ltda', document: '12.345.678/0001-90', email: 'oi@padarialua.com.br' } }),
  cofreEntry({ id: 'l1', kind: 'login', title: 'Mercado Livre', fields: { site: 'mercadolivre.com.br', username: 'loja@padarialua.com.br' }, hasSecret: true }),
  cofreEntry({ id: 'l2', kind: 'login', title: 'Instagram da padaria', fields: { site: 'instagram.com', username: 'padarialua' }, hasSecret: true }),
  cofreEntry({ id: 'k1', kind: 'key', title: 'Mercado Pago', fields: { service: 'Mercado Pago' }, hasSecret: true }),
]
const cofreT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(cofrePt, key, params)) as CofreScreenProps['t']
const cofre = (over: Partial<CofreScreenProps> = {}): ReactNode => (
  <CofreScreen state="ready" groups={cofreGroups(COFRE_ENTRIES)} sealable onSaveLogin={async () => {}} onSaveKey={async () => {}} onSaveCompany={async () => {}} onRemove={async () => {}} onRetry={() => {}} t={cofreT} {...over} />
)
// Item 16 fatia 2 (Anvil): aba "Jeito de trabalhar" (4 estágios) e o cartão "Virar skill" em Aprovações. Dados de exemplo.
const pbDay = (back: number): string => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 12).toISOString() }
const pbRow = (over: Partial<PlaybookNoteView> & Pick<PlaybookNoteView, 'id' | 'title'>): PlaybookNoteView => ({ personaId: 'bia', uses: 1, lastAt: pbDay(1), stage: 'learning', progress: 1, goal: 3, adjustments: [], ...over })
const PB_ROWS: readonly PlaybookNoteView[] = [
  pbRow({ id: 'n1', title: 'Resposta ao cliente sobre a entrega' }),
  pbRow({ id: 'n2', title: 'Legenda do post de sexta', uses: 3, progress: 3, stage: 'ready', lastAt: pbDay(0) }),
  pbRow({ id: 'n3', title: 'Cartaz da promoção de pão de queijo', uses: 3, progress: 3, stage: 'offered', approvalId: 'skill-offer-pb-bia-x', adjustments: ['Preço maior', 'Sem ponto de exclamação', 'Fundo claro', 'Letra grande'] }),
  pbRow({ id: 'n4', title: 'Foto de produto com fundo claro', uses: 4, progress: 3, stage: 'skill', lastAt: '2025-03-04T12:00:00.000Z' }),
]
const pbPanel = (rows: readonly PlaybookNoteView[] = PB_ROWS): ReactNode => <PlaybookPanel personaName="Bia" rows={rows} actions={{ onForget: async () => {}, onDecide: () => {} }} onMessage={() => {}} />
const SKILL_OFFER: ApprovalView = { id: 'skill-offer-pb-bia-x', kind: 'skill', title: 'Bia aprendeu: cartaz da promoção de pão de queijo', question: 'Usado 3 vezes em 2 dias.', status: 'pending', personaId: 'bia', personaName: 'Bia' }
const skillOffer = (): ReactNode => (
  <div role="list" style={{ maxWidth: 560 }}><ReactiveApprovalsList dict={approvalsPt} items={[approvalViewToItem(SKILL_OFFER)]} scopeFor={() => undefined} exitStampId={null} rememberFor={() => ({ grant: false, validity: 'once' })} rememberStampNote={null} onRememberChange={() => {}} onCelebrateAccept={() => {}} onDecideItem={() => {}} /></div>
)
// Item 19a (Rivet): "Seus números" na Visão geral (grade, vazio) e "Fixar na Visão geral" na conversa (oferta + modal). Dados de exemplo.
const numAt = (hour: number): string => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0).toISOString() }
const numCard = (id: string, name: string, data: IndicatorUiData, extra: Partial<IndicatorUi> = {}): IndicatorUi => ({
  id: 'ind:' + id, name, data, schedule: 'daily', status: 'ok', updatedAt: numAt(8), personaName: 'Nina', sourceMessageId: id, ...extra,
})
const NUM_CARDS: readonly IndicatorUi[] = [
  numCard('a', 'Vendas de ontem', { kind: 'numero', value: 'R$ 1.240', raw: 1240, trend: { text: '+12% desde ontem', direction: 'up', goodWhen: 'up' } }),
  numCard('b', 'Pedidos da semana', { kind: 'numero', value: '9', raw: 9, trend: { text: '-31% desde ontem', direction: 'down', goodWhen: 'up' } }, { alert: { pct: 31, text: 'Caiu 31% desde ontem', at: numAt(8) } }),
  numCard('c', 'Meta do mês', { kind: 'meta', value: 18, goal: 30, unit: 'pedidos' }),
  numCard('d', 'Vendas por dia', { kind: 'barras', points: [{ label: 'Seg', value: 12 }, { label: 'Ter', value: 9 }, { label: 'Qua', value: 15 }, { label: 'Qui', value: 11 }] }),
  numCard('e', 'Visitas ao site', { kind: 'linha', points: [{ label: 'Seg', value: 10 }, { label: 'Ter', value: 14 }, { label: 'Qua', value: 12 }, { label: 'Qui', value: 18 }] }, { schedule: 'hourly' }),
  numCard('f', 'Encomendas de sexta', { kind: 'lista', items: [{ text: 'Bolo de cenoura · 12', state: 'ok' }, { text: 'Pão de queijo · 40', state: 'atencao' }] }),
  numCard('g', 'Resumo do dia', { kind: 'resumo', sentences: ['Vendemos mais que ontem.', 'Dois clientes ficaram sem retorno.'] }, { status: 'updating' }),
  numCard('h', 'Avaliações da loja', { kind: 'numero', value: '4,8' }, { status: 'failed', failure: 'Não consegui falar com a loja.', updatedAt: numAt(6) }),
]
const NUM_OFFER = { messageId: 'm-1', name: 'Vendas de ontem', data: NUM_CARDS[0]!.data }
const numHost = (): Record<string, () => Promise<unknown>> => {
  const kept: IndicatorUi[] = []
  return {
    listIndicators: () => Promise.resolve([...kept]),
    testIndicator: () => Promise.resolve({ testId: 'itest:1', name: 'Vendas de ontem', data: { kind: 'numero', value: 'R$ 1.300', raw: 1300 } }),
    pinIndicator: () => Promise.resolve(NUM_CARDS[0]!),
    unpinIndicator: () => Promise.resolve(true),
    refreshIndicator: () => Promise.resolve(NUM_CARDS[0]!),
  }
}
const numOffer = (): ReactNode => (
  <IndicatorsProvider remote={numHost()} tenant={{ workspaceId: 'ws', projectId: 'pp' }}><ul style={{ maxWidth: 560, listStyle: 'none', padding: 0 }}><IndicatorOffer offer={NUM_OFFER} personaName="Nina" /></ul></IndicatorsProvider>
)
// Item 15 (Lumen): o cartão "Precisa de um código" (2FA) em 3 estados. Dados de exemplo; nenhum código real.
const codeRow = (over: Partial<CodeRequestRow> = {}): CodeRequestRow => ({
  id: 'r1', personaName: 'Bia', faceSrc: personaFaceSrc('bia', 'bia'), site: 'Mercado Livre', reason: 'O site mandou um código por WhatsApp para entrar na conta da loja.',
  state: 'pending', expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(), ...over,
})
const codeCard = (row: CodeRequestRow): ReactNode => thread(<CodeRequestCard row={row} t={cofreT} rowTag="div" onFill={async () => {}} onCancel={async () => {}} onRetry={() => {}} />)
// Passada de leigo (Lumen L5/L6/L7). Dados de exemplo.
const LEIGO_LABELS = { backlog: 'A fazer', in_progress: 'Fazendo', in_review: 'Em revisão', blocked: 'Bloqueado', done: 'Feito' }
const leigoCard = (id: string, title: string, column: KanbanCardModel['column'], extra: Partial<KanbanCardModel> = {}): ReactNode => (
  <KanbanCard dict={kanbanPt} card={{ id, title, projectId: 'p1', projectName: 'Padaria Lua', teamId: 't1', teamName: 'Marketing', column, waitingEvent: false, blocked: false, reviewApproved: false, ...extra }} draggingId={null} showProject={false} columnLabels={LEIGO_LABELS as never} onDragStart={() => {}} onDragEnd={() => {}} />
)
const leigoColumns = (): ReactNode => (
  <BoardColumns label="Quadro da equipe">
    <BoardColumn name="A fazer" category="todo" categoryLabel="A fazer" count={1} emptyLabel="Nada aqui">{leigoCard('c0', 'Legenda do post de sexta', 'backlog')}</BoardColumn>
    <BoardColumn name="Fazendo" category="doing" categoryLabel="Em andamento" count={1} emptyLabel="Nada aqui">{leigoCard('c1', 'Tabela de preços da semana', 'in_progress', { assignee: { id: 'nina', name: 'Nina', initials: 'N' }, assigneeState: 'working' })}</BoardColumn>
    <BoardColumn name="Revisão do cliente" category="review" categoryLabel="Em revisão" count={1} emptyLabel="Nada aqui">{leigoCard('c2', 'Cartaz da promoção', 'in_review', { assignee: { id: 'bia', name: 'Bia', initials: 'B' }, assigneeState: 'resting' })}</BoardColumn>
    <BoardColumn name="Feito" category="done" categoryLabel="Concluído" count={1} emptyLabel="Nada aqui">{leigoCard('c3', 'Foto do pão de queijo', 'done', { assignee: { id: 'bia', name: 'Bia', initials: 'B' }, assigneeState: 'resting' })}</BoardColumn>
  </BoardColumns>
)
const brainPageOf = (id: string, title: string, kind: BrainPageView['kind'], body = 'Corpo da página.'): BrainPageView => ({
  id, slug: id, title, kind, body, revision: 1, links: [], sources: [], editorHint: 'persona:nina', updatedAt: new Date().toISOString(), restricted: false,
})
const BRAIN_START = brainPageOf('start', 'Comece aqui', 'company', '# Comece aqui\n\nO cardápio, os horários e as regras da casa ficam nas páginas ao lado.')
const BRAIN_HOME: BrainHomeView = { startHereId: 'start', changedToday: [BRAIN_START], activeGrants: [], contradictions: [], leftover: [] }
const brainClient = (): PersonaRemoteClient => ({
  getBrainPage: async () => ({ ok: true, value: BRAIN_START }), listBrainVersions: async () => ({ ok: true, value: [] }),
  putBrainPage: async () => ({ ok: true, value: BRAIN_START }), restoreBrainPage: async () => ({ ok: true, value: BRAIN_START }),
}) as unknown as PersonaRemoteClient
const brainShell = (): ReactNode => (
  <SecondBrainShell persona={brainClient()} scope={{ workspaceId: 'ws', projectId: 'proj' }} actorId="owner" home={BRAIN_HOME} pages={[BRAIN_START]} grants={[]} personaNames={{ nina: 'Nina' }} memberNames={{ owner: 'Você' }} surfaceState="ready" />
)
const STATES: Readonly<Record<string, () => ReactNode>> = {
  'quadro-colunas': () => leigoColumns(),
  'cartao-feito': () => <div style={{ display: 'grid', gap: 12, maxWidth: 340 }}>{leigoCard('d1', 'Cartaz da promoção', 'done', { assignee: { id: 'bia', name: 'Bia', initials: 'B' }, assigneeState: 'resting' })}{leigoCard('d2', 'Tabela de preços da semana', 'in_progress', { assignee: { id: 'nina', name: 'Nina', initials: 'N' }, assigneeState: 'working' })}</div>,
  'memoria-empresa': () => brainShell(),
  'cofre-codigo-pedindo': () => <TypeIn digits="4829">{codeCard(codeRow())}</TypeIn>,
  'cofre-codigo-entregue': () => codeCard(codeRow({ state: 'filled' })),
  'cofre-codigo-vencido': () => codeCard(codeRow({ state: 'expired', expiresAt: new Date(Date.now() - 60_000).toISOString() })),
  'cofre-editar-login-erro': () => <Drive steps={[{ role: 'button', name: 'Editar Mercado Livre' }, { role: 'button', name: 'Guardar' }]}>{cofre()}</Drive>,
  'seus-numeros-grade': () => <SeusNumeros items={NUM_CARDS} loaded onRefresh={async () => {}} onUnpin={async () => {}} />,
  'seus-numeros-vazio': () => <SeusNumeros items={[]} loaded />,
  'seus-numeros-oferta': () => numOffer(),
  'seus-numeros-modal': () => <Drive steps={[{ role: 'button', name: 'Fixar na Visão geral' }]}>{numOffer()}</Drive>,
  'seus-numeros-modal-testado': () => <Drive steps={[{ role: 'button', name: 'Fixar na Visão geral' }, { role: 'button', name: 'Testar agora' }]}>{numOffer()}</Drive>,
  'playbook-jeitos': () => pbPanel(),
  'playbook-vazio': () => pbPanel([]),
  'playbook-esquecer-skill': () => <Drive steps={[{ role: 'button', name: 'Esquecer*' }]}>{pbPanel([PB_ROWS[3]!])}</Drive>,
  'playbook-esquecer': () => <Drive steps={[{ role: 'button', name: 'Esquecer*' }]}>{pbPanel([PB_ROWS[0]!, PB_ROWS[2]!])}</Drive>,
  'approvals-skill-offer': () => skillOffer(),
  'cofre-lista': () => cofre(),
  'cofre-vazio': () => cofre({ groups: cofreGroups([]) }),
  'cofre-novo-login': () => <Drive steps={[{ role: 'button', name: 'Adicionar' }, { role: 'menuitem', name: 'Login' }]}>{cofre()}</Drive>,
  'cofre-editar-login': () => <Drive steps={[{ role: 'button', name: 'Editar Mercado Livre' }]}>{cofre()}</Drive>,
  'cofre-remover': () => <Drive steps={[{ role: 'button', name: 'Remover Mercado Livre' }]}>{cofre()}</Drive>,
  'cofre-erro': () => cofre({ state: 'error' }),
  'cofre-sem-cofre-windows': () => cofre({ sealable: false }),
  'memory-owner': () => <MemoryPanel rows={OWNER_MEMORY} initialState="ready" actions={{ onApprove: async () => {}, onEdit: async () => {}, onForget: async () => {} }} />,
  'memory-owner-open': () => <ClickLater selector="button[aria-expanded]"><MemoryPanel rows={OWNER_MEMORY} initialState="ready" actions={{ onApprove: async () => {}, onEdit: async () => {}, onForget: async () => {} }} /></ClickLater>,
  'continue-card': () => askCard({ ask: CONTINUE_ASK }),
  'usage-reserve': () => usageReserve({ state: 'reserve', windowId: 'five_hour', usedPercent: 97, resetsAt: IN_2H, queued: 2, overridden: false }),
  'usage-reserve-exhausted': () => usageReserve({ state: 'exhausted', windowId: 'five_hour', usedPercent: 100, resetsAt: IN_2H, queued: 3, overridden: false }, [{ ...RESERVE_OFFICIAL_METERS[0]!, percent: 100 }, ...RESERVE_OFFICIAL_METERS.slice(1)]),
  'usage-reserve-overridden': () => usageReserve({ state: 'reserve', windowId: 'weekly', usedPercent: 96, resetsAt: IN_2H, queued: 0, overridden: true }),
  'email-rule-connections': () => <ConnectionsView entries={MOCK_CONNECTIONS} emailRule={MAIL_RULE('full')} />,
  'routine-editor-email': () => <RoutineEditorModal {...editorProps} personas={ROUTINE_PEOPLE.map(p => ({ ...p, avatarSrc: personaFaceSrc(p.id, p.id) }))} mode="create" emailRule={MAIL_RULE('phrase')} initial={{ prompt: 'Responder às encomendas por e-mail', when: DEFAULT_WHEN, ownerPersonaId: 'nina', projectId: 'site' }} />,
  'routine-editor-email-end': () => <ScrollEnd><RoutineEditorModal {...editorProps} personas={ROUTINE_PEOPLE.map(p => ({ ...p, avatarSrc: personaFaceSrc(p.id, p.id) }))} mode="create" emailRule={MAIL_RULE('phrase')} initial={{ prompt: 'Responder às encomendas por e-mail', when: DEFAULT_WHEN, ownerPersonaId: 'nina', projectId: 'site' }} /></ScrollEnd>,
  'speech-details-folded': () => bubble(<MarkdownBody source={SPEECH_SOURCE} t={chatT} />),
  'speech-details-open': () => <Preclick selector="summary" indexes={[0]}>{bubble(<MarkdownBody source={SPEECH_SOURCE} t={chatT} />)}</Preclick>,
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
