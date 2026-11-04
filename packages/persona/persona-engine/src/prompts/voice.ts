/**
 * Shared persona voice: fields → prompt chrome for channel / DM / talk / handoff.
 * Engine-owned copy is locale-owned (pt / en). No fixed persona names (D-043).
 */

import { composePrompt, type PromptIdentity } from './templates.ts'
import { capTalkContext, wrapAsData, type TalkColleague } from './talk.ts'

/** Engine chrome locale. */
export type EngineLocale = 'pt' | 'en'

/** Surface that must carry the same voice block. */
export type VoiceSurface = 'channel' | 'dm' | 'talk' | 'handoff'

/** Labels and owner-norm sentences the engine owns. */
export interface EngineCopy {
  language: string
  function: string
  personality: string
  instructions: string
  sector: string
  colleagues: string
  alone: string
  undefined: string
  undefinedPlural: string
  none: string
  capabilities: string
  vault: string
  ownerNorms: string
  ownerNormsBody: string
  channelHint: string
  dmHint: string
  handoffHint: string
}

/** pt-BR and English chrome. Template bodies in {@link composePrompt} stay pt-BR. */
export const ENGINE_COPY: Record<EngineLocale, EngineCopy> = {
  pt: {
    language: 'Idioma',
    function: 'Função nesta conversa',
    personality: 'Personalidade',
    instructions: 'Instruções da persona',
    sector: 'Setor',
    colleagues: 'Colegas (só estes existem; não invente nome)',
    alone: '(você está só)',
    undefined: '(não definida)',
    undefinedPlural: '(não definidas)',
    none: '(nenhum)',
    capabilities: 'O que esta conversa pode',
    vault: 'Cofre e memória autorizados',
    ownerNorms: 'Normas de dono',
    ownerNormsBody: 'Termine. Verifique. Relate com evidência. Proponha o próximo passo. Não devolva ao humano o que o mandato já cobre.',
    channelHint: 'Responda no canal na voz desta persona.',
    dmHint: 'Responda na DM na voz desta persona.',
    handoffHint: 'Ao passar a Tarefa, mantenha a voz desta persona e entregue objetivo, evidência e próxima ação.',
  },
  en: {
    language: 'Language',
    function: 'Function in this conversation',
    personality: 'Personality',
    instructions: 'Persona instructions',
    sector: 'Sector',
    colleagues: 'Colleagues (only these exist; do not invent a name)',
    alone: '(you are alone)',
    undefined: '(undefined)',
    undefinedPlural: '(undefined)',
    none: '(none)',
    capabilities: 'What this conversation can do',
    vault: 'Authorized vault and memory',
    ownerNorms: 'Owner norms',
    ownerNormsBody: 'Finish. Verify. Report with evidence. Propose the next step. Do not hand back work the mandate already covers.',
    channelHint: 'Reply in the channel in this persona voice.',
    dmHint: 'Reply in the DM in this persona voice.',
    handoffHint: 'When handing off, keep this persona voice and deliver goal, evidence, and next action.',
  },
}

/**
 * Map a BCP-47 tag onto {@link EngineLocale}.
 * @param locale - `pt-BR`, `en`, or omitted (pt).
 */
export function resolveEngineLocale(locale?: string): EngineLocale {
  if (locale !== undefined && locale.toLowerCase().startsWith('en')) return 'en'
  return 'pt'
}

/**
 * @param locale - Raw locale tag.
 */
export function engineCopyOf(locale?: string): EngineCopy {
  return ENGINE_COPY[resolveEngineLocale(locale)]
}

/** Fields that define one persona's voice. Display name only. */
export interface PersonaVoiceFields {
  identity: PromptIdentity
  personality: string
  instructions: string
  functionLabel: string
  vault: string
  sector?: string
  locale?: string
  colleagues?: readonly TalkColleague[]
  capabilities?: string
  contextLimit?: number
}

/**
 * Stable voice key. Same persona → same key; different fields → different key.
 * @param fields - Identity and tone fields.
 */
export function voiceFingerprint(fields: PersonaVoiceFields): string {
  return [
    fields.identity.name,
    fields.identity.title,
    fields.personality,
    fields.instructions,
    fields.sector ?? '',
    fields.functionLabel,
  ].map(part => part.trim().toLowerCase()).join('|')
}

/**
 * Shared policy lines (personality, instructions, vault, owner norms).
 * @param fields - Voice fields.
 */
export function composeVoicePolicy(fields: PersonaVoiceFields): string {
  const copy = engineCopyOf(fields.locale)
  const localeLabel = fields.locale ?? (resolveEngineLocale(fields.locale) === 'en' ? 'en' : 'pt-BR')
  const team = (fields.colleagues ?? [])
    .map((row) => {
      const role = row.role === undefined || row.role === '' ? '' : `, ${row.role}`
      return `- ${row.name} (${row.title}${role})`
    })
    .join('\n')
  const context = capTalkContext(fields.vault, fields.contextLimit)
  const lines = [
    `${copy.language}: ${localeLabel}`,
    `${copy.function}: ${fields.functionLabel}`,
    `${copy.personality}: ${fields.personality === '' ? copy.undefined : fields.personality}`,
    `${copy.instructions}: ${fields.instructions === '' ? copy.undefinedPlural : fields.instructions}`,
  ]
  if (fields.sector !== undefined && fields.sector !== '') {
    lines.push(`${copy.sector}: ${fields.sector}`)
  }
  lines.push(
    `${copy.colleagues}:`,
    team === '' ? copy.alone : team,
    `${copy.capabilities}: ${fields.capabilities ?? copy.none}`,
    `${copy.vault}:`,
    context === '' ? copy.none : context,
    `${copy.ownerNorms}: ${copy.ownerNormsBody}`,
  )
  return lines.join('\n')
}

/**
 * Surface hint that does not change the voice fingerprint.
 * @param surface - Channel, DM, talk, or handoff.
 * @param locale - Chrome locale.
 */
export function voiceSurfaceHint(surface: VoiceSurface, locale?: string): string {
  const copy = engineCopyOf(locale)
  if (surface === 'channel') return copy.channelHint
  if (surface === 'dm') return copy.dmHint
  if (surface === 'handoff') return copy.handoffHint
  return ''
}

export interface ComposePersonaPromptInput {
  fields: PersonaVoiceFields
  surface: VoiceSurface
  userText?: string
  attachments?: readonly string[]
}

/**
 * Compose one surface. Voice fields are identical across channel / DM / handoff.
 * @param input - Fields + surface + optional user data.
 */
export function composePersonaPrompt(input: ComposePersonaPromptInput): string {
  const part = input.surface === 'handoff' ? 'handoff' : 'talk'
  const hint = voiceSurfaceHint(input.surface, input.fields.locale)
  const policy = hint === ''
    ? composeVoicePolicy(input.fields)
    : `${hint}\n${composeVoicePolicy(input.fields)}`
  const base = composePrompt({
    part,
    identity: input.fields.identity,
    policy,
  }).trimEnd()
  if (input.surface === 'handoff' || input.userText === undefined) return base
  const attachments = (input.attachments ?? [])
    .map((item, index) => wrapAsData(`anexo-${String(index + 1)}`, item))
    .join('\n\n')
  const user = wrapAsData('mensagem', input.userText)
  return attachments === '' ? `${base}\n\n${user}` : `${base}\n\n${attachments}\n\n${user}`
}
