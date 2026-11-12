/**
 * The owner's speech register (harvest item 4), kept per project as one small screen document. Simple until the owner says otherwise,
 * and said in plain words in the conversation ("fala mais simples", "pode ser técnico"): no setting to hunt for, no model call to read it.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { SpeechStyle } from './speech.ts'

const KIND = 'speech_style'
const DOC = 'owner'
/** A request to change the register is a short line; a long message that happens to say "técnico" is work, not a setting. */
const REQUEST_LIMIT = 140

const WANTS_SIMPLE = /\b(?:(?:mais|bem|bom|t[aã]o)\s+simples|sem\s+jarg[aã]o|sem\s+(?:termos?|palavras?)\s+t[eé]cnic\w*|em\s+portugu[eê]s\s+simples|linguagem\s+simples|fala\s+como\s+gente|explica\s+como\s+pra\s+leigo)\b/iu
const WANTS_TECHNICAL = /\b(?:(?:pode|quero|prefiro|manda|mande|fala|fale|vai)\s+(?:ser\s+)?(?:mais\s+)?t[eé]cnic[oa]s?|(?:com|quero|mande|manda)\s+(?:os\s+)?detalhes?\s+t[eé]cnic\w*|modo\s+t[eé]cnico|pode\s+usar\s+(?:termos?|palavras?)\s+t[eé]cnic\w*)\b/iu

/**
 * Whether a person's line asks to change how the team talks.
 * @param text - The person's message.
 * @returns The register asked for, or undefined when the line is not such a request.
 */
export function styleRequestOf(text: string): SpeechStyle | undefined {
  const line = text.trim()
  if (line === '' || line.length > REQUEST_LIMIT) return undefined
  const technical = WANTS_TECHNICAL.test(line)
  const simple = WANTS_SIMPLE.test(line)
  if (technical === simple) return undefined // neither, or both (a contradiction is not a request)
  return technical ? 'technical' : 'simple'
}

/**
 * @param screens - The host's screen documents.
 * @param projectId - Tenant.
 * @returns The stored register; simple when none was ever chosen.
 */
export function readSpeechStyle(screens: ScreenRepos, projectId: string): SpeechStyle {
  const stored = screens.get<{ readonly style?: unknown }>(projectId, KIND, DOC)
  return stored?.style === 'technical' ? 'technical' : 'simple'
}

/**
 * @param screens - The host's screen documents.
 * @param projectId - Tenant.
 * @param style - The register to keep.
 */
export function saveSpeechStyle(screens: ScreenRepos, projectId: string, style: SpeechStyle): void {
  if (readSpeechStyle(screens, projectId) === style && screens.get(projectId, KIND, DOC) !== undefined) return
  screens.put(projectId, KIND, DOC, { style })
}
