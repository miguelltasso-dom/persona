/**
 * Dogfood #2 Agência Ponto on the real persona-profile web host (dev, not NSIS).
 * Fake CLIs on PATH — 0 / 20 real model turns unless PERSONA_REAL_TALK.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import type { DogfoodFinding, DogfoodOwner, DogfoodSeverity } from './dogfood-padaria.ts'
import { chat, onboarding } from './real-app-locale.pt.ts'
import { geralComposerLocator } from './geral-composer.ts'
import { navigateGalleryPanel } from './real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from './real-gallery/panels.ts'
import { openRealPersonaApp } from './real-app-session.ts'
import { isBuildLockBootFailure } from './web-host.ts'
import { REPO_ROOT } from './paths.ts'

const COMPANY = 'Agência Ponto — estúdio de sites e campanhas em cidade média. Tom direto. Não inventar preço. Cliente: padaria de bairro que quer site + posts.'
const BYC_PASTE = '## Decisões já tomadas\nUsar lilás no hero do site da padaria cliente.\n## Ferramentas e processos\nCliente prefere fotos da vitrine de manhã.'
const ASSEMBLE = 'Monte a equipe da Agência Ponto para o site e a campanha do cliente.'

const SHOTS = join(REPO_ROOT, '.maestri', 'tmp', 'shots', 'dogfood-agencia')
const REPORT = join(REPO_ROOT, 'persona-spec', 'reports', 'dogfood-agencia.md')

export interface AgenciaDogfoodReport {
  findings: DogfoodFinding[]
  stepsOk: string[]
  home: string
  realCliUsed: number
}

type NoteFn = (
  title: string,
  severity: DogfoodSeverity,
  owner: DogfoodOwner,
  steps: string,
  capture: string,
  expected: string,
  got: string,
) => void

function shotPath(name: string): string {
  return join(SHOTS, `${name}.png`)
}

/**
 * Walk Agência Ponto on the live persona host. Always writes the report.
 * Caller must not start a second host; this session owns dispose.
 */
