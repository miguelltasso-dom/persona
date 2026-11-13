/**
 * O amostrador do soak em TEMPO REAL (M7, Probe): o que se vê do host DE FORA, como processo — RSS da árvore, filhos vivos, handles do sistema, tamanho do banco com o WAL.
 * Regras aprendidas (memória do Probe "medição de processo é segura quanto à posse"): o processo é identificado por (pid, criação), o filho conta só se o pai é mais velho, e uma listagem que
 * FALHA é ERRO — nunca "nenhum processo" (que leria como "0 filhos, sem vazamento").
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { processTree, type ProcRow } from './soak-real-verdicts.ts'

const run = promisify(execFile)

/** Uma linha da lista de processos com os handles do sistema. */
export interface SampledRow extends ProcRow {
  readonly handles: number
  /** The first 160 characters of the command line (what the process IS: the CLI, its MCP server, a conhost…). */
  readonly cmd: string
}

/** O que se lê da árvore do host num instante. */
export interface TreeReading {
  readonly rssMb: number
  readonly hostRssMb: number
  readonly children: number
  readonly handles: number
  /** Descendants by process name. */
  readonly childNames: Readonly<Record<string, number>>
  /** The descendants themselves (PID + creation + command), oldest first: the run follows each one over time to tell a leak from a short re-probe. */
  readonly childList: readonly ChildDescription[]
}

const MB = 1_048_576

interface WindowsRow { readonly ProcessId: number; readonly ParentProcessId: number; readonly Created: string; readonly WorkingSetSize: number; readonly HandleCount: number; readonly Name: string; readonly Cmd: string | null }

/**
 * A lista INTEIRA de processos (Windows: CIM; outros: `ps`). Lança se a listagem falhar ou vier vazia.
 */
export async function listProcesses(): Promise<SampledRow[]> {
  if (process.platform === 'win32') {
    const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n='Created';e={$_.CreationDate.ToString('o')}},WorkingSetSize,HandleCount,Name,@{n='Cmd';e={if ($_.CommandLine) { $_.CommandLine.Substring(0,[Math]::Min(160,$_.CommandLine.Length)) } else { '' }}} | ConvertTo-Json -Compress"
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { maxBuffer: 64 * MB, timeout: 90_000, windowsHide: true })
    const parsed = JSON.parse(stdout) as WindowsRow | WindowsRow[]
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map(row => ({ pid: row.ProcessId, ppid: row.ParentProcessId, created: Date.parse(row.Created), rssBytes: row.WorkingSetSize, handles: row.HandleCount, name: row.Name, cmd: row.Cmd ?? '' }))
    if (rows.length === 0 || rows.some(row => Number.isNaN(row.created))) throw new Error('a listagem de processos veio vazia ou sem data de criação: não dá para medir')
    return rows
  }
  const { stdout } = await run('ps', ['-eo', 'pid=,ppid=,rss=,lstart=,args='], { maxBuffer: 64 * MB, timeout: 30_000 })
  const rows: SampledRow[] = []
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/u.exec(line)
    if (match === null) continue
    const cmd = (match[5] ?? '').trim()
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), rssBytes: Number(match[3]) * 1024, created: Date.parse(match[4] ?? ''), handles: 0, name: cmd.split(/\s+/u)[0] ?? '', cmd: cmd.slice(0, 160) })
  }
  if (rows.length === 0) throw new Error('a listagem de processos veio vazia: não dá para medir')
  return rows
}

/**
 * Quem escuta na porta do host (o processo do host). Lança se ninguém escutar.
 * @param port - A porta de `host.url`.
 */
export async function listeningPid(port: number): Promise<number> {
  if (process.platform === 'win32') {
    const script = `(Get-NetTCPConnection -LocalPort ${String(port)} -State Listen -ErrorAction Stop | Select-Object -First 1).OwningProcess`
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 60_000, windowsHide: true })
    const pid = Number(stdout.trim())
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`ninguém escuta na porta ${String(port)}`)
    return pid
  }
  const { stdout } = await run('lsof', ['-nP', `-iTCP:${String(port)}`, '-sTCP:LISTEN', '-t'], { timeout: 30_000 })
  const pid = Number(stdout.split('\n')[0]?.trim())
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`ninguém escuta na porta ${String(port)}`)
  return pid
}

