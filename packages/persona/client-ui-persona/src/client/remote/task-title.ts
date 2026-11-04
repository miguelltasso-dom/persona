/**
 * O título da ficha da tarefa no chat (Muse, P0 do Atlas): é o TÍTULO da tarefa — nunca um id, nem o assunto.
 * Sem título real não há ficha (nada de fallback para o id: apareceu "subject-geral · Ver contexto usado").
 */

/** Cara de id/slug: minúsculo, com hífen, sem espaço — "subject-geral", "task-9f3a", "proj-ab12cd34". */
const ID_SHAPED = /^[a-z]+-[a-z0-9-]+$/u

/** O título que pode ir à tela, ou `undefined`. `ids` = os ids que o título jamais pode repetir (assunto, tarefa). */
export function usableTaskTitle(title: string | undefined, ids: readonly (string | undefined)[] = []): string | undefined {
  const trimmed = (title ?? '').trim()
  if (trimmed === '') return undefined
  if (ID_SHAPED.test(trimmed)) return undefined
  if (ids.some(id => id !== undefined && id.trim() !== '' && id.trim() === trimmed)) return undefined
  return trimmed
}
