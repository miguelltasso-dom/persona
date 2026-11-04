// Ember: gallery of screens I build, with sample data in the app's frame (rail width kept so 960 px and 200 % zoom are honest).
// Built by scripts/persona/ember-gallery.mjs; `#state` picks what is drawn. Not shipped with the app.
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import '../../../packages/persona/client-ui-persona/src/client/theme/fonts/persona-fonts.generated.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-palette.css'
import '../../../packages/persona/client-ui-persona/src/client/theme/persona-base.css'
import { ApprovalsInbox } from '../../../packages/persona/client-ui-persona/src/client/approvals/ApprovalsInbox.tsx'
import type { ApprovalItem } from '../../../packages/persona/client-ui-persona/src/client/approvals/mock-data.ts'
import { approvalViewToItem } from '../../../packages/persona/client-ui-persona/src/client/data/adapters/approvals.ts'
import { pt as approvalsPt } from '../../../packages/persona/client-ui-persona/src/client/locale/approvals/locales.ts'
import { OrgChartView } from '../../../packages/persona/client-ui-persona/src/client/governance/OrgChartView.tsx'
import { pt as governancePt } from '../../../packages/persona/client-ui-persona/src/client/locale/governance/locales.ts'
import { SkillsPanel } from '../../../packages/persona/client-ui-persona/src/client/skills/SkillsPanel.tsx'

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

const STATES: Readonly<Record<string, () => ReactNode>> = {
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
