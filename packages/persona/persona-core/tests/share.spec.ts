import { expect, it } from 'vitest'
import {
  DomainError,
  TEAM_TEMPLATES,
  exportPersonaFile,
  exportTeamFile,
  importCliSkillCandidates,
  importPersonaFile,
  importTeamFile,
  shareableAvatar,
  type PersonaSpec,
  type SkillDirIo,
} from '../src/index.ts'

function spec(): PersonaSpec {
  return {
    name: 'Guia',
    avatar: { kind: 'gallery', ref: 'luna' },
    title: 'Coordenação',
    description: 'Triagem.',
    personality: 'Calma.',
    instructions: 'Uma pergunta.',
    runner: { kind: 'dsh', model: 'deepseek-chat' },
    tools: { files: 'read' },
    skills: ['briefing'],
    limits: { concurrency: 1 },
    systemRoles: ['coordination'],
    canRecruit: true,
  }
}

it('exporta persona gallery com proveniência e recusa segredo', () => {
  const file = exportPersonaFile(spec(), 'ana', '2026-11-03T21:00:00.000Z')
  expect(file.kind).toBe('persona.share')
  expect(file.version).toBe(1)
  expect(file.provenance.authorId).toBe('ana')
  expect(file.spec.avatar).toEqual({ kind: 'gallery', ref: 'luna' })
  expect(file.spec.skills).toEqual(['briefing'])
  const back = importPersonaFile(JSON.parse(JSON.stringify(file)))
  expect(back.spec.name).toBe('Guia')
  expect(back.provenance.source).toBe('file-import')
  expect(() => importPersonaFile({ ...file, memory: { secret: 'x' } })).toThrow(DomainError)
  expect(() => exportPersonaFile({
    ...spec(),
    instructions: 'token sk-abcdefghijklmnopqrstuv',
  }, 'ana', '2026-11-03T21:00:00.000Z')).toThrow(DomainError)
})

it('upload vira silhueta; equipe exporta sem memória privada', () => {
  expect(shareableAvatar({ kind: 'upload', ref: '/tmp/face.png' })).toEqual({ kind: 'silhouette', ref: 'default' })
  const team = TEAM_TEMPLATES[0]!
  const file = exportTeamFile(team, 'ana', '2026-11-03T21:00:00.000Z')
  expect(file.kind).toBe('team.share')
  expect(file.personas.length).toBeGreaterThan(0)
  const back = importTeamFile(JSON.parse(JSON.stringify(file)))
  expect(back.personas[0]?.avatar.kind).not.toBe('upload')
  expect(() => importTeamFile({ ...file, credentials: { key: 'x' } })).toThrow(DomainError)
})

it('skills de CLI viram candidatas desligadas e ignoram segredo', () => {
  const files: Record<string, string> = {
    '/home/.claude/skills/brief/SKILL.md': '---\nname: Briefing\n---\nPeça o tom no Cofre.',
    '/home/.claude/skills/leak/SKILL.md': 'token sk-abcdefghijklmnopqrstuv',
    '/home/.codex/skills/review/SKILL.md': '---\nname: Review\n---\nPeça testes no PR.',
  }
  const dirs = new Set(['/home/.claude/skills', '/home/.claude/skills/brief', '/home/.claude/skills/leak', '/home/.codex/skills', '/home/.codex/skills/review'])
  const io: SkillDirIo = {
    home: () => '/home',
    isDir: path => dirs.has(path.replace(/\\/g, '/')),
    list: (dir) => {
      const norm = dir.replace(/\\/g, '/')
      if (norm === '/home/.claude/skills') return ['brief', 'leak']
      if (norm === '/home/.codex/skills') return ['review']
      if (norm.endsWith('/brief') || norm.endsWith('/leak') || norm.endsWith('/review')) return ['SKILL.md']
      return []
    },
    read: file => files[file.replace(/\\/g, '/')],
  }
  const rows = importCliSkillCandidates(io)
  expect(rows.every(row => row.enabled === false)).toBe(true)
  expect(rows.map(row => row.name)).toEqual(['Briefing', 'Review'])
  expect(rows.some(row => /sk-/.test(row.body))).toBe(false)
})
