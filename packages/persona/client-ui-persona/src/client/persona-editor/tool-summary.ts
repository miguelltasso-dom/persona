import type { PersonaDraft, ToolAccessLevel } from './persona-draft.ts'

const TOOL_ORDER = ['filesystem', 'shell', 'web'] as const
type ToolKey = (typeof TOOL_ORDER)[number]

type Translate = (key: string) => string

/** "Internet" → "internet" (só a inicial, para encadear "Arquivos do projeto e internet"). */
function lowerFirst(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toLocaleLowerCase()}${text.slice(1)}`
}

/**
 * Resumo do que a persona pode usar, em português corrido — o preview "Como a equipe vai ver"
 * não repete o nível por ferramenta: "Arquivos do projeto e internet · só leitura".
 * Níveis diferentes viram partes separadas por ponto e vírgula; sem ferramentas → `none`.
 */
export function summarizeToolAccess(draft: Pick<PersonaDraft, ToolKey>, t: Translate): string {
  const groups: { readonly level: Exclude<ToolAccessLevel, 'none'>; readonly tools: ToolKey[] }[] = [
    { level: 'read', tools: [] },
    { level: 'write', tools: [] },
  ]
  for (const tool of TOOL_ORDER) {
    const level = draft[tool]
    if (level === 'none') continue
    groups.find(group => group.level === level)?.tools.push(tool)
  }
  const parts = groups
    .filter(group => group.tools.length > 0)
    .map((group) => {
      const names = group.tools.map((tool, index) => (index === 0 ? t(`tool.${tool}`) : lowerFirst(t(`tool.${tool}`))))
      const joined = names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} ${t('preview.and')} ${names[names.length - 1]!}`
      return `${joined} · ${t(`preview.level.${group.level}`)}`
    })
  return parts.join('; ')
}
