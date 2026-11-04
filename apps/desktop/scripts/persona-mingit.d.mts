/** Immutable upstream Git for Windows archive and its SHA-256 digest. */
export const MINGIT_ARCHIVE: string
export const MINGIT_SHA256: string

/**
 * Verify and extract the portable Git archive into the packaged resources.
 * @param resources - Packaged resource directory.
 * @param env - Optional packaging cache directory.
 * @returns Resolves after the full distribution is extracted; rejects on download or integrity failure.
 */
export function installPersonaMinGit(resources: string, env?: NodeJS.ProcessEnv): Promise<void>