export async function runAgenciaDogfood(): Promise<AgenciaDogfoodReport> {
  mkdirSync(SHOTS, { recursive: true })
  const findings: DogfoodFinding[] = []
  const stepsOk: string[] = []
  let n = 0
  let session: Awaited<ReturnType<typeof openRealPersonaApp>>
  try {
    session = await openRealPersonaApp()
  } catch (bootError: unknown) {
    const lock = isBuildLockBootFailure(bootError)
    writeAgenciaMarkdown([{
      id: lock ? 'AG-LOCK' : 'AG-000',
      title: lock ? 'Harness: fila do build lock' : 'App real não subiu',
      severity: lock ? 'P2' : 'P0',
      owner: lock ? 'Probe' : 'Rivet',
      steps: 'openRealPersonaApp perfil persona (dev, sem instalador)',
      capture: '',
      expected: 'shell visível',
      got: String(bootError),
    }], [], '(sem home)', 0)
    throw bootError
  }
  let page = session.page

  const shot = async (name: string): Promise<string> => {
    const path = shotPath(name)
    await page.screenshot({ path, fullPage: true }).catch(() => {})
    return path.replace(/\\/g, '/')
  }

  const note: NoteFn = (title, severity, owner, steps, capture, expected, got) => {
    n += 1
    findings.push({
      id: `AG-${String(n).padStart(3, '0')}`,
      title,
      severity,
      owner,
      steps,
      capture,
      expected,
      got,
    })
  }

  try {
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
    await shot('00-boot')
    stepsOk.push('boot shell')

    if (await page.getByRole('heading', { name: onboarding.step1Title }).count() > 0) {
      await page.getByPlaceholder(onboarding.step1Placeholder).fill('Miguel')
      await page.getByRole('button', { name: onboarding.continue, exact: true }).last().click()
      await page.getByText(onboarding.step2VaultBadge).waitFor({ state: 'visible', timeout: 30_000 })
      const byc = page.getByPlaceholder(/colar|Descreva/i).first()
      if (await byc.count() > 0) {
        await byc.fill(`${COMPANY}\n\n${BYC_PASTE}`)
        await shot('01-byc-onboarding')
        stepsOk.push('BYC colado no onboarding')
      } else {
        note('Campo BYC/cofre ausente no passo 2', 'P1', 'Prism', 'Onboarding passo 2', await shot('01-byc-ausente'), 'colar texto', 'placeholder ausente')
        await page.getByPlaceholder(/Descreva/i).fill(COMPANY).catch(() => {})
      }
      await page.getByRole('button', { name: onboarding.continue, exact: true }).last().click()
      await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible', timeout: 30_000 })
      const skip = page.getByRole('button', { name: 'Continuar sem conectar' })
      if (await skip.count() > 0) await skip.click()
      else await page.getByRole('button', { name: onboarding.continue, exact: true }).last().click()
      await page.getByRole('heading', { name: /equipe|Boas-vindas|template/i }).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
      await shot('02-equipe')
      const finish = page.getByRole('button', { name: onboarding.finish })
      if (await finish.count() > 0) await finish.click()
      await page.waitForTimeout(2_500)
      stepsOk.push('onboarding Agência Ponto')
    }

    const overlayStuck = await page.locator('[role="presentation"][class*="scrim"]').count() > 0
      || await page.getByRole('heading', { name: onboarding.step5Title }).count() > 0
    if (overlayStuck || await page.locator('[data-persona-shell]').count() === 0) {
      note('Overlay preso — reabre com seed para o passeio', 'P1', 'Prism', 'Entrar na Persona', await shot('03-overlay'), 'firstUse false', 'scrim ainda no ar')
      await session.close()
      session = await openRealPersonaApp({ dismissOnboardingViaStorage: true, devSeed: true })
      page = session.page
      stepsOk.push('reabriu seed')
    }

    await walkAgencia(page, note, shot, stepsOk)
  } catch (walkError: unknown) {
    note('Passeio abortou', 'P0', 'Forge', 'Agência Ponto app real', await shot('99-abort'), 'completar o cenário', String(walkError))
  } finally {
    writeAgenciaMarkdown(findings, stepsOk, session.host.home, 0)
    await session.close()
  }

  return { findings, stepsOk, home: session.host.home, realCliUsed: 0 }
}

