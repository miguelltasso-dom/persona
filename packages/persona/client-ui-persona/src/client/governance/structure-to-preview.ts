import type { OrgGroup, OrgPersona, TwoDayRow } from '../primitives/Governance.tsx'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { RecommendedPersona, StructurePlan } from './structure-types.ts'

/** "Braço direito — prioriza e delega" → "Braço direito": o Teste dos 2 dias mostra só o nome e a função. */
function shortRole(jobTitle: string): string {
  const head = jobTitle.split(' — ')[0]?.trim()
  return head === undefined || head === '' ? jobTitle : head
}

const CAST = ['sol', 'luna', 'capivara', 'raposa', 'tucano'] as const

function personaPreview(row: RecommendedPersona, index: number, t: (key: string) => string): OrgPersona {
  return {
    id: row.id,
    name: row.name,
    role: row.jobTitle,
    characterId: CAST[index % CAST.length],
    state: row.coordination ? 'working' : 'resting',
    stateLabel: t(row.coordination ? 'preview.state.coordination' : 'preview.state.planned'),
  }
}

/** Maps a structure plan to org-chart groups (by person: one human caretaker). */
export function structurePlanToOrgPreview(
  plan: StructurePlan,
  dict: LocaleDict,
  humanName: string,
): { readonly root: OrgPersona & { readonly caption: string }; readonly groups: readonly OrgGroup[] } {
  const t = (key: string) => bindLocale(dict, key)
  const coord = plan.personas.find(row => row.coordination)
  const rootPersona = coord ?? plan.personas[0]
  const root = rootPersona === undefined
    ? { id: 'coord', name: t('preview.coordFallback'), role: '', characterId: 'sol', state: 'resting' as const, stateLabel: t('preview.state.planned'), caption: t('preview.rootCaption') }
    : { ...personaPreview(rootPersona, 0, t), caption: t('preview.rootCaption') }
  const hanging = plan.personas.filter(row => row.id !== rootPersona?.id)
  return {
    root,
    groups: [{
      id: 'caretaker-you',
      title: humanName.length > 0 ? humanName : t('preview.you'),
      subtitle: t('preview.responsibleSubtitle'),
      kind: 'person',
      members: hanging.map((row, index) => personaPreview(row, index + 1, t)),
    }],
  }
}

/** Simulated "Teste dos 2 dias" for the recommended team (no host clock yet). */
export function structurePlanToTwoDayRows(plan: StructurePlan, dict: LocaleDict): readonly TwoDayRow[] {
  const t = (key: string) => bindLocale(dict, key)
  return plan.personas.map((row) => {
    const autonomous = row.coordination
    const slots = autonomous
      ? (['runs', 'runs', 'runs', 'runs'] as const)
      : (['waits', 'waits', 'waits', 'waits'] as const)
    return {
      id: row.id,
      label: bindLocale(dict, 'twoDay.rowLabel', { name: row.name, role: shortRole(row.jobTitle) }),
      slots,
      reason: autonomous ? undefined : t('twoDay.reason.approval'),
      fixLabel: autonomous ? undefined : t('twoDay.fix.substitute'),
      onFix: autonomous ? undefined : () => { /* wired by caller when host GOV-5 lands */ },
    }
  })
}
