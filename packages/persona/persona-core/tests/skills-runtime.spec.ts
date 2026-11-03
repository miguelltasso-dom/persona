import { expect, it } from 'vitest'
import { materializeSkills } from '../src/index.ts'
import { skill } from './mandatory/helpers.ts'

it('materializeSkills: dsh vira seção; CLI vira prefixo + MCP; manifesto com versão ativa', () => {
  const active = [skill({ id: 's1', version: 3 }), skill({ id: 's2', name: 'lint', body: 'Rode o lint.' })]
  const dsh = materializeSkills(active, 'dsh', { kind: 'channel', personaId: 'bento', projectId: 'launch' })
  expect(dsh.runtime).toBe('dsh')
  expect(dsh.promptSection).toContain('# Skills')
  expect(dsh.promptSection).toContain('v3')
  expect(dsh.manifesto).toEqual([{ id: 's1', version: 3 }, { id: 's2', version: 1 }])
  const cli = materializeSkills(active, 'cli', { kind: 'channel', personaId: 'bento' })
  expect(cli.promptPrefix).toContain('Revise o diff.')
  expect(cli.mcpResource).toMatchObject({ uri: 'persona://skills', mimeType: 'text/markdown' })
})

it('skill candidata ou DM nunca entra na execução de outra audiência', () => {
  const candidate = skill({ id: 'cand', enabled: false })
  const dm = skill({ id: 'dm', origin: 'dm', personaId: 'bento' })
  const other = materializeSkills([candidate, dm], 'dsh', { kind: 'channel', personaId: 'nina' })
  expect(other.manifesto).toEqual([])
  expect(other.promptSection).toBeUndefined()
  const ownDm = materializeSkills([dm], 'cli', { kind: 'dm', personaId: 'bento' })
  expect(ownDm.manifesto).toEqual([{ id: 'dm', version: 1 }])
})
