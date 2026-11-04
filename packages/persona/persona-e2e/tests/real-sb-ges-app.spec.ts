/**
 * SB-7 + GES-6 — APP layer: Empresa › Segundo cérebro (SECOND-BRAIN.md §5/§6) and the Gestor de equipe (MAESTRO.md) as a
 * person sees them in the real `persona` profile (Chrome, fake CLIs on PATH, 0 AI), with light/dark captures, axe,
 * stuck-loading and console gates. Host-level contracts: {@link ./mandatory-second-brain-host.spec.ts} and
 * {@link ./mandatory-team-manager-host.spec.ts}. Data is seeded through the same `/api/persona/<method>` door the UI uses
 * (src/gauge-sb-ges.ts) because the UI has no way to author most of it; every seed id is Gauge-prefixed and re-runnable.
 * Run (one host): PERSONA_E2E=1 under `with-lock` — see README "Gauge".
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it as vitestIt } from 'vitest'
import { scanAccessibility } from '../src/axe-check.ts'
import { captureDir, mainText, openGaugeSession, panelHealth, shootBothThemes, type GaugeSession } from '../src/gauge-app.ts'
import {
  FORBIDDEN_UI_WORDS,
  bodyText,
  hostRpc,
  hostRpcOk,
  readTenant,
  type Tenant,
} from '../src/gauge-sb-ges.ts'
import { navigateGalleryPanel, navigateProfileViaRailCard } from '../src/real-gallery/navigate-panel.ts'
import { probeKeyboardTraversal } from '../src/real-gallery/keyboard.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'

const run = process.env.PERSONA_E2E === '1'
const SUITE = 'sb-ges'
const STAMP = String(Date.now())

/** Known product bug: asserts the REQUIRED behaviour, fails today (`it.fails`), flips red when fixed. */
function bug(owner: string, title: string, fn: () => Promise<void>, timeout = 180_000): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, timeout)
}