async function walkAgencia(
  page: Page,
  note: NoteFn,
  shot: (n: string) => Promise<string>,
  stepsOk: string[],
): Promise<void> {
  const geral = REAL_GALLERY_PANELS.find(p => p.slug === 'geral')!
  await tryNav(page, geral, note, shot)
  const composer = geralComposerLocator(page).first()
  if (await composer.count() > 0) {
    await composer.fill(ASSEMBLE)
    const send = page.getByRole('button', { name: chat.send, exact: true })
    if (await send.count() > 0) await send.click()
    else await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(3_000)
    await shot('10-geral-assemble')
    const plan = page.getByText(/Plano do|Aprovar|gestor-plan|Monte a equipe/i)
    if (await plan.count() === 0) {
      note(
        'Cartão de plano do Gestor não apareceu após o pedido no #geral',
        'P1',
        'Prism',
        'Enviar "Monte a equipe da Agência Ponto…" no #geral (fake CLI)',
        await shot('10-gestor-sem-cartao'),
        'cartão Plano do Atlas / Aprovar',
        'ausente — fake CLI pode não disparar assemble',
      )
    } else {
      const approve = page.getByRole('button', { name: 'Aprovar', exact: true })
      if (await approve.count() > 0) {
        await approve.first().click()
        await page.waitForTimeout(1_500)
        await shot('10-gestor-aprovado')
      }
      stepsOk.push('Gestor cartão de plano')
    }
    stepsOk.push('#geral pedido assemble')
  } else {
    note('Composer #geral ausente', 'P0', 'Prism', 'Canais → #geral', await shot('10-sem-composer'), 'placeholder do canal', 'composer não montou')
  }

  const boards = REAL_GALLERY_PANELS.find(p => p.slug === 'kanban')!
  await tryNav(page, boards, note, shot)
  await shot('20-quadros')
  const openBoard = page.getByRole('article', { name: /Abrir quadro/i }).first()
  if (await openBoard.count() > 0) {
    await openBoard.click({ timeout: 30_000 })
    await page.waitForTimeout(800)
    await shot('20-quadro-aberto')
  }
  const sprint = page.getByRole('button', { name: /Planejar|Iniciar sprint/i })
  if (await sprint.count() === 0) {
    note('Sprint ausente nos Quadros', 'P2', 'Lumen', 'Quadros → abrir projeto após pedido de equipe', await shot('20-sprint-ausente'), 'Planejar/Iniciar sprint', 'botão ausente')
  } else {
    await sprint.first().click()
    await page.waitForTimeout(800)
    await shot('20-sprint')
    stepsOk.push('quadros + sprint')
  }

  const perfil = REAL_GALLERY_PANELS.find(p => p.slug === 'perfil')!
  await tryNav(page, perfil, note, shot)
  await shot('30-perfil')
  const teach = page.getByRole('button', { name: /Ensinar/i })
  if (await teach.count() === 0) {
    note('Ensinar ausente no perfil', 'P1', 'Prism', 'Perfil Atlas → Ensinar', await shot('30-ensinar-ausente'), 'botão Ensinar', 'ausente')
  } else {
    await teach.first().click()
    await page.waitForTimeout(800)
    await shot('30-ensinar')
    stepsOk.push('Ensinar')
    await page.keyboard.press('Escape').catch(() => {})
  }

  const brain = REAL_GALLERY_PANELS.find(p => p.slug === 'segundo-cerebro')!
  await tryNav(page, brain, note, shot)
  await shot('40-cerebro')
  const perms = page.getByRole('button', { name: /Permiss/i }).or(page.getByText(/Permissões ativas|Nenhuma permissão/i))
  if (await perms.count() === 0) {
    note('Bloco de permissões do Segundo cérebro ausente', 'P1', 'Lumen', 'Empresa → Segundo cérebro', await shot('40-perms-ausente'), 'Permissões ativas / vazias', 'não achei o bloco')
  } else {
    await perms.first().click().catch(() => {})
    await page.waitForTimeout(500)
    await shot('40-permissoes')
    const revoke = page.getByRole('button', { name: /Tirar permissão|Revogar/i })
    if (await revoke.count() > 0) {
      await revoke.first().click()
      const confirm = page.getByRole('button', { name: /Tirar agora|Revogar agora/i })
      if (await confirm.count() > 0) await confirm.click()
      await shot('40-revogada')
      stepsOk.push('permissão lembrada + revogar')
    } else {
      note(
        'Nenhuma permissão lembrada para revogar (esperado com fake CLI / seed vazio)',
        'P2',
        'Anvil',
        'Segundo cérebro → Permissões',
        await shot('40-sem-grant'),
        'grant + Revogar após Aprovações "Lembrar"',
        'lista vazia — precisa de um grant no host',
      )
      stepsOk.push('Segundo cérebro (vazio honesto)')
    }
  }

  const approvals = REAL_GALLERY_PANELS.find(p => p.slug === 'aprovacoes')!
  await tryNav(page, approvals, note, shot)
  await shot('41-aprovacoes')
  const remember = page.getByText(/Lembrar esta permissão/i)
  if (await remember.count() > 0) {
    await remember.first().click()
    await page.getByText(/Até eu revogar/i).first().click().catch(() => {})
    stepsOk.push('lembrar permissão na aprovação')
  }

  const importar = REAL_GALLERY_PANELS.find(p => p.slug === 'importar')!
  await tryNav(page, importar, note, shot)
  await shot('50-importar')
  const paste = page.getByPlaceholder(/colar|Uma colagem/i).first()
  if (await paste.count() > 0) {
    await paste.fill(BYC_PASTE)
    const organize = page.getByRole('button', { name: /Organizar|Revisar|Importar/i })
    if (await organize.count() > 0) await organize.first().click()
    await page.waitForTimeout(1_000)
    await shot('50-byc-colado')
    stepsOk.push('BYC colado em Importar')
  } else {
    note('Campo de colar BYC ausente em Importadores', 'P1', 'Lumen', 'Empresa → Importadores', await shot('50-byc-ausente'), 'placeholder de colagem', 'ausente')
  }

  const dms = REAL_GALLERY_PANELS.find(p => p.slug === 'dms')!
  await tryNav(page, dms, note, shot)
  await shot('60-dm')
  const subject = page.getByRole('button', { name: /Geral|Novo assunto|assunto/i })
  if (await subject.count() === 0) {
    note('Barra de assuntos da DM ausente', 'P1', 'Prism', 'Mensagens diretas', await shot('60-assuntos-ausente'), 'assunto Geral / Novo assunto', 'não achei')
  } else {
    await shot('60-assuntos')
    stepsOk.push('assuntos na DM')
  }

  const org = REAL_GALLERY_PANELS.find(p => p.slug === 'org-chart')!
  await tryNav(page, org, note, shot)
  await shot('70-quem-cuida')
  const surface = page.locator('[data-persona-surface="org-chart"]')
  if (await surface.count() === 0) {
    note('Quem cuida de quem não montou', 'P1', 'Lumen', 'Equipe → Quem cuida de quem', await shot('70-org-ausente'), '[data-persona-surface=org-chart]', 'ausente')
  } else {
    stepsOk.push('Quem cuida de quem')
  }
}

