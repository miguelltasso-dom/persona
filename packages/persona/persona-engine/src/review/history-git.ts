/** Bounded private-history Git operations; no shell, hooks, filters, or working-directory metadata. */
import { spawn } from 'node:child_process'
import { lstat, open } from 'node:fs/promises'
import { basename } from 'node:path'
import type { HistoryFile } from './history-files.ts'
import { HistoryReviewError } from './history-files.ts'
import { confinePath } from '../executor/confine.ts'
import type { ReviewFileVersion } from './types.ts'

/** Captured Git output; truncation drains the process without retaining unbounded text. */
export interface HistoryGitResult { stdout: string; bytes: Buffer; truncated: boolean }

/** Explicit settings for a private Git invocation. */
export interface HistoryGitOptions { git: string; directory: string; timeoutMs: number }

/** Executes private history commands; the caller owns serialization and all destination paths. */
export class HistoryGit {
  /** @param options - Executable, working directory, and maximum command duration. */
  constructor(private readonly options: HistoryGitOptions) {}

  /**
   * Run one bounded command without printing subprocess output to product flows.
   * @param args - Git argv, including explicit git-dir/work-tree where needed.
   * @param input - Optional index records.
   * @param outputLimit - Maximum retained stdout bytes.
   * @param index - Optional isolated index path.
   * @returns Bounded output after the child has exited.
   */
  run(args: readonly string[], input?: string, outputLimit = 8 * 1024 * 1024, index?: string): Promise<HistoryGitResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.git, [...args], { cwd: this.options.directory, shell: false, windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ATTR_NOSYSTEM: '1',
          ...(index === undefined ? {} : { GIT_INDEX_FILE: index }) } })
      const chunks: Buffer[] = []
      let retained = 0, truncated = false, timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, this.options.timeoutMs)
      child.stdout.on('data', (chunk: Buffer) => {
        const remaining = Math.max(0, outputLimit - retained)
        if (chunk.length > remaining) truncated = true
        if (remaining > 0) { const part = chunk.subarray(0, remaining); chunks.push(part); retained += part.length }
      })
      child.stderr.resume()
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        // Git can exit before reading index input; its close code owns that failure.
        if (error.code !== 'EPIPE' && error.code !== 'EOF') { child.kill(); reject(error) }
      })
      child.stdin.end(input)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(new HistoryReviewError('git_unavailable', 'Não conseguimos preparar o rascunho. Reabra ou reinstale a Persona para restaurar o componente necessário.', error))
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (timedOut) reject(new HistoryReviewError('git_timeout', 'A preparação do rascunho demorou demais. Feche os arquivos abertos e tente de novo.'))
        else if (code !== 0) reject(new HistoryReviewError('git_failed', 'Não conseguimos atualizar o histórico desta pasta. Seus arquivos continuam salvos; tente de novo.'))
        else { const bytes = Buffer.concat(chunks); resolve({ stdout: bytes.toString('utf8'), bytes, truncated }) }
      })
    })
  }

  private async hashFile(prefix: readonly string[], source: string): Promise<string> {
    try { return (await this.run([...prefix, 'hash-object', '-w', '--no-filters', '--', source])).stdout.trim() }
    catch (error) {
      if (!(error instanceof HistoryReviewError) || error.code !== 'git_failed') throw error
      // Diagnose the source only after Git fails; repository failures retain their original classification.
      const handle = await open(source, 'r').catch((readError: unknown) => {
        const code = typeof readError === 'object' && readError !== null && 'code' in readError ? readError.code : undefined
        if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
          const name = basename(source).replace(/[\u0000-\u001f\u007f]/gu, ' ')
          throw new HistoryReviewError('file_unavailable',
            `Feche “${name}” no Excel, Word ou outro aplicativo e tente de novo. Se continuar, confira a permissão do arquivo.`,
            new AggregateError([error, readError]))
        }
        throw error
      })
      try { await handle.close() }
      catch (closeError) { throw new HistoryReviewError('git_failed', error.message, new AggregateError([error, closeError])) }
      throw error
    }
  }

  /**
   * Store exact file bytes as a tree; hash-object disables attributes and clean filters.
   * @param gitDir - Private object repository.
   * @param workTree - Folder to snapshot.
   * @param index - Per-operation index.
   * @param files - Regular admitted files.
   * @returns Git tree id.
   */
  async snapshot(gitDir: string, workTree: string, index: string, files: readonly HistoryFile[]): Promise<string> {
    const prefix = [`--git-dir=${gitDir}`, `--work-tree=${workTree}`]
    await this.run([...prefix, 'read-tree', '--empty'], undefined, undefined, index)
    const entries: string[] = []
    for (const file of files) {
      const hash = await this.hashFile(prefix, confinePath(workTree, file.path))
      if (!/^[a-f\d]{40,64}$/u.test(hash)) throw new HistoryReviewError('history_invalid', 'O histórico desta pasta precisa ser verificado antes de continuar.')
      entries.push(`${file.mode} ${hash}\t${file.path}\0`)
    }
    if (entries.length) await this.run([...prefix, 'update-index', '-z', '--index-info'], entries.join(''), undefined, index)
    return (await this.run([...prefix, 'write-tree'], undefined, undefined, index)).stdout.trim()
  }

  /**
   * Read regular-file versions from a private immutable tree.
   * @param gitDir - Private repository.
   * @param tree - Tree id admitted by private metadata.
   * @returns Relative filenames and exact blob/mode versions.
   */
  async versions(gitDir: string, tree: string): Promise<Map<string, ReviewFileVersion>> {
    const result = await this.run([`--git-dir=${gitDir}`, 'ls-tree', '-rz', '--full-tree', tree])
    if (result.truncated) throw new HistoryReviewError('copy_limit', 'Há arquivos demais nesta revisão. Divida a tarefa em pastas menores.')
    const versions = new Map<string, ReviewFileVersion>()
    for (const row of result.stdout.split('\0').filter(Boolean)) {
      const match = /^(100644|100755) blob ([a-f\d]{40,64})\t([\s\S]+)$/u.exec(row)
      if (!match || (match[1] !== '100644' && match[1] !== '100755')) throw new HistoryReviewError('history_invalid', 'O histórico contém um arquivo que precisa ser verificado.')
      versions.set(match[3]!, { hash: match[2]!, mode: match[1] })
    }
    return versions
  }

  /**
   * Compose the expected applied tree from the current user tree and only the selected replacements.
   * @param gitDir - Private repository.
   * @param workTree - Source directory used only as command context.
   * @param index - Isolated index for composition.
   * @param base - Current user snapshot.
   * @param replacements - Exact source files, or absence for deletions.
   * @returns Combined tree id, including unrelated user edits.
   */
  async updatedTree(gitDir: string, workTree: string, index: string, base: string, replacements: readonly { path: string; source?: string }[]): Promise<string> {
    const prefix = [`--git-dir=${gitDir}`, `--work-tree=${workTree}`]
    await this.run([...prefix, 'read-tree', base], undefined, undefined, index)
    const rows: string[] = []
    for (const replacement of replacements) {
      if (replacement.source === undefined) { rows.push(`0 ${'0'.repeat(base.length)}\t${replacement.path}\0`); continue }
      const hash = await this.hashFile(prefix, replacement.source)
      const mode = (await lstat(replacement.source)).mode & 0o111 ? '100755' : '100644'
      if (!/^[a-f\d]{40,64}$/u.test(hash)) throw new HistoryReviewError('history_invalid', 'Não foi possível verificar o arquivo desta revisão.')
      rows.push(`${mode} ${hash}\t${replacement.path}\0`)
    }
    if (rows.length) await this.run([...prefix, 'update-index', '-z', '--index-info'], rows.join(''), undefined, index)
    return (await this.run([...prefix, 'write-tree'], undefined, undefined, index)).stdout.trim()
  }
}
