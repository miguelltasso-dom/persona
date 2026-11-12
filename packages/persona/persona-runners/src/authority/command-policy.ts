/**
 * COLHEITA item 8: the deterministic command judge. Given the text of ONE shell call (bash or PowerShell) it says what the call is (`ActionKind`); the authority table
 * (`authority-table.ts`) then turns that into allow / ask / deny. No model, no network, no clock; the only I/O is the `realpath` of what already exists, through `insideRoot`.
 *
 * What it promises, and what it does not:
 *  - It is a FILTER for the honest path, not a sandbox. Reading a command line is not a security boundary: past the command a line names, nothing is followed (a script
 *    file, a package script, a program that runs another program). Those are `unknown`, and `unknown` waits for the person (or is refused where nobody can be asked).
 *  - It fails closed. Whatever it cannot read plainly is `unknown`: substitutions, grouping, here-documents, variables inside a path, a path-qualified program, an
 *    interpreter, a name no table lists. A table only ever PROVES a command harmless (`read`) or confined to the draft (`draft-change`); everything else is the worst reading.
 *  - A command line is as bad as its worst command (`worstOf`).
 */

import { homedir } from 'node:os'
import { basename, isAbsolute, resolve } from 'node:path'
import { insideRoot } from '../resolve/draft-path.ts'
import { worstOf, type ActionKind } from './authority-table.ts'

/** Where the call runs and where the draft is. Without a draft nothing can be changed (`outside-change`). */
export interface CommandContext {
  /** The draft of the task (an absolute directory). */
  readonly draftRoot?: string
  /** The CLI's working directory when it made the call (where a relative path is read from). Default: the draft. */
  readonly cwd?: string
}

/** What one command line is. */
export interface CommandJudgment {
  readonly kind: ActionKind
  /** The word that decided (`git push`, `curl`, `rm`...), for the card's label. Empty when nothing decided (`read`). */
  readonly verb: string
  /** A short code for tests and diagnosis, never shown to the model. */
  readonly reason: string
}

interface Finding {
  readonly kind: ActionKind
  readonly verb: string
  readonly reason: string
}

interface Word {
  readonly text: string
  /** True when the shell would expand it (`$VAR`, `$(...)`, `%VAR%`, a leading `~`): the text is not the real value. */
  readonly expands: boolean
}

interface Redirect {
  readonly op: string
  readonly target: Word | undefined
}

interface Simple {
  readonly words: readonly Word[]
  readonly redirects: readonly Redirect[]
  /** The command is fed by a pipe (`a | this`). */
  readonly piped: boolean
}

interface Parsed {
  readonly simples: readonly Simple[]
  /** Something the parser will not follow: `$(...)`, backticks, `<(...)`, grouping, a here-document, an unbalanced quote. */
  readonly unreadable: string | undefined
}

const MAX_COMMAND_CHARS = 16 * 1024
const MAX_DEPTH = 3

/** A path that holds credentials, keys, tokens, browser profiles or the product's own vault (heuristic over the normalized, lower-case, `/`-separated path). */
const SECRET_PATHS: readonly RegExp[] = [
  /(^|\/)\.(ssh|aws|gnupg|gpg|kube|azure|docker|netrc|npmrc|pypirc|git-credentials|git-credential-store|pgpass|boto|s3cfg)(\/|$)/u,
  /(^|\/)\.config\/(gcloud|gh|op|opencode|claude|codex)(\/|$)/u,
  /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?$/u,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/u,
  /\.(pem|key|pfx|p12|ppk|kdbx|keystore|jks)$/u,
  /(^|\/)(credentials|secrets?|passwords?)(\.(json|ya?ml|toml|ini|txt|csv|xml|conf|cfg))?$/u,
  /(^|\/)\.credentials\.json$/u,
  /(^|\/)\.claude\.json$/u,
  /(^|\/)\.(claude|codex|cursor)\/(\.credentials\.json|auth\.json|credentials)$/u,
  /(^|\/)auth\.json$/u,
  /(^|\/)\.local\/share\/opencode(\/|$)/u,
  /(^|\/)appdata\/(roaming|local)\/(google\/chrome|microsoft\/(edge|credentials|vault|protect)|mozilla|bravesoftware|opencode|cursor\/user)(\/|$)/u,
  /(^|\/)user data\/(default|profile \d+)\/(login data|cookies|web data|local state)/u,
  /(^|\/)windows\/system32\/config(\/|$)/u,
  /(^|\/)ntuser\.dat/u,
  /(^|\/)(\.persona|persona-vault|persona_home)(\/|$)/u,
  /(^|\/)appdata\/roaming\/persona(\/|$)/u,
]

/**
 * True when a path names credentials, keys, tokens, a browser profile or the product's vault. A heuristic over the WRITTEN path (no symlink is followed): the filter
 * for the honest path, not a boundary.
 * @param path - A path as written in a tool call (`/` or `\`, relative or absolute, `~` allowed).
 */
export function isSecretPath(path: string): boolean {
  // Carbon P0-04: Windows ignores a trailing dot or space of a segment (`.ssh.`, `.env.`): the pattern must see the name Windows opens.
  const flat = pathSegments(path).join('/')
  return SECRET_PATHS.some(pattern => pattern.test(flat))
}

/** A variable whose name says it holds a secret (`$ANTHROPIC_API_KEY`, `$env:GITHUB_TOKEN`, `%PASSWORD%`). */
const SECRET_VARIABLE = /(api_?key|token|secret|passw(or)?d|credential|private_?key|auth)/iu

const NEVER_NAMES: ReadonlySet<string> = new Set([
  'sudo', 'su', 'doas', 'runas', 'eval', 'iex', 'invoke-expression', 'invoke-command', 'icm', 'add-type', 'set-executionpolicy', 'set-mppreference', 'add-mppreference',
  'reg', 'regedit', 'regsvr32', 'schtasks', 'sc', 'net', 'netsh', 'bcdedit', 'diskpart', 'format', 'mkfs', 'dd', 'shutdown', 'stop-computer', 'restart-computer',
  'taskkill', 'stop-process', 'kill', 'pkill', 'killall', 'cmdkey', 'vaultcmd', 'certutil', 'bitsadmin', 'mshta', 'rundll32', 'wmic', 'register-scheduledtask',
  'new-service', 'set-service', 'new-localuser', 'add-localgroupmember', 'get-credential', 'convertto-securestring', 'chown', 'chmod', 'icacls', 'takeown', 'attrib',
  'setx', 'export', 'unset', 'alias', 'set-alias', 'new-alias', 'set-itemproperty', 'new-itemproperty', 'remove-itemproperty', 'enable-psremoting', 'enter-pssession',
  'new-pssession', 'start-job', 'wsl',
])