async function tryNav(
  page: Page,
  spec: (typeof REAL_GALLERY_PANELS)[number],
  note: NoteFn,
  shot: (n: string) => Promise<string>,
): Promise<void> {
  try {
    await navigateGalleryPanel(page, spec)
  } catch (navError: unknown) {
    note(
      `Navegação falhou: ${spec.slug}`,
      'P1',
      spec.owner === 'Muse' ? 'Prism' : spec.owner,
      `Rail → ${spec.navLabel}`,
      await shot(`nav-${spec.slug}-fail`),
      'painel visível',
      String(navError),
    )
    await page.getByRole('button', { name: spec.navLabel, exact: true }).first().click({ force: true }).catch(() => {})
  }
}

/**
 * @param findings - Bugs filed to owners.
 * @param stepsOk - Beats that landed.
 * @param home - Disposable PERSONA_HOME.
 * @param realCliUsed - Real model turns (cap 20).
 */
function writeAgenciaMarkdown(
  findings: readonly DogfoodFinding[],
  stepsOk: readonly string[],
  home: string,
  realCliUsed: number,
): void {
  const bugs = findings.filter(row => row.severity !== 'ok')
  const lines = [
    '# Dogfood #2 — Agência Ponto',
    '',
    `04/11 · Forge · host perfil \`persona\` em **dev** (não instalador). Home: \`${home.replace(/\\/g, '/')}\`. Execuções reais de CLI: **${String(realCliUsed)} / 20**.`,
    '',
    '## Escopo (Atlas)',
    'Gestor montando equipe (cartão de plano), quadros com sprint, Ensinar, Segundo cérebro com permissão lembrada + revogar, BYC colado, assuntos na DM, Quem cuida de quem.',
    '',
    '## App real — passos',
    ...stepsOk.map(step => `- ok: ${step}`),
    '',
    `## Bugs / donos (${String(bugs.length)})`,
    '',
  ]
  if (bugs.length === 0) lines.push('_Nenhum atrito neste passeio._', '')
  for (const row of bugs) {
    lines.push(
      `### ${row.id} — ${row.title}`,
      '',
      `- Severidade: **${row.severity}**`,
      `- Dono: **${row.owner}**`,
      `- Passos: ${row.steps}`,
      `- Captura: \`${row.capture}\``,
      `- Esperado: ${row.expected}`,
      `- Obtido: ${row.got}`,
      '',
    )
  }
  lines.push(
    '## Notas',
    '',
    '- Host e Chrome encerrados no `finally` (dispose).',
    '- Sem `PERSONA_REAL_TALK`: fake CLI no PATH. Um host por vez sob `with-lock`.',
    '- Engine walk (0 execs) continua em `packages/persona/persona-engine/tests/dogfood-agencia.spec.ts`.',
    '',
  )
  writeFileSync(REPORT, `${lines.join('\n')}\n`)
}