/**
 * A identidade do host: o (pid, criação) de quem escuta na porta.
 * @param port - A porta do host.
 */
export async function identifyHost(port: number): Promise<{ readonly pid: number; readonly created: number }> {
  const pid = await listeningPid(port)
  const row = (await listProcesses()).find(candidate => candidate.pid === pid)
  if (row === undefined) throw new Error(`o dono da porta ${String(port)} (pid ${String(pid)}) não está na lista de processos`)
  return { pid: row.pid, created: row.created }
}

/**
 * Lê a árvore do host AGORA. Lança se o host (mesmo pid E mesma criação) não está mais vivo: o soak acusa "o host sumiu", nunca "0 filhos".
 * @param host - A identidade do host.
 * @param rows - A lista de processos (para testar sem o sistema).
 */
export async function readTree(host: { readonly pid: number; readonly created: number }, rows?: readonly SampledRow[]): Promise<TreeReading> {
  const tree = processTree(rows ?? await listProcesses(), host)
  if (tree === undefined) throw new Error(`o host (pid ${String(host.pid)}) não está mais vivo`)
  const all = [tree.root, ...tree.descendants]
  return {
    rssMb: all.reduce((sum, row) => sum + row.rssBytes, 0) / MB,
    hostRssMb: tree.root.rssBytes / MB,
    children: tree.descendants.length,
    handles: all.reduce((sum, row) => sum + row.handles, 0),
    childNames: tree.descendants.reduce<Record<string, number>>((names, row) => ({ ...names, [row.name]: (names[row.name] ?? 0) + 1 }), {}),
    childList: describeRows(tree.descendants),
  }
}

/** One live descendant of the host, as the list asked for by Forge (12/11 15:53, 19:09): who it is (PID + creation: the identity), who its parent is, what it runs. */
export interface ChildDescription {
  readonly name: string
  readonly pid: number
  readonly ppid: number
  /** Epoch ms of the creation: (pid, created) is the identity; a pid alone can be reused. */
  readonly created: number
  readonly createdIso: string
  readonly cmd: string
  readonly rssMb: number
}

function describeRows(descendants: readonly SampledRow[]): ChildDescription[] {
  return [...descendants].sort((a, b) => a.created - b.created).map(row => ({ name: row.name, pid: row.pid, ppid: row.ppid, created: row.created, createdIso: new Date(row.created).toISOString(), cmd: row.cmd, rssMb: Math.round(row.rssBytes / MB) }))
}

/**
 * Which of these processes (pid + creation) are STILL alive: after the host closed, a survivor is a leaked child (a pid reused by another process does NOT count: its creation differs).
 * @param identities - The processes seen as children of the host during the run.
 * @param rows - The process list (to test without the system).
 */
export async function survivors(identities: ReadonlyArray<{ readonly pid: number; readonly created: number }>, rows?: readonly SampledRow[]): Promise<SampledRow[]> {
  const all = rows ?? await listProcesses()
  return all.filter(row => identities.some(identity => identity.pid === row.pid && identity.created === row.created))
}

/**
 * The live descendants of the host, oldest first (the order they were opened in). Throws, like {@link readTree}, when the host is gone.
 * @param host - The host's identity.
 * @param rows - The process list (to test without the system).
 */
export async function describeChildren(host: { readonly pid: number; readonly created: number }, rows?: readonly SampledRow[]): Promise<ChildDescription[]> {
  const all = rows ?? await listProcesses()
  const tree = processTree(all, host)
  if (tree === undefined) throw new Error(`o host (pid ${String(host.pid)}) não está mais vivo`)
  return describeRows(tree.descendants)
}

const DB_FILE = /\.(db|sqlite3?)(-wal|-shm)?$/iu

/**
 * O tamanho do banco com o WAL e o SHM, em MB (todos os `.db`/`.sqlite` do `PERSONA_HOME`, sem `node_modules`/`runtime`).
 * @param home - A pasta do host.
 */
export function dbSizeMb(home: string): number {
  if (!existsSync(home)) return 0
  let bytes = 0
  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (depth < 4 && entry.name !== 'node_modules' && entry.name !== 'runtime') walk(join(dir, entry.name), depth + 1)
      } else if (DB_FILE.test(entry.name)) {
        bytes += statSync(join(dir, entry.name)).size
      }
    }
  }
  walk(home, 0)
  return bytes / MB
}
