// P0-04 do Carbon (repro do Gauge, 12/11 03:42; consertado por Tally 12/11 03:5x): OpenCode fecha tudo que o produto não abriu. Era opencode-deny-all.red.ts.
import { describe, expect, it } from 'vitest'
import { opencodeConfigContent, opencodePermission } from '../src/authority/opencode-config.ts'

/**
 * `opencode-config.ts` monta o bloco `permission` com 5 chaves (edit, bash, webfetch, external_directory, doom_loop) e NENHUM `"*": "deny"`: uma ferramenta que o produto não listou
 * (e todo recurso novo do OpenCode) cai no padrão do CLI ("allow"/"ask"). O próprio cabeçalho do arquivo diz que "the last matching rule wins": o coringa tem de vir PRIMEIRO e o resto abre
 * só o que o produto concede. Esperado: `permission['*'] === 'deny'`, como primeira chave, no bloco global e nos blocos dos agentes `build` e `plan`.
 */
const GRANTS = { files: 'write', web: 'none' } as const

describe('P0-04: OpenCode fecha tudo que o produto não abriu', () => {
  it('opencodePermission tem "*": "deny" e ele é a PRIMEIRA chave (a última regra que casa vence)', () => {
    const permission = opencodePermission(GRANTS, true)
    expect(permission['*']).toBe('deny')
    expect(Object.keys(permission)[0]).toBe('*')
  })

  it('a configuração inline carrega o coringa no bloco global e nos agentes build e plan', () => {
    const config = JSON.parse(opencodeConfigContent(GRANTS, true)) as { permission: Record<string, string>; agent: Record<'build' | 'plan', { permission: Record<string, string> }> }
    expect(config.permission['*']).toBe('deny')
    expect(config.agent.build.permission['*']).toBe('deny')
    expect(config.agent.plan.permission['*']).toBe('deny')
  })

  it('o que o produto concede continua concedido (controle: edit só com arquivo=write e rascunho)', () => {
    expect(opencodePermission({ files: 'write', web: 'none' }, true).edit).toMatchObject({ '*': 'allow' }) // S4: allow in the draft, deny for `.git` (p0-b-s4-opencode-git.spec.ts)
    expect(opencodePermission({ files: 'write', web: 'none' }, false).edit).toBe('deny')
    expect(opencodePermission({ files: 'none', web: 'none' }, true).edit).toBe('deny')
    expect(opencodePermission(GRANTS, true).bash).toBe('deny')
    expect(opencodePermission(GRANTS, true).external_directory).toBe('deny')
  })
})
