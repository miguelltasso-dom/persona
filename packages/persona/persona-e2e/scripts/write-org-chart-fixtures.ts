/** Write committed 60/150 organogram fixtures for Probe/Prism. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHARS = ['sol', 'raposa', 'panda', 'tucano', 'tamandua', 'atlas'] as const
const STATES = ['working', 'reviewing', 'waiting', 'resting', 'stuck', 'offline'] as const
const SECTORS = ['Produto', 'Engenharia', 'Vendas', 'Suporte', 'Marketing', 'Operações'] as const

function roster(personaCount: 60 | 150, groupBy: 'person' | 'sector') {
  const humans = Math.max(6, Math.min(24, Math.ceil(personaCount / 8)))
  const personas = Array.from({ length: personaCount }, (_, i) => ({
    id: `p-scale-${String(i)}`,
    name: `Persona ${String(i)}`,
    role: `Cargo ${String(i % 12)}`,
    characterId: CHARS[i % CHARS.length],
    state: STATES[i % STATES.length],
  }))
  const rightHand = {
    id: 'p-gestor',
    name: 'Atlas',
    role: 'Gestor de equipe',
    characterId: 'atlas',
    state: 'working',
  }
  if (groupBy === 'sector') {
    const groups = SECTORS.map((title, g) => ({
      id: `sec-${String(g)}`,
      title,
      kind: 'sector' as const,
      members: personas.filter((_, i) => i % SECTORS.length === g),
    })).filter(group => group.members.length > 0)
    return {
      workspaceId: 'ws',
      groupBy,
      rightHand,
      rightHandCaption: 'Gestor de equipe',
      personaCount: personaCount + 1,
      humanCount: humans,
      groups,
    }
  }
  const groups = Array.from({ length: humans }, (_, h) => ({
    id: `h-${String(h)}`,
    title: `Responsável ${String(h + 1)}`,
    subtitle: 'Setor',
    kind: 'person' as const,
    ...(h % 9 === 0 ? { away: true as const } : {}),
    members: personas.filter((_, i) => i % humans === h),
  })).filter(group => group.members.length > 0)
  return {
    workspaceId: 'ws',
    groupBy,
    rightHand,
    rightHandCaption: 'Gestor de equipe',
    personaCount: personaCount + 1,
    humanCount: humans,
    groups,
  }
}

const destDir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/org-chart')
mkdirSync(destDir, { recursive: true })
writeFileSync(resolve(destDir, 'roster-60.json'), `${JSON.stringify(roster(60, 'person'), null, 2)}\n`)
writeFileSync(resolve(destDir, 'roster-150.json'), `${JSON.stringify(roster(150, 'sector'), null, 2)}\n`)
process.stdout.write(`wrote ${destDir}\n`)
