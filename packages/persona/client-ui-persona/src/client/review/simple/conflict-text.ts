/**
 * The words of a clash ("Revisar mudanças"), with and without the persona's name. The host does not say who made a draft (no persona on the
 * ticket yet), and "A persona" in the middle of a sentence read as a machine ("Você e A persona mudaram…", "o de A persona"). Muse's rule
 * (04:10): with a name, "{nome} e você mudaram {arquivo}"; without one, no stand-in name at all — "Você e a equipe…", "a versão do rascunho".
 * Each text has a fallback here for a build whose generated locale does not carry the new keys yet; the locale wins when it has them.
 */

type Params = Readonly<Record<string, string | number>>
export type ConflictT = (key: string, params?: Params) => string

const FALLBACK: Readonly<Record<string, string>> = {
  'blocked.title.named': '{name} e você mudaram o mesmo arquivo',
  'blocked.title.unnamed': 'Você e a equipe mudaram o mesmo arquivo',
  'conflict.title.named': '{name} e você mudaram {file}',
  'conflict.title.unnamed': 'Você e a equipe mudaram {file}',
  'conflict.body.named': '{name} estava trabalhando nele quando você mudou o arquivo. Escolha o que fica.',
  'conflict.body.unnamed': 'O rascunho foi feito enquanto você mudava o arquivo. Escolha o que fica.',
  'conflict.mine.body.named': 'Mantém o arquivo da sua pasta e descarta a mudança de {name} neste arquivo.',
  'conflict.mine.body.unnamed': 'Mantém o arquivo da sua pasta e descarta a mudança do rascunho neste arquivo.',
  'conflict.theirs.title.named': 'Ficar com a versão de {name}',
  'conflict.theirs.title.unnamed': 'Ficar com a versão do rascunho',
  'conflict.both.body.named': 'Salva a versão de {name} como “{copy}” ao lado da sua.',
  'conflict.both.body.unnamed': 'Salva a versão do rascunho como “{copy}” ao lado da sua.',
  'conflict.draftSide.named': 'No rascunho de {name}',
  'conflict.draftSide.unnamed': 'No rascunho',
  // Header and history with no name (Muse 05:51): no "O rascunho fez isto num rascunho", never initials, no "A persona aplicou".
  'hero.title.unnamed.notask': 'Mudanças prontas para revisar',
  'hero.title.unnamed': 'Mudanças prontas para revisar em {task}',
  'subtitle.unnamed': 'Isto está num rascunho. Sua pasta ainda não mudou.',
  'discard.body.unnamed': 'As mudanças do rascunho somem. Sua pasta continua como está.',
  'history.entry.unnamed.one': '1 mudança aplicada · {when}',
  'history.entry.unnamed.many': '{count} mudanças aplicadas · {when}',
}

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/gu, (_whole, key: string) => String(params[key] ?? ''))
}

/**
 * @param t - The locale's translator.
 * @param base - The key without its `.named` / `.unnamed` tail (e.g. `conflict.title`).
 * @param name - The persona's name when the host gave one; `undefined` when unknown.
 * @param params - The values the text uses (`file`, `copy`; `name` is added when there is one).
 */
export function conflictText(t: ConflictT, base: string, name: string | undefined, params: Params = {}): string {
  const key = `${base}.${name === undefined ? 'unnamed' : 'named'}`
  return unnamedText(t, key, name === undefined ? params : { ...params, name })
}

/** A text by its full key, with the fallback above when the generated locale does not carry it yet (the header and the history, when no name is known). */
export function unnamedText(t: ConflictT, key: string, params: Params = {}): string {
  const text = t(key, params)
  if (text !== key) return text
  const fallback = FALLBACK[key]
  return fallback === undefined ? key : fill(fallback, params)
}

/**
 * "cardápio.docx" → "cardápio (rascunho).docx" — the copy that sits next to the person's file. Always "(rascunho)", with or without a persona's name
 * (Muse 04:33): the host writes `{arquivo} (rascunho).ext`, so the screen never promises a file name the disk does not have; the name stays in the sentence.
 */
export function conflictCopyName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} (rascunho)`
  return `${fileName.slice(0, dot)} (rascunho)${fileName.slice(dot)}`
}
