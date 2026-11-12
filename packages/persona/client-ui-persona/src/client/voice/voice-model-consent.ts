/**
 * Item 20 (Muse §3): the voice model is downloaded only after the person presses "Baixar agora". The consent lives on this machine,
 * next to the other shell preferences; the Host never starts the download on its own.
 */

const CONSENT_KEY = 'persona.voice.modelConsent'

/** The storage the consent lives in; absent when the window has none (tests, server rendering). */
const STORAGE: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage

/**
 * Whether the person already agreed to the one-time voice model download.
 * @param storage - Injected for tests; defaults to `localStorage`.
 * @returns True after {@link grantVoiceModelConsent}.
 */
export function voiceModelConsentGranted(storage: Storage | undefined = STORAGE): boolean {
  return storage?.getItem(CONSENT_KEY) === 'granted'
}

/**
 * Record the person's consent, so the card is not shown again.
 * @param storage - Injected for tests; defaults to `localStorage`.
 */
export function grantVoiceModelConsent(storage: Storage | undefined = STORAGE): void {
  storage?.setItem(CONSENT_KEY, 'granted')
}
