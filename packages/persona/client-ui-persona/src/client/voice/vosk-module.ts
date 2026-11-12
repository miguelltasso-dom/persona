/**
 * Item 20: the vosk-browser surface in its own module, so the ~5.8 MB WASM build arrives only when someone asks for a transcript.
 * A relative dynamic import is what the client bundle turns into a `require.async` chunk; a bare package specifier is not.
 */

export { createModel } from 'vosk-browser'