describe.skipIf(!run)('SB-7 + GES-6 app — Segundo cérebro e Gestor de equipe', () => {
  let s: GaugeSession
  let tenant: Tenant
  let scope: { workspaceId: string; projectId: string }
  const surface = () => s.page.locator('[data-persona-surface]').first()

  /** The host keys pages by SLUG (title): it returns the id it actually stored, which may differ from the one requested. */
  const ids = { cli: '', reg: '', priv: '', persona: '' }

  async function seedBrain(): Promise<void> {
    const put = async (id: string, kind: string, title: string, body: string, extra: Record<string, unknown> = {}): Promise<string> =>
      (await hostRpcOk<{ id: string }>(s.page, 'putBrainPage', { ...scope, id, kind, title, body, editorKind: 'person', editorId: tenant.memberId, ...extra })).id
    ids.cli = await put('gauge-sb-cli', 'client', 'Cliente Padaria SBGES', 'Cliente ativo. Ver [[Regra da casa SBGES]].', { sources: ['tarefa:gauge-1'] })
    ids.reg = await put('gauge-sb-reg', 'rule', 'Regra da casa SBGES', 'Nunca vender fiado.')
    ids.priv = await put('gauge-sb-priv', 'learning', 'Nota privada SBGES', 'Segredo do dono.', { visibility: 'members', memberIds: [tenant.memberId] })
    ids.persona = await put('gauge-sb-persona', 'learning', 'Segredo persona SBGES', 'conteudo-restrito-sbges', { visibility: 'persona', personaId: 'atendimento' })
  }

  async function openBrainHome(): Promise<void> {
    const anyBrain = s.page.locator('[data-persona-surface^="second-brain"]')
    if (await anyBrain.count() === 0) {
      await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'segundo-cerebro')!)
    } else {
      // Already inside the Segundo cérebro (a page / kind list / permissions view): walk back with "Início".
      for (let step = 0; step < 4; step += 1) {
        const back = anyBrain.first().getByRole('button', { name: 'Início' })
        if (await back.count() === 0) break
        await back.first().click()
        await s.page.waitForTimeout(500)
      }
    }
    await s.page.locator('[data-persona-surface="second-brain"]').waitFor({ state: 'visible', timeout: 60_000 })
    await s.page.getByText('Por tipo', { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 })
  }

  /** The visible row of a permission, found by its (unique) action text. */
  const grantRow = (action: string) => surface().getByText(action).first().locator('xpath=ancestor::*[.//button[normalize-space()="Revogar" or normalize-space()="Tirar permissão"]][1]')

  /** #geral on its default assunto "Geral" (a sibling suite may have left another assunto active on the shared host). */
  async function openGeral(): Promise<void> {
    await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!)
    const general = s.page.locator('[id="persona-subject-channel:geral:t0"]')
    if (await general.count() > 0) {
      await general.first().click()
      await s.page.waitForTimeout(600)
    }
  }

  /** Reject the Gauge-created pending approvals so the inbox head is always the one the test owns (re-runnable). */
  async function rejectGaugeApprovals(): Promise<void> {
    const pending = await hostRpcOk<{ id: string; kind: string; status: string }[]>(s.page, 'listApprovals', scope)
    for (const row of pending.filter(item => item.status === 'pending' && item.id.startsWith('gauge-'))) {
      await hostRpc(s.page, 'decideApproval', { ...scope, id: row.id, kind: row.kind, accept: false })
    }
  }

  async function axeGate(name: string): Promise<void> {
    const axe = await scanAccessibility(s.page)
    await writeFile(join(await captureDir('axe'), `sb-ges-${name}.json`), JSON.stringify(axe, null, 2), 'utf8')
    if (axe.skipped) {
      console.warn(`[gauge] axe indisponível em ${name}: ${axe.reason ?? ''}`)
      return
    }
    const hard = axe.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
    expect(hard.map(v => `${v.id}(${String(v.nodes)}): ${v.detail ?? ''}`).join(' || '), `axe crítico/sério em ${name}`).toBe('')
  }

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 1000 } })
    tenant = await readTenant(s.page)
    scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
    await seedBrain()
  }, 480_000)

  // Keep one test from poisoning the next: close stray popovers/dialogs and make sure the shell is back before each test.
  beforeEach(async () => {
    await s.page.keyboard.press('Escape').catch(() => undefined)
    const shell = s.page.locator('[data-persona-shell]')
    if (!(await shell.isVisible().catch(() => false))) {
      await s.page.reload({ waitUntil: 'load' })
      await shell.waitFor({ state: 'visible', timeout: 120_000 })
    }
  }, 180_000)

  afterAll(async () => {
    await s?.close()
  }, 60_000)

  describe('SB-5 — Empresa › Segundo cérebro: navegação, início e páginas', () => {
    vitestIt('[SB-5a] fica sob "Empresa" (não no rail principal) e o início mostra as 4 seções sem loading infinito, sem fatais, sem axe grave', async () => {
      const health = await panelHealth(s, 'segundo-cerebro')
      expect(health.fatals).toEqual([])
      expect(health.stuck, health.detail).toBe(false)
      expect(health.blank, health.detail).toBe(false)
      const company = s.page.locator('#persona-nav-company')
      expect(await company.getByRole('button', { name: 'Segundo cérebro' }).count(), 'item dentro do grupo Empresa').toBe(1)
      for (const group of ['persona-nav-work', 'persona-nav-team', 'persona-nav-more']) {
        expect(await s.page.locator(`#${group}`).getByRole('button', { name: 'Segundo cérebro' }).count(), `fora de ${group}`).toBe(0)
      }
      await openBrainHome()
      const text = await mainText(s.page)
      for (const section of ['Comece aqui', 'O que mudou hoje', 'Precisa de você', 'Permissões ativas', 'Por tipo']) expect(text.toLowerCase(), section).toContain(section.toLowerCase())
      expect(text).not.toMatch(/Carregando páginas/u)
      for (const word of FORBIDDEN_UI_WORDS) expect(text).not.toMatch(word)
      expect(text, 'dados fabricados (mock) no Segundo cérebro').not.toMatch(/Pipoca/u)
      await shootBothThemes(s.page, SUITE, 'sb-inicio')
      await axeGate('segundo-cerebro-inicio')
    })

    vitestIt('[SB-5b] "Por tipo" conta as páginas semeadas; a lista do tipo abre a página com propriedades (slug/rev), fonte e histórico', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /^Cliente\s*\d/u }).first().click()
      await surface().getByRole('button', { name: /Cliente Padaria SBGES/u }).first().click()
      const text = await mainText(s.page)
      for (const label of ['Propriedades', 'slug', 'rev', 'Citada em', 'Histórico', 'Fontes']) expect(text.toLowerCase(), label).toContain(label.toLowerCase())
      expect(text).toContain('cliente-padaria-sbges')
      expect(text).toMatch(/Visível para a equipe/u)
      await shootBothThemes(s.page, SUITE, 'sb-pagina')
      await axeGate('segundo-cerebro-pagina')
    })

    vitestIt('[SB-5b] editor markdown manual: Editar → Salvar grava uma NOVA versão (rev +1) e o texto novo aparece; reabrir mostra as versões', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /Regra da casa SBGES/u }).first().click()
      const hostRev = async (): Promise<number> => (await hostRpcOk<{ revision: number }>(s.page, 'getBrainPage', { ...scope, pageId: ids.reg })).revision
      const before = await hostRev()
      await surface().getByRole('button', { name: 'Editar' }).first().click()
      const marker = `Exceto à família (${STAMP}).`
      await surface().getByRole('textbox', { name: 'Editar' }).fill(`Nunca vender fiado. ${marker}`)
      await surface().getByRole('button', { name: 'Salvar' }).click()
      await expect.poll(hostRev, { timeout: 20_000 }).toBe(before + 1)
      await expect.poll(async () => (await mainText(s.page)).includes(marker), { timeout: 20_000 }).toBe(true)
      const shownRev = Number(/rev\s*\n?\s*(\d+)/iu.exec(await mainText(s.page))?.[1] ?? '0')
      expect(shownRev, 'a revisão exibida bate com a do host').toBe(before + 1)
      const versions = await hostRpcOk<{ revision: number }[]>(s.page, 'listBrainVersions', { ...scope, pageId: ids.reg })
      expect(versions.map(v => v.revision)).toContain(before + 1)
      expect(versions.length, 'nenhuma versão anterior se perde').toBeGreaterThanOrEqual(2)
    })

    vitestIt('[SB-5b] busca por texto acha a página e abre (sem rede: filtra o que já está carregado)', async () => {
      await openBrainHome()
      await s.page.getByPlaceholder('Buscar no Segundo cérebro').fill('fiado')
      const hit = surface().getByRole('button', { name: 'Regra da casa SBGES' }).first()
      await hit.waitFor({ state: 'visible', timeout: 15_000 })
      await hit.click()
      expect(await mainText(s.page)).toMatch(/Nunca vender fiado/u)
    })

    vitestIt('[SB-5b] "Citada em" mostra QUEM CITA a página: a Regra citada por [[Regra da casa SBGES]] na página do Cliente deve listar "Cliente Padaria SBGES" (corrigido)', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /Regra da casa SBGES/u }).first().click()
      const text = await mainText(s.page)
      expect(text).toMatch(/Cliente Padaria SBGES/u)
      expect(text).not.toMatch(/Nenhum link ainda/u)
    })

    vitestIt('[SB-5b] o histórico de versões oferece RESTAURAR uma versão anterior (o host tem restoreBrainPage; a página só mostra a lista, sem ação) (corrigido)', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /Regra da casa SBGES/u }).first().click()
      expect(await surface().getByRole('button', { name: /Restaurar/u }).count()).toBeGreaterThan(0)
    })

    vitestIt('[SB-5b] depois de SALVAR, a lista de versões da página já inclui a versão nova (corrigido)', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /Regra da casa SBGES/u }).first().click()
      await surface().getByRole('button', { name: 'Editar' }).first().click()
      await surface().getByRole('textbox', { name: 'Editar' }).fill(`Nunca vender fiado. Versão ${String(Date.now())}.`)
      await surface().getByRole('button', { name: 'Salvar' }).click()
      await s.page.waitForTimeout(2_500)
      const versions = await hostRpcOk<{ revision: number }[]>(s.page, 'listBrainVersions', { ...scope, pageId: ids.reg })
      const history = surface().locator('section, div').filter({ hasText: 'Histórico' }).last()
      const rows = await history.getByText(/^\d{4}-\d{2}-\d{2}$/u).count()
      expect(rows, 'linhas no histórico depois de salvar').toBe(versions.length)
    })

    vitestIt('[SB-5b] existe ação para CRIAR uma página nova com a home não vazia ("Escrever uma página" só existe no estado vazio, que nunca aparece porque o "Comece aqui" já conta como página) (corrigido)', async () => {
      await openBrainHome()
      expect(await surface().getByRole('button', { name: /Escrever uma página|Nova página/u }).count()).toBeGreaterThan(0)
    })

    vitestIt('[SB-5] o feed "O que mudou hoje" e o histórico falam em português ("Você"/nome), nunca ids internos como "person:owner", "grant:owner" ou "owner"', async () => {
      await openBrainHome()
      const text = await mainText(s.page)
      expect(text).not.toMatch(/person:owner|grant:owner|persona:[a-z]/u)
    })

    vitestIt('[SB-5] o feed não atribui a atualização a um "bibliotecário (Atlas)" fixo quando a equipe não tem nenhuma persona chamada Atlas (nome vem da persona com a função) (corrigido)', async () => {
      const personas = await hostRpcOk<{ name: string }[]>(s.page, 'listPersonas', scope)
      expect(personas.some(p => p.name === 'Atlas'), 'pré-condição: sem Atlas na equipe').toBe(false)
      await openBrainHome()
      expect(await mainText(s.page)).not.toMatch(/\(Atlas\)/u)
    })

    vitestIt('[SB-5] duas páginas com o MESMO título e ids diferentes convivem (ou a segunda é recusada com aviso) (corrigido)', async () => {
      const title = `Duplicada SBGES ${STAMP}`
      const first = await hostRpcOk<{ id: string }>(s.page, 'putBrainPage', { ...scope, id: `gauge-sb-dup-a-${STAMP}`, kind: 'learning', title, body: 'corpo A', editorKind: 'person', editorId: tenant.memberId })
      const second = await hostRpc<{ id: string }>(s.page, 'putBrainPage', { ...scope, id: `gauge-sb-dup-b-${STAMP}`, kind: 'learning', title, body: 'corpo B', editorKind: 'person', editorId: tenant.memberId })
      const original = await hostRpcOk<{ body: string }>(s.page, 'getBrainPage', { ...scope, pageId: first.id })
      expect(second.ok ? second.value?.id : 'recusada', 'a segunda página tem o id pedido (ou foi recusada)').not.toBe(first.id)
      expect(original.body, 'a primeira página não pode ser sobrescrita').toBe('corpo A')
    })

    bug('Lumen+Rivet', '[SB-4] o Segundo cérebro oferece "Exportar para pasta" (ou, no web, um aviso honesto de que só o app instalado exporta) — hoje nada na tela chama exportBrainVault/importBrainVault', async () => {
      await openBrainHome()
      expect(await mainText(s.page)).toMatch(/Exportar|pasta|Obsidian/u)
    })
  })

  describe('SB-2c — ACL na UI', () => {
    vitestIt('[SB-2c] a página restrita a uma persona NÃO aparece na home, na busca, no feed nem na lista do tipo; a página só do dono aparece na lista "Tudo"', async () => {
      await openBrainHome()
      const home = await mainText(s.page)
      expect(home).toContain('Nota privada SBGES')
      expect(home, 'página restrita à persona vazou na home').not.toMatch(/Segredo persona SBGES|conteudo-restrito-sbges/u)
      await s.page.getByPlaceholder('Buscar no Segundo cérebro').fill('conteudo-restrito-sbges')
      await s.page.waitForTimeout(600)
      expect(await mainText(s.page), 'busca devolveu a página restrita').not.toMatch(/Segredo persona SBGES/u)
      await s.page.getByPlaceholder('Buscar no Segundo cérebro').fill('')
      await surface().getByRole('button', { name: /^Aprendizado\s*\d/u }).first().click()
      await surface().getByRole('tab', { name: 'Tudo' }).click()
      const list = await mainText(s.page)
      expect(list).toContain('Nota privada SBGES')
      expect(list).not.toMatch(/Segredo persona SBGES/u)
      const denied = await hostRpc(s.page, 'getBrainPage', { ...scope, pageId: ids.persona })
      expect(denied.ok, 'o host deve recusar a página restrita a persona').toBe(false)
    })

    bug('Lumen+Anvil', '[SB-2c] a página só do dono aparece como "Privada" (hoje diz "Visível para a equipe": BrainPageView.restricted só diz "escondida de você", não "privada") e aparece em "Minhas privadas" (hoje a aba fica vazia)', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /^Aprendizado\s*\d/u }).first().click()
      await surface().getByRole('tab', { name: 'Minhas privadas' }).click()
      expect(await mainText(s.page), 'aba "Minhas privadas"').toContain('Nota privada SBGES')
      await surface().getByRole('tab', { name: 'Tudo' }).click()
      await surface().getByRole('button', { name: /Nota privada SBGES/u }).first().click()
      const text = await mainText(s.page)
      expect(text).toMatch(/Privada/u)
      expect(text).not.toMatch(/Visível para a equipe/u)
    })

    vitestIt('[SB-2c] o índice "Comece aqui" derivado NÃO cita o título de uma página restrita a persona (corrigido)', async () => {
      const home = await hostRpcOk<{ startHereId: string }>(s.page, 'getBrainHome', scope)
      const start = await hostRpcOk<{ body: string }>(s.page, 'getBrainPage', { ...scope, pageId: home.startHereId })
      expect(start.body).not.toMatch(/Segredo persona SBGES|segredo-persona-sbges|conteudo-restrito-sbges/u)
    })
  })

  describe('SB-3 — permissões lembradas na UI', () => {
    const action = `rascunhar-resposta-${STAMP}`
    /** The UI humanises the machine action ("rascunhar-resposta-1" → "Rascunhar resposta 1"). */
    const shown = `Rascunhar resposta ${STAMP}`
    const grantId = `gauge-sb-g-${STAMP}`

    vitestIt('[SB-3f] Permissões ativas lista a concessão; Revogar pede confirmação; Cancelar mantém; confirmar revoga NA HORA e a persona volta a perguntar', async () => {
      await hostRpcOk(s.page, 'grantBrainPermission', { ...scope, id: grantId, personaId: 'm-dia', action, target: 'clientes-aprovados', validity: '7d' })
      await openBrainHome()
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await openBrainHome()
      await surface().getByRole('button', { name: /Ver todas/u }).first().click()
      await surface().getByText(shown).first().waitFor({ state: 'visible', timeout: 20_000 })
      const text = await mainText(s.page)
      expect(text).toMatch(/Por 7 dias|Até \d{4}-\d{2}-\d{2}/u)
      expect(text).toContain('Concedida por você')
      await shootBothThemes(s.page, SUITE, 'sb-permissoes')
      await axeGate('segundo-cerebro-permissoes')
      await grantRow(shown).getByRole('button', { name: /^(Tirar permissão|Revogar)$/u }).click()
      await grantRow(shown).getByRole('button', { name: 'Cancelar' }).click()
      expect(await surface().getByText(shown).count(), 'Cancelar não revoga').toBeGreaterThan(0)
      expect((await hostRpcOk<{ id: string; revokedAt?: string }[]>(s.page, 'listBrainPermissions', scope)).find(g => g.id === grantId)?.revokedAt).toBeUndefined()
      await grantRow(shown).getByRole('button', { name: /^(Tirar permissão|Revogar)$/u }).click()
      await grantRow(shown).getByRole('button', { name: /^(Tirar agora|Revogar agora)$/u }).click()
      await expect.poll(() => surface().getByText(shown).count(), { timeout: 15_000 }).toBe(0)
      const use = await hostRpc(s.page, 'useBrainPermission', { ...scope, grantId, personaId: 'm-dia', action, target: 'clientes-aprovados' })
      expect(use.ok, 'a próxima ação idêntica deve perguntar de novo (forbidden)').toBe(false)
    })

    vitestIt('[SB-3f] a permissão revogada fica na aba "Revogadas" para auditoria', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: 'Permissões' }).first().click()
      await surface().getByRole('tab', { name: 'Revogadas' }).click()
      await s.page.waitForTimeout(600)
      expect(await mainText(s.page)).toContain(shown)
    })

    vitestIt('[SB-3h] "Lembrar esta permissão" ao aprovar grava escopo EXPLÍCITO: persona, ação, alvo e validade (7 dias)', async () => {
      await rejectGaugeApprovals()
      const recordId = `gauge-sb-rec-${STAMP}`
      const proposalId = `gauge-sb-prop-${STAMP}`
      await hostRpcOk(s.page, 'createVaultRecord', { ...scope, id: recordId, kind: 'brief', body: 'Horário: abrimos às 6h.', authorId: tenant.memberId })
      await hostRpcOk(s.page, 'proposeVault', { ...scope, id: proposalId, creatorPersonaId: 'atendimento', recordId, nextBody: 'Horário: abrimos às 7h.' })
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'aprovacoes')!)
      await surface().getByText('Lembrar esta permissão').first().waitFor({ state: 'visible', timeout: 30_000 })
      // The toggle lives on the head card: dismiss older pending proposals until the head is ours.
      for (let guard = 0; guard < 12; guard += 1) {
        await surface().getByText('Lembrar esta permissão').first().click()
        if ((await mainText(s.page)).includes(recordId)) break
        await surface().getByText('Lembrar esta permissão').first().click()
        await surface().getByRole('button', { name: 'Dispensar' }).first().click()
        await s.page.waitForTimeout(900)
      }
      const scopeText = await mainText(s.page)
      expect(scopeText).toContain(recordId)
      for (const part of ['Da próxima vez, Atendimento não pergunta para', 'Só desta vez', '7 dias', 'Até eu revogar', 'Qualquer coisa maior, outro alvo ou outra persona']) expect(scopeText, part).toContain(part)
      await shootBothThemes(s.page, SUITE, 'sb-lembrar-permissao')
      await surface().getByText('7 dias').first().click()
      await surface().getByRole('button', { name: 'Revisar proposta' }).first().click({ timeout: 60_000 })
      await expect.poll(async () => (await hostRpcOk<{ id: string }[]>(s.page, 'listBrainPermissions', scope)).some(g => g.id === `grant-${proposalId}`), { timeout: 20_000 }).toBe(true)
      const grant = (await hostRpcOk<{ id: string; personaId: string; action: string; target: string; validity: string }[]>(s.page, 'listBrainPermissions', scope)).find(g => g.id === `grant-${proposalId}`)!
      expect(grant).toMatchObject({ personaId: 'atendimento', action: 'vault.update', target: `vault:${proposalId}`, validity: '7d' })
    })

    bug('Prism', '[SB-3h] o botão que APROVA a proposta do Cofre diz "Revisar proposta" e aprova sem mostrar o que muda (a pergunta é só "Atualizar registro no Cofre?" + id do registro); o cartão mostra o texto atual e o novo antes de decidir', async () => {
      const recordId = `gauge-sb-rec2-${STAMP}`
      await hostRpcOk(s.page, 'createVaultRecord', { ...scope, id: recordId, kind: 'brief', body: 'Horário: abrimos às 6h.', authorId: tenant.memberId })
      await hostRpcOk(s.page, 'proposeVault', { ...scope, id: `gauge-sb-prop2-${STAMP}`, creatorPersonaId: 'atendimento', recordId, nextBody: 'Horário: abrimos às 7h30.' })
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'aprovacoes')!)
      await surface().getByText('Cofre').first().waitFor({ state: 'visible', timeout: 30_000 })
      try {
        expect(await mainText(s.page)).toMatch(/abrimos às 7h30/u)
      } finally {
        await rejectGaugeApprovals()
      }
    })

    bug('Prism', '[SB-3h] a proposta que chega com o app aberto aparece na caixa de Aprovações SEM recarregar (hoje fica "Nada pendente" até F5)', async () => {
      await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'aprovacoes')!)
      const recordId = `gauge-sb-rec3-${STAMP}`
      await hostRpcOk(s.page, 'createVaultRecord', { ...scope, id: recordId, kind: 'brief', body: 'x', authorId: tenant.memberId })
      await hostRpcOk(s.page, 'proposeVault', { ...scope, id: `gauge-sb-prop3-${STAMP}`, creatorPersonaId: 'atendimento', recordId, nextBody: 'y' })
      await s.page.waitForTimeout(6_000)
      try {
        expect(await mainText(s.page)).toContain(recordId)
      } finally {
        await rejectGaugeApprovals()
      }
    })
  })

  describe('SB-5 — teclado e grafo', () => {
    vitestIt('[SB-5b] a lista de um tipo tem visão Lista/Grafo; o Grafo tem alternativa "Ver como lista" e o Tab não prende o foco', async () => {
      await openBrainHome()
      await surface().getByRole('button', { name: /^Cliente\s*\d/u }).first().click()
      await surface().getByRole('tab', { name: 'Grafo' }).click()
      await s.page.waitForTimeout(800)
      expect(await surface().getByRole('button', { name: 'Ver como lista' }).count(), 'alternativa em lista ao grafo').toBeGreaterThan(0)
      const kb = await probeKeyboardTraversal(s.page)
      expect(kb.pass, kb.reason ?? kb.focusTags.join(' → ')).toBe(true)
      await shootBothThemes(s.page, SUITE, 'sb-grafo')
      await surface().getByRole('button', { name: 'Ver como lista' }).first().click()
      await surface().getByRole('tab', { name: 'Lista' }).click()
    })
  })

  describe('GES-4 — editor, selo Gestor e a palavra proibida', () => {
    vitestIt('[GES-4a] o editor da Coordenação tem "Gestor de equipe" com modo de aprovação, tamanho máximo, gasto, escopo, "pode conceder Gestor" e a prévia mostra o selo', async () => {
      await navigateProfileViaRailCard(s.page, 'Coordenação')
      await surface().getByRole('button', { name: 'Editar persona' }).waitFor({ state: 'visible', timeout: 60_000 })
      expect(await mainText(s.page), 'selo Gestor no perfil').toMatch(/Gestor/u)
      await surface().getByRole('button', { name: 'Editar persona' }).click()
      await s.page.getByRole('heading', { name: 'Funções do sistema' }).waitFor({ state: 'visible', timeout: 30_000 })
      const text = await bodyText(s.page)
      for (const part of [
        'Gestor de equipe', 'Quando contratar ou mudar alguém', 'Sempre me perguntar', 'Fazer sozinho dentro dos limites', 'Fazer e me avisar',
        'Tamanho máximo da equipe', 'Gasto das novas personas', 'Onde pode agir', 'Pode tornar outra persona Gestor de equipe',
        'Coordenação nunca cria persona com mais acesso que ele mesmo', 'Limites', 'COMO A EQUIPE VAI VER',
      ]) expect(text, part).toContain(part)
      for (const word of FORBIDDEN_UI_WORDS) expect(text, String(word)).not.toMatch(word)
      await s.page.getByText('Gestor de equipe').first().scrollIntoViewIfNeeded()
      await shootBothThemes(s.page, SUITE, 'ges-editor-gestor')
      await axeGate('editor-persona')
      await s.page.getByRole('button', { name: 'Cancelar' }).click()
      await s.page.waitForTimeout(500)
    })

    vitestIt('[GES-4a] os modos de aprovação são excludentes e "Sempre me perguntar" é o padrão recomendado', async () => {
      await navigateProfileViaRailCard(s.page, 'Coordenação')
      await surface().getByRole('button', { name: 'Editar persona' }).click()
      await s.page.getByRole('heading', { name: 'Funções do sistema' }).waitFor({ state: 'visible', timeout: 30_000 })
      const radios = s.page.getByRole('radio')
      const names = await radios.evaluateAll(els => els.map(el => `${el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? ''}|${(el as HTMLInputElement).checked ? 'on' : 'off'}`))
      const ask = names.find(row => /Sempre me perguntar/u.test(row))
      expect(ask, 'modo "Sempre me perguntar" como radio').toBeDefined()
      expect(ask).toMatch(/\|on$/u)
      expect(names.filter(row => /Sempre me perguntar|Fazer sozinho|Fazer e me avisar/u.test(row) && /\|on$/u.test(row))).toHaveLength(1)
      await s.page.getByRole('button', { name: 'Cancelar' }).click()
    })

    vitestIt('[GES-4b] selo "Gestor" coerente com o banco: a Coordenação do template também é Gestor e o perfil mostra o selo', async () => {
      const personas = await hostRpcOk<{ id: string; name: string; systemRoles: string[] }[]>(s.page, 'listPersonas', scope)
      const coordination = personas.find(p => p.systemRoles.includes('coordination'))
      expect(coordination?.systemRoles, 'Coordenação também é Gestor').toContain('team_manager')
      await navigateProfileViaRailCard(s.page, coordination?.name ?? 'Coordenação')
      await surface().getByRole('button', { name: 'Editar persona' }).waitFor({ state: 'visible', timeout: 60_000 })
      expect(await mainText(s.page)).toMatch(/\bGestor\b/u)
    })

    bug('Lumen', '[GES-4b] o organograma "Quem cuida de quem" mostra o selo "Gestor" no cartão da Coordenação (hoje só o perfil mostra; o organograma não diferencia o Gestor)', async () => {
      await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'org-chart')!)
      await s.page.waitForTimeout(1_500)
      expect(await mainText(s.page)).toMatch(/\bGestor\b/u)
    })

    vitestIt('[GES-4a] a palavra "Maestro" não aparece em nenhuma tela visitada (Gestor de equipe, nunca Maestro)', async () => {
      const seen: string[] = []
      for (const slug of ['visao-geral', 'geral', 'equipe', 'org-chart', 'team-health', 'kanban', 'rotinas', 'aprovacoes', 'segundo-cerebro', 'conexoes', 'uso', 'importar', 'configuracoes']) {
        await navigateGalleryPanel(s.page, REAL_GALLERY_PANELS.find(panel => panel.slug === slug)!)
        await s.page.waitForTimeout(700)
        const text = await bodyText(s.page)
        seen.push(slug)
        expect(text, `Maestro em ${slug}`).not.toMatch(/Maestro/iu)
      }
      expect(seen).toHaveLength(13)
    })
  })

  describe('GES-1 — plano do Gestor no chat', () => {
    const plansOf = () => hostRpcOk<{ id: string; status: string }[]>(s.page, 'listGestorPlans', { workspaceId: tenant.workspaceId })
    let planId = ''
    let personasBefore = 0
    let coachmarkCoversPlan: boolean | undefined

    async function dismissCoachmark(): Promise<void> {
      const gotIt = s.page.getByRole('button', { name: 'Entendi' })
      if (await gotIt.count() > 0) await gotIt.first().click()
      await s.page.waitForTimeout(400)
    }

    vitestIt('[GES-1a] o plano "Monte um time para o Site" chega ao #geral com Aprovar / Ajustar / Agora não e o resumo do que será feito (e nada é contratado antes de aprovar)', async () => {
      personasBefore = (await hostRpcOk<unknown[]>(s.page, 'listPersonas', scope)).length
      await openGeral()
      planId = `gauge-sb-plan-${STAMP}`
      const out = await hostRpcOk<{ plan: { status: string; summary: string }; preview: { personaTitles: string[]; workflowId: string; sprintName: string } }>(
        s.page, 'proposeGestorAssemble', { ...scope, gestorId: 'coordena-o', id: planId, goal: 'Monte um time para o Site' })
      expect(out.plan.status).toBe('proposed')
      expect(out.preview.workflowId).toBe('site')
      expect(out.preview.sprintName).toBe('Sprint 1')
      // The card is hydrated from the plan list on load, so reload once (the live path is the bug test below).
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await openGeral()
      await s.page.getByRole('button', { name: 'Aprovar' }).first().waitFor({ state: 'visible', timeout: 30_000 })
      // First-run hint "A Coordenação distribui o pedido / Entendi": measure whether it covers the plan buttons BEFORE dismissing it.
      await s.page.getByRole('button', { name: 'Entendi' }).first().waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined)
      const hint = await s.page.getByRole('button', { name: 'Entendi' }).first().boundingBox().catch(() => null)
      const boxes = await Promise.all(['Aprovar', 'Ajustar', 'Agora não'].map(name => s.page.getByRole('button', { name }).first().boundingBox()))
      coachmarkCoversPlan = hint !== null && boxes.some(box => box !== null
        && hint.x < box.x + box.width && hint.x + hint.width > box.x && hint.y < box.y + box.height && hint.y + hint.height > box.y)
      await dismissCoachmark()
      const text = await bodyText(s.page)
      expect(text).toMatch(/PLANO DO/u)
      expect(text).toContain(out.plan.summary)
      for (const action of ['Aprovar', 'Ajustar', 'Agora não']) expect(await s.page.getByRole('button', { name: action }).count(), action).toBeGreaterThan(0)
      expect((await hostRpcOk<unknown[]>(s.page, 'listPersonas', scope)).length, 'antes de aprovar ninguém foi contratado').toBe(personasBefore)
      await shootBothThemes(s.page, SUITE, 'ges-plano-no-geral')
    })

    vitestIt('[GES-1a] "Ajustar" abre a edição do plano e "Esc" volta sem aprovar nem recusar', async () => {
      await dismissCoachmark()
      await s.page.getByRole('button', { name: 'Ajustar' }).first().click()
      await s.page.waitForTimeout(1_200)
      await shootBothThemes(s.page, SUITE, 'ges-plano-ajustar')
      await s.page.keyboard.press('Escape')
      await s.page.waitForTimeout(600)
      expect((await plansOf()).find(plan => plan.id === planId)?.status).toBe('proposed')
    })

    bug('Prism', '[GES-1a] o plano do Gestor aparece como CARTÃO no #geral assim que é proposto, sem recarregar (hoje só chega o texto "Vou contratar…"; Aprovar/Ajustar só depois do F5)', async () => {
      await openGeral()
      await s.page.getByRole('button', { name: 'Aprovar' }).first().waitFor({ state: 'visible', timeout: 30_000 })
      const cardsBefore = await s.page.getByRole('button', { name: 'Aprovar' }).count()
      await hostRpcOk(s.page, 'proposeGestorAssemble', { ...scope, gestorId: 'coordena-o', id: `gauge-sb-plan-live-${STAMP}`, goal: 'Monte um time para o Site' })
      await s.page.waitForTimeout(6_000)
      expect(await s.page.getByRole('button', { name: 'Aprovar' }).count(), 'novo cartão com Aprovar sem recarregar').toBe(cardsBefore + 1)
    })

    vitestIt('[GES-1a] o aviso "A Coordenação distribui o pedido / Entendi" NÃO cobre os botões do cartão do plano (Aprovar/Ajustar/Agora não)', async () => {
      expect(coachmarkCoversPlan, 'o aviso de 1ª vez não cobre Aprovar/Ajustar/Agora não').toBe(false)
    })

    vitestIt('[GES-1b] Aprovar marca o cartão "Aprovado" e o plano vira applied com auditoria COM MOTIVO', async () => {
      await s.page.reload({ waitUntil: 'load' })
      await s.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await openGeral()
      await s.page.getByRole('button', { name: 'Aprovar' }).first().waitFor({ state: 'visible', timeout: 30_000 })
      await dismissCoachmark()
      const approve = s.page.getByRole('button', { name: 'Aprovar' }).first()
      await approve.scrollIntoViewIfNeeded()
      await approve.click({ timeout: 90_000 })
      await s.page.getByText('Aprovado', { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 })
      await shootBothThemes(s.page, SUITE, 'ges-plano-aprovado')
      await expect.poll(async () => (await plansOf()).filter(plan => plan.status === 'applied').length, { timeout: 15_000 }).toBeGreaterThan(0)
      const audit = await hostRpcOk<{ summary: string; reason: string }[]>(s.page, 'listGestorAudit', { workspaceId: tenant.workspaceId })
      expect(audit.length).toBeGreaterThan(0)
      expect(audit.every(row => row.reason.trim() !== ''), 'toda linha de auditoria tem motivo').toBe(true)
      expect(audit.map(row => `${row.summary} ${row.reason}`).join(' ')).not.toMatch(/undefined|\[object|plan-\d/u)
    })

    bug('Anvil+Forge', '[GES-1b] depois de "Aprovado — Personas alocadas conforme o plano", as personas, o fluxo Site e a Sprint 1 EXISTEM de verdade (hoje o cartão afirma isso e nada é criado: host.approveGestorPlan não monta equipe)', async () => {
      const personas = await hostRpcOk<unknown[]>(s.page, 'listPersonas', scope)
      expect(personas.length, 'personas criadas pelo plano').toBeGreaterThan(personasBefore)
      const sprints = await hostRpcOk<{ name: string }[]>(s.page, 'listSprints', scope)
      expect(sprints.some(sprint => sprint.name === 'Sprint 1'), 'Sprint 1').toBe(true)
    })

    bug('Forge', '[GES-1a] "Monte um time para o Site" gera uma equipe de SITE (hoje: Coordenação, Atendimento, Financeiro, Pessoas — papéis de escritório — e repete uma Coordenação que já existe)', async () => {
      const out = await hostRpcOk<{ preview: { personaTitles: string[] } }>(s.page, 'proposeGestorAssemble', { ...scope, gestorId: 'coordena-o', id: `gauge-sb-plan-site-${STAMP}`, goal: 'Monte um time para o Site' })
      const titles = out.preview.personaTitles
      expect(titles.some(title => /Financeiro|Pessoas/u.test(title)), `papéis de escritório num time de site: ${titles.join(', ')}`).toBe(false)
      expect(titles.filter(title => title === 'Coordenação'), 'repete a Coordenação existente').toHaveLength(0)
    })

    vitestIt('[GES-1c] com movimento reduzido a faixa/rail não tem animação infinita (reduced-motion respeitado)', async () => {
      await s.page.emulateMedia({ reducedMotion: 'reduce' })
      await openGeral()
      await s.page.waitForTimeout(1_500)
      const infinite = await s.page.evaluate(() => document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming()
        return timing !== undefined && timing.iterations === Infinity && animation.playState === 'running'
      }).length)
      await s.page.emulateMedia({ reducedMotion: 'no-preference' })
      expect(infinite, 'animações infinitas rodando com prefers-reduced-motion').toBe(0)
    })
  })

  describe('GES-3c — auditoria com motivo visível', () => {
    vitestIt('[GES-3c] a Saúde da equipe tem a seção de atividade do Gestor depois de uma ação e NENHUM texto inventado (mock)', async () => {
      await panelHealth(s, 'team-health')
      const text = await mainText(s.page)
      expect(text).toContain('Atividade do Gestor de equipe')
      expect(text, 'atividade fabricada (mock)').not.toMatch(/Pipoca · Designer|mudou 1 arquivo\(s\) e contratou 1 · 1 falhou|alocar Nina/u)
      await shootBothThemes(s.page, SUITE, 'ges-saude-auditoria')
    })

    bug('Lumen', '[GES-3c] a atividade do Gestor na Saúde mostra O QUE foi feito e o MOTIVO ("Vou contratar 4 personas…" + "Uma persona por função contínua…"); hoje a ação "assemble" vira "Coordenação mandou 2 mensagens" e o motivo some', async () => {
      await panelHealth(s, 'team-health')
      const row = surface().getByText(/mandou \d+ mensage/u).first()
      if (await row.count() > 0) await row.click().catch(() => undefined)
      const text = await mainText(s.page)
      expect(text).toMatch(/Vou contratar \d+ personas/u)
      expect(text).toMatch(/Uma persona por função contínua/u)
    })

    vitestIt('[GES-3c] o perfil da Coordenação (Gestor) mostra o motivo da última ação do Gestor', async () => {
      await navigateProfileViaRailCard(s.page, 'Coordenação')
      await surface().getByRole('button', { name: 'Editar persona' }).waitFor({ state: 'visible', timeout: 60_000 })
      const card = await hostRpcOk<{ gestorAuditReason?: string }>(s.page, 'getPersonaCard', { ...scope, personaId: 'coordena-o' })
      expect(card.gestorAuditReason ?? '', 'o host expõe o motivo').not.toBe('')
      expect(await mainText(s.page)).toContain((card.gestorAuditReason ?? '').slice(0, 24))
    })
  })
})
