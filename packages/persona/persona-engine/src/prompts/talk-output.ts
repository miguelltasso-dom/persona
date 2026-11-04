/**
 * Talk turn: cache-stable prefix + lean reply (OPT-3 / OPT-6).
 * {@link composeTalkPrompt} stays the snapshot path; host should prefer this.
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { refuseHesitantOffer } from '../continue.ts'
import { countWords, leanChannelReply } from '../lean-output.ts'
import { composeTurnPrompt, type StablePrefix } from './stable-prefix.ts'
import { TALK_CONTEXT_LIMIT, capTalkContext, wrapAsData, type TalkPromptInput } from './talk.ts'
import { composePersonaPrompt, voiceSurfaceHint, type ComposePersonaPromptInput } from './voice.ts'

/**
 * Identity / voice / capabilities stay in the prefix. Context and the user
 * line stay in the variable tail so the cache does not break every message.
 * @param input - Same fields as {@link composeTalkPrompt}.
 * @returns Prefix + variable tail + full text.
 */
export function composeTalkStable(input: TalkPromptInput): StablePrefix & { readonly text: string } {
  const colleagues = input.colleagues
    .map((row) => {
      const role = row.role === undefined || row.role === '' ? '' : `, ${row.role}`
      return `- ${row.name} (${row.title}${role})`
    })
    .join('\n')
  return composeTurnPrompt({
    fields: {
      identity: input.identity,
      personality: input.personality,
      instructions: input.instructions,
      functionLabel: input.functionLabel,
      vault: '',
      capabilities: input.capabilities,
    },
    part: 'talk',
    tools: [],
    required: input.sector ?? '',
    ...(colleagues === '' ? {} : { subject: colleagues }),
    recall: capTalkContext(input.context, input.contextLimit ?? TALK_CONTEXT_LIMIT),
    message: input.userText,
  })
}

/**
 * Channel reply after the model: no echo, no step narration, 100-word cap.
 * @param modelText - Raw model output.
 * @param userText - Last human line.
 * @returns Lean channel text.
 */
export function finalizeTalkReply(modelText: string, userText: string): string {
  return leanChannelReply(modelText, userText)
}

/**
 * Channel / DM / talk surface with a cache-stable prefix. Vault + sector stay
 * in `required`. The user line and attachments stay in the tail.
 * {@link composePersonaPrompt} stays the snapshot path.
 * @param input - Same fields as {@link composePersonaPrompt}.
 * @returns Prefix + variable tail + full text.
 */
export function composePersonaStable(input: ComposePersonaPromptInput): StablePrefix & { readonly text: string } {
  return composeHostTalk(input)
}

export interface HostTalkUsedRow {
  readonly id?: string
  readonly kind: string
  readonly body: string
  readonly required: boolean
  readonly restricted: boolean
}

export interface HostTalkUsedFold {
  readonly required: string
  readonly subject: string
  readonly recall: string
}

/**
 * Same fold the host talkLayers used: required vault, subject summary, recall.
 * @param used - Compiled "Contexto usado" rows.
 * @returns Slices for {@link composeHostTalk}.
 */
export function foldHostTalkUsed(used: readonly HostTalkUsedRow[]): HostTalkUsedFold {
  const required = used
    .filter(row => row.required && !row.restricted && row.body !== '')
    .slice()
    .sort((left, right) => (left.id ?? left.kind).localeCompare(right.id ?? right.kind))
    .map(row => `${row.kind}: ${row.body}`)
    .join('\n')
  const subject = used
    .filter(row => row.kind === 'subject_summary' && row.body !== '')
    .map(row => row.body)
    .join('\n')
  const recall = used
    .filter(row => !row.required && !row.restricted && row.body !== '' && row.kind !== 'subject_summary')
    .map(row => `${row.kind}: ${row.body}`)
    .join('\n')
  return { required, subject, recall }
}

export interface HostTalkInput extends ComposePersonaPromptInput {
  readonly required?: string
  readonly subject?: string
  readonly recall?: string
}

export type HostTalkCompose = StablePrefix & { readonly text: string }

/**
 * Host talk path (OPT-3): colleagues stay in the prefix; required vault,
 * subject summary and recall stay in the tail with the user line.
 * @param input - Voice fields plus optional host slices.
 * @returns Prefix (cacheable) and variable tail.
 */
export function composeHostTalk(input: HostTalkInput): HostTalkCompose {
  const hint = voiceSurfaceHint(input.surface, input.fields.locale)
  const required = [input.required ?? input.fields.vault, input.fields.sector ?? '', hint]
    .map(part => part.trim())
    .filter(part => part !== '')
    .join('\n\n')
  const attachments = (input.attachments ?? [])
    .map((item, index) => wrapAsData(`anexo-${String(index + 1)}`, item))
    .join('\n\n')
  const user = input.userText === undefined ? '' : wrapAsData('mensagem', input.userText)
  const message = [attachments, user].filter(part => part !== '').join('\n\n')
  return composeTurnPrompt({
    fields: {
      identity: input.fields.identity,
      personality: input.fields.personality,
      instructions: input.fields.instructions,
      functionLabel: input.fields.functionLabel,
      vault: '',
      ...(input.fields.colleagues === undefined ? {} : { colleagues: input.fields.colleagues }),
      ...(input.fields.capabilities === undefined ? {} : { capabilities: input.fields.capabilities }),
    },
    part: input.surface === 'handoff' ? 'coordinator' : 'talk',
    tools: [],
    required,
    ...(input.subject === undefined || input.subject === '' ? {} : { subject: input.subject }),
    ...(input.recall === undefined || input.recall === '' ? {} : { recall: input.recall }),
    ...(message === '' ? {} : { message }),
  })
}

/**
 * After the model: lean channel + no hedge when the work is in the mandate.
 * @param modelText - Raw model output.
 * @param userText - Last human line.
 * @param withinMandate - Offered follow-up is already authorized.
 * @returns Text for the channel.
 */
export function finishHostTalk(modelText: string, userText: string, withinMandate = true): string {
  return refuseHesitantOffer(finalizeTalkReply(modelText, userText), withinMandate)
}

export interface LeanVsNaiveReport {
  readonly naiveTokens: number
  readonly stableTokens: number
  readonly prefixHasUser: boolean
  readonly naiveWords: number
  readonly leanWords: number
}

/**
 * Scripted OPT-3/OPT-6 saving vs the snapshot prompt + raw model echo.
 * @returns Token and word counts. Not the OPT-8 −40% gate.
 */
export function measureLeanVsNaive(): LeanVsNaiveReport {
  const fields = {
    identity: { name: 'Atlas', title: 'Coordenação' },
    personality: 'Calmo.',
    instructions: 'Despache.',
    functionLabel: 'coordenação',
    vault: 'Lilás é a cor oficial.',
    sector: 'Operações',
    capabilities: 'resposta de conversa',
  }
  const userText = 'status do quadro agora?'
  const naive = composePersonaPrompt({ fields, surface: 'talk', userText })
  const stable = composePersonaStable({ fields, surface: 'talk', userText })
  const model = `${userText}\nVou agora abrir o quadro.\nPronto: 3 cards. Posso fazer o e2e se você quiser.`
  const lean = finishHostTalk(model, userText, true)
  return {
    naiveTokens: estimateTokens(naive),
    stableTokens: estimateTokens(stable.text),
    prefixHasUser: stable.prefix.toLowerCase().includes(userText.toLowerCase()),
    naiveWords: countWords(model),
    leanWords: countWords(lean),
  }
}
