// Muse: acceptance gallery for GES-4 (Gestor de equipe) and GOV-8 (Assistente de estrutura) with real locale text and
// sample data, so the visual acceptance does not wait for the build lock. Built by scripts/persona/muse-accept-gallery.mjs;
// `#state` picks what is drawn. Not shipped with the app.
import { createRoot } from 'react-dom/client'
import { useState, type ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { GestorPlanCard, GestorSettings, type GestorLimitsValue, type GestorPlanStep } from '../../../packages/persona/client-ui-persona/src/client/primitives/Gestor.tsx'
import { StructureAssistant } from '../../../packages/persona/client-ui-persona/src/client/governance/StructureAssistant.tsx'
import { AVATAR_96 } from '../../../packages/persona/client-ui-persona/src/client/assets/generated-imports.ts'
import { pt as editorPt } from '../../../packages/persona/client-ui-persona/src/client/locale/persona-editor/locales.ts'
import { pt as chatPt } from '../../../packages/persona/client-ui-persona/src/client/locale/chat/locales.ts'
import { pt as governancePt } from '../../../packages/persona/client-ui-persona/src/client/locale/governance/locales.ts'
import { ConversasPrototype } from './conversas.tsx'
import { CartaoPerguntaPrototype } from './cartao-pergunta.tsx'
import { BaloesPrototype } from './baloes.tsx'
import { Sw7Draft } from './sw7.tsx'
import { SubjectBar } from '../../../packages/persona/client-ui-persona/src/client/chat/SubjectBar.tsx'
import type { ConversationSubjectUi } from '../../../packages/persona/client-ui-persona/src/client/chat/conversation-subjects.ts'

type Dict = Readonly<Record<string, string>>
const bind = (dict: Dict) => (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  (dict[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))
const te = bind(editorPt as Dict)
const tc = bind(chatPt as Dict)

const settingsLabels = {
  title: te('gestor.title'),
  explain: (name: string) => te('gestor.explain', { name }),
  approvalLegend: te('gestor.approvalLegend'),
  approval: {
    ask: { title: te('gestor.approval.ask.title'), body: te('gestor.approval.ask.body') },
    'auto-within': { title: te('gestor.approval.autoWithin.title'), body: te('gestor.approval.autoWithin.body') },
    'auto-notify': { title: te('gestor.approval.autoNotify.title'), body: te('gestor.approval.autoNotify.body') },
  },
  recommended: te('gestor.recommended'),
  maxPersonas: te('gestor.maxPersonas'),
  maxPersonasValue: (n: number) => te('gestor.maxPersonasValue', { n: String(n) }),
  fewer: te('gestor.fewer'),
  more: te('gestor.more'),
  budget: te('gestor.budgetLegend'),
  areas: te('gestor.areas'),
  areasAll: te('gestor.areasAll'),
  canGrant: te('gestor.canGrant'),
  canGrantHint: te('gestor.canGrantHint'),
  ceiling: (name: string) => te('gestor.ceiling', { name }),
}
const budgetOptions = [
  { id: 'pouco', label: te('gestor.budget.pouco'), hint: te('gestor.budget.poucoHint') },
  { id: 'normal', label: te('gestor.budget.normal'), hint: te('gestor.budget.normalHint') },
  { id: 'bastante', label: te('gestor.budget.bastante'), hint: te('gestor.budget.bastanteHint') },
]

function Settings({ initial }: { readonly initial: boolean }): ReactNode {
  const [on, setOn] = useState(initial)
  const [value, setValue] = useState<GestorLimitsValue>({ approval: 'ask', maxPersonas: 8, budget: 'normal', areas: ['site'], canGrantGestor: false })
  return (
    <GestorSettings personaName="Atlas" enabled={on} onEnabledChange={setOn} value={value} onChange={setValue}
      budgetOptions={budgetOptions} areaOptions={[{ id: 'site', label: 'Projeto Site' }, { id: 'contratacao', label: 'Projeto Contratação' }]} labels={settingsLabels} />
  )
}

const planLabels = {
  title: (name: string) => tc('gestorPlan.title', { name }),
  kinds: { hire: tc('gestorPlan.kind.hire'), board: tc('gestorPlan.kind.board'), allocate: tc('gestorPlan.kind.allocate'), sprint: tc('gestorPlan.kind.sprint'), move: tc('gestorPlan.kind.move'), pause: tc('gestorPlan.kind.pause') },
  approve: tc('gestorPlan.approve'), adjust: tc('gestorPlan.adjust'), decline: tc('gestorPlan.decline'),
  approvedText: tc('gestorPlan.approved'), declinedText: tc('gestorPlan.declined'), adjustingText: tc('gestorPlan.adjusting'), stamp: tc('gestorPlan.stamp'),
}
const fullSteps: readonly GestorPlanStep[] = [
  { id: 's1', kind: 'hire', title: 'Pipoca · Designer', detail: 'raposa · Claude · ferramentas: Figma, arquivos', avatarSrc: AVATAR_96.raposa },
  { id: 's2', kind: 'hire', title: 'Bolota · Redatora', detail: 'tamanduá · Claude · ferramentas: arquivos', avatarSrc: AVATAR_96.tamandua },
  { id: 's3', kind: 'board', title: 'Quadro Site', flowModel: 'site' },
  { id: 's4', kind: 'allocate', title: 'Bento no Site, 2 dias por semana' },
]
const gestor = { name: 'Atlas', avatarSrc: AVATAR_96.atlas }
const summary = 'Vou contratar 2 personas e criar o quadro Site.'
const plan = (state: 'pending' | 'approved' | 'declined' | 'adjusting', steps: readonly GestorPlanStep[] = fullSteps, withWhy = true): ReactNode => (
  <div style={{ maxWidth: 640 }}>
    <GestorPlanCard gestor={gestor} summary={summary} steps={steps} state={state} labels={planLabels}
      {...(withWhy ? { reason: 'Porque você pediu um time para o Site, e hoje ninguém cobre design.', cost: '≈ 40 tarefas médias por mês a mais' } : {})}
      onApprove={() => {}} onAdjust={() => {}} onDecline={() => {}} />
  </div>
)

const subjects: readonly ConversationSubjectUi[] = [
  { id: 's-geral', name: 'Geral', colorIndex: 0, unreadCount: 0 },
  { id: 's-site', name: 'Site novo', colorIndex: 2, unreadCount: 3, working: true, workingName: 'Nina' },
  { id: 's-precos', name: 'Preços de dezembro', colorIndex: 4, unreadCount: 0 },
]
function Subjects({ editing, archived }: { readonly editing?: string; readonly archived?: boolean }): ReactNode {
  const [active, setActive] = useState('s-geral')
  return (
    <div style={{ maxWidth: 900 }}>
      <SubjectBar t={tc as never} subjects={editing === undefined ? subjects : [...subjects, { id: 's-novo', name: '', colorIndex: 5, unreadCount: 0 }]}
        activeSubjectId={active} onSelect={setActive} onCreate={() => {}} onRename={() => {}} onArchive={() => {}}
        {...(archived === true ? { archived: [{ id: 's-old', name: 'Natal 2025', colorIndex: 1, unreadCount: 0 }], onReopen: () => {} } : {})}
        {...(editing === undefined ? {} : { editingSubjectId: editing })} />
      <p style={{ marginTop: 16, color: 'var(--persona-ink-soft)' }}>(as mensagens do assunto aparecem aqui)</p>
    </div>
  )
}

const STATES: Readonly<Record<string, () => ReactNode>> = {
  'conversas-5': () => <ConversasPrototype many={false} dm />,
  'conversas-30': () => <ConversasPrototype many />,
  'conversas-30-picker': () => <ConversasPrototype many picker />,
  'conversas-pergunta': () => <CartaoPerguntaPrototype state="question" />,
  'conversas-figurinha': () => <CartaoPerguntaPrototype state="sticker" />,
  'conversas-baloes-dm': () => <BaloesPrototype state="dm" />,
  'conversas-baloes-canal': () => <BaloesPrototype state="channel" />,
  'conversas-baloes-dm-luz': () => <BaloesPrototype state="dm" lamp />,
  'conversas-baloes-canal-luz': () => <BaloesPrototype state="channel" lamp />,
  'sw7-num-rascunho': () => <Sw7Draft />,
  subjects: () => <Subjects />,
  'subjects-new': () => <Subjects editing="s-novo" />,
  'subjects-archived': () => <Subjects archived />,
  'gestor-off': () => <div style={{ maxWidth: 720 }}><Settings initial={false} /></div>,
  'gestor-on': () => <div style={{ maxWidth: 720 }}><Settings initial /></div>,
  'plan-pending': () => plan('pending'),
  'plan-approved': () => plan('approved'),
  'plan-declined': () => plan('declined'),
  'plan-adjusting': () => plan('adjusting'),
  // What the chat renders today (GestorPlanMessageCard): one step whose title is the summary, no reason, no cost.
  'plan-as-chat': () => plan('pending', [{ id: 'one', kind: 'hire', title: summary }], false),
  assistant: () => <StructureAssistant dict={governancePt} humanLabel="Miguel" onHireAll={() => {}} />,
}

const state = window.location.hash.replace('#', '') || 'gestor-on'
const render = STATES[state] ?? STATES['gestor-on']!
if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.setAttribute('data-ds-dark-theme', 'true')

const fullBleed = state.startsWith('conversas-')
createRoot(document.getElementById('root')!).render(
  fullBleed ? <main data-gallery-state={state} data-persona-root="" style={{ color: 'var(--persona-ink)' }}>{render()}</main> : (
    <div data-persona-root="" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', minHeight: '100vh', background: 'var(--persona-paper)', color: 'var(--persona-ink)' }}>
      <aside style={{ background: 'var(--persona-rail)' }} aria-hidden="true" />
      <main data-gallery-state={state} style={{ padding: 24, minWidth: 0 }}>{render()}</main>
    </div>
  ),
)
