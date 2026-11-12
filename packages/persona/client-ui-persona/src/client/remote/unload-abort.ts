/**
 * Probe P3 (12/11): quando a página é descarregada (reload, fechar, navegar), o `fetch` em voo é abortado e o refresh do cliente logava
 * `console.error('[persona] refresh falhou', TypeError: Failed to fetch)`. Não afeta a pessoa, mas é ruído que esconde erro de verdade.
 * Aqui mora a pergunta "este erro é só o descarregamento da página?": verdade só DEPOIS de `pagehide` (a página está saindo) ou nos 2 s depois de
 * `beforeunload` (que pode ser cancelado: a página fica e o erro real volta a aparecer), e só para o que um fetch abortado produz
 * (`AbortError` ou o `TypeError` do `fetch`). Qualquer outro erro, ou o mesmo erro com a página viva, continua sendo logado.
 */

const BEFORE_UNLOAD_GRACE_MS = 2_000

let leaving = false
let graceTimer: ReturnType<typeof setTimeout> | undefined

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { leaving = true })
  // Voltar pelo cache de páginas (bfcache): a página está viva de novo.
  window.addEventListener('pageshow', () => {
    leaving = false
    if (graceTimer !== undefined) clearTimeout(graceTimer)
  })
  window.addEventListener('beforeunload', () => {
    leaving = true
    if (graceTimer !== undefined) clearTimeout(graceTimer)
    graceTimer = setTimeout(() => { leaving = false }, BEFORE_UNLOAD_GRACE_MS)
  })
}

/** `true` quando a página está saindo (ou acabou de ouvir `beforeunload`). */
export function pageIsLeaving(): boolean {
  return leaving
}

/**
 * @param error - O que o refresh pegou.
 * @returns `true` quando é só o `fetch` abortado pelo descarregamento da página (não vale logar).
 */
export function isAbortedByUnload(error: unknown): boolean {
  if (!leaving) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof TypeError
}
