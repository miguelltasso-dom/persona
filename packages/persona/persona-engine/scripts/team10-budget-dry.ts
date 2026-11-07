/**
 * ZERO model: the token budget of the real team round (TEAM-10), by counting. Inputs are MEASURED numbers (the CLI's own count of the tools a turn is offered,
 * `persona-runners/scripts/tools-overhead-dry.ts`; the answer-only base and the persona prompt cost of the real OPT-8b rounds; the image cost of the real round of
 * 04/11) and the prompts the product really builds. Nothing here calls a model.
 *
 *   node --import tsx/esm packages/persona/persona-engine/scripts/team10-budget-dry.ts
 */
import { workerPromptText, talkPromptTokens } from '../src/bench/token-faithful.ts'
import { FIXTURE_NINA } from '../src/bench/token-fixtures.ts'
import { reviewRequestFor } from '../src/review-step.ts'
import { IMAGE_COST_MEASURED, imageTokens } from '../src/ux/image-tokens.ts'

/** Measured on the real CLI (OPT-8b, haiku, answer-only): the direct call of a one-line prompt. */
const BASE_ANSWER_ONLY = 3_022 - 36
/** Vendor tokens per character of a Portuguese prompt (OPT-8b: +464 tokens for +1,152 characters). */
const CHARS_PER_VENDOR_TOKEN = 1_152 / 464
/** The CLI's own count of the tools a turn is offered (tools-overhead-dry, 2.1.318, 05/11). */
const TOOLS = { askOnly: 428, workerTeam: 2_540, reviewer: 773, workerTeamBoard: 2_865, all19: 6_240 }
/** Vendor tokens of a talk prompt: the engine's chars/4 estimate × 1.61 (the same pair, OPT-8b). */
const TALK_RATIO = 1.61

const worker = Math.round(workerPromptText(FIXTURE_NINA, true).length / CHARS_PER_VENDOR_TOKEN)
const talk = Math.round(talkPromptTokens(FIXTURE_NINA, 'Dê sua opinião sobre este cartaz de sábado. Rascunho: pão quente às 7h, bolo de fenda a R$ 12.') * TALK_RATIO)
const review = Math.round(reviewRequestFor({
  authorName: 'Teo', reviewerName: 'Lia', title: 'Cartaz do sábado', pass: 1,
  note: { done: ['cartaz com a chamada e o preço', 'versão 1500x1000'], needed: ['conferir a ortografia'], files: ['cartaz.png'], decisions: ['fundo claro'] },
}).length / CHARS_PER_VENDOR_TOKEN)
const image = imageTokens({ width: 1500, height: 1000 })
const imageMax = imageTokens(undefined)

const row = (label: string, parts: Record<string, [number, number]>): { label: string; min: number; max: number } => ({
  label, min: Object.values(parts).reduce((total, [low]) => total + low, 0), max: Object.values(parts).reduce((total, [, high]) => total + high, 0),
})

const requests = {
  // R1 of a worker Task turn that receives the poster: base + the tools of that turn + the worker prompt + persona + brief + the image
  workerFirst: row('worker, 1st request (Task with the poster)', { base: [BASE_ANSWER_ONLY, BASE_ANSWER_ONLY], tools: [TOOLS.askOnly, TOOLS.workerTeamBoard], prompt: [worker, worker], persona: [120, 320], brief: [150, 900], image: [image.min, imageMax.max] }),
  // a later request of the same turn: everything above plus the model's tool call and the tool's answer
  workerLater: row('worker, later request of the same turn', { base: [BASE_ANSWER_ONLY, BASE_ANSWER_ONLY], tools: [TOOLS.askOnly, TOOLS.workerTeamBoard], prompt: [worker, worker], persona: [120, 320], brief: [150, 900], image: [image.min, imageMax.max], toolCallAndResult: [250, 1_400] }),
  // an opinion reply of a colleague: a short talk turn with the draft AND the image, no tools
  opinionReply: row('opinion reply of a colleague (no tools, with the image)', { base: [BASE_ANSWER_ONLY, BASE_ANSWER_ONLY], talk: [talk, talk + 600], draft: [60, 400], image: [image.min, imageMax.max] }),
  // the consolidation: the asker's own turn, the replies, NO image
  consolidation: row('consolidation by the asker (the replies, no image)', { base: [BASE_ANSWER_ONLY, BASE_ANSWER_ONLY], tools: [TOOLS.askOnly, TOOLS.workerTeam], prompt: [worker, worker], persona: [120, 320], replies: [3 * 30, 5 * 150], draft: [60, 400] }),
  reviewer: row('reviewer (the bilhete, no image)', { base: [BASE_ANSWER_ONLY, BASE_ANSWER_ONLY], tools: [TOOLS.reviewer, TOOLS.reviewer + TOOLS.askOnly - 428], prompt: [worker, worker], persona: [120, 320], bilhete: [review, review + 500] }),
}

const out = {
  measuredInputs: { baseAnswerOnly: BASE_ANSWER_ONLY, workerPromptTokens: worker, talkPromptTokens: talk, reviewRequestTokens: review, image1500x1000: image, imageUnknownSize: imageMax, imageBasis: IMAGE_COST_MEASURED.basis, tools: TOOLS },
  requests,
  // A TEAM round of 12 turns: 3 Tasks (one per persona) + 1 opinion round (3 replies + 1 consolidation) + 2 reviews + 2 follow-ups of a worker.
  turns12: (() => {
    const worker3 = { turns: 3, requestsEach: [1, 3] as const }
    const total = (name: keyof typeof requests, count: number, perTurnRequests: readonly [number, number], first?: keyof typeof requests): { min: number; max: number } => {
      const a = requests[first ?? name]
      const later = requests[name]
      return {
        min: count * (a.min + (perTurnRequests[0] - 1) * later.min),
        max: count * (a.max + (perTurnRequests[1] - 1) * later.max),
      }
    }
    const parts = {
      workers: total('workerLater', 3, worker3.requestsEach, 'workerFirst'),
      followUps: total('workerLater', 2, [1, 3], 'workerFirst'),
      opinionReplies: total('opinionReply', 3, [1, 1]),
      consolidation: total('consolidation', 1, [1, 1]),
      reviews: total('reviewer', 2, [1, 1]),
    }
    const sum = (key: 'min' | 'max'): number => Object.values(parts).reduce((all, part) => all + part[key], 0)
    return { turns: 11, parts, totalInputMin: sum('min'), totalInputMax: sum('max') }
  })(),
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
