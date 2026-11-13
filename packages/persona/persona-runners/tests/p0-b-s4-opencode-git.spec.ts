/**
 * P0-B resíduo (S4, Mend): o OpenCode não pergunta ao produto antes de editar; o único portão é o bloco `permission` que ele mesmo aplica. Provado com o CLI REAL 1.19.3 e um modelo
 * falso local (`.maestri/tmp/mend/s4/prove-opencode-git.mjs`, rascunho em pasta temporária, PWD = rascunho): com `edit: "allow"`, `edit` em `<rascunho>/.git/config` e em
 * `sub4/.GIT/config` foi APLICADO (filtro `clean` plantado), o mesmo `.git` que o host e outros motores usam depois. Esperado: `edit` continua `allow` no rascunho, mas o caminho que
 * alcança um `.git` (pasta ou arquivo, qualquer caixa, ponto final, nome 8.3) é `deny`. O avaliador abaixo imita o do OpenCode (`*` = qualquer texto, `?` = um caractere, a ÚLTIMA regra
 * que casa vence); a prova de que o CLI real nega está no script acima (rodado antes e depois).
 */
import { describe, expect, it } from 'vitest'
import { opencodeConfigContent, opencodePermission } from '../src/authority/opencode-config.ts'

function matches(pattern: string, path: string): boolean {
  const regex = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.')
  return new RegExp(`^${regex}$`, 'su').test(path)
}

/** What OpenCode decides for an edit of `path` under this `edit` rule (a string, or patterns in order: the last match wins). */
function decide(rule: unknown, path: string): string {
  if (typeof rule === 'string') return rule
  let decision = 'ask'
  for (const [pattern, action] of Object.entries(rule as Record<string, string>)) if (matches(pattern, path)) decision = action
  return decision
}

const granted = opencodePermission({ files: 'write', web: 'none' }, true)

describe('OpenCode: edit no rascunho sim, no `.git` não (P0-B S4)', () => {
  it.each([
    'C:\\Users\\x\\rascunho\\.git\\config', 'C:/Users/x/rascunho/.git/config', '.git/config', '.git', 'sub/.git', 'sub\\.git', 'C:\\r\\sub\\.GIT\\hooks\\pre-commit',
    'C:\\r\\sub\\.Git', 'C:\\r\\sub3\\.git.', 'C:\\r\\sub3\\.git.\\config', 'C:\\r\\GIT~1\\config', 'GIT~2/hooks/x', 'C:\\r\\sub\\git~1\\config', 'C:\\r\\GIAB12~1\\config',
  ])('%s → deny', (path) => {
    expect(decide(granted.edit, path)).toBe('deny')
  })
  it.each([
    'C:\\Users\\x\\rascunho\\cartaz.svg', 'ok.txt', '.gitignore', 'sub/.gitattributes', 'C:\\r\\.github\\workflows\\ci.yml', 'notes/git-notes.md', 'C:\\r\\digit~1.txt', 'C:\\r\\mygit\\x.txt',
  ])('%s → allow (controle)', (path) => {
    expect(decide(granted.edit, path)).toBe('allow')
  })
  it('sem grant ou sem rascunho: edit fechado inteiro; o bloco vai para build e plan', () => {
    expect(opencodePermission({ files: 'none', web: 'none' }, true).edit).toBe('deny')
    expect(opencodePermission({ files: 'write', web: 'none' }, false).edit).toBe('deny')
    const config = JSON.parse(opencodeConfigContent({ files: 'write', web: 'none' }, true)) as { agent: { build: { permission: { edit: unknown } }; plan: { permission: { edit: unknown } } } }
    expect(decide(config.agent.build.permission.edit, 'sub/.git')).toBe('deny')
    expect(decide(config.agent.plan.permission.edit, 'sub/.git')).toBe('deny')
  })
})
