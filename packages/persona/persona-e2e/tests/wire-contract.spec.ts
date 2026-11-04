/**
 * WIRE-5 — contrato cliente ↔ host (sem navegador, ~10 s, entra no gate).
 * Os tipos de remoto do cliente são manuscritos; o host valida com os schemas zod ESTRITOS gerados pelo Typert.
 * Este teste compara os dois mundos: (1) cada método dos tipos `*Remote`/`*Wire` do cliente contra o schema do host
 * (existência, chaves, obrigatórias, aninhados); (2) cada chamada `x.<métodoDoHost>({ … })` no código do cliente (chaves
 * desconhecidas, obrigatórias ausentes, literais recusados, ex.: `limit: 300`); (3) amostras de payload com números não
 * finitos e aninhados. Achados conhecidos ficam como `bug` (it.fails) até Anvil/Lumen/Prism corrigirem; depois viram `it`.
 * Requer `persona-host/lib/typert.host.js` (gerado por `pnpm exec tsx scripts/generate-typert.ts`).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { compareRemoteInterfaces, loadHostSchemas, scanClientCallSites, type Finding } from '../src/wire-contract.ts'

// The client source is NOT part of the host TypeScript program (TS6307/TS6142 in the installer pack's host aggregate, 04/11):
// the Gestor limits builder is loaded at RUNTIME instead of imported.
type GestorLimitsBuilder = (personaId: string, workspaceId: string, limits: Record<string, unknown>, ...rest: unknown[]) => Record<string, unknown> & { readonly maxPersonas: number }
let gestorLimitsToSetRequest: GestorLimitsBuilder
beforeAll(async () => {
  const href = pathToFileURL(join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'src', 'client', 'persona-editor', 'gestor-editor-map.ts')).href
  ;({ gestorLimitsToSetRequest } = (await import(href)) as { gestorLimitsToSetRequest: GestorLimitsBuilder })
})

const generated = join(REPO_ROOT, 'packages', 'persona', 'persona-host', 'lib', 'typert.host.js')

const fmt = (rows: readonly Finding[]): string => rows.map(row => `${row.where} · ${row.method}: ${row.problem}`).join('\n')

describe.skipIf(!existsSync(generated))('WIRE-5 — contrato cliente ↔ host', () => {
  let schemas: Awaited<ReturnType<typeof loadHostSchemas>>
  let interfaces: ReturnType<typeof compareRemoteInterfaces>
  let sites: ReturnType<typeof scanClientCallSites>

  beforeAll(async () => {
    schemas = await loadHostSchemas()
    interfaces = compareRemoteInterfaces(schemas)
    sites = scanClientCallSites(schemas)
    const dir = join(ARTIFACTS_DIR, 'gauge', 'wire')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'findings.json'), JSON.stringify({ interfaces: interfaces.findings, calls: sites.findings, unresolved: interfaces.unresolved, checked: interfaces.checked, callSites: sites.calls }, null, 2), 'utf8')
  }, 120_000)

  it('o schema gerado do host está carregado e o comparador viu os tipos e as chamadas do cliente (guarda contra teste vazio)', () => {
    expect(schemas.size).toBeGreaterThan(200)
    for (const method of ['postMessage', 'acceptReview', 'reviewSummary', 'listMessages', 'updateWorkflow', 'setGestorLimits', 'submitTeachDraft']) {
      expect(schemas.has(method), `host sem o Remote ${method}`).toBe(true)
    }
    expect(interfaces.checked, 'métodos dos tipos manuscritos comparados').toBeGreaterThan(40)
    expect(sites.calls, 'chamadas do cliente inspecionadas').toBeGreaterThan(30)
  })

  it('o schema estrito do host recusa o payload do cliente de hoje nos casos citados (prova de que a régua funciona)', () => {
    const accept = schemas.get('acceptReview')!
    expect(accept.safeParse({ workspaceId: 'w', projectId: 'p', ticketId: 't', mode: 'ff', choices: {} }).success, 'choices no lugar de conflicts[]').toBe(false)
    expect(accept.safeParse({ workspaceId: 'w', projectId: 'p', ticketId: 't', mode: 'ff' }).success, 'sem conflitos é válido (opcional)').toBe(true)
    expect(schemas.get('setGestorLimits')!.safeParse({ workspaceId: 'w', personaId: 'x', approval: 'always_ask', maxPersonas: Number.NaN, budgetTokens: 1, allowedTools: [], allowedEngines: [], sectorIds: [], projectIds: [], canGrantGestor: false }).success, 'NaN').toBe(false)
    expect(schemas.get('setGestorLimits')!.safeParse({ workspaceId: 'w', personaId: 'x', approval: 'always_ask', maxPersonas: Number.POSITIVE_INFINITY, budgetTokens: 1, allowedTools: [], allowedEngines: [], sectorIds: [], projectIds: [], canGrantGestor: false }).success, 'Infinity').toBe(false)
  })

  // No known-drift allowlist any more: every owner fixed their findings, so ANY new drift fails here (and in the gate once it blocks).
  it('[WIRE-5] zero desvios entre cliente e host: nenhuma chave desconhecida, nenhum limit acima do teto de runtime, nada fora do schema', () => {
    expect(fmt([...interfaces.findings, ...sites.findings])).toBe('')
  })

  it('[WIRE-5] a importação avançada (BringContextImportPage monta o pedido sobre `unknown`, fora do comparador estático) manda ao host o que ele aceita', () => {
    // Mirrors BringContextImportPage: `{ ...base, files }`, `{ ...base, batchId, files }`, `{ ...base, batchId }` with base = { workspaceId, projectId }.
    const base = { workspaceId: 'ws', projectId: 'pr' }
    const files = [{ name: 'regras.md', text: '# Regras\n- sempre ao meio-dia' }]
    expect(schemas.get('previewImport')!.safeParse({ ...base, files }).success, 'previewImport').toBe(true)
    expect(schemas.get('confirmImport')!.safeParse({ ...base, batchId: 'b1', files }).success, 'confirmImport').toBe(true)
    expect(schemas.get('rollbackImport')!.safeParse({ ...base, batchId: 'b1' }).success, 'rollbackImport').toBe(true)
    expect(schemas.get('previewImport')!.safeParse({ ...base, files, actorId: 'x' }).success, 'a chave que o host não conhece é recusada (a régua funciona)').toBe(false)
  })

  it('[WIRE-5] o builder de limites do Gestor produz um payload que o host ACEITA (valores normais)', () => {
    const request = gestorLimitsToSetRequest('atlas', 'ws', { approval: 'ask', maxPersonas: 8, budget: 'normal', areas: [], canGrantGestor: false }, [], [])
    expect(schemas.get('setGestorLimits')!.safeParse(request).success).toBe(true)
  })

  it('[WIRE-5] o builder de limites do Gestor não deixa passar número não finito (NaN/Infinity/negativo/fracionário são saneados antes de chegar ao host)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 2.5]) {
      const request = gestorLimitsToSetRequest('atlas', 'ws', { approval: 'ask', maxPersonas: bad, budget: 'normal', areas: [], canGrantGestor: false }, [], [])
      expect(schemas.get('setGestorLimits')!.safeParse(request).success, `maxPersonas=${String(bad)} chegou ao host`).toBe(true)
      expect(Number.isFinite(request.maxPersonas) && Number.isInteger(request.maxPersonas) && request.maxPersonas >= 0, `maxPersonas=${String(bad)} não foi saneado`).toBe(true)
    }
  })
})
