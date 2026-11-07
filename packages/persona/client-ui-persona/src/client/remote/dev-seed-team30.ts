/**
 * CV-1 (Muse, 19:15): para as capturas da barra única "com 30 personas" precisamos de um elenco grande no home descartável.
 * SÓ DE DESENVOLVIMENTO, como os seeds de decisões: exige as DUAS chaves de localStorage —
 *   `persona.devSeed.v1 = '1'` (o seed de dev em geral) E `persona.devSeed.team30 = '1'`.
 * Sem as duas, nada aqui roda; o app real nunca liga isso (o teste `dev-seed-team30` prova). Nunca é chamado do onboarding.
 *
 * Cria até {@link DEV_TEAM30_COUNT} personas no total (conta as que já existem), com ids estáveis `dev-team30-NN`
 * (idempotente: repetir não duplica). Os retratos repetem os bichos da galeria (são 17): o nome vem sempre ao lado do rosto.
 */
import type { PersonaTenantScope } from './persona-remote-types.ts'
import { readClientDevSeedEnabled } from './persona-dev-seed.ts'

export const DEV_TEAM30_KEY = 'persona.devSeed.team30'
export const DEV_TEAM30_COUNT = 30

/** As duas chaves ligadas. Nunca lança (storage bloqueado = desligado). */
export function readDevTeam30Enabled(): boolean {
  if (!readClientDevSeedEnabled()) return false
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEV_TEAM30_KEY) === '1'
  } catch {
    return false
  }
}

/** Bichos da galeria (retratos que existem em AVATAR_96). */
const AVATAR_REFS = [
  'capivara', 'cervo', 'coelho', 'coruja', 'guaxinim', 'lobo-guara', 'lontra', 'mico-leao-dourado', 'ourico', 'panda', 'raposa',
  'atlas', 'bento', 'nina', 'sol', 'luna',
] as const

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Davi', 'Elisa', 'Fabio', 'Gabi', 'Hugo', 'Iris', 'Joao',
  'Kaue', 'Lia', 'Marcos', 'Nair', 'Otavio', 'Paula', 'Quiteria', 'Rafa', 'Sara', 'Tiago',
  'Ursula', 'Vitor', 'Wanda', 'Xavier', 'Yara', 'Zeca', 'Alice', 'Beto', 'Cida', 'Dora',
] as const

/** Funções repartidas em 6 equipes de 5 (as equipes do organograma entram pelo harness, por `setSector`). */
const ROLES = ['Marketing', 'Atendimento', 'Engenharia', 'Financeiro', 'Operações', 'Pesquisa'] as const

export interface DevTeam30Person {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly avatarRef: string
}

/** O elenco fixo e determinístico: o mesmo nas duas execuções. */
export function devTeam30Roster(count: number = DEV_TEAM30_COUNT): readonly DevTeam30Person[] {
  return Array.from({ length: Math.min(count, FIRST_NAMES.length) }, (_, i) => ({
    id: `dev-team30-${String(i + 1).padStart(2, '0')}`,
    name: FIRST_NAMES[i] ?? `Pessoa ${String(i + 1)}`,
    title: ROLES[i % ROLES.length] ?? 'Operações',
    avatarRef: AVATAR_REFS[i % AVATAR_REFS.length] ?? 'atlas',
  }))
}

export interface DevTeam30Remote {
  createPersona(request: {
    workspaceId: string
    projectId: string
    id: string
    name: string
    title: string
    description: string
    personality: string
    instructions: string
    avatarKind: 'gallery'
    avatarRef: string
    runnerKind: 'dsh'
    runnerCli: string
    runnerModel: string
    canRecruit: boolean
    createdBy: string
  }): unknown
  listTeam(request: { readonly workspaceId: string; readonly projectId: string }): unknown
}

/** Quantas pessoas a resposta do `listTeam` traz (host novo ou antigo). */
function personaIds(team: unknown): ReadonlySet<string> {
  const personas = (team as { personas?: readonly { id?: unknown }[] } | null)?.personas
  return new Set(Array.isArray(personas) ? personas.flatMap(p => (typeof p?.id === 'string' ? [p.id] : [])) : [])
}

/**
 * Completa o elenco até 30 pessoas. Devolve quantas criou. Sem as duas chaves: 0, sem tocar no host.
 * Falha em uma criação (duplicata, corrida) não derruba o resto.
 */
export async function seedDevTeam30(remote: DevTeam30Remote, tenant: PersonaTenantScope): Promise<number> {
  if (!readDevTeam30Enabled()) return 0
  const team = await Promise.resolve(remote.listTeam({ workspaceId: tenant.workspaceId, projectId: tenant.projectId }))
  const existing = personaIds(team)
  const missing = DEV_TEAM30_COUNT - existing.size
  if (missing <= 0) return 0
  let created = 0
  for (const person of devTeam30Roster()) {
    if (created >= missing) break
    if (existing.has(person.id)) continue
    try {
      await Promise.resolve(remote.createPersona({
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        id: person.id,
        name: person.name,
        title: person.title,
        description: person.title,
        personality: 'Proativo e claro.',
        instructions: 'Trabalhe até concluir; reporte com evidência.',
        avatarKind: 'gallery',
        avatarRef: person.avatarRef,
        runnerKind: 'dsh',
        runnerCli: '',
        runnerModel: 'default',
        canRecruit: false,
        createdBy: tenant.memberId,
      }))
      created += 1
    } catch {
      /* duplicata ou corrida: segue com as outras */
    }
  }
  return created
}
