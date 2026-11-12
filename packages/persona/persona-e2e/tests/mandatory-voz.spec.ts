/**
 * Item 20 (voz) NO APP DE VERDADE (web, host real, Chrome com microfone de mentira, CLI de mentira: 0 IA) — a Colheita-S1 P1-03 (Carbon): o transcritor REAL (Vosk em Worker, o modelo vem do Host).
 *   Gravar uma fala de fixture → "Enviar áudio" → o app TRANSCREVE antes de enviar → o que vai ao fio é uma mensagem com o TEXTO da fala e o áudio anexado; NUNCA corpo vazio (sem transcrição nada é postado e o app avisa).
 *
 * Modelo: PRÉ-SEMEADO em `<PERSONA_HOME>/runtime/stt/vosk-model-small-pt-0.3/model.tar.gz` (o arquivo oficial, conferido contra o sha256 FIXADO; a rede não entra). `PERSONA_VOICE_DOWNLOAD=1` faz a rodada de
 * DOWNLOAD REAL (sem semear: o modelo é baixado no 1º uso de verdade, ~32 MB, precisa de rede). O manifesto de componentes vem de `scripts/persona/gen-components-json.mjs` (o web host aponta `DSH_COMPONENTS_MANIFEST`).
 * O microfone é o do Chromium (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`), a fala é uma fixture pt-BR de ~6 s (Windows "Maria", `fixtures/voice/fala-pt.wav`).
 *
 * LIMITE (dito de propósito): a CSP do Electron (D-114: media-src blob, wasm) não existe no web host; o que este spec prova é o PIPELINE (modelo do Host → Worker → texto → mensagem). A CSP do desktop é do
 * `real-desktop-app`/instalado. Opt-in `PERSONA_E2E=1`. Comando: `PERSONA_E2E=1 node scripts/persona/with-lock.mjs "probe e2e voz" --lock build -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-voz.spec.ts`
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VOICE_MODEL_ENTRY } from '../../persona-components/src/voice-model.ts'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { PACKAGE_ROOT, REPO_ROOT } from '../src/paths.ts'
import { ensureGeralComposer, openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'
import { channelMessages, until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'
const download = process.env.PERSONA_VOICE_DOWNLOAD === '1'
/** The official archive, already on this machine (Zinc 12/11) — the same bytes the pinned URL serves. */
const ARCHIVE = process.env.PERSONA_VOICE_MODEL_ARCHIVE ?? join(REPO_ROOT, '.maestri', 'tmp', 'zinc', 'voice', 'model-official.tar.gz')
const WAV = join(PACKAGE_ROOT, 'fixtures', 'voice', 'fala-pt.wav')
/** What the fixture says: "Bom dia. Quero dois pães de queijo para amanhã." Small model, synthetic voice: the transcript must hold at least this many of the words. */
const WORDS = ['bom', 'dia', 'quero', 'dois', 'queijo', 'amanha'] as const
const MIN_WORDS = 3

const plain = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** O veredito, PURO: o que a mensagem de voz postada tem de errado (vazio = certo). */
export function voiceMessageProblems(message: { readonly body: string; readonly attachmentIds?: readonly string[] | undefined } | undefined): string[] {
  if (message === undefined) return ['nenhuma mensagem de voz chegou ao fio']
  const out: string[] = []
  if (message.body.trim() === '') out.push('a mensagem de voz foi postada com o corpo VAZIO (a persona responderia sem ter ouvido nada)')
  if ((message.attachmentIds?.length ?? 0) === 0) out.push('a mensagem de voz não leva o áudio anexado')
  const heard = WORDS.filter(word => plain(message.body).includes(word))
  if (message.body.trim() !== '' && heard.length < MIN_WORDS) out.push(`a transcrição não bate com a fala: "${message.body.slice(0, 120)}" (ouvi ${String(heard.length)} de ${String(WORDS.length)} palavras, preciso de ${String(MIN_WORDS)})`)
  return out
}

describe('voz — veredito da mensagem (puro)', () => {
  it('texto com as palavras da fala e o áudio passa; corpo vazio, sem áudio ou outra fala são acusados, cada um sozinho', () => {
    expect(voiceMessageProblems({ body: 'bom dia quero dois pães de queijo para amanhã', attachmentIds: ['a1'] })).toEqual([])
    expect(voiceMessageProblems({ body: 'bom dia quero dois', attachmentIds: ['a1'] })).toEqual([]) // the small model drops words: 3 of 6 is enough
    expect(voiceMessageProblems({ body: '', attachmentIds: ['a1'] })).toHaveLength(1)
    expect(voiceMessageProblems({ body: 'bom dia quero dois pães', attachmentIds: [] })).toHaveLength(1)
    expect(voiceMessageProblems({ body: 'o relatório de vendas de ontem', attachmentIds: ['a1'] })).toHaveLength(1)
    expect(voiceMessageProblems(undefined)).toHaveLength(1)
  })
})

