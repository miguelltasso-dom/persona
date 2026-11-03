/** Classify and refuse DeepSeek collector / account / download hosts (A3b / D-016). */

const DEEPSEEK_HOST = /(?:^|\.)deepseek(?:svc)?\.com$/iu

/**
 * Whether a URL would talk to a DeepSeek product, telemetry, or download host.
 * @param value - absolute URL or hostname.
 */
export function isDeepSeekHost(value: string): boolean {
  try {
    const host = value.includes('://') ? new URL(value).hostname : value
    return DEEPSEEK_HOST.test(host)
  } catch {
    return /deepseek/iu.test(value)
  }
}

/** Hosts the Persona desktop must never contact. */
export const KNOWN_DEEPSEEK_ENDPOINTS = [
  'https://dsh-otel-collector.deepseeksvc.com/v1/logs',
  'https://platform.deepseek.com/usage',
  'https://download.deepseek.com/desktop/latest',
] as const

/** Allowlisted control URLs used to prove the request filter is not a blanket cancel. */
export const PERSONA_ALLOWED_PROBE_ENDPOINTS = [
  'https://api.anthropic.com/v1/messages',
  'https://api.openai.com/v1/chat/completions',
  'https://127.0.0.1:3080/health',
] as const

/**
 * Decide whether the desktop session may continue a URL.
 * @param url - absolute request URL captured from `webRequest.onBeforeRequest`.
 * @returns `cancel` for DeepSeek hosts, otherwise `allow`.
 */
export function decideDesktopRequest(url: string): 'cancel' | 'allow' {
  return isDeepSeekHost(url) ? 'cancel' : 'allow'
}
