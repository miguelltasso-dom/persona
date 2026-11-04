/** Gallery-scale organogram (60/150): real Brush ids, roles, sectors, human leads. */

export const ORG_SCALE_CHARACTER_IDS = [
  'atlas',
  'sol',
  'raposa',
  'panda',
  'tucano',
  'tamandua',
  'bento',
  'nina',
  'luna',
  'capivara',
  'cervo',
  'coelho',
  'coruja',
  'guaxinim',
  'lobo-guara',
  'lontra',
  'ourico',
] as const

export type OrgScaleCharacterId = (typeof ORG_SCALE_CHARACTER_IDS)[number]

const PERSONA_TEMPLATES: readonly { readonly name: string; readonly role: string }[] = [
  { name: 'Atlas', role: 'Coordenação' },
  { name: 'Sol', role: 'Relacionamento' },
  { name: 'Nina', role: 'Pesquisa' },
  { name: 'Bento', role: 'Engenharia' },
  { name: 'Luna', role: 'Vigia' },
  { name: 'Raposa', role: 'Conteúdo' },
  { name: 'Panda', role: 'Operações' },
  { name: 'Tucano', role: 'Marketing' },
  { name: 'Tamandua', role: 'Suporte' },
  { name: 'Capivara', role: 'Dados' },
  { name: 'Cervo', role: 'Produto' },
  { name: 'Coelho', role: 'Design' },
  { name: 'Coruja', role: 'Jurídico' },
  { name: 'Guaxinim', role: 'Financeiro' },
  { name: 'Lontra', role: 'Comercial' },
  { name: 'Ourico', role: 'People' },
  { name: 'Lobo-guara', role: 'Infra' },
]

export const ORG_SCALE_SECTOR_NAMES = [
  'Produto',
  'Engenharia',
  'Vendas',
  'Suporte',
  'Marketing',
  'Operações',
] as const

/** Human leads on the organogram (por pessoa). */
export const ORG_SCALE_HUMAN_LEADS: readonly { readonly title: string; readonly subtitle: string }[] = [
  { title: 'Miguel', subtitle: 'Produto · Fundador' },
  { title: 'Amara', subtitle: 'Operações · Sócia' },
  { title: 'Kenji', subtitle: 'Engenharia · Tech lead' },
  { title: 'Helena', subtitle: 'Vendas · Comercial' },
  { title: 'Rafa', subtitle: 'Suporte · CS' },
  { title: 'Julia', subtitle: 'Marketing · Growth' },
  { title: 'Tiago', subtitle: 'Financeiro · Controladoria' },
  { title: 'Luísa', subtitle: 'People · RH' },
]

export function orgScalePersonaAt(index: number): {
  readonly name: string
  readonly role: string
  readonly characterId: OrgScaleCharacterId
} {
  const template = PERSONA_TEMPLATES[index % PERSONA_TEMPLATES.length]!
  const characterId = ORG_SCALE_CHARACTER_IDS[index % ORG_SCALE_CHARACTER_IDS.length]!
  return { ...template, characterId }
}