describe.skipIf(!run).sequential(`voz no app real (${download ? 'DOWNLOAD REAL do modelo' : 'modelo pré-semeado'})`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'mandatory-voz-'))
  const home = join(dir, 'home')
  let session: RealPersonaSession
  let tenant: V11Tenant

  beforeAll(async () => {
    expect(existsSync(WAV), `a fala de fixture não existe: ${WAV}`).toBe(true)
    const manifest = join(dir, 'components.json')
    execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'persona', 'gen-components-json.mjs'), '--out', manifest], { cwd: REPO_ROOT, stdio: 'ignore' })
    if (!download) {
      expect(existsSync(ARCHIVE), `o arquivo do modelo não existe: ${ARCHIVE} (PERSONA_VOICE_MODEL_ARCHIVE)`).toBe(true)
      expect(createHash('sha256').update(readFileSync(ARCHIVE)).digest('hex'), 'o modelo pré-semeado não é o arquivo oficial fixado').toBe(VOICE_MODEL_ENTRY.sha256)
      const target = join(home, 'runtime', 'stt', VOICE_MODEL_ENTRY.version)
      mkdirSync(target, { recursive: true })
      copyFileSync(ARCHIVE, join(target, 'model.tar.gz'))
    }
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      home,
      hostEnv: { DSH_COMPONENTS_MANIFEST: manifest },
      browserArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${WAV}`],
      permissions: ['microphone'],
    })
    await session.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    const written = await until(session.page, async () => (await session.page.evaluate(() => localStorage.getItem('persona.tenant.v1'))) ?? undefined, 60_000, 500)
    expect(written, 'o app não gravou o tenant').toBeDefined()
    tenant = await v11Tenant(session.page)
    await ensureGeralComposer(session.page)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
    rmSync(dir, { recursive: true, force: true })
  }, 120_000)

  it('OBSERVAÇÃO: o Host diz o estado do modelo e o microfone aparece no composer vazio do #geral', async () => {
    const state = await hostRpcOk<{ state: string; version?: string }>(session.page, 'voiceModelState')
    expect(state.state, `o Host devia dizer ${download ? 'absent (baixável)' : 'installed (pré-semeado)'}: ${JSON.stringify(state)}`).toBe(download ? 'absent' : 'installed')
    await session.page.getByRole('button', { name: 'Gravar áudio' }).waitFor({ state: 'visible', timeout: 30_000 })
  }, 90_000)

  it('gravar a fala, "Enviar áudio": o fio recebe UMA mensagem com o TEXTO da fala e o áudio anexado — nunca vazia', async () => {
    const { page } = session
    const before = (await channelMessages(page, tenant)).length
    await page.getByRole('button', { name: 'Gravar áudio' }).click()
    await page.getByRole('button', { name: 'Enviar áudio' }).waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(7_000) // the fixture is ~6 s: the whole sentence is recorded before sending
    await page.getByRole('button', { name: 'Enviar áudio' }).click()
    if (download) await page.getByText('Baixando o ouvido da Persona (1ª vez)…').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined)
    const posted = await until(page, async () => (await channelMessages(page, tenant)).slice(before).find(message => (message.attachmentIds?.length ?? 0) > 0), download ? 360_000 : 150_000, 1_000)
    const mine = posted === undefined ? undefined : { body: posted.body, attachmentIds: posted.attachmentIds }
    if (posted === undefined) {
      // Nothing was posted: say WHY (the warning on screen, the model state, the console) and keep a capture, so the failure explains itself.
      mkdirSync(join(PACKAGE_ROOT, 'artifacts', 'voz'), { recursive: true })
      await page.screenshot({ path: join(PACKAGE_ROOT, 'artifacts', 'voz', 'nada-postado.png') }).catch(() => undefined)
      const why = {
        avisoNaTela: await page.getByText('Não consegui transcrever o áudio agora').count(),
        baixando: await page.getByText('Baixando o ouvido da Persona').count(),
        modelo: await hostRpcOk<{ state: string }>(page, 'voiceModelState').catch((error: unknown) => String(error)),
        consoleErrors: session.tripwire.consoleErrors.slice(-5),
        pageErrors: session.tripwire.pageErrors.slice(-5),
      }
      expect(why, 'nenhuma mensagem de voz chegou ao fio (o porquê)').toEqual({ avisoNaTela: 0 })
    }
    expect(voiceMessageProblems(mine), JSON.stringify(mine)).toEqual([])
    // the app did not warn that it could not transcribe
    expect(await page.getByText('Não consegui transcrever o áudio agora').count()).toBe(0)
  }, 480_000)

  it('NUNCA vazio: nenhuma mensagem com áudio e corpo vazio no fio, e nenhuma violação de CSP no console', async () => {
    const messages = await channelMessages(session.page, tenant)
    const empty = messages.filter(message => (message.attachmentIds?.length ?? 0) > 0 && message.body.trim() === '')
    expect(empty.map(message => message.id), 'há mensagem de voz com corpo vazio').toEqual([])
    const csp = session.tripwire.consoleErrors.filter(line => /Content Security Policy|CSP/iu.test(line))
    expect(csp, 'violação de CSP no console').toEqual([])
    if (download) expect((await hostRpcOk<{ state: string }>(session.page, 'voiceModelState')).state, 'depois do download o modelo devia estar instalado').toBe('installed')
  }, 60_000)
})
