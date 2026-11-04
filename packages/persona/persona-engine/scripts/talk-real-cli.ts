/**
 * Talk-eval real CLI: ≤4 haiku. Always cancel/dispose + timeout + tree kill.
 * Run: PERSONA_REAL_TALK=1 pnpm exec tsx packages/persona/persona-engine/scripts/talk-real-cli.ts
 */

import { disposeRunnerSessions, resolveRunner } from '@deepseek-ai/dsh-persona-runners'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TALK_EVAL_SCENARIOS,
  TALK_REAL_LIMIT,
  collectTurnText,
  decideTalkFake,
  reviewLooksLikeCredential,
  redactSecrets,
  scoreTalkReply,
  talkEvalPrompt,
} from '../src/index.ts'
import {
  COORD_REAL_TOTAL_MS,
  COORD_REAL_TURN_MS,
  installProcessGuards,
  killProcessTree,
  runSessionTurn,
  shutdownCoordRunner,
  withTimeout,
} from '../src/bench/coord-real-lifecycle.ts'

const CLI = 'claude'
const MODEL = 'haiku'
const PERMISSION = 'deny' as const

const fields = {
  identity: { name: 'Luna', title: 'Coordenação' },
  personality: 'Discreta e atenta.',
  instructions: 'Uma pergunta por vez.',
  functionLabel: 'coordenação',
  vault: 'Standup às 10h. Lilás é a cor oficial.',
  capabilities: 'resposta de conversa; sem ferramentas',
}

const live: { runner: { dispose?: () => Promise<void> } | undefined } = { runner: undefined }

async function shutdownAll(): Promise<void> {
  await shutdownCoordRunner(live.runner, disposeRunnerSessions)
  live.runner = undefined
}

async function main(): Promise<void> {
  if (process.env.PERSONA_REAL_TALK !== '1') {
    console.error('set PERSONA_REAL_TALK=1')
    process.exit(2)
  }
  const unguard = installProcessGuards({
    shutdown: shutdownAll,
    killTree: () => {
      killProcessTree(process.pid)
    },
  })
  const runner = await resolveRunner({
    spec: { kind: 'cli', cli: CLI, model: MODEL },
    permissionMode: PERMISSION,
    autonomy: 'act',
  })
  live.runner = runner
  try {
    const rows = TALK_EVAL_SCENARIOS.slice(0, TALK_REAL_LIMIT)
    const cells = await withTimeout(COORD_REAL_TOTAL_MS, (async () => {
      const out: Array<{
        id: string
        class: string
        ok: boolean
        echo: boolean
        placeholder: boolean
        useful: boolean
        fakeOk: boolean
        excerpt: string
      }> = []
      for (const scenario of rows) {
        const raw = await runSessionTurn(
          runner,
          {
            ticketId: `talk-${scenario.id}`,
            assignmentId: 'talk-eval',
            personaId: 'luna',
            cwd: process.cwd(),
            prompt: talkEvalPrompt(scenario, fields),
            model: MODEL,
            permissionMode: PERMISSION,
          },
          collectTurnText,
          COORD_REAL_TURN_MS,
        )
        const text = reviewLooksLikeCredential(raw) ? redactSecrets(raw).text : raw
        const score = scoreTalkReply(text, scenario)
        const fake = decideTalkFake(scenario)
        console.log(`${scenario.id} realOk=${String(score.ok)} echo=${String(score.echo)} fakeOk=${String(scoreTalkReply(fake, scenario).ok)}`)
        out.push({
          id: scenario.id,
          class: scenario.class,
          ok: score.ok,
          echo: score.echo,
          placeholder: score.placeholder,
          useful: score.useful,
          fakeOk: scoreTalkReply(fake, scenario).ok,
          excerpt: text.length > 180 ? `${text.slice(0, 180)}…` : text,
        })
      }
      return out
    })(), async () => {
      await shutdownAll()
      killProcessTree(process.pid)
    })
    const report = {
      cli: CLI,
      model: MODEL,
      n: cells.length,
      correct: cells.filter(cell => cell.ok).length,
      fakeCorrect: cells.filter(cell => cell.fakeOk).length,
      cells,
    }
    const outPath = resolve('persona-spec/reports/talk-eval-real.json')
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report))
  } finally {
    unguard()
    await shutdownAll()
  }
}

void main().catch(async (error: unknown) => {
  await shutdownAll()
  killProcessTree(process.pid)
  const message = error instanceof Error ? error.message : String(error)
  console.error(reviewLooksLikeCredential(message) ? '[redacted]' : message)
  process.exit(1)
})