/** Variables a command line must not set before a command: they change what runs or where it connects. */
const DANGEROUS_ENV = /^(path|pathext|comspec|shell|ld_[a-z_]+|dyld_[a-z_]+|git_[a-z0-9_]+|home|userprofile|homedrive|homepath|appdata|localappdata|programdata|xdg_[a-z_]+|ripgrep_config_path|rg_[a-z_]+|pager|editor|visual|node_options|node_path|pythonpath|pythonstartup|bash_env|env|ifs|http_proxy|https_proxy|all_proxy|no_proxy)$/iu

const SHELL_NAMES: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'powershell', 'pwsh'])
/** A UNC path as written (`\\host\share\...` or `//host/share/...`): a share separator after the host, so a pattern such as `//TODO` is not one. */
const UNC_PATH = /^(?:\\\\|\/\/)[^\\/\s]+[\\/]/u
/** Programs that read a whole tree when they are given a folder (the ones that need a flag are checked with it). */
const RECURSIVE_READERS: ReadonlySet<string> = new Set(['rg', 'grep', 'egrep', 'fgrep', 'find', 'get-childitem', 'gci', 'ls', 'dir', 'tree', 'select-string', 'sls'])
/** Shell options that take the NEXT word as their value (so that word is not "the script file"). */
const SHELL_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-executionpolicy', '-ep', '-windowstyle', '-w', '-workingdirectory', '-wd', '-inputformat', '-if', '-outputformat', '-of', '-version', '-configurationname', '-o', '--rcfile', '--init-file'])
const WRAPPER_NAMES: ReadonlySet<string> = new Set(['command', 'builtin', 'nohup', 'time', 'nice', 'exec', 'env', 'timeout', 'stdbuf'])

const READ_NAMES: ReadonlySet<string> = new Set([
  'ls', 'dir', 'pwd', 'cat', 'type', 'head', 'tail', 'wc', 'echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'sort', 'uniq', 'cut', 'diff', 'cmp', 'stat', 'file', 'which',
  'where', 'whoami', 'date', 'tree', 'basename', 'dirname', 'realpath', 'readlink', 'test', '[', 'true', 'false', 'sleep', 'nl', 'column', 'fold', 'rev', 'tac', 'md5sum',
  'sha1sum', 'sha256sum', 'du', 'df', 'jq', 'wslpath', 'hostname', 'uname', 'id', 'groups', 'tput', 'clear', 'cls', 'printenv',
  'get-childitem', 'gci', 'get-content', 'gc', 'select-string', 'sls', 'get-location', 'gl', 'test-path', 'measure-object', 'measure', 'get-item', 'gi', 'resolve-path', 'rvpa',
  'write-output', 'write-host', 'get-date', 'select-object', 'select', 'sort-object', 'where-object', 'format-table', 'ft', 'format-list', 'fl', 'out-string', 'out-host',
  'convertto-json', 'convertfrom-json', 'group-object', 'get-filehash', 'get-help', 'get-command', 'get-alias', 'split-path', 'join-path', 'compare-object', 'get-itemproperty',
])

/** Read-only programs that only print or test their operands: an operand with a variable in it is not a path to read. */
const PRINTS_OPERANDS: ReadonlySet<string> = new Set([
  'echo', 'printf', 'write-output', 'write-host', 'true', 'false', 'sleep', 'date', 'get-date', 'basename', 'dirname', 'test', '[', 'whoami', 'hostname', 'uname', 'id', 'groups',
  'pwd', 'get-location', 'gl', 'tput', 'clear', 'cls', 'split-path', 'join-path', 'printenv',
])

/** Draft-confined changes: every path operand must lie inside the draft. */
const CHANGE_NAMES: ReadonlySet<string> = new Set([
  'mkdir', 'md', 'touch', 'cp', 'copy', 'mv', 'move', 'ren', 'rename', 'tee',
  'new-item', 'ni', 'set-content', 'add-content', 'ac', 'out-file', 'copy-item', 'cpi', 'move-item', 'mi', 'rename-item', 'rni', 'clear-content', 'clc',
  'compress-archive', 'zip',
])

const DELETE_NAMES: ReadonlySet<string> = new Set(['rm', 'del', 'erase', 'rmdir', 'rd', 'unlink', 'shred', 'remove-item', 'ri'])

/** Programs that put something on the network or deploy, publish or pay. Always `send`. */
const SEND_NAMES: ReadonlySet<string> = new Set([
  'curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'start-bitstransfer', 'scp', 'sftp', 'ftp', 'ssh', 'rsync', 'nc', 'ncat', 'netcat', 'telnet', 'send-mailmessage',
  'sendmail', 'mail', 'msg', 'vercel', 'netlify', 'wrangler', 'firebase', 'fly', 'flyctl', 'heroku', 'aws', 'gcloud', 'az', 'doctl', 'terraform', 'kubectl', 'docker', 'podman', 'helm',
  'stripe', 'twilio', 'ngrok', 'cloudflared', 'supabase', 'railway', 'render', 'gh-pages', 'twine',
])

/** Package managers and runtimes: never read, `publish` and `deploy` leave the machine. */
const PACKAGE_NAMES: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn', 'npx', 'bun', 'bunx', 'pip', 'pip3', 'uv', 'cargo', 'gem', 'composer', 'dotnet', 'nuget'])

const GIT_READ: ReadonlySet<string> = new Set([
  'status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'blame', 'describe', 'shortlog', 'cat-file', 'check-ignore', 'whatchanged', 'rev-list', 'name-rev', 'grep',
  'count-objects', 'var', 'help', 'version', 'diff-tree', 'diff-index', 'show-ref', 'for-each-ref', 'merge-base', 'verify-commit', 'verify-tag', 'ls-remote-local', 'range-diff', 'cherry',
])
const GIT_DRAFT_CHANGE: ReadonlySet<string> = new Set(['add', 'commit', 'restore', 'switch', 'mv', 'init', 'merge', 'cherry-pick', 'revert', 'apply', 'rm', 'notes', 'worktree'])
const GIT_SEND: ReadonlySet<string> = new Set(['push', 'fetch', 'pull', 'clone', 'ls-remote', 'submodule', 'send-email', 'request-pull', 'svn', 'remote-add-send'])
const GIT_NEVER: ReadonlySet<string> = new Set(['credential', 'credential-store', 'credential-cache', 'daemon', 'filter-branch'])

const READ_FLAGS_ONLY: ReadonlySet<string> = new Set(['--version', '-v', '-V', '--help', '-h', '-?', '/?', 'version'])

