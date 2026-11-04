/**
 * Helpers for the BYC + Wave 2 app-layer suite (`tests/real-byc-w2-app.spec.ts`): host RPC through the page (same
 * origin, same auth as the app), the BYC review rows, the desktop-picker bridge and an axe gate by impact.
 */
import type { BrowserContext, Locator, Page } from 'playwright'
import type { AxeScanResult } from './axe-check.ts'

/** Tenant the app bootstrapped (`persona.tenant.v1`). */
export interface GaugeTenant { readonly workspaceId: string; readonly projectId: string; readonly memberId: string; readonly channelId?: string }

/**
 * @param page - Live Persona page.
 */
export async function tenantOf(page: Page): Promise<GaugeTenant> {
  const raw = await page.evaluate(() => localStorage.getItem('persona.tenant.v1'))
  if (raw === null) throw new Error('persona.tenant.v1 missing — open the app first')
  return JSON.parse(raw) as GaugeTenant
}

/**
 * Call a host Remote exactly as the app does (same-origin POST). Returns the unwrapped value or throws the host error.
 * @param page - Live Persona page.
 * @param method - Remote name (without the `persona/` prefix).
 * @param request - Request body; workspace/project default to the app tenant.
 */
export async function hostRpc<T = unknown>(page: Page, method: string, request: Record<string, unknown> = {}): Promise<T> {
  const tenant = await tenantOf(page)
  const result = await page.evaluate(async ([name, scope, extra]) => {
    const body = {
      type: 'client-request',
      rpcId: `gauge-${String(Math.random()).slice(2)}`,
      method: `persona/${name}`,
      payload: { args: { request: { ...(scope as object), ...(extra as object) } } },
    }
    const res = await fetch(`/api/persona/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return await res.json() as { result?: { ok: boolean; value?: unknown; error?: { code?: string; message?: string } } }
  }, [method, { workspaceId: tenant.workspaceId, projectId: tenant.projectId }, request] as const)
  const outcome = result.result
  if (outcome === undefined) throw new Error(`${method}: no result`)
  if (!outcome.ok) throw new Error(`${method}: ${outcome.error?.code ?? 'error'} ${outcome.error?.message ?? ''}`.trim())
  return outcome.value as T
}

/**
 * Install `window.personaDesktop.pickDirectory` (what Electron's preload offers) BEFORE the app loads.
 * A string script on purpose: a function would get esbuild's `__name` helper, undefined in the page.
 * @param context - Browser context (must be set before the page is created).
 * @param root - Folder the "picker" returns.
 */
export async function installDesktopPicker(context: BrowserContext, root: string): Promise<void> {
  await context.addInitScript(`window.personaDesktop = { pickDirectory: async function () { return ${JSON.stringify(root)} } }`)
}

/** One row of the BYC review list (`li[data-decision]`). */
export function reviewRow(page: Page, text: string): Locator {
  return page.locator('li[data-decision]').filter({ hasText: text }).first()
}

/** The "Traga o que suas IAs já sabem" capture block. */
export function bycBlock(page: Page): Locator {
  return page.locator('[data-persona-byc]').first()
}

/**
 * A paste in the prompt's format whose every line carries run-unique words, so the Cofre dedupe (Jaccard ≥ 0.8)
 * never swallows it on a host that already imported an earlier run.
 * @param tag - Unique tag per run.
 */
export function uniquePaste(tag: string) {
  const w = (n: number): string => `${tag}x${String(n)} ${tag}y${String(n)} ${tag}z${String(n)}`
  const lines = {
    about: `${w(1)} fundadora da casa prefere ser tratada pelo nome.`,
    company: `${w(2)} casa que vende bolos caseiros em Curitiba.`,
    uncertain: `${w(3)} projeto atual é o catálogo de verão. (incerto)`,
    rule: `${w(4)} nunca prometer entrega no mesmo dia.`,
    decision: `${w(5)} cardápio com letras grandes porque idosos leem.`,
    tool: `${w(6)} planilha usada para anotar pedidos.`,
    person: `${w(7)} Rita, confeiteira-chefe.`,
    cpf: `${w(8)} Marcos, contador. CPF 987.654.321-00.`,
    card: `${w(9)} cartão da loja 5555 4444 3333 2222.`,
    open: `${w(10)} definir o fornecedor de embalagens.`,
  } as const
  const text = [
    '## Sobre mim', `- ${lines.about}`, '',
    '## Empresa e projetos', `- ${lines.company}`, `- ${lines.uncertain}`, '',
    '## Regras e restrições', `- ${lines.rule}`, '',
    '## Decisões já tomadas', `- ${lines.decision}`, '',
    '## Ferramentas e processos', `- ${lines.tool}`, '',
    '## Pessoas e contatos de trabalho', `- ${lines.person}`, `- ${lines.cpf}`, `- ${lines.card}`, '',
    '## O que ainda está em aberto', `- ${lines.open}`, '- não sei', '',
  ].join('\n')
  return { text, lines }
}

/** Axe violations split by impact: serious/critical (WCAG A/AA blockers) vs the rest (best-practice). */
export function splitAxe(axe: AxeScanResult): { readonly blockers: readonly string[]; readonly advisory: readonly string[] } {
  const row = (v: AxeScanResult['violations'][number]): string => `${v.id}[${v.impact ?? '?'}](${String(v.nodes)}) ${v.detail ?? ''}`
  return {
    blockers: axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(row),
    advisory: axe.violations.filter(v => v.impact !== 'serious' && v.impact !== 'critical').map(row),
  }
}
