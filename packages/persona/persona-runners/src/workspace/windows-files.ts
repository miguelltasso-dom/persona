/** Windows draft copies hydrate source bytes and keep writable drafts independent. */
import { constants, createReadStream } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { basename, resolve, sep, toNamespacedPath } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { HistoryReviewError, type HistoryFileOps } from '@deepseek-ai/dsh-persona-engine'

/** Recovery reason without native paths or subprocess details. */
export type WindowsFileFailure = 'file_locked' | 'cloud_file_unavailable' | 'path_too_long' | 'file_unavailable'

/** Safe recovery guidance for the review host; the engine retains its transaction guarantees. */
export class WindowsHistoryFileError extends HistoryReviewError {
  /** @param reason - Recovery category. @param fileName - Basename shown to the user. @param message - Localized action. */
  constructor(readonly reason: WindowsFileFailure, readonly fileName: string, message: string) {
    super('file_unavailable', message)
    this.name = 'WindowsHistoryFileError'
  }
}

/** Bounded read and independent-copy operations supplied by the platform. */
export interface WindowsHistoryIo {
  hydrate(source: string, timeoutMs: number): Promise<void>
  copy(source: string, destination: string): Promise<void>
}

/** Cloud locations affect recovery guidance, not permission to read files. */
export interface WindowsHistoryFileOptions {
  /** Maximum hydration read time; defaults to 30000 ms. */
  readonly hydrationTimeoutMs?: number
  /** Defaults to Windows OneDrive environment roots. */
  readonly cloudRoots?: readonly string[]
}

async function hydrate(source: string, timeoutMs: number): Promise<void> {
  const abort = new AbortController()
  const timer = setTimeout(() => { abort.abort() }, timeoutMs)
  try {
    await pipeline(createReadStream(source, { signal: abort.signal }), new Writable({
      write(_chunk, _encoding, done) { done() },
    }))
  } finally { clearTimeout(timer) }
}

const platformIo: WindowsHistoryIo = {
  hydrate,
  copy: (source, destination) => copyFile(source, destination, constants.COPYFILE_FICLONE),
}

function failure(error: unknown, source: string, destination: string, cloudRoots: readonly string[]): WindowsHistoryFileError {
  const fileName = basename(source.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/gu, ' ')
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (['EBUSY', 'EACCES', 'EPERM'].includes(code)) return new WindowsHistoryFileError('file_locked', fileName,
    `Feche “${fileName}” no Excel, Word ou outro aplicativo e tente de novo. Se continuar, confira a permissão da pasta.`)
  if (code === 'ENAMETOOLONG' || (code === 'EINVAL' && Math.max(source.length, destination.length) > 260)) {
    return new WindowsHistoryFileError('path_too_long', fileName,
      `O caminho de “${fileName}” é longo demais. Mova o projeto para uma pasta mais curta e tente de novo.`)
  }
  const key = (path: string): string => resolve(path).toLowerCase()
  const sourceKey = key(source)
  const cloud = cloudRoots.some(root => sourceKey === key(root) || sourceKey.startsWith(`${key(root)}${sep}`))
  if (cloud) return new WindowsHistoryFileError('cloud_file_unavailable', fileName,
    `Abra o OneDrive e marque “${fileName}” como “Sempre manter neste dispositivo”. Aguarde o download e tente de novo.`)
  return new WindowsHistoryFileError('file_unavailable', fileName,
    `Não conseguimos acessar “${fileName}”. Confira se o arquivo está disponível e se você pode acessar a pasta; depois tente de novo.`)
}

/**
 * Build lazy copy operations for HistoryReviewOptions.fileOps; construction reads no files.
 * @param options - Hydration deadline and cloud roots.
 * @param io - Bounded hydration and independent-copy provider.
 * @returns Copies that finish hydration before copying, use long-path names and never share writable hardlinks.
 */
export function createWindowsHistoryFileOps(
  options: WindowsHistoryFileOptions = {}, io: WindowsHistoryIo = platformIo,
): HistoryFileOps {
  const timeoutMs = options.hydrationTimeoutMs ?? 30000
  const cloudRoots = options.cloudRoots ?? ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']
    .flatMap(name => process.env[name] === undefined ? [] : [process.env[name]])
  return {
    copyFile: async (source, destination) => {
      try {
        await io.hydrate(toNamespacedPath(resolve(source)), timeoutMs)
        await io.copy(toNamespacedPath(resolve(source)), toNamespacedPath(resolve(destination)))
      } catch (error) { throw failure(error, source, destination, cloudRoots) }
    },
  }
}