/** Normalize a Git-Bash style path (`/c/Users/x`) to a Windows path when running on Windows. */
function shellPath(path: string): string {
  if (process.platform !== 'win32') return path
  const match = /^\/([a-zA-Z])(?:\/(.*))?$/u.exec(path)
  return match === null ? path : `${match[1] ?? ''}:/${match[2] ?? ''}`
}

/**
 * Split a command line into simple commands. Quotes group; a backslash is a literal path separator except before a character the shell treats as special.
 * Anything the parser will not follow is reported in `unreadable` (the judge then answers `unknown`).
 */
function parse(command: string): Parsed {
  const simples: Simple[] = []
  let words: Word[] = []
  let redirects: Redirect[] = []
  let piped = false
  let current = ''
  let started = false
  let expands = false
  let unreadable: string | undefined
  let pendingRedirect: string | undefined
  const flag = (reason: string): void => { unreadable ??= reason }
  const endWord = (): void => {
    if (!started) return
    const word: Word = { text: current, expands }
    if (pendingRedirect === undefined) words.push(word)
    else { redirects.push({ op: pendingRedirect, target: word }); pendingRedirect = undefined }
    current = ''
    started = false
    expands = false
  }
  const endSimple = (nextPiped: boolean): void => {
    endWord()
    if (pendingRedirect !== undefined) { redirects.push({ op: pendingRedirect, target: undefined }); pendingRedirect = undefined }
    if (words.length > 0 || redirects.length > 0) simples.push({ words, redirects, piped })
    words = []
    redirects = []
    piped = nextPiped
  }
  // Carbon CP-2: PowerShell takes the typographic quotes as quotes, inside a string too (a "paste from a document" carries them); this parser sees letters. Anywhere in the line: never `read`.
  if (/[“”‘’]/u.test(command)) flag('curly-quote')
  const length = command.length
  for (let i = 0; i < length; i++) {
    const ch = command.charAt(i)
    const next = command.charAt(i + 1)
    if (ch === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) { flag('unbalanced-quote'); break }
      current += command.slice(i + 1, end)
      started = true
      i = end
      continue
    }
    if (ch === '"') {
      started = true
      let closed = false
      for (i = i + 1; i < length; i++) {
        const inner = command.charAt(i)
        if (inner === '"') { closed = true; break }
        // Carbon CP-1: the quote state must be the shell's. `\\` is ONE backslash (so `"a\\"` closes at the second quote, in bash AND PowerShell). `\"`, `\$` and a backslash-backtick read differently
        // in bash (escaped) and in PowerShell (the backslash is a letter and the quote closes / the variable expands): two readings of where the string ends is never judged `read`.
        if (inner === '\\' && command.charAt(i + 1) === '\\') { current += '\\'; i++; continue }
        if (inner === '\\' && (command.charAt(i + 1) === '"' || command.charAt(i + 1) === '$' || command.charAt(i + 1) === '`')) { flag('escape-ambiguous'); current += command.charAt(i + 1); i++; continue }
        if (inner === '`' || (inner === '$' && command.charAt(i + 1) === '(')) flag('substitution')
        if (inner === '$' && /[A-Za-z_{]/u.test(command.charAt(i + 1))) expands = true
        if (inner === '%' && /^%[A-Za-z_][A-Za-z0-9_]*%/u.test(command.slice(i))) expands = true
        current += inner
      }
      if (!closed) { flag('unbalanced-quote'); break }
      continue
    }
    if (ch === '\\') {
      if (next === '\n' || (next === '\r' && command.charAt(i + 2) === '\n')) { flag('line-continuation'); i += next === '\n' ? 1 : 2; continue } // bash joins the lines; PowerShell ends the statement
      if (next !== '' && ';&|<>()$`\'" '.includes(next)) {
        if (next !== ' ') flag('escape-ambiguous') // Carbon CP-2: `\;` `\|` `\>` `\$` `\"` are letters in bash and operators/quotes/variables in PowerShell
        current += next
        started = true
        i++
        continue
      }
      current += ch
      started = true
      continue
    }
    if (ch === '`') { flag('substitution'); current += ch; started = true; continue }
    if (ch === '$') {
      if (next === '(' || next === '{') flag('substitution')
      if (/[A-Za-z_{(?@*#!$0-9]/u.test(next)) expands = true
      current += ch
      started = true
      continue
    }
    if (ch === '%' && /^%[A-Za-z_][A-Za-z0-9_]*%/u.test(command.slice(i))) { expands = true; current += ch; started = true; continue }
    if (ch === '~' && !started) { expands = true; current += ch; started = true; continue }
    if (ch === ' ' || ch === '\t') { endWord(); continue }
    if (ch === '\n' || ch === '\r' || ch === ';') { endSimple(false); continue } // Carbon CP-2: PowerShell ends a statement at a lone CR as well; an empty simple is dropped, so CRLF costs nothing
    if (ch === '&') {
      if (next === '&') { endSimple(false); i++; continue }
      if (next === '>') { endWord(); pendingRedirect = '&>'; i++; if (command.charAt(i + 1) === '>') i++; continue }
      if (words.length === 0 && !started) { flag('call-operator'); continue }
      endSimple(false)
      continue
    }
    if (ch === '|') {
      if (next === '|') { endSimple(false); i++; continue }
      endSimple(true)
      continue
    }
    if (ch === '<' || ch === '>') {
      if (next === '(') { flag('substitution'); continue }
      if (ch === '<' && next === '<') { flag('heredoc'); i++; if (command.charAt(i + 1) === '<') i++; continue }
      // `2>`, `1>` and `&>`: a number glued to the operator is a file descriptor, not a word.
      if (started && /^[0-9]$/u.test(current)) { current = ''; started = false; expands = false } else endWord()
      let op = ch
      if (ch === '>' && next === '>') { op = '>>'; i++ } else if (ch === '>' && next === '|') { op = '>'; i++ }
      if (command.charAt(i + 1) === '&') {
        // `2>&1`: a descriptor, not a file.
        i++
        const match = /^(-|[0-9]+)/u.exec(command.slice(i + 1))
        if (match !== null) { i += match[0].length; continue }
        pendingRedirect = op
        continue
      }
      pendingRedirect = op
      continue
    }
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}') { flag('grouping'); current += ch; started = true; continue }
    // Carbon CP-1: a `#` that starts a word is a comment in bash and PowerShell, and it hides a quote from the shell that this parser would still open. Not followed: never `read`.
    if (ch === '#' && !started) flag('comment')
    current += ch
    started = true
  }
  endSimple(false)
  return { simples, unreadable }
}

/** The name a program is called by: lower-case, without directory or the Windows extensions. `undefined` when the word is path-qualified. */
function programName(word: string): string | undefined {
  if (/[\\/]/u.test(word)) return undefined
  return word.toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/u, '')
}

function isFlag(text: string): boolean {
  return text.startsWith('-') && text.length > 1
}

/** Carbon P0-04: a value written INSIDE an option (`-Destination:C:\x`, `--target-directory=/x`) is a path like any operand; the option and its value are judged apart. */
const OPTION_WITH_VALUE = /^(--?[A-Za-z][A-Za-z0-9-]*)[:=](.+)$/su

function withOptionValues(args: readonly Word[]): Word[] {
  const out: Word[] = []
  for (const arg of args) {
    const match = isFlag(arg.text) ? OPTION_WITH_VALUE.exec(arg.text) : null
    if (match === null) { out.push(arg); continue }
    out.push({ text: match[1] ?? '', expands: false }, { text: match[2] ?? '', expands: arg.expands })
  }
  return out
}

/** A wildcard the shell (or a PowerShell cmdlet, quoted or not) expands to file names that cannot be read from the text. */
const GLOB_CHARS = /[*?]/u

/**
 * A glob that can reach beyond the draft or a hidden or secret name: absolute, home-relative, UNC, with a `..` segment, or in a path with a hidden segment
 * (`.ss?/id_ed25519`, `.e*`, `.config/*`). A plain relative glob (`*.md`, `src/*.ts`) stays what it was.
 */
function isRiskyGlob(text: string): boolean {
  if (!GLOB_CHARS.test(text) && !hasBracketClass(text)) return false
  if (/^(~|\/|\\|[A-Za-z]:)/u.test(text)) return true
  const segments = text.replace(/\\/gu, '/').split('/')
  return segments.includes('..') || segments.some(segment => segment.startsWith('.') && segment !== '.')
}

function markRiskyGlob(word: Word): Word {
  return word.expands || !isRiskyGlob(word.text) ? word : { text: word.text, expands: true }
}

/** The segments of a path as Windows reads them: lower case, `/`-separated, a trailing dot or space of a segment ignored (`.ssh.` IS `.ssh`). */
function pathSegments(path: string): string[] {
  return path.trim().replace(/\\/gu, '/').replace(/\/{2,}/gu, '/').toLowerCase().split('/')
    // Carbon P0-05b: NTFS opens `.env::$DATA`, `.env:stream`, `.ssh::$INDEX_ALLOCATION` as the SAME file or folder: the stream after the first colon is not part of the name (a bare drive `c:` is).
    .map(segment => (segment === '.' || segment === '..' ? segment : trimEnd(/^[a-z]:$/u.test(segment) ? segment : beforeColon(segment), '. ')))
}

/**
 * Carbon CP-11: LINEAR trims. `/[. ]+$/`, `/\/+$/` and `/:.*$/` re-scan a long run from every start position when the run is not at the end, so a 60,000-character `file_path` froze the host for
 * ~6 s per call (measured) and a 1 MiB one for far longer: the model chooses that path.
 * @param text - Any text.
 * @param chars - The characters to cut off the END.
 */
function trimEnd(text: string, chars: string): string {
  let end = text.length
  while (end > 0 && chars.includes(text.charAt(end - 1))) end--
  return end === text.length ? text : text.slice(0, end)
}

/** The text before the first colon (the NTFS stream marker); all of it when there is none. */
function beforeColon(text: string): string {
  const colon = text.indexOf(':')
  return colon < 0 ? text : text.slice(0, colon)
}

/** Whether a word holds a `[class]` of a glob (`[` + at least one character + `]`), without re-scanning from every `[`. */
function hasBracketClass(text: string): boolean {
  let open = text.indexOf('[')
  while (open >= 0) {
    const close = text.indexOf(']', open + 1)
    if (close < 0) return false
    if (close > open + 1) return true
    open = text.indexOf('[', open + 1)
  }
  return false
}

/** Carbon P0-04: a path strictly INSIDE a `.git` directory (a hook, the config...): a raw write there is code that runs later; git itself manages those files. */
function isGitInternalPath(path: string): boolean {
  const segments = pathSegments(path)
  const at = segments.lastIndexOf('.git')
  return at >= 0 && at < segments.length - 1
}

/** Commands whose `-t` takes a DIRECTORY (the destination), so it can be written glued to other short options or to the directory itself. */
const TARGET_OPTION_COMMANDS: ReadonlySet<string> = new Set(['cp', 'mv', 'install', 'ln'])

/**
 * Carbon P0-05b: `-t` takes a directory, and getopt reads `-rt DIR`, `-tDIR` and `-rtDIR` the same way (what follows the `t` in the word is its value). Split them so the directory is judged
 * as the operand it is: `cp -rt C:/Users/x/Desktop a` writes OUTSIDE the draft, whatever the last word is.
 */
function splitTargetOptions(args: readonly Word[]): Word[] {
  const out: Word[] = []
  for (const arg of args) {
    const match = arg.text.startsWith('--') ? null : /^-([A-Za-z]*)t(.*)$/su.exec(arg.text)
    if (match === null) { out.push(arg); continue }
    const before = match[1] ?? ''
    const value = match[2] ?? ''
    if (before !== '') out.push({ text: `-${before}`, expands: false })
    out.push({ text: '-t', expands: false })
    if (value !== '') out.push({ text: value, expands: arg.expands })
  }
  return out
}

/** Options of git whose NEXT word is a value that is not a path (a message, an author, a date...). */
const GIT_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-m', '--message', '--author', '--date', '--trailer', '-s', '-S', '--gpg-sign', '-u', '--cleanup', '--reuse-message', '-c', '-C'])

/** The operands of a git change that look like paths. A quoted path with a space IS a path; only the VALUE of a message-like option is not. */
function gitPathOperands(operands: readonly Word[]): Word[] {
  const paths: Word[] = []
  for (let at = 0; at < operands.length; at += 1) {
    const arg = operands[at]
    if (arg === undefined) continue
    if (isFlag(arg.text)) {
      if (GIT_VALUE_OPTIONS.has(arg.text) || /^-[A-Za-z]*m$/u.test(arg.text)) at += 1
      continue
    }
    if (/[\\/.]/u.test(arg.text) && !/^[0-9a-f]{7,40}$/iu.test(arg.text)) paths.push(arg)
  }
  return paths
}

/** True for `/dev/null`, `nul`, `$null`: a sink, not a file. */
function isSink(text: string): boolean {
  const flat = text.toLowerCase()
  return flat === '/dev/null' || flat === 'nul' || flat === '$null'
}

/** A target so broad that deleting it is never a task: a drive or filesystem root, the home folder, the Windows directory. */
function isBroadTarget(path: string): boolean {
  const flat = trimEnd(path.trim().replace(/\\/gu, '/'), '/').toLowerCase()
  if (flat === '' || flat === '/' || flat === '~' || flat === '*' || /^[a-z]:$/u.test(flat) || flat === '$home' || flat === '%userprofile%' || flat === '$env:userprofile') return true
  if (/^[a-z]:\/(users|program files( \(x86\))?|programdata)$/u.test(flat) || /^[a-z]:\/windows(\/.*)?$/u.test(flat)) return true
  return flat === homedir().replace(/\\/gu, '/').toLowerCase()
}

/**
 * Carbon P0-04: a folder a recursive read (`Grep`, `Glob`) must not START from: a drive or filesystem root, the home folder, or a folder ABOVE the home (`C:\Users`): every secret
 * under it would be swept by one call. A folder UNDER the home (documents, the draft) is not broad. A relative path is read from `cwd`.
 * @param path - The `path` of the tool call, as written.
 * @param cwd - The working folder of the call, to resolve a relative path.
 */
export function isBroadReadRoot(path: string, cwd?: string): boolean {
  const written = path.trim()
  if (written === '') return false
  if (isBroadTarget(written)) return true
  const flat = (value: string): string => trimEnd(value.replace(/\\/gu, '/'), '/').toLowerCase()
  const absolute = isAbsolute(shellPath(written)) || cwd === undefined ? resolve(shellPath(written)) : resolve(cwd, shellPath(written))
  const target = flat(absolute)
  const home = flat(homedir())
  return target === '' || /^[a-z]:$/u.test(target) || home === target || home.startsWith(`${target}/`)
}

class Judge {
  private readonly findings: Finding[] = []
  private readonly draftRoot: string | undefined
  private cwd: string | undefined

  constructor(context: CommandContext) {
    this.draftRoot = context.draftRoot
    this.cwd = context.cwd ?? context.draftRoot
  }

  add(kind: ActionKind, verb: string, reason: string): void {
    this.findings.push({ kind, verb, reason })
  }

  result(): CommandJudgment {
    if (this.findings.length === 0) return { kind: 'unknown', verb: '', reason: 'nothing-read' }
    const kind = worstOf(this.findings.map(item => item.kind))
    const decided = this.findings.find(item => item.kind === kind) ?? this.findings[0]
    return { kind, verb: decided?.verb ?? '', reason: decided?.reason ?? '' }
  }

  /** Whether a written path lies inside the draft (`undefined` when no draft is known, or the path expands and cannot be resolved). */
  private within(word: Word): boolean | undefined {
    if (this.draftRoot === undefined || this.cwd === undefined || word.expands) return undefined
    return insideRoot(this.draftRoot, shellPath(word.text), this.cwd)
  }

  /** Every operand a change touches must be inside the draft. */
  private operandsKind(verb: string, operands: readonly Word[], inside: ActionKind, outside: ActionKind): void {
    if (operands.length === 0) { this.add('unknown', verb, 'no-operand'); return }
    for (const operand of operands) {
      if (isSecretPath(operand.text)) { this.add('secret', verb, 'secret-path'); continue }
      // P0-B: the `.git` folder itself counts (`mv sub .git`, `cp -r sub .git`, `mkdir .git`): a folder that BECOMES the `.git` brings its hooks and config.
      if (isGitInternalPath(operand.text) || pathSegments(operand.text).includes('.git')) { this.add(outside, verb, 'git-internals'); continue }
      const within = this.within(operand)
      if (within === undefined) this.add(operand.expands ? 'unknown' : outside, verb, operand.expands ? 'expands' : 'no-draft')
      else this.add(within ? inside : outside, verb, within ? 'draft-path' : 'outside-draft')
    }
  }

  private secretOperands(verb: string, operands: readonly Word[]): void {
    for (const operand of operands) {
      // Carbon CP-8: a UNC path (`\\host\share\x`, `//host/share/x`) is a connection to another machine (and hands over the owner's NTLM hash), not a read.
      if (UNC_PATH.test(operand.text)) { this.add('send', verb, 'unc-network'); continue }
      // Carbon CP-12: a git object path `REV:path` (`git show HEAD:.env`) names a file after the colon; the secret-name check strips what follows a colon as an NTFS stream, so it read only `HEAD`.
      const colon = operand.text.indexOf(':')
      if (colon > 1 && isSecretPath(operand.text.slice(colon + 1))) { this.add('secret', verb, 'secret-object-path'); continue }
      if (isSecretPath(operand.text) || /^env:/iu.test(operand.text) || (operand.expands && SECRET_VARIABLE.test(operand.text))) this.add('secret', verb, 'secret-operand')
    }
  }

  private redirectsOf(simple: Simple, verb: string): void {
    for (const redirect of simple.redirects) {
      const target = redirect.target === undefined ? undefined : markRiskyGlob(redirect.target)
      if (target === undefined) { this.add('unknown', verb, 'redirect-without-target'); continue }
      if (isSink(target.text)) continue
      if (redirect.op === '<') { this.secretOperands(verb === '' ? '<' : verb, [target]); if (isSecretPath(target.text)) this.add('secret', verb, 'secret-input'); continue }
      if (isSecretPath(target.text)) { this.add('secret', verb, 'secret-path'); continue }
      if (isGitInternalPath(target.text)) { this.add('outside-change', verb === '' ? redirect.op : verb, 'git-internals'); continue }
      const within = this.within(target)
      if (within === undefined) this.add(target.expands ? 'unknown' : 'outside-change', verb === '' ? redirect.op : verb, target.expands ? 'expands' : 'no-draft')
      else this.add(within ? 'draft-change' : 'outside-change', verb === '' ? redirect.op : verb, within ? 'draft-redirect' : 'outside-redirect')
    }
  }

  simple(simple: Simple, depth: number): void {
    let words = [...simple.words]
    // Leading `NAME=value` assignments change what runs or where it connects: refuse the dangerous names, accept the rest.
    while (words.length > 0) {
      const first = words[0]
      const assign = first === undefined ? null : /^([A-Za-z_][A-Za-z0-9_]*)=/u.exec(first.text)
      if (first === undefined || assign === null) break
      if (DANGEROUS_ENV.test(assign[1] ?? '')) { this.add('never', `${assign[1] ?? ''}=`, 'dangerous-env'); return }
      words = words.slice(1)
    }
    if (words.length === 0) { this.redirectsOf(simple, ''); return }
    const head = words[0]
    if (head === undefined) return
    const rest = words.slice(1).map(markRiskyGlob)
    const name = programName(head.text)
    if (head.expands || name === undefined) { this.add('unknown', head.text, head.expands ? 'name-expands' : 'path-qualified-program'); this.redirectsOf(simple, head.text); return }
    this.redirectsOf(simple, name)
    this.command(name, rest, simple, depth)
  }

  private command(name: string, args: readonly Word[], simple: Simple, depth: number): void {
    if (NEVER_NAMES.has(name)) { this.add('never', name, 'never-listed'); return }
    if (simple.piped && (SHELL_NAMES.has(name) || name === 'cmd')) { this.add('never', name, 'pipe-into-shell'); return }
    if (args.length > 0 && args.every(arg => READ_FLAGS_ONLY.has(arg.text)) && !SHELL_NAMES.has(name)) { this.add('read', name, 'version-or-help'); return }
    if (SHELL_NAMES.has(name)) { this.shell(name, args, depth); return }
    if (name === 'cmd') { this.add('unknown', 'cmd', 'cmd-shell'); return }
    if (WRAPPER_NAMES.has(name)) { this.wrapper(name, args, simple, depth); return }
    if (name === 'git') { this.git(args); return }
    if (name === 'gh') { this.gh(args); return }
    if (name === 'cd' || name === 'pushd' || name === 'chdir' || name === 'set-location' || name === 'sl') { this.changeDirectory(name, args); return }
    if (SEND_NAMES.has(name)) { this.add('send', name, 'network'); return }
    if (PACKAGE_NAMES.has(name)) {
      const action = args.find(arg => !isFlag(arg.text))?.text.toLowerCase() ?? ''
      this.add(action === 'publish' || action === 'deploy' || action === 'login' || action === 'adduser' ? 'send' : 'unknown', name, action === 'publish' || action === 'deploy' ? 'publish' : 'runs-unread-code')
      return
    }
    if (DELETE_NAMES.has(name)) { this.deleteOf(name, withOptionValues(args)); return }
    if (CHANGE_NAMES.has(name)) { this.changeOf(name, withOptionValues(args)); return }
    if (READ_NAMES.has(name)) { this.read(name, withOptionValues(args)); return }
    this.add('unknown', name, 'not-listed')
  }

  /**
   * A change confined to the draft. `cp` reads its sources, so only its destination (the last operand) has to be inside; every other command, and `cp` with an explicit
   * target option, must have EVERY operand inside (a PowerShell `-Destination` can come before or after the source).
   */
  private changeOf(name: string, rawArgs: readonly Word[]): void {
    const args = TARGET_OPTION_COMMANDS.has(name) ? splitTargetOptions(rawArgs) : rawArgs
    const operands = args.filter(arg => !isFlag(arg.text))
    const targetOption = args.some(arg => ['-t', '-T', '--target-directory', '--no-target-directory'].includes(arg.text))
    // Carbon CP-7: `cp -l` / `-s` (and `--link`, `--symbolic-link`) make the destination a LINK to the source, so the source is written through later: every operand must lie inside the draft.
    const linking = args.some(arg => arg.text === '--link' || arg.text === '--symbolic-link' || /^-[A-Za-z]*[ls][A-Za-z]*$/u.test(arg.text))
    if (name === 'cp' && !targetOption && !linking && operands.length >= 2) {
      this.secretOperands(name, operands.slice(0, -1))
      this.operandsKind(name, operands.slice(-1), 'draft-change', 'outside-change')
      return
    }
    this.operandsKind(name, operands, 'draft-change', 'outside-change')
  }

  private read(name: string, args: readonly Word[]): void {
    const texts = args.map(arg => arg.text.toLowerCase())
    if (name === 'find' && texts.some(text => ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls'].includes(text))) { this.add('unknown', name, 'runs-or-deletes'); return }
    if (name === 'sort' && texts.some(text => text === '-o' || text.startsWith('--output') || /^-[a-z0-9]*o/u.test(text))) { this.add('unknown', name, 'writes-file'); return } // Carbon P0-05b: `-oFILE`, `-rnoFILE` write too; P0-A: so does a cluster that ENDS in `o` (`-uo FILE`)
    if (name === 'sort' && texts.some(text => text.startsWith('--compress-program'))) { this.add('unknown', name, 'runs-program'); return } // Carbon CP-12: the temp-file compressor is a program
    if (name === 'tree' && texts.some(text => text === '-o' || text.startsWith('--output') || /^-[a-z0-9]*o/u.test(text))) { this.add('unknown', name, 'writes-file'); return } // Carbon CP-12
    // Carbon CP-6: `uniq INPUT OUTPUT` writes the second operand: every path operand must lie inside the draft, as for any change.
    if (name === 'uniq' && args.filter(arg => !isFlag(arg.text)).length >= 2) { this.changeOf(name, args); return }
    if ((name === 'grep' || name === 'rg' || name === 'egrep' || name === 'fgrep') && texts.some(text => text.startsWith('--pre'))) { this.add('unknown', name, 'runs-program'); return }
    if (name === 'date' && texts.some(text => text === '-s' || text.startsWith('--set'))) { this.add('never', name, 'sets-clock'); return }
    if (name === 'printenv' && (args.length === 0 || texts.some(text => SECRET_VARIABLE.test(text)))) { this.add('secret', name, 'dumps-environment'); return }
    // Carbon CP-9: a jq program that names `env` / `$ENV` dumps the environment, like `printenv` (a `.env` KEY of the file read is not the environment).
    if (name === 'jq' && texts.some(text => /(^|[^a-z0-9_.])\$?env(?![a-z0-9_])/u.test(text))) { this.add('secret', name, 'dumps-environment'); return }
    // Carbon CP-10: the native Grep/Glob refuse to START a recursive read at the home folder, a drive or `C:\Users`; the shell version of the same sweep was a plain `read`.
    if (RECURSIVE_READERS.has(name) && (['rg', 'find', 'tree'].includes(name) || texts.some(text => text === '--recursive' || text === '-recurse' || /^-[a-z]*r[a-z]*$/u.test(text)))
      && args.some(arg => !isFlag(arg.text) && isBroadReadRoot(arg.text, this.cwd))) { this.add('secret', name, 'broad-recursive-read'); return }
    this.secretOperands(name, args)
    // A path built from a variable or a `~` cannot be checked: a program that reads files must wait. Programs that only print their operands (`echo $HOME`) are not held.
    if (!PRINTS_OPERANDS.has(name) && args.some(arg => arg.expands && !isFlag(arg.text))) this.add('unknown', name, 'operand-expands')
    this.add('read', name, 'read-only')
  }

  private deleteOf(name: string, args: readonly Word[]): void {
    const targets = args.filter(arg => !isFlag(arg.text) && !/^\/[a-z]$/iu.test(arg.text))
    if (targets.length === 0) { this.add('unknown', name, 'no-operand'); return }
    for (const target of targets) {
      if (isSecretPath(target.text)) { this.add('secret', name, 'secret-path'); continue }
      if (isGitInternalPath(target.text)) { this.add('delete', name, 'git-internals'); continue }
      if (isBroadTarget(target.text)) { this.add('never', name, 'broad-target'); continue }
      const within = this.within(target)
      if (within === undefined) this.add(target.expands ? 'unknown' : 'delete', name, target.expands ? 'expands' : 'no-draft')
      else this.add(within ? 'draft-change' : 'delete', name, within ? 'draft-path' : 'outside-draft')
    }
  }

  private changeDirectory(name: string, args: readonly Word[]): void {
    const target = args.find(arg => !isFlag(arg.text))
    if (target === undefined || target.expands) { this.add('unknown', name, 'cd-unresolved'); this.cwd = undefined; return }
    const within = this.within(target)
    const base = this.cwd ?? this.draftRoot
    if (base !== undefined) this.cwd = isAbsolute(shellPath(target.text)) ? resolve(shellPath(target.text)) : resolve(base, shellPath(target.text))
    this.add(within === true ? 'read' : 'unknown', name, within === true ? 'cd-in-draft' : 'cd-outside-draft')
  }

  private wrapper(name: string, args: readonly Word[], simple: Simple, depth: number): void {
    let rest = [...args]
    if (name === 'env') {
      while (rest.length > 0) {
        const first = rest[0]
        if (first === undefined) break
        if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(first.text)) {
          if (DANGEROUS_ENV.test(first.text.split('=')[0] ?? '')) { this.add('never', 'env', 'dangerous-env'); return }
          rest = rest.slice(1)
          continue
        }
        if (first.text === '-i' || first.text === '--ignore-environment') { rest = rest.slice(1); continue }
        if (isFlag(first.text)) { this.add('unknown', 'env', 'env-option'); return }
        break
      }
      if (rest.length === 0) { this.add('secret', 'env', 'dumps-environment'); return }
    } else if (name === 'timeout') {
      rest = rest.filter(arg => !isFlag(arg.text))
      if (rest.length > 0 && /^[0-9.]+[smhd]?$/u.test(rest[0]?.text ?? '')) rest = rest.slice(1)
    } else {
      rest = rest.filter(arg => !isFlag(arg.text))
    }
    const inner = rest[0]
    if (inner === undefined) { this.add('unknown', name, 'wrapper-without-command'); return }
    if (depth + 1 > MAX_DEPTH) { this.add('unknown', name, 'too-deep'); return }
    this.simple({ words: rest, redirects: [], piped: simple.piped }, depth + 1)
  }

  private shell(name: string, args: readonly Word[], depth: number): void {
    const texts = args.map(arg => arg.text.toLowerCase())
    // Carbon CP-12: PowerShell takes any prefix of `-EncodedCommand` (`-en`, `-enco`, `-encodedc`), not only the spellings the list had.
    if (texts.some(text => text === '-ec' || (text.length >= 2 && '-encodedcommand'.startsWith(text)))) { this.add('never', name, 'encoded-command'); return }
    if (texts.some(text => text === '-file' || text === '-f' || text === '-i' || text === '-s' || text === '--login' || text === '-l')) { this.add('unknown', name, 'script-file'); return }
    // Carbon CP-3: `-c` / `-Command` counts only BEFORE the first word that is not an option: `bash evil.sh -c echo` runs the file `evil.sh` (the `-c` is its argument), and judging only the text after it
    // made a script file `read`. An option that takes a value (`-ExecutionPolicy Bypass`) is skipped with its value.
    let at = -1
    for (let k = 0; k < texts.length; k++) {
      const text = texts[k] ?? ''
      if (text === '-c' || text === '-command' || text === '--command' || text === '-lc' || text === '-ic') { at = k; break }
      if (!isFlag(text)) break
      if (SHELL_VALUE_OPTIONS.has(text)) k++
    }
    if (at < 0) { this.add('unknown', name, args.length === 0 ? 'interactive-shell' : 'shell-script'); return }
    const script = args.slice(at + 1).map(arg => arg.text).join(' ')
    if (script.trim() === '') { this.add('unknown', name, 'empty-script'); return }
    if (depth + 1 > MAX_DEPTH) { this.add('unknown', name, 'too-deep'); return }
    this.script(script, depth + 1)
  }

  /** Judge a whole script text (the argument of `-c`, or the top-level command line). */
  script(script: string, depth: number): void {
    if (script.length > MAX_COMMAND_CHARS || script.includes('\0')) { this.add('unknown', '', 'too-long'); return }
    const parsed = parse(script)
    if (parsed.unreadable !== undefined) this.add('unknown', '', parsed.unreadable)
    for (const simple of parsed.simples) this.simple(simple, depth)
  }

  private git(args: readonly Word[]): void {
    let index = 0
    // Global options before the subcommand. `-c`, `--config-env`, `--exec-path`, `--git-dir`, `--work-tree`... can make git run a program or act on another repository.
    while (index < args.length) {
      const option = args[index]
      if (option === undefined || !isFlag(option.text)) break
      if (['--no-pager', '-p', '--paginate', '--no-optional-locks', '--no-replace-objects', '--literal-pathspecs', '--bare', '--no-lazy-fetch'].includes(option.text)) { index++; continue }
      if (option.text === '-C') {
        const target = args[index + 1]
        if (target === undefined || this.within(target) !== true) { this.add('unknown', 'git', 'git-C-outside'); return }
        this.cwd = resolve(this.cwd ?? this.draftRoot ?? '.', shellPath(target.text))
        index += 2
        continue
      }
      this.add('unknown', 'git', 'git-global-option')
      return
    }
    const sub = args[index]
    if (sub === undefined) { this.add('read', 'git', 'git-bare'); return }
    const subName = sub.text.toLowerCase()
    const operands = args.slice(index + 1)
    const texts = operands.map(arg => arg.text.toLowerCase())
    const flags = new Set(texts.filter(text => text.startsWith('-')))
    const verb = `git ${subName}`
    if (texts.some(text => text.startsWith('--output') || text.startsWith('--exec') || text === '--upload-pack' || text.startsWith('--upload-pack=') || text.startsWith('--receive-pack'))) { this.add('unknown', verb, 'git-runs-or-writes'); return }
    // P0-B: `git init --template=DIR` / `--separate-git-dir=DIR` (git takes any unique prefix) fill the new `.git` from a folder the persona wrote: its hooks and config then run on the next commit.
    if (subName === 'init' && texts.some(text => /^--(?:t|se)/u.test(text))) { this.add('unknown', verb, 'git-init-template'); return }
    // Carbon CP-4: `git grep -O<cmd>` / `--open-files-in-pager=<cmd>` run a program on the matches (case matters: `-o` is `--only-matching`, so the ORIGINAL text is read).
    if (subName === 'grep' && (texts.some(text => text.startsWith('--open-files-in-pager')) || operands.some(arg => /^-[A-Za-z0-9]*O/u.test(arg.text)))) { this.add('unknown', verb, 'git-runs-pager'); return }
    if (GIT_NEVER.has(subName)) { this.add('never', verb, 'git-credential'); return }
    if (subName === 'push') {
      const forced = texts.some(text => ['--force', '-f', '--force-with-lease', '--mirror', '--delete', '-d', '--all', '--prune', '--tags'].includes(text) || text.startsWith('--force-with-lease=') || text.startsWith('+') || text.startsWith(':'))
      this.add(forced ? 'never' : 'send', verb, forced ? 'git-push-force' : 'git-push')
      return
    }
    if (GIT_SEND.has(subName)) { this.add('send', verb, 'git-network'); return }
    if (subName === 'branch') {
      if (texts.some(text => ['-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C', '--copy', '--force', '-f', '--set-upstream-to', '-u', '--unset-upstream', '--edit-description'].includes(text) || text.startsWith('--set-upstream'))) { this.add('delete', verb, 'git-branch-change'); return }
      const positional = operands.filter(arg => !isFlag(arg.text))
      if (positional.length === 0 || flags.has('--list') || flags.has('-l')) { this.add('read', verb, 'git-branch-list'); return }
      this.add('unknown', verb, 'git-branch-create')
      return
    }
    if (subName === 'tag') {
      const positional = operands.filter(arg => !isFlag(arg.text))
      if (positional.length === 0 || flags.has('-l') || flags.has('--list')) { this.add('read', verb, 'git-tag-list'); return }
      this.add('unknown', verb, 'git-tag-change')
      return
    }
    if (subName === 'remote') {
      const action = operands.find(arg => !isFlag(arg.text))?.text.toLowerCase()
      this.add(action === undefined || action === 'show' || action === 'get-url' ? 'read' : 'unknown', verb, 'git-remote')
      return
    }
    if (subName === 'config') {
      const reads = texts.some(text => ['--get', '--get-all', '--get-regexp', '--list', '-l', '--show-origin', '--show-scope'].includes(text))
      this.secretOperands(verb, operands) // Carbon P0-05b: `-f <file>` / `--file=<file>` READS that file: a secret operand is a secret read
      this.add(reads ? 'read' : 'unknown', verb, reads ? 'git-config-read' : 'git-config-write')
      return
    }
    if (subName === 'stash') {
      const action = operands.find(arg => !isFlag(arg.text))?.text.toLowerCase()
      if (action === 'list' || action === 'show') { this.add('read', verb, 'git-stash-read'); return }
      if (action === 'drop' || action === 'clear') { this.add('delete', verb, 'git-stash-drop'); return }
      this.add('draft-change', verb, 'git-stash'); return
    }
    if (subName === 'reflog') {
      const action = operands.find(arg => !isFlag(arg.text))?.text.toLowerCase()
      this.add(action === 'expire' || action === 'delete' ? 'delete' : 'read', verb, 'git-reflog')
      return
    }
    if (subName === 'reset') {
      this.add(flags.has('--hard') || flags.has('--merge') || flags.has('--keep') ? 'delete' : 'draft-change', verb, 'git-reset')
      return
    }
    if (subName === 'clean') { this.add('delete', verb, 'git-clean'); return }
    if (subName === 'checkout') {
      this.add(flags.has('-f') || flags.has('--force') || flags.has('--') && operands.some(arg => arg.text === '.') ? 'delete' : 'draft-change', verb, 'git-checkout')
      return
    }
    if (GIT_READ.has(subName)) { this.secretOperands(verb, operands); this.add('read', verb, 'git-read'); return }
    if (GIT_DRAFT_CHANGE.has(subName)) {
      // Carbon P0-04: with NO draft known nothing is "inside" it; a quoted path with a space is still a path; a raw path into .git/ is never a draft change.
      if (this.draftRoot === undefined) { this.add('outside-change', verb, 'no-draft'); return }
      for (const path of gitPathOperands(operands)) {
        const within = this.within(markRiskyGlob(path))
        if (isSecretPath(path.text)) this.add('secret', verb, 'secret-path')
        else if (isGitInternalPath(path.text)) this.add('outside-change', verb, 'git-internals')
        else if (within === undefined) this.add(path.expands || isRiskyGlob(path.text) ? 'unknown' : 'outside-change', verb, path.expands || isRiskyGlob(path.text) ? 'expands' : 'no-draft')
        else if (within === false) this.add('outside-change', verb, 'outside-draft')
      }
      this.add('draft-change', verb, 'git-draft-change')
      return
    }
    this.add('unknown', verb, 'git-not-listed')
  }

  private gh(args: readonly Word[]): void {
    const positional = args.filter(arg => !isFlag(arg.text)).map(arg => arg.text.toLowerCase())
    const texts = args.map(arg => arg.text.toLowerCase())
    const noun = positional[0] ?? ''
    const action = positional[1] ?? ''
    const verb = `gh ${noun}`.trim()
    if (noun === 'auth') {
      if (action === 'status') { this.add('read', verb, 'gh-auth-status'); return }
      this.add('never', verb, 'gh-auth')
      return
    }
    if (noun === 'api') { this.add('send', verb, 'gh-api'); return }
    if (texts.includes('--web') || texts.includes('-w')) { this.add('unknown', verb, 'gh-web'); return }
    const READ_NOUNS = ['pr', 'issue', 'repo', 'run', 'workflow', 'release', 'gist', 'label', 'project', 'cache', 'ruleset']
    const READ_ACTIONS = ['view', 'list', 'diff', 'checks', 'status', 'watch']
    if (noun === 'search' || noun === 'status' || (READ_NOUNS.includes(noun) && READ_ACTIONS.includes(action))) { this.add('read', `${verb} ${action}`.trim(), 'gh-read'); return }
    this.add('send', `${verb} ${action}`.trim(), 'gh-write')
  }
}

/**
 * What one shell call is. Never throws; a command it cannot read is `unknown`.
 * @param command - The text the model sent to `Bash` or `PowerShell`.
 * @param context - The draft of the task and the CLI's working directory.
 * @returns The worst kind found in the command line, the word that decided it and a short reason code.
 */
export function judgeCommand(command: string, context: CommandContext = {}): CommandJudgment {
  const judge = new Judge(context)
  judge.script(command, 0)
  return judge.result()
}

/**
 * The program a command line starts with, for labels (`git push`, `curl`). Empty when the line is empty.
 * @param command - The text the model sent to `Bash` or `PowerShell`.
 */
export function headOfCommand(command: string): string {
  const first = command.trim().split(/\s+/u)[0] ?? ''
  return basename(first.replace(/\\/gu, '/'))
}
